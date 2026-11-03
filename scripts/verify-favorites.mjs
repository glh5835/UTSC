import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { reserveReportOutput } from '../web/tests/report-output.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = reserveReportOutput(process.argv.slice(2), { root })
const { UTSC_SUPABASE_URL: url, UTSC_SUPABASE_PUBLISHABLE_KEY: key, UTSC_SUPABASE_SERVICE_ROLE_KEY: secret } = process.env
if (url !== 'http://127.0.0.1:55421' || !key || !secret) throw new Error('The isolated local QA stack must be explicitly configured')
const require = createRequire(path.join(root, 'web/package.json')), { createClient } = require('@supabase/supabase-js')
const config = { auth: { persistSession: false, autoRefreshToken: false } }, admin = createClient(url, secret, config), anon = createClient(url, key, config)
const accounts = [], checks = [], suffix = crypto.randomUUID()
async function check(name, run) {
  try { await run(); checks.push({ name, passed: true }) } catch (error) { checks.push({ name, passed: false, message: error.message }) }
}
function ok(result) { assert.equal(result.error, null, result.error?.message); return result.data }
try {
  for (const label of ['a', 'b']) {
    const email = `utsc-a6-${label}-${suffix}@example.test`, password = crypto.randomUUID() + '!Aa2'
    const user = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user
    accounts.push({ uid: user.id, client: createClient(url, key, config) })
    ok(await accounts.at(-1).client.auth.signInWithPassword({ email, password }))
  }
  const [a, b] = accounts
  await check('A explicitly saves a resource', async () => { ok(await a.client.from('favorites').insert({ target_type: 'resource', target_id: 'synthetic_sql' })); assert.equal(ok(await a.client.from('favorites').select('*')).length, 1) })
  await check('Duplicate save is constrained by the database', async () => { assert.equal((await a.client.from('favorites').insert({ target_type: 'resource', target_id: 'synthetic_sql' })).error?.code, '23505') })
  await check('A saves an opportunity independently', async () => { ok(await a.client.from('favorites').insert({ target_type: 'opportunity', target_id: 'synthetic_opportunity_1' })); assert.equal(ok(await a.client.from('favorites').select('*')).length, 2) })
  await check('B cannot read A favorites', async () => { assert.deepEqual(ok(await b.client.from('favorites').select('*')), []) })
  await check('B cannot forge A ownership', async () => { assert.ok((await b.client.from('favorites').insert({ user_id: a.uid, target_type: 'resource', target_id: 'forged' })).error) })
  await check('B cannot update A records', async () => { assert.deepEqual(ok(await b.client.from('favorites').update({ target_id: 'changed' }).eq('user_id', a.uid).select('*')), []) })
  await check('B cannot delete A records', async () => { assert.deepEqual(ok(await b.client.from('favorites').delete().eq('user_id', a.uid).select('*')), []); assert.equal(ok(await a.client.from('favorites').select('*')).length, 2) })
  await check('A cannot transfer ownership to B', async () => { assert.ok((await a.client.from('favorites').update({ user_id: b.uid }).eq('target_id', 'synthetic_sql')).error) })
  await check('Anonymous reads and writes are refused', async () => { assert.ok((await anon.from('favorites').select('*')).error); assert.ok((await anon.from('favorites').insert({ target_type: 'resource', target_id: 'anonymous' })).error) })
  await check('Invalid target type is rejected', async () => { assert.ok((await a.client.from('favorites').insert({ target_type: 'admin', target_id: 'bad' })).error) })
  await check('A explicitly removes one saved item and preserves the other', async () => { ok(await a.client.from('favorites').delete().eq('target_type', 'resource').eq('target_id', 'synthetic_sql')); assert.equal(ok(await a.client.from('favorites').select('*')).length, 1) })
} catch (error) {
  checks.push({ name: 'Real local setup and execution', passed: false, message: error.message })
} finally {
  for (const account of accounts) {
    await check('Temporary account deleted with favorites cascade', async () => {
      ok(await admin.auth.admin.deleteUser(account.uid))
      for (const table of ['favorites', 'experiences', 'user_skills', 'learning_paths', 'path_items', 'profiles']) {
        assert.equal(ok(await admin.from(table).select('*').eq(table === 'profiles' ? 'id' : 'user_id', account.uid)).length, 0)
      }
    })
  }
  const report = { passed: checks.filter(item => item.passed).length, total: checks.length, checks, scope: 'real isolated local Supabase; only uniquely created QA accounts mutated and removed' }
  output.write(report)
  console.log(`${report.passed}/${report.total} real favorites checks passed`)
  if (accounts.length !== 2 || report.passed !== report.total) process.exitCode = 1
}
