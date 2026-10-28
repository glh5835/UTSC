import assert from 'node:assert/strict'

/**
 * Full A1 RLS acceptance matrix against a running local Supabase stack.
 *
 * Exports runMatrix() (used by the vitest wrapper and the standalone
 * acceptance CLI); contains NO process.exit and prints nothing unless a
 * logger is provided. Every allow/deny assertion runs through ordinary
 * user-session clients created with the public publishable key; the
 * service_role client is used ONLY for account preparation, physical row
 * verification and cleanup.
 *
 * Strictness rules (from the 2026-10-28 review):
 * - Test payloads are complete and individually valid; both accounts'
 *   own CRUD MUST succeed, proving the payloads themselves are fine.
 * - Denials are classified by Postgres error code: RLS refusal is 42501,
 *   foreign-key refusal is 23503, unique/PK refusal is 23505. A check that
 *   expects a permission refusal fails if it observes a constraint code
 *   instead (wrong failure mode), or succeeds with rows affected.
 * - Every denial also deep-compares the victim's physical rows before and
 *   after, so "some error happened" can never pass for "database intact".
 * - The metadata escalation test is performed BY the ordinary user (self
 *   edit + session refresh + JWT payload inspection), not by the admin.
 * - Account deletion is verified per physical table across all six tables.
 */

const TABLES = ['profiles', 'experiences', 'user_skills', 'favorites', 'learning_paths', 'path_items']
const OWNER_KEY = (table) => (table === 'profiles' ? 'id' : 'user_id')

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // Node ≥19 has crypto.randomUUID; fallback for exotic environments.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

const ACCOUNT_SPEC = {
  A: {
    skill_id: 'python',
    favorite_target: 'resource_own_a1',
    target_role_id: 'data_analyst',
    resource_id: 'res_own_a1',
  },
  B: {
    skill_id: 'typescript',
    favorite_target: 'resource_own_b1',
    target_role_id: 'data_engineer',
    resource_id: 'res_own_b1',
  },
}

function ownBody(table, uid, label) {
  const s = ACCOUNT_SPEC[label]
  switch (table) {
    case 'profiles':
      return { id: uid, display_name: `${label}-matrix-name`, completed_course_ids: [`course_${label.toLowerCase()}`] }
    case 'experiences':
      return { user_id: uid, text: `${label} own matrix experience` }
    case 'user_skills':
      return { user_id: uid, skill_id: s.skill_id, source: 'manual', source_id: null }
    case 'favorites':
      return { user_id: uid, target_type: 'resource', target_id: s.favorite_target }
    case 'learning_paths':
      return { user_id: uid, target_role_id: s.target_role_id }
    default:
      return { user_id: uid, path_id: null, resource_id: s.resource_id, skill_id: s.skill_id, status: 'not_started' }
  }
}

function forgeBody(table, uid, label, marker) {
  const body = ownBody(table, uid, label)
  if (table === 'profiles') body.display_name = marker
  if (table === 'experiences') body.text = marker
  if (table === 'user_skills') body.skill_id = 'rust' // not owned by the victim either → keeps the refusal purely RLS
  if (table === 'favorites') body.target_id = `forge_${marker}`
  if (table === 'learning_paths') body.target_role_id = 'bi_analyst'
  if (table === 'path_items') body.status = 'completed'
  return body
}

function mutationPayload(table, marker) {
  switch (table) {
    case 'profiles':
      return { display_name: marker }
    case 'experiences':
      return { text: marker }
    case 'user_skills':
      return { source_id: marker }
    case 'favorites':
      return { created_at: '2026-01-01T00:00:00Z' }
    case 'learning_paths':
      return { target_role_id: 'bi_analyst' }
    default:
      return { status: 'completed' }
  }
}

function anonInsertBody(table, uid) {
  switch (table) {
    case 'profiles':
      return { id: uuid(), display_name: 'anon probe', completed_course_ids: [] }
    case 'experiences':
      return { user_id: uid, text: 'anon probe' }
    case 'user_skills':
      return { user_id: uid, skill_id: 'python', source: 'manual' }
    case 'favorites':
      return { user_id: uid, target_type: 'resource', target_id: 'anon_probe' }
    case 'learning_paths':
      return { user_id: uid, target_role_id: 'data_analyst' }
    default:
      return { user_id: uid, path_id: null, status: 'not_started' }
  }
}

export function isRlsRefusal(error) {
  return Boolean(error) && (error.code === '42501' || /row-level security|permission denied/i.test(error.message ?? ''))
}
export function isConstraintRefusal(error) {
  return Boolean(error) && ['23503', '23505', '23502', '23514', '23P01'].includes(error.code)
}

/** Runs the whole matrix. Returns { allPassed, checks, integrity, cleanup, accounts }.
 * config: { url, publicKey, secret, createClient } — createClient comes from
 * @supabase/supabase-js (injected so this module stays dependency-free). */
export async function runMatrix({ url, publicKey, secret, createClient }, log = () => {}) {
  const checks = []
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(url, secret, options)
  const anon = createClient(url, publicKey, options)
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const EMAIL = (label) => `utsc-matrix-${runId}-${label.toLowerCase()}@example.com`
  const PASSWORD = `Matrix-${runId}-pass`
  const accounts = {} // label → { uid, client, pathId }
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

  function requireOk(result, label) {
    assert.equal(result.error, null, `${label}: unexpected error ${result.error?.code ?? ''} ${result.error?.message ?? ''}`)
    return result.data
  }

  async function physical(table, uid) {
    const [key, value] = [OWNER_KEY(table), uid]
    return requireOk(await admin.from(table).select('*').eq(key, value), `physical read ${table}`)
  }

  async function assertPhysicalUnchanged(table, uid, before, context) {
    const after = await physical(table, uid)
    assert.deepEqual(after, before, `${context}: physical rows of ${table} changed after a denied operation`)
  }

  async function createAccount(label) {
    const client = createClient(url, publicKey, options)
    const signup = await client.auth.signUp({ email: EMAIL(label), password: PASSWORD })
    requireOk(signup, `${label} real signUp`)
    assert.equal(signup.data.session, null, `${label}: signup must NOT yield a session (email confirmation required)`)
    const uid = signup.data.user.id
    requireOk(await admin.auth.admin.updateUserById(uid, { email_confirm: true }), `${label} local confirmation (test preparation only)`)
    const login = await client.auth.signInWithPassword({ email: EMAIL(label), password: PASSWORD })
    requireOk(login, `${label} real password sign-in`)
    assert.equal(login.data.session.user.id, uid, `${label}: signed-in id must match the registered user`)
    const profile = requireOk(await admin.from('profiles').select('id').eq('id', uid), `${label} signup trigger created profile row`)
    assert.equal(profile.length, 1, `${label}: profiles row missing after signup`)
    return { uid, client }
  }

  async function cleanupAccounts() {
    const labels = Object.keys(accounts)
    for (const label of labels) {
      await admin.auth.admin.deleteUser(accounts[label].uid)
    }
    const remaining = {}
    for (const label of labels) {
      for (const table of TABLES) {
        const rows = await physical(table, accounts[label].uid)
        remaining[`${label}/${table}`] = rows.length
      }
    }
    return remaining
  }

  try {
    // ---- 0. Environment sanity (caller guarantees credentials; this proves reachability + migrations) ----
    const reachable = await admin.from('profiles').select('id').limit(1)
    if (reachable.error) {
      throw new Error(`Supabase stack unreachable or migrations missing: ${reachable.error.code} ${reachable.error.message}`)
    }

    // ---- 1. Two real accounts: signUp → confirmation required → admin confirms → password login ----
    for (const label of ['A', 'B']) {
      await check(`${label}: real signUp, confirmation required, real password login`, async () => {
        accounts[label] = await createAccount(label)
      })
    }
    if (!accounts.A || !accounts.B) throw new Error('account creation failed; aborting matrix')

    // ---- 2. Each account reads and writes its own data in all six tables ----
    // (path_items is exercised separately below because it needs the path id
    // created by the learning_paths iteration.)
    for (const label of ['A', 'B']) {
      for (const table of TABLES.filter((t) => t !== 'path_items')) {
        await check(`${label}: own ${table} insert/select/update succeed (payload validity proof)`, async () => {
          const uid = accounts[label].uid
          const client = accounts[label].client
          if (table === 'profiles') {
            const body = ownBody(table, uid, label)
            const updated = requireOk(await client.from(table).update({ display_name: body.display_name, completed_course_ids: body.completed_course_ids }).eq('id', uid).select(), 'own profiles update')
            assert.equal(updated.length, 1)
            assert.equal(updated[0].display_name, body.display_name)
            const rows = requireOk(await client.from(table).select().eq('id', uid), 'own profiles select')
            assert.equal(rows.length, 1)
            return
          }
          const body = ownBody(table, uid, label)
          if (table === 'path_items') body.path_id = accounts[label].pathId
          const created = requireOk(await client.from(table).insert(body).select(), `own ${table} insert`)
          assert.equal(created.length, 1, `own ${table} insert returned ${created.length} rows`)
          if (table === 'learning_paths') accounts[label].pathId = created[0].id
          const [key, value] = [OWNER_KEY(table), uid]
          const rows = requireOk(await client.from(table).select().eq(key, value), `own ${table} select`)
          assert.equal(rows.length, 1)
          const updated = requireOk(await client.from(table).update(mutationPayload(table, `${label} matrix own edit`)).eq(key, value).select(), `own ${table} update`)
          assert.equal(updated.length, 1)
          // restore a clean owned state for the denial sections below
          const restored = requireOk(await client.from(table).update(body).eq(key, value).select(), `own ${table} restore`)
          assert.equal(restored.length, 1)
        })
      }
    }
    // path_items for both accounts (needs the path ids created above)
    for (const label of ['A', 'B']) {
      await check(`${label}: own path_items insert/select/update succeed`, async () => {
        const uid = accounts[label].uid
        const client = accounts[label].client
        assert.ok(accounts[label].pathId, `${label}: learning_paths row missing`)
        const body = ownBody('path_items', uid, label)
        body.path_id = accounts[label].pathId
        const created = requireOk(await client.from('path_items').insert(body).select(), 'own path_items insert')
        assert.equal(created.length, 1)
        accounts[label].itemId = created[0].id
        const rows = requireOk(await client.from('path_items').select().eq('user_id', uid), 'own path_items select')
        assert.equal(rows.length, 1)
        const updated = requireOk(await client.from('path_items').update({ status: 'in_progress' }).eq('id', created[0].id).select(), 'own path_items update')
        assert.equal(updated[0].status, 'in_progress')
        const restored = requireOk(await client.from('path_items').update({ status: 'not_started' }).eq('id', created[0].id).select(), 'own path_items restore')
        assert.equal(restored[0].status, 'not_started')
      })
    }

    // ---- 3. Cross-account denials, both directions, all six tables ----
    for (const [attackerLabel, victimLabel] of [['B', 'A'], ['A', 'B']]) {
      const attacker = accounts[attackerLabel]
      const victim = accounts[victimLabel]
      for (const table of TABLES) {
        await check(`${attackerLabel}→${victimLabel} ${table}: read/insert/update/delete/owner-transfer denied; rows intact`, async () => {
          const [key, victimValue] = [OWNER_KEY(table), victim.uid]
          const before = await physical(table, victim.uid)

          // SELECT: policy filters foreign rows (success, zero rows is the CORRECT behaviour).
          const read = requireOk(await attacker.client.from(table).select().eq(key, victimValue), 'foreign select')
          assert.deepEqual(read, [], `foreign SELECT on ${table} returned ${read.length} rows`)

          // INSERT forged with the victim as owner: hard RLS refusal expected.
          const forgedBodyRow = forgeBody(table, victim.uid, victimLabel, 'FORGED')
          if (table === 'path_items') forgedBodyRow.path_id = victim.pathId // FK-valid shape → the refusal is purely ownership
          const forged = await attacker.client.from(table).insert(forgedBodyRow).select()
          if (table === 'profiles') {
            // profiles insert "as the victim" collides on the primary key
            // (id IS the owner); both the RLS refusal (42501) and the PK
            // collision (23505) deny the insert — record which one fired and
            // require one of them, never a silent success or another cause.
            if (forged.error === null) {
              assert.deepEqual(forged.data ?? [], [])
              throw new Error('forged profiles INSERT was accepted (no error, rows returned)')
            }
            assert.ok(
              ['42501', '23505'].includes(forged.error.code),
              `forged profiles INSERT failed with wrong failure mode: ${forged.error.code} ${forged.error.message}`,
            )
          } else {
            assert.ok(forged.error !== null, `forged INSERT into ${table} was accepted`)
            assert.equal(forged.error.code, '42501', `forged INSERT into ${table} failed with wrong failure mode (want RLS 42501): ${forged.error.code} ${forged.error.message}`)
          }

          // UPDATE and DELETE of the victim's row: policy hides it → 0 affected rows.
          const updated = requireOk(await attacker.client.from(table).update(mutationPayload(table, 'HIJACK')).eq(key, victimValue).select(), 'foreign update call')
          assert.deepEqual(updated, [], `foreign UPDATE on ${table} affected ${updated.length} rows`)
          const removed = requireOk(await attacker.client.from(table).delete().eq(key, victimValue).select(), 'foreign delete call')
          assert.deepEqual(removed, [], `foreign DELETE on ${table} affected ${removed.length} rows`)

          // Owner transfer of the attacker's OWN row to the victim: WITH CHECK refusal (no PK collisions by payload design).
          const [ownKey, ownValue] = [OWNER_KEY(table), attacker.uid]
          const transferPayload = table === 'profiles' ? { id: uuid(), display_name: 'TRANSFER' } : { user_id: victim.uid }
          if (table === 'path_items') transferPayload.path_id = victim.pathId // keep the composite FK satisfied → refusal must be RLS, not 23503
          const transferred = await attacker.client.from(table).update(transferPayload).eq(ownKey, ownValue).select()
          if (table === 'profiles') {
            // fresh random id → no PK collision; only the WITH CHECK can deny
            assert.ok(transferred.error !== null, 'own profiles id transfer was accepted')
            assert.equal(transferred.error.code, '42501', `profiles owner transfer wrong failure mode: ${transferred.error.code}`)
          } else {
            assert.ok(transferred.error !== null, `owner transfer on ${table} was accepted`)
            assert.equal(transferred.error.code, '42501', `owner transfer on ${table} wrong failure mode (want RLS 42501): ${transferred.error.code} ${transferred.error.message}`)
          }

          await assertPhysicalUnchanged(table, victim.uid, before, `${attackerLabel}→${victimLabel} ${table}`)
          // attacker's own rows must still belong to the attacker
          const ownAfter = await physical(table, attacker.uid)
          assert.ok(ownAfter.length >= 1, `attacker own ${table} rows disappeared`)
          if (table !== 'profiles') {
            assert.deepEqual(ownAfter.map((r) => r.user_id), ownAfter.map(() => attacker.uid), `attacker own ${table} ownership changed`)
          }
        })
      }
    }

    // ---- 4. Cross-owner path binding ----
    // PostgreSQL evaluates RLS WITH CHECK BEFORE column/FK constraints, so a
    // signed-in user's cross-owner binding attempt surfaces as a 42501 RLS
    // refusal (policy requires the referenced path to be the caller's own).
    // The composite FK's INDEPENDENT enforcement is proven by the privileged
    // bypass probe, which must fail with 23503 — that distinguishes the two
    // refusal layers instead of conflating them.
    await check('path binding across owners refused (RLS 42501 for users; composite FK 23503 enforced independently)', async () => {
      const b = accounts.B
      const a = accounts.A
      const beforeVictim = await physical('path_items', a.uid)
      const beforeAttacker = await physical('path_items', b.uid)

      const claimOwn = await b.client.from('path_items').insert({ user_id: b.uid, path_id: a.pathId, status: 'not_started' }).select()
      assert.ok(claimOwn.error !== null, 'B could attach its item to A\'s path (must be refused)')
      assert.equal(claimOwn.error.code, '42501', `cross-owner binding wrong failure mode (WITH CHECK fires before FK for user sessions): ${claimOwn.error.code}`)

      const claimA = await b.client.from('path_items').insert({ user_id: a.uid, path_id: a.pathId, status: 'not_started' }).select()
      assert.ok(claimA.error !== null, 'B could insert an item claiming A as owner under A\'s path')
      assert.equal(claimA.error.code, '42501', `forged-owner binding wrong failure mode (want RLS 42501): ${claimA.error.code}`)

      const repointed = await b.client.from('path_items').update({ path_id: a.pathId }).eq('id', b.itemId).select()
      assert.ok(repointed.error !== null, 'B could re-point its own item at A\'s path')
      assert.equal(repointed.error.code, '42501', `re-point wrong failure mode (want RLS 42501): ${repointed.error.code}`)

      // The FK is independently enforced even for a privileged client that
      // bypasses RLS — proves the refusal is a database constraint, not just
      // policy luck.
      const adminBypass = await admin.from('path_items').insert({ user_id: b.uid, path_id: a.pathId, status: 'not_started' })
      assert.ok(adminBypass.error !== null, 'privileged client could violate the composite FK (constraint not installed?)')
      assert.equal(adminBypass.error.code, '23503', `privileged FK bypass wrong code (want 23503): ${adminBypass.error.code}`)

      await assertPhysicalUnchanged('path_items', a.uid, beforeVictim, 'cross-owner binding')
      await assertPhysicalUnchanged('path_items', b.uid, beforeAttacker, 'cross-owner binding')
    })

    // ---- 5. Signed-out client: SELECT/INSERT/UPDATE/DELETE all refused on every table ----
    for (const table of TABLES) {
      await check(`anonymous: ${table} SELECT/INSERT/UPDATE/DELETE all refused; rows intact`, async () => {
        const victim = accounts.A
        const [key, value] = [OWNER_KEY(table), victim.uid]
        const before = await physical(table, victim.uid)

        const read = await anon.from(table).select('*').eq(key, value)
        assert.ok(read.error !== null, `anonymous SELECT on ${table} returned data (data === null expected)`)
        assert.equal(read.data, null)

        const insert = await anon.from(table).insert(anonInsertBody(table, victim.uid)).select()
        assert.ok(insert.error !== null, `anonymous INSERT into ${table} was accepted`)
        assert.equal(insert.data, null)
        assert.ok(isRlsRefusal(insert.error) || isConstraintRefusal(insert.error) === false, `anonymous INSERT wrong failure mode: ${insert.error.code} ${insert.error.message}`)

        const update = await anon.from(table).update(mutationPayload(table, 'anon')).eq(key, value).select()
        assert.ok(update.error !== null, `anonymous UPDATE on ${table} was accepted`)
        assert.equal(update.data, null)

        const remove = await anon.from(table).delete().eq(key, value).select()
        assert.ok(remove.error !== null, `anonymous DELETE on ${table} was accepted`)
        assert.equal(remove.data, null)

        await assertPhysicalUnchanged(table, victim.uid, before, 'anonymous')
      })
    }

    // ---- 6. Self-edited metadata + refreshed JWT grants nothing (done BY the user, not the admin) ----
    await check('self-edited user metadata in refreshed JWT grants no access on any table', async () => {
      const b = accounts.B
      const a = accounts.A
      requireOk(await b.client.auth.updateUser({ data: { role: 'admin', is_superuser: true } }), 'self-edit metadata')
      const refreshed = requireOk(await b.client.auth.refreshSession(), 'session refresh')
      const payload = JSON.parse(Buffer.from(refreshed.session.access_token.split('.')[1], 'base64url').toString('utf8'))
      assert.equal(payload.user_metadata?.role, 'admin', 'refreshed JWT must actually contain the attempted privilege')
      assert.equal(payload.user_metadata?.is_superuser, true)

      for (const table of TABLES) {
        const [key, value] = [OWNER_KEY(table), a.uid]
        const before = await physical(table, a.uid)
        const read = requireOk(await b.client.from(table).select().eq(key, value), `metadata select ${table}`)
        assert.deepEqual(read, [], `with self-granted metadata B read ${read.length} rows of A in ${table}`)
        const forged = await b.client.from(table).insert(forgeBody(table, a.uid, 'A', 'METAFORGE')).select()
        if (table === 'profiles') {
          if (forged.error !== null) {
            assert.ok(['42501', '23505'].includes(forged.error.code), `metadata forged profiles wrong failure mode: ${forged.error.code}`)
          } else {
            assert.deepEqual(forged.data ?? [], [])
            throw new Error('metadata forged profiles INSERT accepted')
          }
        } else {
          assert.ok(forged.error !== null, `metadata forged INSERT into ${table} accepted`)
          assert.equal(forged.error.code, '42501', `metadata forged INSERT ${table} wrong failure mode: ${forged.error.code}`)
        }
        await assertPhysicalUnchanged(table, a.uid, before, `metadata ${table}`)
      }
    })

    // ---- 7. Own deletes still work (before the accounts themselves are removed) ----
    for (const label of ['A', 'B']) {
      await check(`${label}: own delete succeeds on the five child tables`, async () => {
        const account = accounts[label]
        for (const table of ['path_items', 'learning_paths', 'favorites', 'user_skills', 'experiences']) {
          const [key, value] = [OWNER_KEY(table), account.uid]
          const removed = requireOk(await account.client.from(table).delete().eq(key, value).select(), `own delete ${table}`)
          assert.equal(removed.length, 1, `own delete ${table} removed ${removed.length} rows`)
        }
      })
    }

    // ---- 8. Account deletion cascades: every physical table empties for both users ----
    await check('account deletion cascades: all six tables empty for both accounts (physical)', async () => {
      const remaining = await cleanupAccounts()
      const nonzero = Object.entries(remaining).filter(([, count]) => count !== 0)
      assert.deepEqual(nonzero, [], `rows survived account deletion: ${JSON.stringify(nonzero)}`)
      const users = requireOk(await admin.auth.admin.listUsers({ perPage: 200 }), 'list users after deletion')
      const emails = users.users.map((u) => u.email)
      assert.equal(emails.includes(EMAIL('A')), false, 'account A still exists')
      assert.equal(emails.includes(EMAIL('B')), false, 'account B still exists')
    })
  } catch (fatal) {
    allPassed = false
    checks.push({ name: 'FATAL', passed: false, message: fatal.message })
    log(`FATAL ${fatal.message}`)
  } finally {
    // Last-resort cleanup in case of a mid-matrix failure (only this run's data).
    if (accounts.A || accounts.B) {
      try {
        await cleanupAccounts()
      } catch {
        /* report below already flags it via leftover-row assertions */
      }
    }
  }

  return { allPassed, checks, runId, url }
}
