import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { contentCheck, loadBundleValidation, loadMarketCriteria, MAX_BUNDLE_BYTES } from './publish_bundle.mjs'

const candidate = fileURLToPath(new URL('../web/tests/fixtures/d7-1.1/', import.meta.url))
const schemaProvenanceSha = 'df7f595a4734a2d204ae37ed1a8c3648c8da6fa05f422d0c9f8e3d7efcc8471c'
const sidecars = {
  'manifest.json': 'manifest',
  'market_jobs.json': 'market_jobs',
  'skills.json': 'skills',
  'organizers.json': 'organizers',
  'courses.json': 'courses',
  'learning_resources.json': 'resources',
  'opportunities.json': 'opportunities',
}
const required = new Set([
  'bundle.json', ...Object.keys(sidecars), 'reference_statistics.json',
  'dataset_provenance.json', 'release_attestation.template.json',
])
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const validSha = /^[0-9a-f]{64}$/
const { isFormalScopeJob } = await loadMarketCriteria()
const attestationKeys = ['role_classifications', 'course_evidence', 'opportunity_dates']

function readFile(directory, name) {
  const file = path.join(directory, name)
  const stat = lstatSync(file)
  if (!stat.isFile() || stat.size > MAX_BUNDLE_BYTES) {
    throw new Error(`Expected a regular file within 5 MiB: ${name}`)
  }
  const bytes = readFileSync(file)
  if (bytes.length > MAX_BUNDLE_BYTES) throw new Error(`File exceeds 5 MiB: ${name}`)
  return bytes
}

function json(bytes) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}

function readPackage(directory, expectedSha) {
  if (!validSha.test(expectedSha ?? '')) throw new Error('A trusted inventory SHA-256 is required')
  if (!lstatSync(directory).isDirectory()) throw new Error('Expected a regular package directory')
  const names = readdirSync(directory)
  if (names.length !== required.size + 1 ||
      names.some(name => name !== 'SHA256SUMS.txt' && !required.has(name))) {
    throw new Error('D7 package does not contain exactly the required files')
  }
  const inventory = readFile(directory, 'SHA256SUMS.txt')
  if (hash(inventory) !== expectedSha) throw new Error('D7 inventory checksum mismatch')
  const files = new Map()
  for (const line of inventory.toString('utf8').replace(/\r?\n$/, '').split(/\r?\n/)) {
    const entry = /^([0-9a-f]{64}) {2}([a-zA-Z0-9_.]+)$/.exec(line)
    if (!entry || !required.has(entry[2]) || files.has(entry[2])) {
      throw new Error('Unexpected, unsafe or duplicate D7 checksum entry')
    }
    const [, sha, name] = entry
    const bytes = readFile(directory, name)
    if (hash(bytes) !== sha) throw new Error(`D7 file checksum mismatch: ${name}`)
    files.set(name, bytes)
  }
  if (files.size !== required.size) throw new Error('Incomplete D7 checksum inventory')
  return files
}

function loadCandidateSchemas() {
  const provenance = readFile(candidate, 'PROVENANCE.json')
  if (hash(provenance) !== schemaProvenanceSha) throw new Error('Pinned D7 schema provenance mismatch')
  const metadata = json(provenance)
  const schemaBytes = new Map()
  const schemas = new Map()
  for (const entry of metadata.files) {
    if (!entry.path.startsWith('contracts/schemas/')) continue
    const name = path.basename(entry.path)
    const bytes = readFile(candidate, name)
    if (hash(bytes) !== entry.sha256) throw new Error(`Pinned D7 schema checksum mismatch: ${name}`)
    const schema = json(bytes)
    schemaBytes.set(name, bytes)
    schemas.set(schema.$id, schema)
  }
  return { schemas, schemaBytes, contractCommit: metadata.commit }
}

// D7 reference statistics are unfiltered and contain only skills present in
// formal-scope jobs. The website adds the unused catalog skills for display.
export function referenceStatistics(jobs) {
  const counts = new Map()
  let jobCount = 0
  let analyzable = 0
  for (const job of jobs) {
    if (!isFormalScopeJob(job)) continue
    jobCount += 1
    if (job.description_analyzable) analyzable += 1
    for (const id of new Set([...job.technical_skill_ids, ...job.soft_skill_ids])) {
      counts.set(id, (counts.get(id) ?? 0) + Number(job.description_analyzable))
    }
  }
  return {
    job_count: jobCount,
    analyzable_description_count: analyzable,
    skills: [...counts.keys()].sort().map(id => ({
      skill_id: id,
      mention_count: counts.get(id),
      mention_rate: analyzable === 0 ? null : counts.get(id) / analyzable,
    })),
  }
}

function recordsById(records, key, ids, label) {
  if (!Array.isArray(records) || records.length !== ids.size) {
    throw new Error(`D7 provenance IDs do not match: ${label}`)
  }
  const result = new Map()
  for (const record of records) {
    const id = record?.[key]
    if (!ids.has(id) || result.has(id)) throw new Error(`Unexpected or duplicate D7 provenance ID: ${label}`)
    result.set(id, record)
  }
  return result
}

function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
      !Number.isFinite(Date.parse(value))) throw new Error('D7 provenance requires a timestamp with offset')
  return Date.parse(value)
}

function verifyProvenance(bundle, provenance) {
  const manifest = bundle.manifest
  const datasets = provenance?.datasets
  const market = datasets?.market_jobs
  const opportunities = datasets?.opportunities
  const synthetic = market?.source === 'synthetic'
  if (provenance?.generated_at !== manifest.generated_at ||
      (provenance.dataset_version !== undefined && provenance.dataset_version !== manifest.dataset_version) ||
      (!synthetic && market?.source !== 'jsearch') ||
      opportunities?.source !== (synthetic ? 'synthetic' : 'instagram') ||
      market.collected_from !== manifest.collected_from ||
      market.collected_to !== manifest.collected_to) {
    throw new Error('D7 provenance does not match the manifest')
  }
  for (const [key, idKey, timeKey] of [
    ['courses', 'course_id', 'verified_at'],
    ['resources', 'resource_id', 'verified_at'],
    ['organizers', 'organizer_id', 'last_verified_at'],
  ]) {
    const records = recordsById(datasets[key]?.records, idKey, new Set(bundle[key].map(record => record[idKey])), key)
    if (datasets[key].timestamp_field !== timeKey ||
        bundle[key].some(record => records.get(record[idKey])[timeKey] !== record[timeKey])) {
      throw new Error(`D7 provenance timestamps do not match: ${key}`)
    }
  }
  const byId = recordsById(opportunities.records, 'opportunity_id',
    new Set(bundle.opportunities.map(item => item.opportunity_id)), 'opportunities')
  const firstSeen = []
  const lastSeen = []
  const entries = bundle.opportunities.map(item => {
    const record = byId.get(item.opportunity_id)
    const eligibility = record.eligibility
    if (!['auto_candidate', 'human_approved'].includes(eligibility?.decision) ||
        eligibility.content_revision !== item.content_revision || item.review_status !== 'approved') {
      throw new Error(`D7 opportunity decision or revision mismatch: ${item.opportunity_id}`)
    }
    instant(eligibility.evaluated_at)
    const posts = recordsById(record.source_post_ids, 'source_post_id', new Set(item.source_post_ids), item.opportunity_id)
    for (const post of posts.values()) {
      const first = instant(post.first_seen_at)
      const last = instant(post.last_seen_at)
      if (first > last || last > instant(post.last_fetched_at)) throw new Error('D7 source post timestamp order is invalid')
      firstSeen.push(post.first_seen_at)
      lastSeen.push(post.last_seen_at)
    }
    return [item.opportunity_id, eligibility.decision]
  })
  if (opportunities.collected_from !== (firstSeen.sort()[0] ?? null) ||
      opportunities.collected_to !== (lastSeen.sort().at(-1) ?? null)) {
    throw new Error('D7 opportunity provenance collection range mismatch')
  }
  return { opportunityReviews: Object.fromEntries(entries), synthetic }
}

/** Validate immutable input bytes for localhost integration only. */
export async function verifyD7Package(packageDirectory, expectedInventorySha256) {
  const files = readPackage(packageDirectory, expectedInventorySha256)
  const bundleBytes = files.get('bundle.json')
  const bundle = json(bundleBytes)
  if (bundle?.manifest?.run_status === 'failed') throw new Error('Failed D7 dataset cannot enter integration')
  const { createBundleValidator, checkCrossRecords } = await loadBundleValidation()
  const { schemas, schemaBytes, contractCommit } = loadCandidateSchemas()
  const validate = createBundleValidator(schemas)
  if (!validate(bundle)) throw new Error('D7 bundle schema rejected: ' + validate.errors?.[0]?.message)
  if (checkCrossRecords(bundle).length) throw new Error('D7 bundle cross-record validation failed')
  contentCheck(bundle)
  for (const [name, key] of Object.entries(sidecars)) {
    if (!isDeepStrictEqual(json(files.get(name)), bundle[key])) throw new Error(`D7 sidecar mismatch: ${name}`)
  }
  const template = json(files.get('release_attestation.template.json'))
  if (template?.dataset_version !== bundle.manifest.dataset_version || template.reviewer !== '' ||
      template.confirmed_at !== '' ||
      attestationKeys.some(key => template.confirmations?.[key] !== false) ||
      Object.values(template.confirmations).some(value => value !== false)) {
    throw new Error('D7 candidate release template must match the version and remain unsigned')
  }
  const actual = json(files.get('reference_statistics.json'))
  if (!Array.isArray(actual?.skills) || actual.skills.some(row => typeof row?.skill_id !== 'string') ||
      !isDeepStrictEqual(
        { ...actual, skills: [...actual.skills].sort((a, b) => a.skill_id < b.skill_id ? -1 : Number(a.skill_id > b.skill_id)) },
        referenceStatistics(bundle.market_jobs),
      )) throw new Error('D7 reference statistics do not match the bundle')
  const { opportunityReviews, synthetic } = verifyProvenance(bundle, json(files.get('dataset_provenance.json')))
  return { bundle, bundleBytes, opportunityReviews, synthetic, bundleSha256: hash(bundleBytes), schemaBytes, contractCommit }
}
