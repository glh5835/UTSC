import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { stageDelivery, activateDelivery, validateDelivery, materializeDelivery } from './publish_bundle.mjs'

const sample = new URL('../web/public/demo/a5-opportunities-demo.json', import.meta.url)
const bytes = fs.readFileSync(sample), expectedSha = crypto.createHash('sha256').update(bytes).digest('hex')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'utsc-release-test-'))
const options = { bundleFile: sample.pathname.replace(/^\/(.:\/)/, '$1'), expectedSha, mode: 'demo', store: path.join(temporary, 'store') }
options.bundleFile = (await import('node:url')).fileURLToPath(sample)
test('validates exactly the shared runtime schema and cross-record rules', async () => {
  const result = await validateDelivery(options)
  assert.equal(result.metadata.bundle_sha256, expectedSha)
})
test('stages immutable versions, switches atomically, rejects corruption and rolls back', async () => {
  const first = await stageDelivery(options)
  activateDelivery({ store: options.store, release: first.release })
  const pointer = fs.readFileSync(path.join(options.store, 'active.json'))
  await assert.rejects(stageDelivery(options))
  const b = JSON.parse(bytes); b.manifest.dataset_version = '0.10.1'
  const secondFile = path.join(temporary, 'second.json'); fs.writeFileSync(secondFile, JSON.stringify(b))
  const second = await stageDelivery({ ...options, bundleFile: secondFile, expectedSha: crypto.createHash('sha256').update(fs.readFileSync(secondFile)).digest('hex') })
  fs.writeFileSync(path.join(options.store, 'releases', second.release, 'bundle.json'), '{}')
  assert.throws(() => activateDelivery({ store: options.store, release: second.release }))
  assert.deepEqual(fs.readFileSync(path.join(options.store, 'active.json')), pointer)
  activateDelivery({ store: options.store, release: first.release })
  assert.deepEqual(fs.readFileSync(path.join(options.store, 'active.json')), pointer)
  const publicDirectory = path.join(temporary, 'public'), selectionFile = path.join(temporary, 'selected.ts'), allowlistFile = path.join(temporary, 'allowed.json')
  fs.writeFileSync(allowlistFile, '[]')
  const materialized = materializeDelivery({ store: options.store, publicDirectory, selectionFile, allowlistFile })
  assert.equal(materialized.bundle_sha256, expectedSha)
  assert.deepEqual(fs.readFileSync(path.join(publicDirectory, materialized.bundlePath.slice(1))), bytes)
  assert.deepEqual(JSON.parse(fs.readFileSync(allowlistFile)), [materialized.bundlePath.slice(1)])
})
test('rejects bad checksums, unsupported contracts, partial runs and dishonest demo mode', async () => {
  await assert.rejects(validateDelivery({ ...options, expectedSha: '0'.repeat(64) }))
  for (const alter of [b => { b.manifest.schema_version = '1.1.0' }, b => { b.manifest.run_status = 'partial' }, b => { b.market_jobs[0].source = 'jsearch' }, b => { b.opportunities[0].title = 'Real event' }, b => { b.opportunities[0].skill_ids = ['does_not_exist'] }]) {
    const b = JSON.parse(bytes); alter(b); const file = path.join(temporary, crypto.randomUUID() + '.json'); fs.writeFileSync(file, JSON.stringify(b))
    await assert.rejects(validateDelivery({ ...options, bundleFile: file, expectedSha: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }))
  }
})
test('requires a real hash-bound attestation for published data and rejects traversal', async () => {
  await assert.rejects(validateDelivery({ ...options, mode: 'published' }))
  assert.throws(() => activateDelivery({ store: options.store, release: '../outside' }))
})
