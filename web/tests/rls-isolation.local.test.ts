import { describe, expect, it, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
// @ts-expect-error — plain node module without type declarations
import { runMatrix } from './rls-matrix.mjs'

/**
 * REAL database isolation tests against the isolated local Supabase stack
 * (project id utsc-a1-local, see supabase/config.toml). The full strict
 * matrix lives in tests/rls-matrix.mjs and is shared with the standalone
 * acceptance command `node web/tests/rls-acceptance.mjs`, which — unlike
 * this file — FAILS instead of skipping when credentials are missing.
 * Acceptance evidence MUST come from that command, never from a skipped
 * vitest run.
 *
 * Setup (repo root):
 *   npx supabase start
 *   npx supabase status -o env   # copy the values (never commit them)
 *   UTSC_SUPABASE_PUBLISHABLE_KEY=... UTSC_SUPABASE_SERVICE_ROLE_KEY=... \
 *     npm --prefix web run test -- rls-isolation.local
 *
 * The service_role key is used ONLY for test data preparation, physical row
 * verification and cleanup. Every allow/deny assertion runs through ordinary
 * user-session clients created with the public publishable key.
 */

const URL = process.env.UTSC_SUPABASE_URL ?? 'http://127.0.0.1:55421'
const PUBLISHABLE_KEY = process.env.UTSC_SUPABASE_PUBLISHABLE_KEY ?? ''
const SERVICE_KEY = process.env.UTSC_SUPABASE_SERVICE_ROLE_KEY ?? ''
const credentialsPresent = Boolean(PUBLISHABLE_KEY && SERVICE_KEY)

describe.skipIf(!credentialsPresent)(
  'A1 RLS strict matrix (real local Supabase, two accounts + signed-out)',
  () => {
    let result: { allPassed: boolean; checks: { name: string; passed: boolean; message?: string }[] }

    beforeAll(async () => {
      // Server reachability is asserted inside runMatrix and reported as a
      // failed FATAL check (not a skip), so an unreachable stack can never
      // look green here either.
      result = await runMatrix({ url: URL, publicKey: PUBLISHABLE_KEY, secret: SERVICE_KEY, createClient })
    }, 180_000)

    it('ran the full strict matrix with every check passing', () => {
      const failed = result.checks.filter((c) => !c.passed)
      expect(failed.map((f) => `${f.name}: ${f.message}`)).toEqual([])
      expect(result.checks.length).toBeGreaterThan(0)
    })

    it('covered the required matrix breadth', () => {
      const names = result.checks.map((c) => c.name)
      for (const fragment of [
        'A: real signUp',
        'B: real signUp',
        'B→A profiles:',
        'A→B path_items:',
        'anonymous: profiles SELECT/INSERT/UPDATE/DELETE',
        'anonymous: path_items SELECT/INSERT/UPDATE/DELETE',
        'self-edited user metadata',
        'account deletion cascades',
        'path binding across owners',
      ]) {
        expect(names.some((n) => n.includes(fragment))).toBe(true)
      }
      // 2×6 own-CRUD + 2×6 path_items + 2×6 cross-account + binding + 6 anon + metadata + 2 own-delete + cascade + 2 signup
      expect(result.checks.length).toBeGreaterThanOrEqual(30)
    })

    it('cleanup left no rows or accounts behind', () => {
      const cascade = result.checks.find((c) => c.name.includes('account deletion cascades'))
      expect(cascade?.passed).toBe(true)
    })
  },
)
