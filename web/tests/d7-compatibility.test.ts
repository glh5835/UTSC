import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBundleValidator, loadAndValidateBundle, loadSchemaSet, type SchemaSet } from '../src/data/validation'
import type { UtscBundle } from '../src/data/types'
import { DATA_CONFIG } from '../src/data/sources'

const oldBase = new URL('../public/contracts/schemas/', import.meta.url)
const candidateBase = new URL('./fixtures/d7-1.1/', import.meta.url)
const commonFiles = ['bundle', 'common', 'manifest', 'market-job', 'skill', 'course', 'resource', 'opportunity']
const read = (url: URL) => JSON.parse(readFileSync(url, 'utf8'))
const oldBundle = read(new URL('../public/contracts/fixtures/valid_bundle.json', import.meta.url)) as UtscBundle
const candidate = read(new URL('valid_bundle.json', candidateBase)) as UtscBundle
function registry(base: URL, files: string[]): SchemaSet {
  return new Map(files.map((name) => {
    const schema = read(new URL(`${name}.schema.json`, base))
    return [schema.$id, schema]
  }))
}
const oldValidator = createBundleValidator(registry(oldBase, commonFiles))
const candidateValidator = createBundleValidator(registry(candidateBase, [...commonFiles, 'organizer']))
function load(bundle: UtscBundle, validate = candidateValidator) {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(bundle)))
  return loadAndValidateBundle('/test-only/bundle.json', validate)
}
afterEach(() => vi.unstubAllGlobals())

describe('pinned D7 candidate contract, never a formal upgrade', () => {
  it('preserves the demo configuration and formal 1.0 default', () => {
    expect(DATA_CONFIG.mode).toBe('demo')
    expect(DATA_CONFIG.schemaVersion).toBe('1.0.0')
    expect(DATA_CONFIG.contractCommit).toBe('b828553f91cf6cd6ae5b0766e7fbf4c6b1822535')
  })
  it('keeps candidate test artifacts byte-identical to their recorded provenance', () => {
    const provenance = read(new URL('PROVENANCE.json', candidateBase))
    expect(provenance.commit).toBe('aa13bbbab82bc0b58b3f1cf205953cf38407a2e1')
    for (const file of provenance.files) {
      const bytes = readFileSync(new URL(file.path.split('/').at(-1), candidateBase))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256)
    }
  })
  it('accepts each version only through its own registry', () => {
    expect(oldValidator(oldBundle)).toBe(true)
    expect(candidateValidator(candidate)).toBe(true)
    expect(oldValidator(candidate)).toBe(false)
    expect(candidateValidator(oldBundle)).toBe(false)
  })
  it('rejects a version-number-only upgrade of the real 1.0 fixture', () => {
    const changed = structuredClone(oldBundle)
    changed.manifest.schema_version = '1.1.0'
    expect(candidateValidator(changed)).toBe(false)
    expect(candidateValidator.errors?.some((error) => error.params.missingProperty === 'organizers')).toBe(true)
  })
  it('fetches all nine candidate dependencies into a separate registry', async () => {
    const requested: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      requested.push(url)
      return Response.json(read(new URL(url.split('/').at(-1)!, candidateBase)))
    }))
    const loaded = await loadSchemaSet('/test-only/d7', '1.1.0')
    expect(loaded.size).toBe(9)
    expect(requested).toContain('/test-only/d7/organizer.schema.json')
    expect(createBundleValidator(loaded)(candidate)).toBe(true)
    expect(oldValidator(oldBundle)).toBe(true)
  })
  it('fully loads the synthetic candidate with its references intact', async () => {
    expect((await load(candidate)).status).toBe('ok')
  })
  it.each(['skill', 'organizer', 'sample_count', 'private_field'])(
    'rejects a candidate with invalid %s data', async (kind) => {
      const changed = structuredClone(candidate)
      if (kind === 'skill') changed.opportunities[0].skill_ids = ['absent_skill']
      if (kind === 'organizer') changed.opportunities[0].organizer_id = 'absent_club'
      if (kind === 'sample_count') changed.manifest.sample_count += 1
      if (kind === 'private_field') Object.assign(changed.resources[0], { user_id: 'private' })
      expect((await load(changed)).status).toBe('rejected')
    },
  )
})

describe('chronological and cross-record rejection at the consumer boundary', () => {
  it('accepts ascending instants with mixed fractional-second precision', async () => {
    const changed = structuredClone(candidate)
    changed.market_jobs[0].first_seen_at = '2026-10-26T16:00:00Z'
    changed.market_jobs[0].last_seen_at = '2026-10-26T16:00:00.001Z'
    expect((await load(changed)).status).toBe('ok')
  })
  it.each([
    ['2026-10-26T16:00:00.001Z', '2026-10-26T16:00:00Z'],
    ['2026-10-26T16:00:00.0002Z', '2026-10-26T16:00:00.0001Z'],
  ])('rejects descending instants %s > %s', async (first, last) => {
    const changed = structuredClone(candidate)
    changed.market_jobs[0].first_seen_at = first
    changed.market_jobs[0].last_seen_at = last
    expect((await load(changed)).status).toBe('rejected')
  })
  it('rejects reversed opportunity calendar dates', async () => {
    const changed = structuredClone(candidate)
    changed.opportunities[0].end_date = '2026-11-04'
    changed.opportunities[0].end_precision = 'date'
    expect((await load(changed)).status).toBe('rejected')
  })
  it('rejects reversed opportunity UTC instants on the same calendar day', async () => {
    const changed = structuredClone(candidate)
    Object.assign(changed.opportunities[0], {
      start_at: '2026-11-05T16:00:00Z', end_at: '2026-11-05T15:00:00Z',
      start_date: '2026-11-05', end_date: '2026-11-05',
      start_precision: 'datetime', end_precision: 'datetime',
    })
    expect((await load(changed)).status).toBe('rejected')
  })
  it('rejects one source post assigned to two different opportunities', async () => {
    const changed = structuredClone(candidate)
    changed.opportunities.push({ ...structuredClone(changed.opportunities[0]), opportunity_id: 'other_event' })
    expect((await load(changed)).status).toBe('rejected')
  })
  it.each(['jsearch:demo', null])('rejects contradictory posting dates even with source ID %s', async (sourceId) => {
    const changed = structuredClone(candidate)
    Object.assign(changed.market_jobs[0], {
      posted_at: '2026-10-21T12:00:00Z', posted_date: '2026-10-20', posted_precision: 'datetime',
      source_job_id: sourceId,
    })
    expect((await load(changed)).status).toBe('rejected')
  })
})
