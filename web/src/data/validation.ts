/**
 * Runtime data loading and validation for contract bundles.
 *
 * TypeScript types (src/data/types.ts) describe the expected shape but do NOT
 * make incoming data safe: every bundle is validated at runtime against the
 * upstream JSON Schemas (Draft 2020-12) and then against cross-record rules
 * that JSON Schema cannot express (cross-file references, uniqueness, time
 * ordering, sample_count, public data boundary). This mirrors the requirement
 * in contracts/README.md: "implementations must additionally check cross-file
 * references, uniqueness, time ordering, sample_count, and the contents of
 * skill arrays."
 *
 * A bundle with ANY issue is rejected as a whole. There is no fallback that
 * swaps a broken package for a valid one or shows partially trusted data.
 */

import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020'
import type { AnySchema } from 'ajv'
import addFormats from 'ajv-formats'
import type { UtscBundle } from './types'

export const BUNDLE_SCHEMA_ID = 'https://utsc.example/contracts/v1/bundle.schema.json'

/** Schema files shipped under public/contracts/schemas/, by their $id. */
export type SchemaSet = Map<string, unknown>

export type IssueCode =
  | 'schema'
  | 'parse'
  | 'duplicate_id'
  | 'duplicate_source_job_id'
  | 'missing_skill_ref'
  | 'sample_count'
  | 'time_order'
  | 'boundary'

export interface ValidationIssue {
  code: IssueCode
  message: string
  /** JSON pointer-ish location inside the bundle, when known. */
  path?: string
}

export type LoadResult =
  | { status: 'ok'; bundle: UtscBundle }
  | { status: 'rejected'; issues: ValidationIssue[] }

/** Thrown when the bundle files themselves cannot be fetched. Distinct from a
 * rejection: the data never arrived, so there is nothing to accept or reject. */
export class BundleFetchError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'BundleFetchError'
  }
}

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

/** Fetch all contract schemas from the given base path and index them by $id. */
export async function loadSchemaSet(basePath = '/contracts/schemas'): Promise<SchemaSet> {
  const entries = await Promise.all(
    SCHEMA_FILES.map(async (file) => {
      const response = await fetch(`${basePath}/${file}`)
      if (!response.ok) {
        throw new BundleFetchError(`Failed to load schema ${file}: HTTP ${response.status}`)
      }
      const schema = (await response.json()) as { $id?: string }
      if (!schema.$id) {
        throw new BundleFetchError(`Schema ${file} has no $id`)
      }
      return [schema.$id, schema] as const
    }),
  )
  return new Map(entries)
}

export function createBundleValidator(schemas: SchemaSet): ValidateFunction {
  // strict: false disables ajv's schema-authoring lint only. The upstream
  // schemas are frozen contract artifacts (do not modify) and legitimately
  // narrow $ref'd subschemas with bare `properties` inside allOf, which ajv's
  // strict mode flags. Data validation semantics are completely unaffected:
  // every keyword (required, enum, pattern, if/then, format, additional-
  // Properties …) still applies exactly as written upstream.
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  addFormats(ajv)
  for (const [id, schema] of schemas) {
    ajv.addSchema(schema as AnySchema, id)
  }
  const bundleSchema = schemas.get(BUNDLE_SCHEMA_ID)
  if (!bundleSchema) {
    throw new BundleFetchError(`Bundle schema ${BUNDLE_SCHEMA_ID} missing from schema set`)
  }
  return ajv.compile(bundleSchema)
}

function issuesFromAjvErrors(errors: readonly unknown[]): ValidationIssue[] {
  return (errors as { instancePath?: string; message?: string }[]).map((error) => ({
    code: 'schema' as const,
    path: error.instancePath || undefined,
    message: `${error.instancePath || '(root)'}: ${error.message ?? 'failed schema validation'}`,
  }))
}

/**
 * Keys that must never appear anywhere in a public bundle. Exact,
 * case-insensitive key names. This is defence in depth on top of
 * `additionalProperties: false` in the schemas: the schemas already pin the
 * shape, this catches accidental private fields if schema validation is ever
 * bypassed in future loaders.
 */
const FORBIDDEN_KEYS = new Set([
  'user_id',
  'user_record',
  'password',
  'secret',
  'api_key',
  'apikey',
  'access_token',
  'refresh_token',
  'id_token',
  'service_role',
  'session_id',
  'instagram_session',
  'cookie',
  'credentials',
  'authorization',
])

function findForbiddenKeys(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenKeys(item, `${path}/${index}`, issues))
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
        issues.push({
          code: 'boundary',
          path: `${path}/${key}`,
          message: `forbidden private field "${key}" found in public bundle`,
        })
      }
      findForbiddenKeys(child, `${path}/${key}`, issues)
    }
  }
}

function findDuplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id)
    seen.add(id)
  }
  return [...duplicates]
}

function isFirstBeforeOrEqual(first: string, second: string): boolean {
  // All contract instants are UTC ISO 8601 ending in Z and dates are
  // YYYY-MM-DD, so lexicographic order equals chronological order.
  return first <= second
}

/**
 * Cross-record checks that JSON Schema cannot express. Operates on data that
 * has already passed schema validation (or on hand-built objects in tests).
 */
export function checkCrossRecords(bundle: UtscBundle): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const { manifest, market_jobs: jobs, skills, courses, resources, opportunities } = bundle

  for (const [group, idField, items] of [
    ['market_jobs', 'job_key', jobs.map((j) => j.job_key)],
    ['skills', 'skill_id', skills.map((s) => s.skill_id)],
    ['courses', 'course_id', courses.map((c) => c.course_id)],
    ['resources', 'resource_id', resources.map((r) => r.resource_id)],
    ['opportunities', 'opportunity_id', opportunities.map((o) => o.opportunity_id)],
  ] as const) {
    for (const duplicate of findDuplicates(items)) {
      issues.push({
        code: 'duplicate_id',
        path: `/${group}`,
        message: `duplicate ${idField} "${duplicate}" in ${group}`,
      })
    }
  }

  const seenSourceJobs = new Map<string, number>()
  jobs.forEach((job, index) => {
    if (job.source_job_id === null) return
    const key = `${job.source}::${job.source_job_id}`
    const previous = seenSourceJobs.get(key)
    if (previous !== undefined) {
      issues.push({
        code: 'duplicate_source_job_id',
        path: `/market_jobs/${index}`,
        message: `source "${job.source}" job id "${job.source_job_id}" already used by /market_jobs/${previous}`,
      })
    } else {
      seenSourceJobs.set(key, index)
    }
  })

  const skillIds = new Set(skills.map((s) => s.skill_id))
  const referenceSites = [
    ...jobs.flatMap((job, index) => [
      { path: `/market_jobs/${index}/technical_skill_ids`, ids: job.technical_skill_ids },
      { path: `/market_jobs/${index}/soft_skill_ids`, ids: job.soft_skill_ids },
    ]),
    ...courses.flatMap((course, index) => [
      { path: `/courses/${index}/candidate_skill_ids`, ids: course.candidate_skill_ids },
    ]),
    ...resources.flatMap((resource, index) => [
      { path: `/resources/${index}/skill_ids`, ids: resource.skill_ids },
    ]),
    ...opportunities.flatMap((opportunity, index) => [
      { path: `/opportunities/${index}/skill_ids`, ids: opportunity.skill_ids },
    ]),
  ]
  for (const site of referenceSites) {
    for (const id of site.ids) {
      if (!skillIds.has(id)) {
        issues.push({
          code: 'missing_skill_ref',
          path: site.path,
          message: `skill id "${id}" is referenced but missing from /skills`,
        })
      }
    }
  }

  if (manifest.sample_count !== jobs.length) {
    issues.push({
      code: 'sample_count',
      path: '/manifest/sample_count',
      message: `manifest sample_count is ${manifest.sample_count} but /market_jobs has ${jobs.length} entries`,
    })
  }

  if (manifest.collected_from && manifest.collected_to && !isFirstBeforeOrEqual(manifest.collected_from, manifest.collected_to)) {
    issues.push({
      code: 'time_order',
      path: '/manifest',
      message: 'collected_from is after collected_to',
    })
  }
  if (manifest.posting_from && manifest.posting_to && !isFirstBeforeOrEqual(manifest.posting_from, manifest.posting_to)) {
    issues.push({
      code: 'time_order',
      path: '/manifest',
      message: 'posting_from is after posting_to',
    })
  }
  jobs.forEach((job, index) => {
    if (!isFirstBeforeOrEqual(job.first_seen_at, job.last_seen_at)) {
      issues.push({
        code: 'time_order',
        path: `/market_jobs/${index}`,
        message: `first_seen_at is after last_seen_at for ${job.job_key}`,
      })
    }
  })

  findForbiddenKeys(bundle, '', issues)
  return issues
}

/**
 * Fetch one bundle and validate it fully. Network failure throws
 * BundleFetchError; any validation failure returns a whole-bundle rejection.
 * Never returns partial data.
 */
export async function loadAndValidateBundle(
  url: string,
  validate: ValidateFunction,
): Promise<LoadResult> {
  let response: Response
  try {
    response = await fetch(url)
  } catch (error) {
    throw new BundleFetchError(`Could not fetch bundle from ${url}`, error)
  }
  if (!response.ok) {
    throw new BundleFetchError(`Bundle request failed: HTTP ${response.status} for ${url}`)
  }

  let parsed: unknown
  try {
    parsed = await response.json()
  } catch (error) {
    return { status: 'rejected', issues: [{ code: 'parse', message: `Bundle is not valid JSON: ${(error as Error).message}` }] }
  }

  if (!validate(parsed)) {
    return { status: 'rejected', issues: issuesFromAjvErrors(validate.errors ?? []) }
  }

  const bundle = parsed as UtscBundle
  const crossIssues = checkCrossRecords(bundle)
  if (crossIssues.length > 0) {
    return { status: 'rejected', issues: crossIssues }
  }
  return { status: 'ok', bundle }
}
