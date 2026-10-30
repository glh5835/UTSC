import assert from 'node:assert/strict'

/**
 * A4 acceptance against the real local Supabase stack. Ordinary user clients
 * prove RLS and constraint behaviour for learning_paths / path_items; the
 * admin client is used only to prepare and confirm accounts and to read
 * physical rows for cleanup assertions.
 */
export async function runA4Matrix({ url, publicKey, secret, createClient }, log = () => {}) {
  const checks = []
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(url, secret, options)
  const anon = createClient(url, publicKey, options)
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  const email = (label) => `utsc-a4-${runId}-${label.toLowerCase()}@example.test`
  const password = `A4-${runId}-pass`
  const accounts = {}
  let allPassed = true

  async function check(name, action) {
    try {
      await action()
      checks.push({ name, passed: true })
      log(`ok   ${name}`)
    } catch (error) {
      allPassed = false
      checks.push({ name, passed: false, message: error.message })
      log(`FAIL ${name}: ${error.message}`)
    }
  }

  function ok(result, label) {
    assert.equal(result.error, null, `${label}: ${result.error?.code ?? ''} ${result.error?.message ?? ''}`)
    return result.data
  }

  async function count(table, uid) {
    const key = table === 'profiles' ? 'id' : 'user_id'
    const rows = ok(await admin.from(table).select('id').eq(key, uid), `physical ${table}`)
    return rows.length
  }

  async function createAccount(label) {
    const client = createClient(url, publicKey, options)
    const signup = ok(await client.auth.signUp({ email: email(label), password }), `${label} signUp`)
    assert.equal(signup.session, null)
    const uid = signup.user.id
    ok(await admin.auth.admin.updateUserById(uid, { email_confirm: true }), `${label} confirm`)
    ok(await client.auth.signInWithPassword({ email: email(label), password }), `${label} login`)
    accounts[label] = { uid, client }
  }

  async function cleanup() {
    for (const account of Object.values(accounts)) {
      await admin.auth.admin.deleteUser(account.uid)
    }
    const remaining = {}
    for (const [label, account] of Object.entries(accounts)) {
      remaining[label] = {
        profiles: await count('profiles', account.uid),
        learning_paths: await count('learning_paths', account.uid),
        path_items: await count('path_items', account.uid),
      }
    }
    return remaining
  }

  try {
    await createAccount('A')
    await createAccount('B')
    const a = accounts.A
    const b = accounts.B

    await check('a user creates a path with skill and resource items and reads them back', async () => {
      const path = ok(await a.client.from('learning_paths').insert({
        target_role_id: 'data_analyst',
      }).select('id').single(), 'create path')
      a.pathId = path.id
      ok(await a.client.from('path_items').insert({
        path_id: a.pathId, resource_id: null, skill_id: 'sql', status: 'not_started',
      }), 'add skill item')
      ok(await a.client.from('path_items').insert({
        path_id: a.pathId, resource_id: 'demo_resource', skill_id: null, status: 'not_started',
      }), 'add resource item')
      const items = ok(await a.client.from('path_items').select('id, resource_id, skill_id, status').eq('path_id', a.pathId), 'read items')
      assert.equal(items.length, 2)
      assert.deepEqual(items.map((row) => row.skill_id ?? row.resource_id).sort(), ['demo_resource', 'sql'])
    })

    await check('re-adding the same resource or skill is rejected as a duplicate and keeps status', async () => {
      ok(await a.client.from('path_items').update({ status: 'in_progress' }).eq('path_id', a.pathId).eq('skill_id', 'sql'), 'progress sql')
      const dupSkill = await a.client.from('path_items').insert({
        path_id: a.pathId, resource_id: null, skill_id: 'sql', status: 'not_started',
      })
      assert.equal(dupSkill.error?.code, '23505', 'duplicate skill add was accepted')
      const dupResource = await a.client.from('path_items').insert({
        path_id: a.pathId, resource_id: 'demo_resource', skill_id: null, status: 'not_started',
      })
      assert.equal(dupResource.error?.code, '23505', 'duplicate resource add was accepted')
      const rows = ok(await a.client.from('path_items').select('skill_id, status').eq('path_id', a.pathId).eq('skill_id', 'sql'), 'read sql item')
      assert.equal(rows.length, 1)
      assert.equal(rows[0].status, 'in_progress', 'duplicate add reset existing progress')
      assert.equal(await count('path_items', a.uid), 2)
    })

    await check('a resource item and a skill item stay independent', async () => {
      ok(await a.client.from('path_items').update({ status: 'completed' }).eq('path_id', a.pathId).eq('resource_id', 'demo_resource'), 'complete resource')
      const rows = ok(await a.client.from('path_items').select('skill_id, resource_id, status').eq('path_id', a.pathId), 'read both')
      const statuses = Object.fromEntries(rows.map((row) => [row.skill_id ?? row.resource_id, row.status]))
      assert.equal(statuses.sql, 'in_progress')
      assert.equal(statuses.demo_resource, 'completed')
    })

    await check('B cannot read A paths or items and cannot bind items to A path', async () => {
      const paths = ok(await b.client.from('learning_paths').select('id').eq('user_id', a.uid), 'B read A paths')
      assert.deepEqual(paths, [])
      const items = ok(await b.client.from('path_items').select('id').eq('user_id', a.uid), 'B read A items')
      assert.deepEqual(items, [])
      const bound = await b.client.from('path_items').insert({
        path_id: a.pathId, resource_id: null, skill_id: 'excel', status: 'not_started',
      })
      assert.ok(bound.error, 'B could attach an item to A path')
      assert.equal(await count('path_items', a.uid), 2)
    })

    await check('B cannot update or delete A items and forging user_id fails', async () => {
      const updated = ok(await b.client.from('path_items').update({ status: 'completed' }).eq('path_id', a.pathId).select('id'), 'B update A items')
      assert.deepEqual(updated, [])
      const removed = ok(await b.client.from('path_items').delete().eq('path_id', a.pathId).select('id'), 'B delete A items')
      assert.deepEqual(removed, [])
      const forged = await b.client.from('path_items').insert({
        user_id: a.uid, path_id: a.pathId, resource_id: null, skill_id: 'excel', status: 'not_started',
      })
      assert.ok(forged.error, 'forged user_id item insert was accepted')
      const forgedPath = await b.client.from('learning_paths').insert({
        user_id: a.uid, target_role_id: 'bi_analyst',
      })
      assert.ok(forgedPath.error, 'forged user_id path insert was accepted')
    })

    await check('owner status transitions work and are self-reported only', async () => {
      for (const status of ['in_progress', 'completed', 'not_started']) {
        ok(await a.client.from('path_items').update({ status }).eq('path_id', a.pathId).eq('skill_id', 'sql'), `status ${status}`)
        const row = ok(await a.client.from('path_items').select('status, updated_at').eq('path_id', a.pathId).eq('skill_id', 'sql').single(), 'read status')
        assert.equal(row.status, status)
      }
    })

    await check('a fresh login (refresh/restore) sees the same personal paths', async () => {
      const restored = createClient(url, publicKey, options)
      ok(await restored.auth.signInWithPassword({ email: email('A'), password }), 'A re-login')
      const paths = ok(await restored.from('learning_paths').select('id, target_role_id').eq('user_id', a.uid), 'restored read paths')
      assert.deepEqual(paths, [{ id: a.pathId, target_role_id: 'data_analyst' }])
      const items = ok(await restored.from('path_items').select('id').eq('path_id', a.pathId), 'restored read items')
      assert.equal(items.length, 2)
    })

    await check('anonymous cannot read or write path tables', async () => {
      const readPaths = await anon.from('learning_paths').select('*')
      const readItems = await anon.from('path_items').select('*')
      assert.ok(readPaths.error, 'anon read learning_paths')
      assert.ok(readItems.error, 'anon read path_items')
      const write = await anon.from('learning_paths').insert({ target_role_id: 'data_analyst' })
      assert.ok(write.error, 'anon path insert')
    })

    await check('invalid status and unknown role values are rejected by the database', async () => {
      const badStatus = await a.client.from('path_items').update({ status: 'done' }).eq('path_id', a.pathId).eq('skill_id', 'sql')
      assert.ok(badStatus.error, 'invalid status accepted')
      const badRole = await a.client.from('learning_paths').insert({ target_role_id: 'wizard' })
      assert.ok(badRole.error, 'unknown target role accepted')
    })

    await check('deleting a path cascades its items', async () => {
      ok(await a.client.from('learning_paths').delete().eq('id', a.pathId), 'delete path')
      assert.equal(await count('learning_paths', a.uid), 0)
      assert.equal(await count('path_items', a.uid), 0)
    })

    await check('B maintains an independent path of their own', async () => {
      const path = ok(await b.client.from('learning_paths').insert({
        target_role_id: 'bi_analyst',
      }).select('id').single(), 'B create path')
      b.pathId = path.id
      ok(await b.client.from('path_items').insert({
        path_id: b.pathId, resource_id: null, skill_id: 'power_bi', status: 'in_progress',
      }), 'B add item')
      const paths = ok(await a.client.from('learning_paths').select('id'), 'A sees no B paths')
      assert.deepEqual(paths, [])
      assert.equal(await count('learning_paths', b.uid), 1)
      assert.equal(await count('path_items', b.uid), 1)
    })

    await check('account deletion cascades all A4 private rows', async () => {
      const remaining = await cleanup()
      assert.deepEqual(remaining, {
        A: { profiles: 0, learning_paths: 0, path_items: 0 },
        B: { profiles: 0, learning_paths: 0, path_items: 0 },
      })
    })
  } catch (error) {
    allPassed = false
    checks.push({ name: 'A4 FATAL', passed: false, message: error.message })
    log(`A4 FATAL ${error.message}`)
  } finally {
    try {
      if (accounts.A || accounts.B) await cleanup()
    } catch {
      // The preceding checks/report show whether cleanup failed by assertions.
    }
  }

  return { allPassed, checks, runId, url }
}
