import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, cpSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkDist } from './check-dist.mjs'

const original = fileURLToPath(new URL('../static-dist/', import.meta.url))
function probe(mutate, pattern) {
  const directory = mkdtempSync(resolve(tmpdir(), 'utsc-output-probe-'))
  try {
    cpSync(original, directory, { recursive: true })
    mutate(directory)
    assert.throws(() => checkDist(directory), pattern)
  } finally { rmSync(directory, { recursive: true, force: true }) }
}
test('the actual demo output passes', () => assert.ok(checkDist(original) >= 20))
for (const name of ['.env', 'user-records.json', 'assets/debug.js.map']) {
  test(`rejects accidentally packaged ${name}`, () => {
    probe(dir => writeFileSync(resolve(dir, name), 'private data'), /Unapproved deployment file/)
  })
}
test('rejects a server secret injected into an approved file', () => {
  probe(dir => appendFileSync(resolve(dir, 'index.html'), 'sb_secret_security_test_value'), /Server credential/)
})
test('rejects a legacy service_role JWT injected into an approved file', () => {
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.testsignature`
  probe(dir => appendFileSync(resolve(dir, 'index.html'), token), /Server JWT/)
})
test('rejects missing security metadata', () => {
  probe(dir => writeFileSync(resolve(dir, 'index.html'), '<html>unsafe</html>'), /Missing browser security/)
})
