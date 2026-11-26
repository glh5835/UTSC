import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadBundleValidation, loadMarketCriteria } from './publish_bundle.mjs'
import { referenceStatistics } from './verify_d7_package.mjs'
import { readProductionContract, verifyProductionPackage } from './verify_production_package.mjs'

const fixtureRoot = new URL('../web/tests/fixtures/production-2.0/fixtures/', import.meta.url)
const rehearsalRoot = new URL('../web/tests/fixtures/d7-rehearsal/package/', import.meta.url)
const fixture = name => JSON.parse(readFileSync(new URL(`${name}.json`, fixtureRoot), 'utf8'))
const rehearsal = name => JSON.parse(readFileSync(new URL(`${name}.json`, rehearsalRoot), 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const { CANONICAL_ROLE_IDS, FORMAL_CAREER_LEVELS } = await loadMarketCriteria()
const { contractCommit } = readProductionContract()

// Disposable trust-boundary specimen. All values are test data, including the
// nominal approval fields used to drive the verifier's success and failure paths.
function withPackage(mutate, check) {
  const directory = mkdtempSync(join(tmpdir(), 'utsc-production-gate-test-'))
  const date = '2026-10-26T15:00:00Z'
  const bundle = fixture('empty_bundle')
  bundle.manifest.collected_from = date
  bundle.manifest.collected_to = date
  bundle.manifest.query_config_version = 'jsearch-role-career-matrix-v1'
  bundle.skills = rehearsal('skills')
  bundle.market_jobs = [{ ...rehearsal('market_jobs')[0], source: 'jsearch', source_url: null, job_key: 'jsearch:qa_fixture' }]
  bundle.manifest.sample_count = bundle.market_jobs.length
  bundle.courses = [{ ...rehearsal('courses')[0], verified_at: date, official_url: 'https://utsc.calendar.utoronto.ca/' }]
  bundle.resources = [{ ...rehearsal('learning_resources')[0], verified_at: date, source_url: 'https://docs.python.org/3/' }]
  const { manifest } = bundle
  const evidence = {
    data_mode: 'real',
    market: {
      run_id: 'qa_gate_test', query_config_version: manifest.query_config_version,
      collected_from: date, collected_to: date, usage_ref: 'test-only-market', raw_rows: 1, unique_source_jobs: 1,
      queries: CANONICAL_ROLE_IDS.flatMap(role_id => FORMAL_CAREER_LEVELS.map(career_level => {
        const match = role_id === 'data_analyst' && career_level === 'internship'
        return { role_id, career_level, status: match ? 'verified_publishable' : 'checked_no_valid_results', attempts: 1, result_count: Number(match) }
      })),
    },
    sources: [
      ['courses', bundle.courses[0].official_url, bundle.courses[0].course_id],
      ['resources', bundle.resources[0].source_url, bundle.resources[0].resource_id],
      ['organizers', 'https://www.utsc.utoronto.ca/', null],
      ['opportunities', 'https://www.utsc.utoronto.ca/', null],
    ].map(([dataset, source_url, id]) => ({
      source_id: `test-only-${dataset}`, dataset, source_url,
      status: id ? 'verified_publishable' : 'checked_no_valid_results', checked_at: date,
      record_ids: id ? [id] : [], usage_ref: id ? 'test-only-content' : null,
    })),
  }
  const confirmations = { role_classifications: true, course_evidence: true, opportunity_dates: true, sources_and_usage: true }
  const attestation = {
    dataset_version: manifest.dataset_version, reviewer: 'QA fixture', confirmed_at: '2026-10-27T16:00:00Z',
    approval_ref: 'unit-test-only', confirmations,
  }
  mutate(bundle, evidence, attestation)
  const files = {
    'bundle.json': bundle, 'manifest.json': manifest, 'market_jobs.json': bundle.market_jobs, 'skills.json': bundle.skills,
    'organizers.json': bundle.organizers, 'courses.json': bundle.courses, 'learning_resources.json': bundle.resources,
    'opportunities.json': bundle.opportunities, 'reference_statistics.json': referenceStatistics(bundle.market_jobs),
    'dataset_provenance.json': {
      generated_at: manifest.generated_at,
      datasets: {
        market_jobs: { source: 'jsearch', collected_from: date, collected_to: date },
        opportunities: { source: 'official', collected_from: null, collected_to: null, records: [] },
        courses: { timestamp_field: 'verified_at', records: bundle.courses.map(({ course_id, verified_at }) => ({ course_id, verified_at })) },
        resources: { timestamp_field: 'verified_at', records: bundle.resources.map(({ resource_id, verified_at }) => ({ resource_id, verified_at })) },
        organizers: { timestamp_field: 'last_verified_at', records: [] },
      },
    },
    'release_evidence.json': evidence,
    'release_attestation.template.json': {
      dataset_version: manifest.dataset_version, reviewer: '', confirmed_at: '',
      confirmations: Object.fromEntries(Object.keys(confirmations).map(key => [key, false])),
    },
  }
  const text = value => JSON.stringify(value) + '\n'
  const ledger = entries => Object.keys(entries).sort().map(name => `${hash(text(entries[name]))}  ${name}\n`).join('')
  attestation.candidate_sha256 ??= hash(ledger(files))
  files['release_attestation.json'] = attestation
  const inventory = ledger(files)
  for (const [name, value] of Object.entries(files)) writeFileSync(join(directory, name), text(value))
  writeFileSync(join(directory, 'SHA256SUMS.txt'), inventory)
  const pin = {
    datasetVersion: manifest.dataset_version, inventorySha256: hash(inventory), bundleSha256: hash(text(bundle)),
    contractCommit, approvalRef: 'unit-test-only',
  }
  return Promise.resolve().then(() => check(directory, pin)).finally(() => rmSync(directory, { recursive: true }))
}

test('production gate independently accepts a complete and correctly bound test specimen', () =>
  withPackage(() => {}, async (directory, pin) => {
    const { bundle } = await verifyProductionPackage(directory, pin)
    assert.equal(bundle.manifest.schema_version, '2.0.0')
  }))

const rejections = [
  ['candidate contract', bundle => { bundle.manifest.schema_version = '1.1.0' }, /bundle schema rejected/],
  ['partial run', bundle => { bundle.manifest.run_status = 'partial' }, /complete, real package/],
  ['synthetic mode', (_, evidence) => { evidence.data_mode = 'synthetic' }, /complete, real package/],
  ['reserved public URL', bundle => { bundle.resources[0].source_url = 'https://example.org' }, /public HTTPS URLs/],
  ['missing query', (_, evidence) => { evidence.market.queries.pop() }, /query counts do not reconcile/],
  ['unchecked opportunity source', (_, evidence) => { evidence.sources.at(-1).status = 'not_checked' }, /coverage is missing for opportunities/],
  ['unsigned confirmation', (_, __, attestation) => { attestation.confirmations.sources_and_usage = false }, /attestation schema rejected/],
  ['different attested candidate digest', (_, __, attestation) => { attestation.candidate_sha256 = '0'.repeat(64) }, /does not bind/],
]
for (const [name, mutate, expectedError] of rejections) {
  test(`production gate rejects ${name}`, () => withPackage(mutate, (directory, pin) =>
    assert.rejects(verifyProductionPackage(directory, pin), expectedError)))
}

test('production gate rejects a changed inventory and a tampered member', () => withPackage(() => {}, async (directory, pin) => {
  await assert.rejects(verifyProductionPackage(directory, { ...pin, inventorySha256: '0'.repeat(64) }), /inventory checksum mismatch/)
  writeFileSync(join(directory, 'release_evidence.json'), '{}\n')
  await assert.rejects(verifyProductionPackage(directory, pin), /file checksum mismatch/)
}))

test('2.0 accepts the upstream synthetic organizer whose official site has no Instagram username', async () => {
  const { schemas } = readProductionContract()
  const { createBundleValidator } = await loadBundleValidation()
  const validate = createBundleValidator(schemas)
  const bundle = fixture('empty_bundle')
  bundle.organizers.push(fixture('official_organizer'))
  assert.equal(validate(bundle), true, JSON.stringify(validate.errors))
})
