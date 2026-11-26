import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isIP } from 'node:net'
import { contentCheck, loadMarketCriteria } from './publish_bundle.mjs'
import { productionBundleFiles, verifyD7Package } from './verify_d7_package.mjs'

const require = createRequire(new URL('../web/package.json', import.meta.url))
const Ajv2020 = require('ajv/dist/2020')
const addFormats = require('ajv-formats')
const contractDirectory = new URL('../web/tests/fixtures/production-2.0/', import.meta.url)
const requiredFiles = new Set([...productionBundleFiles, 'release_evidence.json', 'release_attestation.template.json', 'release_attestation.json'])
const sha = /^[a-f0-9]{64}$/
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const json = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))

export function readProductionContract() {
  const pin = json(readFileSync(new URL('PROVENANCE.json', contractDirectory)))
  const schemas = new Map()
  const schemaBytes = new Map()
  for (const { destination, sha256 } of pin.files) {
    const bytes = readFileSync(new URL(destination, contractDirectory))
    if (digest(bytes) !== sha256) throw new Error(`Pinned production contract checksum mismatch: ${destination}`)
    if (!destination.startsWith('schemas/')) continue
    const schema = json(bytes)
    schemas.set(schema.$id, schema)
    schemaBytes.set(destination.slice('schemas/'.length), bytes)
  }
  return { schemas, schemaBytes, contractCommit: pin.commit, requiredFiles }
}

function validateEvidenceSchema(schemas, evidence, attestation) {
  const ajv = addFormats(new Ajv2020({ strict: false }))
  for (const schema of schemas.values()) ajv.addSchema(schema)
  for (const [name, value] of [['release-evidence', evidence], ['release-attestation', attestation]]) {
    const validate = ajv.getSchema(`https://utsc.example/contracts/release/${name}.schema.json`)
    if (!validate?.(value)) throw new Error(`Production ${name} schema rejected`)
  }
}

const { CANONICAL_ROLE_IDS, FORMAL_CAREER_LEVELS } = await loadMarketCriteria()
const expectedQueries = new Set(CANONICAL_ROLE_IDS.flatMap(role => FORMAL_CAREER_LEVELS.map(level => `${role}/${level}`)))
const isComplete = status => ['verified_publishable', 'checked_no_valid_results'].includes(status)

function isPublicSource(value) {
  const url = new URL(value)
  const host = url.hostname.replace(/\.$/, '')
  return url.protocol === 'https:' && !url.username && !url.password && host.includes('.') && !isIP(host) &&
    !/(^|\.)(?:example\.(?:com|net|org)|example|test|invalid|localhost)$/.test(host)
}

function verifyCoverage(bundle, evidence) {
  const { market, sources } = evidence
  const manifest = bundle.manifest
  if (market.collected_from !== manifest.collected_from || market.collected_to !== manifest.collected_to ||
      market.query_config_version !== manifest.query_config_version || market.query_config_version !== 'jsearch-role-career-matrix-v1' || !market.usage_ref ||
      !market.collected_from || !market.collected_to || Date.parse(market.collected_to) > Date.parse(manifest.generated_at) ||
      market.unique_source_jobs < bundle.market_jobs.length || market.unique_source_jobs > market.raw_rows) {
    throw new Error('Production market evidence does not reconcile to the bundle')
  }
  const missing = new Set(expectedQueries)
  let rawRows = 0
  for (const query of market.queries) {
    if (!missing.delete(`${query.role_id}/${query.career_level}`) || !isComplete(query.status) || query.attempts < 1 ||
        (query.status === 'verified_publishable' ? !(query.result_count > 0) : query.result_count !== 0)) {
      throw new Error('Production query coverage is incomplete or inconsistent')
    }
    rawRows += query.result_count
  }
  if (missing.size || rawRows !== market.raw_rows) throw new Error('Production query counts do not reconcile')

  const records = {
    courses: new Set(bundle.courses.map(row => row.course_id)),
    resources: new Set(bundle.resources.map(row => row.resource_id)),
    organizers: new Set(bundle.organizers.map(row => row.organizer_id)),
    opportunities: new Set(bundle.opportunities.map(row => row.opportunity_id)),
  }
  const covered = new Set()
  const sourceIds = new Set()
  let inspectedOpportunitySources = false
  for (const source of sources) {
    if (sourceIds.has(source.source_id)) throw new Error('Duplicate source in the production source index')
    if ((source.status === 'not_checked') !== (source.checked_at === null) ||
        (source.checked_at && Date.parse(source.checked_at) > Date.parse(manifest.generated_at))) {
      throw new Error('Release source check time does not match its status or build date')
    }
    sourceIds.add(source.source_id)
    const publicUrl = isPublicSource(source.source_url)
    if (source.dataset === 'opportunities' && isComplete(source.status) && publicUrl) inspectedOpportunitySources = true
    if (source.status === 'verified_publishable') {
      if (!source.record_ids.length) throw new Error('A verified source lacks the records it verified')
      for (const id of source.record_ids) {
        if (!records[source.dataset].has(id)) throw new Error('Source index references a missing record')
        if (publicUrl && source.usage_ref) covered.add(`${source.dataset}/${id}`)
      }
    } else if (source.record_ids.length) {
      throw new Error('An incomplete or empty source carries unverified publication evidence')
    }
  }
  if (!inspectedOpportunitySources) throw new Error('Production source coverage is missing for opportunities')
  for (const [dataset, rows] of Object.entries(records)) {
    if (![...rows].every(id => covered.has(`${dataset}/${id}`))) {
      throw new Error(`Production source coverage is missing for ${dataset}`)
    }
  }
}

export async function verifyProductionPackage(directory, pin) {
  if (!/^[1-9]\d*\.\d+\.\d+$/.test(pin?.datasetVersion ?? '') ||
      !sha.test(pin.inventorySha256 ?? '') || !sha.test(pin.bundleSha256 ?? '') ||
      !/^[a-f0-9]{40}$/.test(pin.contractCommit ?? '') || !pin.approvalRef?.trim()) {
    throw new Error('A protected release pin with the exact version, digests and approval reference is required')
  }
  const contract = readProductionContract()
  if (pin.contractCommit !== contract.contractCommit) throw new Error('Approval points to a different upstream contract commit')
  const result = await verifyD7Package(directory, pin.inventorySha256, contract)
  const { bundle, bundleSha256, synthetic, files, opportunityReviews } = result
  const evidence = json(files.get('release_evidence.json'))
  const attestation = json(files.get('release_attestation.json'))
  validateEvidenceSchema(contract.schemas, evidence, attestation)
  contentCheck(evidence)
  if (synthetic || evidence.data_mode !== 'real' || bundle.market_jobs.some(job => job.source !== 'jsearch') ||
      bundle.manifest.run_status !== 'complete' || bundle.manifest.dataset_version !== pin.datasetVersion ||
      bundleSha256 !== pin.bundleSha256 || !bundle.market_jobs.length || !bundle.courses.length || !bundle.resources.length) {
    throw new Error('Production requires a complete, real package matching the protected release pin')
  }
  const publicUrls = [...bundle.market_jobs.map(job => job.source_url), ...bundle.courses.map(course => course.official_url),
    ...bundle.resources.map(resource => resource.source_url), ...bundle.organizers.map(organizer => organizer.profile_url),
    ...bundle.opportunities.flatMap(opportunity => [opportunity.source_url, opportunity.registration_url])]
  if (publicUrls.some(url => url !== null && !isPublicSource(url))) throw new Error('Published sources require public HTTPS URLs')
  verifyCoverage(bundle, evidence)
  const candidateLedger = [...files.keys()].filter(name => name !== 'release_attestation.json').sort()
    .map(name => `${digest(files.get(name))}  ${name}\n`).join('')
  if (attestation.candidate_sha256 !== digest(candidateLedger) || attestation.dataset_version !== pin.datasetVersion ||
      attestation.approval_ref !== pin.approvalRef || Date.parse(attestation.confirmed_at) < Date.parse(bundle.manifest.generated_at) ||
      Date.parse(attestation.confirmed_at) > Date.now()) {
    throw new Error('The signed release attestation does not bind these exact candidate bytes')
  }
  if (bundle.opportunities.some(item => opportunityReviews[item.opportunity_id] !== 'human_approved' || item.change_pending ||
      (item.source_updated_at && Date.parse(item.source_updated_at) > Date.parse(item.verified_at)))) {
    throw new Error('Every production opportunity requires current human approval')
  }
  return { bundle, bundleBytes: result.bundleBytes, schemaBytes: result.schemaBytes, opportunityReviews }
}
