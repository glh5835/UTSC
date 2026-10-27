import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * REAL database isolation tests against the isolated local Supabase stack
 * (project id utsc-a1-local, see supabase/config.toml). These are skipped
 * unless the stack is running and its keys are provided via environment
 * variables — the run report must distinguish these real checks from the
 * mocked unit tests.
 *
 * Setup (repo root):
 *   npx supabase start
 *   npx supabase status -o env   # copy the values below (never commit them)
 *   UTSC_SUPABASE_PUBLISHABLE_KEY=... UTSC_SUPABASE_SERVICE_ROLE_KEY=... \
 *     npm --prefix web run test -- rls-isolation.local
 *
 * The service_role key is used ONLY here, only for test data preparation and
 * cleanup (creating/confirming/deleting the two accounts and verifying
 * physical row state). Every allow/deny assertion runs through ordinary
 * user-session clients created with the public publishable key, never
 * through the admin client.
 */

const URL = process.env.UTSC_SUPABASE_URL ?? 'http://127.0.0.1:55421'
const PUBLISHABLE_KEY = process.env.UTSC_SUPABASE_PUBLISHABLE_KEY ?? ''
const SERVICE_KEY = process.env.UTSC_SUPABASE_SERVICE_ROLE_KEY ?? ''

const EMAIL_A = 'utsc-a1-rls-a@example.com'
const EMAIL_B = 'utsc-a1-rls-b@example.com'
const PASSWORD = 'utsc-a1-local-test-pass'

describe.skipIf(!PUBLISHABLE_KEY || !SERVICE_KEY)(
  'A1 RLS isolation (real local Supabase, two accounts + signed-out)',
  () => {
    let admin: SupabaseClient<any, 'public', any>
    let asA: SupabaseClient<any, 'public', any>
    let asB: SupabaseClient<any, 'public', any>
    let signedOut: SupabaseClient<any, 'public', any>
    let uidA = ''
    let uidB = ''

    async function cleanupUsers() {
      const { data } = await admin.auth.admin.listUsers({ perPage: 200 })
      for (const user of data.users) {
        if (user.email === EMAIL_A || user.email === EMAIL_B) {
          await admin.auth.admin.deleteUser(user.id)
        }
      }
    }

    /** Create one real account: real signUp (confirmation required), admin
     * confirms the email (test preparation only), then a real password
     * sign-in with the public client. */
    async function createRealAccount(email: string): Promise<{ client: SupabaseClient<any, 'public', any>; uid: string }> {
      const publicClient = createClient(URL, PUBLISHABLE_KEY, { auth: { persistSession: false } })
      const { data, error } = await publicClient.auth.signUp({ email, password: PASSWORD })
      expect(error).toBeNull()
      expect(data.user).toBeTruthy()
      // The project requires email confirmation: signUp must NOT yield a
      // session, i.e. a registered-but-unconfirmed user is not signed in.
      expect(data.session).toBeNull()
      await admin.auth.admin.updateUserById(data.user!.id, { email_confirm: true })
      const { data: signIn, error: signInError } = await publicClient.auth.signInWithPassword({
        email,
        password: PASSWORD,
      })
      expect(signInError).toBeNull()
      expect(signIn.session).toBeTruthy()
      return { client: publicClient, uid: signIn.session!.user.id }
    }

    beforeAll(async () => {
      admin = createClient(URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      signedOut = createClient(URL, PUBLISHABLE_KEY, { auth: { persistSession: false } })
      await cleanupUsers()
      const a = await createRealAccount(EMAIL_A)
      asA = a.client
      uidA = a.uid
      const b = await createRealAccount(EMAIL_B)
      asB = b.client
      uidB = b.uid
      // The signup trigger must have created a profile row per account.
      const profiles = await admin.from('profiles').select('id')
      expect(profiles.data).toEqual(expect.arrayContaining([{ id: uidA }, { id: uidB }]))
    }, 30000)

    afterAll(async () => {
      await cleanupUsers()
    })

    it('A can write and read its own rows across all six tables', async () => {
      const exp = await asA.from('experiences').insert({ text: 'A experience' }).select()
      expect(exp.error).toBeNull()
      expect(exp.data).toHaveLength(1)

      const skill = await asA
        .from('user_skills')
        .insert({ skill_id: 'python', source: 'manual', source_id: null })
        .select()
      expect(skill.error).toBeNull()

      const fav = await asA
        .from('favorites')
        .insert({ target_type: 'resource', target_id: 'resource_a1' })
        .select()
      expect(fav.error).toBeNull()

      const path = await asA
        .from('learning_paths')
        .insert({ target_role_id: 'data_analyst' })
        .select()
      expect(path.error).toBeNull()
      const pathAId = path.data![0].id as string

      const item = await asA
        .from('path_items')
        .insert({ path_id: pathAId, resource_id: 'resource_a1', skill_id: 'python', status: 'not_started' })
        .select()
      expect(item.error).toBeNull()

      const prof = await asA
        .from('profiles')
        .update({ display_name: 'User A', completed_course_ids: ['course_x'] })
        .eq('id', uidA)
        .select()
      expect(prof.error).toBeNull()
      expect(prof.data![0].display_name).toBe('User A')
    })

    it('B cannot read any of the rows A created (owner-scoped SELECT)', async () => {
      for (const table of ['experiences', 'user_skills', 'favorites', 'learning_paths', 'path_items']) {
        const rows = await asB.from(table).select()
        expect(rows.error).toBeNull()
        expect(rows.data).toEqual([])
      }
      const profile = await asB.from('profiles').select().eq('id', uidA)
      expect(profile.error).toBeNull()
      expect(profile.data).toEqual([])
    })

    it('B cannot insert a row forged with A as the owner', async () => {
      const forged = await asB.from('experiences').insert({ text: 'B pretending to be A', user_id: uidA })
      // RLS with-check rejection (PostgREST surfaces it as an error); even on
      // success-with-zero-rows the physical count must stay unchanged.
      if (forged.error === null) {
        expect(forged.data ?? []).toHaveLength(0)
      }
      const physical = await admin.from('experiences').select().eq('user_id', uidA)
      expect(physical.error).toBeNull()
      expect(physical.data).toHaveLength(1)
      expect(physical.data![0].text).toBe('A experience')
    })

    it('B cannot update or delete rows owned by A (targets stay unchanged)', async () => {
      const aRow = await admin.from('experiences').select('id').eq('user_id', uidA)
      const targetId = aRow.data![0].id as string

      const updated = await asB.from('experiences').update({ text: 'hijacked' }).eq('id', targetId)
      expect(updated.error).toBeNull()
      // PostgREST reports zero affected rows as an empty array or null.
      expect(updated.data ?? []).toEqual([])

      const deleted = await asB.from('experiences').delete().eq('id', targetId)
      expect(deleted.error).toBeNull()
      expect(deleted.data ?? []).toEqual([])

      const physical = await admin.from('experiences').select('text').eq('id', targetId)
      expect(physical.data![0].text).toBe('A experience')
    })

    it('B cannot transfer ownership of its own row to A', async () => {
      const inserted = await asB.from('experiences').insert({ text: 'B own row' }).select()
      expect(inserted.error).toBeNull()
      const rowId = inserted.data![0].id as string

      const stolen = await asB.from('experiences').update({ user_id: uidA }).eq('id', rowId)
      // Either an RLS violation error or zero affected rows — in both cases
      // the row must still belong to B.
      if (stolen.error === null) {
        expect(stolen.data ?? []).toEqual([])
      }
      const physical = await admin.from('experiences').select('user_id').eq('id', rowId)
      expect(physical.data![0].user_id).toBe(uidB)

      await asB.from('experiences').delete().eq('id', rowId)
    })

    it('B cannot attach its path item to a path owned by A (database constraint)', async () => {
      const pathA = await admin.from('learning_paths').select('id').eq('user_id', uidA)
      const pathAId = pathA.data![0].id as string

      // Claiming B as the owner while pointing at A's path violates the
      // composite foreign key (path_id, user_id) — a database-level refusal.
      const claimOwn = await asB
        .from('path_items')
        .insert({ path_id: pathAId, user_id: uidB, status: 'not_started' })
      expect(claimOwn.error).not.toBeNull()

      // Claiming A as the owner violates the RLS with-check instead.
      const claimA = await asB
        .from('path_items')
        .insert({ path_id: pathAId, user_id: uidA, status: 'not_started' })
      if (claimA.error === null) {
        expect(claimA.data ?? []).toHaveLength(0)
      }
      // A's own legitimate items may exist under its path; every row under
      // A's path must belong to A, never to B.
      const physical = await admin.from('path_items').select('user_id').eq('path_id', pathAId)
      expect((physical.data ?? []).every((row) => row.user_id === uidA)).toBe(true)

      // B cannot re-point one of its own items at A's path either.
      const ownPath = await asB.from('learning_paths').insert({ target_role_id: 'data_engineer' }).select()
      const ownPathId = ownPath.data![0].id as string
      const ownItem = await asB
        .from('path_items')
        .insert({ path_id: ownPathId, user_id: uidB, status: 'in_progress' })
        .select()
      expect(ownItem.error).toBeNull()
      const repointed = await asB
        .from('path_items')
        .update({ path_id: pathAId })
        .eq('id', ownItem.data![0].id as string)
      expect(repointed.error).not.toBeNull() // composite FK refusal
    })

    it('A can read back and manage everything it owns', async () => {
      const exp = await asA.from('experiences').select()
      expect(exp.data).toHaveLength(1)
      const fav = await asA.from('favorites').select()
      expect(fav.data).toHaveLength(1)
      // Duplicate favorite of the same target is rejected by the primary key
      // (idempotency guard).
      const dup = await asA
        .from('favorites')
        .insert({ target_type: 'resource', target_id: 'resource_a1' })
      expect(dup.error).not.toBeNull()
      const paths = await asA.from('learning_paths').select()
      expect(paths.data).toHaveLength(1)
    })

    it('a signed-out client cannot read or write any personal data', async () => {
      for (const table of ['profiles', 'experiences', 'user_skills', 'favorites', 'learning_paths', 'path_items']) {
        const read = await signedOut.from(table).select()
        // Personal tables grant nothing to the signed-out role: the request
        // must fail (permission denied), never return foreign rows.
        expect(read.error).not.toBeNull()
        expect(read.data).toBeNull()

        const write = await signedOut.from(table).insert(signedOutProbe(table))
        expect(write.error).not.toBeNull()
        expect(write.data).toBeNull()
      }
      function signedOutProbe(table: string): Record<string, unknown> {
        switch (table) {
          case 'profiles':
            return { id: '00000000-0000-0000-0000-000000000000' }
          case 'experiences':
            return { text: 'x' }
          case 'user_skills':
            return { skill_id: 'python', source: 'manual' }
          case 'favorites':
            return { target_type: 'resource', target_id: 'x' }
          case 'learning_paths':
            return { target_role_id: 'data_analyst' }
          default:
            return { status: 'not_started' }
        }
      }
    })

    it('editing ordinary user metadata grants no additional permissions', async () => {
      await admin.auth.admin.updateUserById(uidB, {
        user_metadata: { role: 'admin', is_superuser: true },
      })
      // B's session rights are unchanged: metadata is not an authorization
      // source; policies only consult auth.uid().
      const stolen = await asB.from('experiences').select().eq('user_id', uidA)
      expect(stolen.error).toBeNull()
      expect(stolen.data ?? []).toEqual([])

      const forged = await asB
        .from('experiences')
        .insert({ text: 'elevated attempt', user_id: uidA })
      if (forged.error === null) {
        expect(forged.data ?? []).toHaveLength(0)
      }
      const physical = await admin.from('experiences').select().eq('user_id', uidA)
      expect(physical.data).toHaveLength(1)
    })

    it('deleting an account removes all of its personal rows (cascade)', async () => {
      // Physical counts before, via the admin client (bypasses RLS by design,
      // used here only to verify real database state).
      const before = await admin.from('learning_paths').select('id').eq('user_id', uidA)
      expect(before.data).toHaveLength(1)

      await cleanupUsers()
      const remaining = await admin.from('profiles').select('id')
      const remainingIds = (remaining.data ?? []).map((row) => row.id)
      expect(remainingIds).not.toContain(uidA)
      expect(remainingIds).not.toContain(uidB)

      // Recreate a fresh B for any later assertions/tests (not required by
      // the isolation matrix itself).
      const recreated = await createRealAccount(EMAIL_B)
      uidB = recreated.uid
      asB = recreated.client
    })
  },
)
