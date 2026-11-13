import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, readdirSync, unlinkSync, rmdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { referenceStatistics, verifyD7Package } from './verify_d7_package.mjs'

const fixture = fileURLToPath(new URL('../web/tests/fixtures/d7-rehearsal/', import.meta.url))
const packageDirectory = path.join(fixture, 'package')
const trustedSha = JSON.parse(readFileSync(path.join(fixture, 'PIN.json'), 'utf8')).inventory_sha256
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const read = (directory, filename) => readFileSync(path.join(directory, filename))
const write = (directory, filename, bytes) => writeFileSync(path.join(directory, filename), bytes)

function copyPackage(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'utsc-d7-package-'))
  cpSync(packageDirectory, directory, { recursive: true })
  t.after(() => {
    for (const name of readdirSync(directory)) unlinkSync(path.join(directory, name))
    rmdirSync(directory)
  })
  return directory
}

function changeJson(directory, filename, change) {
  const value = JSON.parse(read(directory, filename))
  change(value)
  write(directory, filename, JSON.stringify(value, null, 2) + '\n')
}

function rehashFiles(directory) {
  const entries = readdirSync(directory).filter(name => name !== 'SHA256SUMS.txt').sort()
  const inventory = entries.map(name => `${hash(read(directory, name))}  ${name}\n`).join('')
  write(directory, 'SHA256SUMS.txt', inventory)
  return hash(inventory)
}

test('fixed synthetic D7 handoff verifies bytes, schema closure and review decisions', async () => {
  const result = await verifyD7Package(packageDirectory, trustedSha)
  assert.equal(result.bundle.manifest.schema_version, '1.1.0')
  assert.equal(result.bundle.manifest.dataset_version, '1.1.1')
  assert.equal(result.synthetic, true)
  assert.equal(hash(result.bundleBytes), result.bundleSha256)
  assert.equal(result.schemaBytes.size, 9)
  assert.equal(result.contractCommit, 'aa13bbbab82bc0b58b3f1cf205953cf38407a2e1')
  assert.deepEqual(result.opportunityReviews, {
    synthetic_exact_event: 'human_approved',
    synthetic_date_only_event: 'auto_candidate',
  })
  assert.deepEqual(referenceStatistics(result.bundle.market_jobs), {
    job_count: 3,
    analyzable_description_count: 2,
    skills: [
      { skill_id: 'excel', mention_count: 1, mention_rate: 0.5 },
      { skill_id: 'python', mention_count: 1, mention_rate: 0.5 },
      { skill_id: 'sql', mention_count: 1, mention_rate: 0.5 },
      { skill_id: 'teamwork', mention_count: 2, mention_rate: 1 },
    ],
  })
})

test('reference statistics omit non-formal jobs and preserve a zero denominator', () => {
  const { market_jobs: jobs } = JSON.parse(read(packageDirectory, 'bundle.json'))
  const notAnalyzable = { ...jobs[0], description_analyzable: false }
  const outOfScope = { ...jobs[1], role_classification_status: 'needs_review' }
  assert.deepEqual(referenceStatistics([notAnalyzable, outOfScope]), {
    job_count: 1,
    analyzable_description_count: 0,
    skills: ['python', 'sql', 'teamwork'].map(skill_id => ({
      skill_id,
      mention_count: 0,
      mention_rate: null,
    })),
  })
})

test('an inventory with an untrusted checksum is refused', async () => {
  await assert.rejects(verifyD7Package(packageDirectory, '0'.repeat(64)), /inventory checksum mismatch/)
})

test('a correctly bound partial candidate passes while a failed run is refused', async t => {
  const directory = copyPackage(t)
  for (const status of ['partial', 'failed']) {
    changeJson(directory, 'bundle.json', data => { data.manifest.run_status = status })
    changeJson(directory, 'manifest.json', data => { data.run_status = status })
    const digest = rehashFiles(directory)
    if (status === 'partial') {
      assert.equal((await verifyD7Package(directory, digest)).bundle.manifest.run_status, status)
    } else {
      await assert.rejects(verifyD7Package(directory, digest), /Failed D7 dataset/)
    }
  }
})

test('missing or unexpected members are refused', async t => {
  const missing = copyPackage(t)
  unlinkSync(path.join(missing, 'reference_statistics.json'))
  await assert.rejects(verifyD7Package(missing, trustedSha), /required files/)
  const extra = copyPackage(t)
  write(extra, 'release_attestation.json', '{}')
  await assert.rejects(verifyD7Package(extra, trustedSha), /required files/)
})

test('mismatched member bytes are refused even with the original trusted inventory', async t => {
  const directory = copyPackage(t)
  changeJson(directory, 'dataset_provenance.json', data => {
    data.datasets.opportunities.records[1].eligibility.decision = 'human_approved'
  })
  await assert.rejects(verifyD7Package(directory, trustedSha), /file checksum mismatch/)
})

for (const [name, edit, error] of [
  ['missing entry', lines => lines.slice(1), /incomplete D7 checksum inventory/i],
  ['duplicate entry', lines => [...lines, lines[0]], /duplicate D7 checksum entry/],
  ['unsafe entry', lines => lines.map((line, index) => index === 0 ? line.replace('  ', '  ../') : line), /unsafe/],
]) {
  test(`inventory with ${name} is refused after hashing`, async t => {
    const directory = copyPackage(t)
    const lines = read(directory, 'SHA256SUMS.txt').toString('utf8').trimEnd().split('\n')
    const inventory = edit(lines).join('\n') + '\n'
    write(directory, 'SHA256SUMS.txt', inventory)
    await assert.rejects(verifyD7Package(directory, hash(inventory)), error)
  })
}

for (const [name, file, change, error] of [
  ['incorrect counts', 'reference_statistics.json', data => { data.job_count = 999999 }, /reference statistics/],
  ['duplicated skill', 'reference_statistics.json', data => { data.skills.push(data.skills[0]) }, /reference statistics/],
  ['incorrect raw rate', 'reference_statistics.json', data => { data.skills[0].mention_rate = 0 }, /reference statistics/],
  ['inconsistent sidecar', 'opportunities.json', data => { data[0].title = 'Changed sidecar' }, /sidecar mismatch/],
  ['approved template', 'release_attestation.template.json', data => { data.confirmations.role_classifications = true }, /remain unsigned/],
  ['unknown market source', 'dataset_provenance.json', data => {
    delete data.datasets.market_jobs.source
  }, /provenance does not match the manifest/],
  ['stale review revision', 'dataset_provenance.json', data => {
    data.datasets.opportunities.records[0].eligibility.content_revision += 1
  }, /decision or revision mismatch/],
  ['unknown source post', 'dataset_provenance.json', data => {
    data.datasets.opportunities.records[0].source_post_ids[0].source_post_id = 'unmatched_post'
  }, /provenance ID/],
]) {
  test(`${name} is refused even when all checksums are valid`, async t => {
    const directory = copyPackage(t)
    changeJson(directory, file, change)
    await assert.rejects(verifyD7Package(directory, rehashFiles(directory)), error)
  })
}
