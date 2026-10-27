import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BundleFetchError,
  checkCrossRecords,
  createBundleValidator,
  loadAndValidateBundle,
  type SchemaSet,
} from '../src/data/validation'
import { stalenessInfo } from '../src/data/staleness'
import type { UtscBundle } from '../src/data/types'

/**
 * Tests run against the exact files shipped under public/contracts/ — the
 * verbatim copies of the upstream contract — not against copies embedded in
 * the test code.
 */

const SCHEMA_FILES = [
  'bundle.schema.json',
  'common.schema.json',
  'manifest.schema.json',
  'market-job.schema.json',
  'skill.schema.json',
  'course.schema.json',
  'resource.schema.json',
  'opportunity.schema.json',
] as const

function readJson<T = unknown>(relativeUrl: string): T {
  const path = fileURLToPath(new URL(relativeUrl, import.meta.url))
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function loadSchemaSet(): SchemaSet {
  const set: SchemaSet = new Map()
  for (const file of SCHEMA_FILES) {
    const schema = readJson<{ $id?: string }>(`../public/contracts/schemas/${file}`)
    if (!schema.$id) throw new Error(`${file} is missing $id`)
    set.set(schema.$id, schema)
  }
  return set
}

const schemas = loadSchemaSet()
const validate = createBundleValidator(schemas)
const validBundle = readJson<UtscBundle>('../public/contracts/fixtures/valid_bundle.json')
const emptyBundle = readJson<UtscBundle>('../public/contracts/fixtures/empty_bundle.json')
const invalidBundle = readJson<unknown>('../public/contracts/fixtures/invalid_bundle.json')

function issueCodes(bundle: unknown): string[] {
  if (validate(bundle)) return []
  return (validate.errors ?? []).map((e) => `${e.instancePath}: ${e.message}`)
}

function dataUrl(json: unknown): string {
  const base64 = Buffer.from(JSON.stringify(json), 'utf8').toString('base64')
  return `data:application/json;base64,${base64}`
}

describe('schema validation of shipped fixtures', () => {
  it('accepts the valid bundle with no schema or cross-record issues', () => {
    expect(validate(validBundle)).toBe(true)
    expect(checkCrossRecords(validBundle)).toEqual([])
  })

  it('accepts the empty bundle as valid with zero records', () => {
    expect(validate(emptyBundle)).toBe(true)
    expect(checkCrossRecords(emptyBundle)).toEqual([])
    expect(emptyBundle.market_jobs).toHaveLength(0)
    expect(emptyBundle.manifest.sample_count).toBe(0)
  })

  it('rejects the invalid bundle at the schema level', () => {
    expect(validate(invalidBundle)).toBe(false)
    const messages = issueCodes(invalidBundle)
    // Non-UTC instant (must end in Z), financial_risk_analyst requires a
    // role_subtype, and description_status missing contradicts
    // description_analyzable true.
    expect(messages.some((m) => m.includes('/market_jobs/0/posted_at'))).toBe(true)
    expect(messages.some((m) => m.includes('role_subtype'))).toBe(true)
  })

  it('rejects the invalid bundle at the cross-record level (unknown skill reference)', () => {
    const issues = checkCrossRecords(invalidBundle as UtscBundle)
    expect(issues.some((i) => i.code === 'missing_skill_ref' && i.message.includes('"sql"'))).toBe(true)
  })
})

describe('full load path (fetch + validate + cross checks)', () => {
  it('returns ok for the valid bundle', async () => {
    const result = await loadAndValidateBundle(dataUrl(validBundle), validate)
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.bundle.manifest.dataset_version).toBe('1.0.0')
    }
  })

  it('returns rejected (never partial data) for the invalid bundle', async () => {
    const result = await loadAndValidateBundle(dataUrl(invalidBundle), validate)
    expect(result.status).toBe('rejected')
    if (result.status === 'rejected') {
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues.some((i) => i.code === 'schema')).toBe(true)
    }
  })

  it('reports non-JSON payloads as a rejection with a parse issue', async () => {
    const result = await loadAndValidateBundle(
      'data:text/plain;base64,' + Buffer.from('not json', 'utf8').toString('base64'),
      validate,
    )
    expect(result.status).toBe('rejected')
    if (result.status === 'rejected') {
      expect(result.issues[0].code).toBe('parse')
    }
  })

  it('throws a distinct fetch error when the bundle cannot be downloaded', async () => {
    await expect(
      loadAndValidateBundle('http://127.0.0.1:9/nothing.json', validate),
    ).rejects.toBeInstanceOf(BundleFetchError)
  })
})

describe('cross-record checks beyond JSON Schema', () => {
  it('flags duplicate job_key values', () => {
    const bundle = structuredClone(validBundle) as UtscBundle
    bundle.market_jobs.push({ ...bundle.market_jobs[0] })
    const issues = checkCrossRecords(bundle)
    expect(issues.some((i) => i.code === 'duplicate_id' && i.message.includes('job_key'))).toBe(true)
  })

  it('flags duplicate (source, source_job_id) pairs', () => {
    const bundle = structuredClone(validBundle) as UtscBundle
    const clone = { ...structuredClone(validBundle.market_jobs[0]), job_key: 'jsearch:demo1-clone' }
    bundle.market_jobs.push(clone)
    const issues = checkCrossRecords(bundle)
    expect(issues.some((i) => i.code === 'duplicate_source_job_id')).toBe(true)
  })

  it('flags manifest sample_count that disagrees with market_jobs', () => {
    const bundle = structuredClone(validBundle) as UtscBundle
    bundle.manifest.sample_count = 5
    const issues = checkCrossRecords(bundle)
    expect(issues.some((i) => i.code === 'sample_count')).toBe(true)
  })

  it('flags skill references that are missing from the skills catalog', () => {
    const bundle = structuredClone(validBundle) as UtscBundle
    bundle.market_jobs[0].technical_skill_ids.push('rust')
    const issues = checkCrossRecords(bundle)
    expect(issues.some((i) => i.code === 'missing_skill_ref' && i.message.includes('"rust"'))).toBe(true)
  })

  it('flags reversed first_seen_at / last_seen_at ordering', () => {
    const bundle = structuredClone(validBundle) as UtscBundle
    bundle.market_jobs[0].first_seen_at = '2026-10-27T00:00:00Z'
    bundle.market_jobs[0].last_seen_at = '2026-10-21T02:00:00Z'
    const issues = checkCrossRecords(bundle)
    expect(issues.some((i) => i.code === 'time_order' && i.message.includes('first_seen_at'))).toBe(true)
  })

  it('flags reversed manifest collection window', () => {
    const bundle = structuredClone(validBundle) as UtscBundle
    bundle.manifest.collected_from = '2026-10-27T00:00:00Z'
    bundle.manifest.collected_to = '2026-10-19T08:00:00Z'
    const issues = checkCrossRecords(bundle)
    expect(issues.some((i) => i.code === 'time_order' && i.message.includes('collected_from'))).toBe(true)
  })

  it('flags private fields anywhere in the bundle (public data boundary)', () => {
    const bundle = structuredClone(validBundle)
    ;(bundle.skills[0] as unknown as Record<string, unknown>).user_id = 'u-123'
    const issues = checkCrossRecords(bundle)
    expect(issues.some((i) => i.code === 'boundary' && i.message.includes('user_id'))).toBe(true)
  })

  it('also flags the schema violation when the boundary-injected bundle re-runs schema validation', () => {
    const bundle = structuredClone(validBundle)
    ;(bundle.skills[0] as unknown as Record<string, unknown>).user_id = 'u-123'
    expect(validate(bundle)).toBe(false)
  })
})

describe('snapshot staleness', () => {
  const generatedAt = '2026-10-26T16:00:00Z'

  it('treats a fresh snapshot as not stale', () => {
    const info = stalenessInfo(generatedAt, new Date('2026-10-27T12:00:00Z'))
    expect(info.stale).toBe(false)
    expect(info.ageDays).toBe(0)
  })

  it('flags snapshots older than the threshold', () => {
    const info = stalenessInfo(generatedAt, new Date('2027-06-01T00:00:00Z'))
    expect(info.stale).toBe(true)
    expect(info.ageDays).toBeGreaterThan(180)
  })

  it('respects a custom threshold at its boundary', () => {
    const now = new Date('2026-11-15T16:00:00Z') // exactly 20 days later
    expect(stalenessInfo(generatedAt, now, 20).stale).toBe(false)
    expect(stalenessInfo(generatedAt, now, 19).stale).toBe(true)
  })

  it('treats an unparsable instant as stale, never as fresh', () => {
    const info = stalenessInfo('not-a-date', new Date('2026-10-27T00:00:00Z'))
    expect(info.stale).toBe(true)
  })
})
