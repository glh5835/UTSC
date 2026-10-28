import assert from 'node:assert/strict'

/**
 * A3 acceptance against the real local Supabase stack. Ordinary user clients
 * prove RLS and trigger behaviour; the admin client is used only to prepare and
 * confirm accounts and to read physical rows for cleanup assertions.
 */
export async function runA3Matrix({ url, publicKey, secret, createClient }, log = () => {}) {
  const checks = []
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(url, secret, options)
  const anon = createClient(url, publicKey, options)
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  const email = (label) => `utsc-a3-${runId}-${label.toLowerCase()}@example.test`
  const password = `A3-${runId}-pass`
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
        experiences: await count('experiences', account.uid),
        user_skills: await count('user_skills', account.uid),
      }
    }
    return remaining
  }

  try {
    await createAccount('A')
    await createAccount('B')
    const a = accounts.A
    const b = accounts.B

    await check('course completion is self-report only and confirms no skill', async () => {
      ok(await a.client.from('profiles').update({
        completed_course_ids: ['demo_course', 'unknown_legacy_course'],
      }).eq('id', a.uid), 'mark course')
      assert.equal(await count('user_skills', a.uid), 0)
      const profile = ok(await a.client.from('profiles').select('completed_course_ids').eq('id', a.uid).single(), 'read courses')
      assert.deepEqual(profile.completed_course_ids, ['demo_course', 'unknown_legacy_course'])
    })

    await check('experience creation is private and does not confirm a skill', async () => {
      const created = ok(await a.client.from('experiences').insert({
        text: 'I used Microsoft Excel to analyze data.',
      }).select('id').single(), 'create experience')
      a.experienceId = created.id
      assert.equal(await count('user_skills', a.uid), 0)
      const bRows = ok(await b.client.from('experiences').select('id').eq('user_id', a.uid), 'B read A experiences')
      assert.deepEqual(bRows, [])
      assert.equal(await count('experiences', a.uid), 1)
    })

    await check('experience-sourced confirmation is explicit and duplicate confirm is idempotent', async () => {
      ok(await a.client.from('user_skills').insert({
        skill_id: 'excel', source: 'experience', source_id: a.experienceId,
      }), 'confirm excel from experience')
      const duplicate = await a.client.from('user_skills').insert({
        skill_id: 'excel', source: 'experience', source_id: a.experienceId,
      })
      assert.equal(duplicate.error?.code, '23505')
      const rows = ok(await a.client.from('user_skills').select('id, skill_id, source, source_id').eq('user_id', a.uid), 'read own skills')
      assert.equal(rows.length, 1)
      assert.equal(rows[0].skill_id, 'excel')
    })

    await check('one skill may keep multiple independent sources', async () => {
      ok(await a.client.from('user_skills').insert({ skill_id: 'excel', source: 'manual', source_id: null }), 'manual excel')
      ok(await a.client.from('user_skills').insert({ skill_id: 'python', source: 'course', source_id: 'demo_course' }), 'course python')
      assert.equal(await count('user_skills', a.uid), 3)
    })

    await check('invalid course and foreign experience sources are rejected by the database', async () => {
      const badCourse = await a.client.from('user_skills').insert({
        skill_id: 'sql', source: 'course', source_id: 'not_a_completed_course',
      })
      assert.ok(badCourse.error, 'uncompleted course source was accepted')
      const badExperience = await b.client.from('user_skills').insert({
        skill_id: 'sql', source: 'experience', source_id: a.experienceId,
      })
      assert.ok(badExperience.error, 'foreign experience source was accepted')
      const manualWithId = await a.client.from('user_skills').insert({
        skill_id: 'sql', source: 'manual', source_id: 'not-allowed',
      })
      assert.ok(manualWithId.error, 'manual confirmation with source_id was accepted')
      assert.equal(await count('user_skills', a.uid), 3)
    })

    await check('B cannot read, forge, update or delete A private A3 rows', async () => {
      const read = ok(await b.client.from('user_skills').select('id').eq('user_id', a.uid), 'B read A skills')
      assert.deepEqual(read, [])
      const forged = await b.client.from('user_skills').insert({
        user_id: a.uid, skill_id: 'python', source: 'manual', source_id: null,
      })
      assert.equal(forged.error?.code, '42501')
      const updated = ok(await b.client.from('experiences').update({ text: 'B changed A' }).eq('id', a.experienceId).select(), 'B update A experience')
      assert.deepEqual(updated, [])
      const removed = ok(await b.client.from('experiences').delete().eq('id', a.experienceId).select(), 'B delete A experience')
      assert.deepEqual(removed, [])
      const original = ok(await a.client.from('experiences').select('text').eq('id', a.experienceId).single(), 'A read experience')
      assert.equal(original.text, 'I used Microsoft Excel to analyze data.')
    })

    await check('editing experience text removes only confirmations sourced from that experience', async () => {
      ok(await a.client.from('experiences').update({ text: 'I used SQL.' }).eq('id', a.experienceId), 'edit experience')
      const rows = ok(await a.client.from('user_skills').select('skill_id, source, source_id').eq('user_id', a.uid), 'skills after edit')
      assert.deepEqual(
        rows.map((row) => `${row.source}:${row.skill_id}`).sort(),
        ['course:python', 'manual:excel'],
      )
    })

    await check('deleting an experience removes its source and keeps course/manual confirmations', async () => {
      ok(await a.client.from('user_skills').insert({
        skill_id: 'sql', source: 'experience', source_id: a.experienceId,
      }), 'confirm sql after edit')
      ok(await a.client.from('experiences').delete().eq('id', a.experienceId).select('id').single(), 'delete experience')
      const rows = ok(await a.client.from('user_skills').select('skill_id, source').eq('user_id', a.uid), 'skills after delete')
      assert.deepEqual(rows.map((row) => `${row.source}:${row.skill_id}`).sort(), ['course:python', 'manual:excel'])
      assert.equal(await count('experiences', a.uid), 0)
    })

    await check('withdrawing a course removes only course-sourced confirmations for that course', async () => {
      ok(await a.client.from('profiles').update({ completed_course_ids: ['unknown_legacy_course'] }).eq('id', a.uid), 'withdraw course')
      const rows = ok(await a.client.from('user_skills').select('skill_id, source').eq('user_id', a.uid), 'skills after course withdrawal')
      assert.deepEqual(rows.map((row) => `${row.source}:${row.skill_id}`), ['manual:excel'])
      const profile = ok(await a.client.from('profiles').select('completed_course_ids').eq('id', a.uid).single(), 'unknown course retained')
      assert.deepEqual(profile.completed_course_ids, ['unknown_legacy_course'])
    })

    await check('database bounds reject empty/overlong experiences and retain a maximum-length row', async () => {
      const tooLong = await a.client.from('experiences').insert({ text: 'x'.repeat(5001) })
      assert.ok(tooLong.error, 'overlong experience accepted')
      const blank = await a.client.from('experiences').insert({ text: '' })
      assert.ok(blank.error, 'empty experience accepted')
      const maximum = ok(await a.client.from('experiences').insert({ text: 'x'.repeat(5000) }).select('id').single(), '5000-char experience')
      ok(await a.client.from('experiences').delete().eq('id', maximum.id), 'delete maximum row')
    })

    await check('anonymous cannot read or write A3 personal tables', async () => {
      const readExperiences = await anon.from('experiences').select('*')
      const readSkills = await anon.from('user_skills').select('*')
      assert.ok(readExperiences.error, 'anon read experiences')
      assert.ok(readSkills.error, 'anon read skills')
      const write = await anon.from('experiences').insert({ text: 'anonymous' })
      assert.ok(write.error, 'anon experience insert')
    })

    await check('account deletion cascades all A3 private rows', async () => {
      const remaining = await cleanup()
      assert.deepEqual(remaining, {
        A: { profiles: 0, experiences: 0, user_skills: 0 },
        B: { profiles: 0, experiences: 0, user_skills: 0 },
      })
    })
  } catch (error) {
    allPassed = false
    checks.push({ name: 'A3 FATAL', passed: false, message: error.message })
    log(`A3 FATAL ${error.message}`)
  } finally {
    try {
      if (accounts.A || accounts.B) await cleanup()
    } catch {
      // The preceding checks/report show whether cleanup failed by assertions.
    }
  }

  return { allPassed, checks, runId, url }
}
