import { describe, expect, it } from 'vitest'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createProfileController, type ProfilePhase } from '../src/auth/profileController'

/**
 * Regression for the cross-account late-response race found by the 2026-10-28
 * review: account A saves, A's re-read response is held, the session switches
 * to B, and A's stale response then lands on B's page (which showed A's name
 * and courses). The old save() compared user.id against an ownerKey captured
 * in the SAME stale closure — always equal, so late A responses were applied.
 *
 * These tests drive the controller directly (no DOM, no real network): they
 * pin the isolation contract itself — every async response re-checks the live
 * owner + generation before writing state. The end-to-end browser variant of
 * the same sequence lives in artifacts/ (controlled synthetic probe).
 */

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

interface Op {
  kind: 'read' | 'write'
  owner: string
  payload?: unknown
  d: Deferred<{ data: unknown; error: { message: string } | null }>
}

/** Minimal stand-in for the two supabase-js call shapes the controller uses;
 * every network response stays pending until the test resolves it. */
function makeFakeSupabase() {
  const ops: Op[] = []
  const from = (table: string) => {
    if (table !== 'profiles') throw new Error(`unexpected table ${table}`)
    return {
      select: () => ({
        eq: (_column: string, owner: string) => ({
          single: () => {
            const d = deferred<{ data: unknown; error: { message: string } | null }>()
            ops.push({ kind: 'read', owner, d })
            return d.promise
          },
        }),
      }),
      update: (payload: unknown) => ({
        eq: (_column: string, owner: string) => {
          const d = deferred<{ data: unknown; error: { message: string } | null }>()
          ops.push({ kind: 'write', owner, payload, d })
          return d.promise
        },
      }),
    }
  }
  return { from, ops }
}

function fakeUser(id: string): User {
  return { id } as unknown as User
}

function row(displayName: string, courses: string[]) {
  return { data: { display_name: displayName, completed_course_ids: courses, updated_at: '2026-10-28T00:00:00Z' }, error: null }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

const ID_A = '10000000-0000-4000-8000-000000000001'
const ID_B = '20000000-0000-4000-8000-000000000002'

describe('profile controller: cross-account late-response isolation', () => {
  it("holds A's late re-read after a switch to B: B never sees A's data (the review sequence)", async () => {
    const fake = makeFakeSupabase()
    const controller = createProfileController(() => fake as unknown as SupabaseClient)
    const snapshots: ProfilePhase[] = []
    controller.subscribe(() => snapshots.push(controller.getPhase()))

    // A signs in; the initial load resolves normally.
    controller.setIdentity(fakeUser(ID_A))
    expect(controller.getPhase()).toEqual({ kind: 'loading' })
    expect(fake.ops).toHaveLength(1)
    fake.ops[0].d.resolve(row('A-NAME', ['course_a']))
    await tick()
    expect(controller.getPhase()).toMatchObject({ kind: 'ready', data: { display_name: 'A-NAME' } })

    // A edits and saves; the PATCH returns but the re-read is held.
    const savePromise = controller.save({ display_name: 'A-DELAYED-PRIVATE', completed_course_ids: ['synthetic_course_a'] })
    const write = fake.ops.find((op) => op.kind === 'write')
    expect(write?.owner).toBe(ID_A)
    write!.d.resolve({ data: null, error: null })
    await tick()
    const reRead = fake.ops.at(-1)!
    expect(reRead.kind).toBe('read')
    expect(reRead.owner).toBe(ID_A)

    // The session switches to B: the cache must be isolated IMMEDIATELY,
    // before any response arrives. B's own load starts and is held.
    controller.setIdentity(fakeUser(ID_B))
    expect(controller.getPhase()).toEqual({ kind: 'loading' })
    const bLoad = fake.ops.at(-1)!
    expect(bLoad.owner).toBe(ID_B)

    // A's late re-read lands FIRST — it must be discarded entirely.
    reRead.d.resolve(row('A-DELAYED-PRIVATE', ['synthetic_course_a']))
    await tick()
    expect(controller.getPhase()).toEqual({ kind: 'loading' })

    const saveResult = await savePromise
    expect(saveResult).toEqual({ ok: true, staleOwner: true })

    // Then B's response lands: only B's data may become visible.
    bLoad.d.resolve(row('B-NAME', ['synthetic_course_b']))
    await tick()
    expect(controller.getPhase()).toMatchObject({
      kind: 'ready',
      data: { display_name: 'B-NAME', completed_course_ids: ['synthetic_course_b'] },
    })

    // No snapshot ever contains A's post-switch data: A-DELAYED-PRIVATE was
    // only ever inside the held re-read, which was discarded.
    const bPhases = snapshots.filter((p) => p.kind === 'ready')
    expect(bPhases.at(-1)).toMatchObject({ data: { display_name: 'B-NAME' } })
    expect(
      snapshots.some(
        (p) => p.kind === 'ready' && p.data.display_name === 'A-DELAYED-PRIVATE',
      ),
    ).toBe(false)
  })

  it("A's late FAILURE response is also discarded after a switch to B", async () => {
    const fake = makeFakeSupabase()
    const controller = createProfileController(() => fake as unknown as SupabaseClient)
    controller.setIdentity(fakeUser(ID_A))
    fake.ops[0].d.resolve(row('A-NAME', []))
    await tick()

    const savePromise = controller.save({ display_name: 'A-EDIT', completed_course_ids: [] })
    const write = fake.ops.find((op) => op.kind === 'write')!
    write.d.resolve({ data: null, error: null })
    await tick()
    const reRead = fake.ops.at(-1)!

    controller.setIdentity(fakeUser(ID_B))
    expect(controller.getPhase()).toEqual({ kind: 'loading' })
    const bLoad = fake.ops.at(-1)!

    // The re-read fails late (network-level rejection): neither an error
    // phase nor any data may appear for B from A's request.
    reRead.d.reject(new Error('network reset'))
    await tick()
    expect(controller.getPhase()).toEqual({ kind: 'loading' })

    const saveResult = await savePromise
    expect(saveResult).toEqual({ ok: false, message: 'network reset' })

    bLoad.d.resolve(row('B-NAME', []))
    await tick()
    expect(controller.getPhase()).toMatchObject({ kind: 'ready', data: { display_name: 'B-NAME' } })
  })

  it("A's late INITIAL load is discarded when it lands after a switch to B", async () => {
    const fake = makeFakeSupabase()
    const controller = createProfileController(() => fake as unknown as SupabaseClient)
    controller.setIdentity(fakeUser(ID_A))
    const aLoad = fake.ops[0]

    controller.setIdentity(fakeUser(ID_B))
    expect(controller.getPhase()).toEqual({ kind: 'loading' })
    const bLoad = fake.ops.at(-1)!

    aLoad.d.resolve(row('A-NAME', ['course_a']))
    await tick()
    expect(controller.getPhase()).toEqual({ kind: 'loading' })

    bLoad.d.resolve(row('B-NAME', []))
    await tick()
    expect(controller.getPhase()).toMatchObject({ kind: 'ready', data: { display_name: 'B-NAME' } })
  })

  it('round-trips a save within the SAME account (no false stale rejection)', async () => {
    const fake = makeFakeSupabase()
    const controller = createProfileController(() => fake as unknown as SupabaseClient)
    controller.setIdentity(fakeUser(ID_A))
    fake.ops[0].d.resolve(row('A-NAME', []))
    await tick()

    const savePromise = controller.save({ display_name: 'A-NEW', completed_course_ids: ['course_x'] })
    fake.ops.find((op) => op.kind === 'write')!.d.resolve({ data: null, error: null })
    await tick()
    fake.ops.at(-1)!.d.resolve(row('A-NEW', ['course_x']))
    const result = await savePromise
    expect(result).toEqual({ ok: true })
    expect(controller.getPhase()).toMatchObject({
      kind: 'ready',
      data: { display_name: 'A-NEW', completed_course_ids: ['course_x'] },
    })
  })

  it('returns to idle on sign-out and never leaks the previous account after a failed load', async () => {
    const fake = makeFakeSupabase()
    const controller = createProfileController(() => fake as unknown as SupabaseClient)
    controller.setIdentity(fakeUser(ID_A))
    fake.ops[0].d.resolve({ data: null, error: { message: 'row not found' } })
    await tick()
    expect(controller.getPhase()).toEqual({ kind: 'error', message: 'row not found' })

    controller.setIdentity(null)
    expect(controller.getPhase()).toEqual({ kind: 'idle' })
  })

  it('reports an explicit error when Supabase is not configured', () => {
    const controller = createProfileController(() => null)
    controller.setIdentity(fakeUser(ID_A))
    expect(controller.getPhase()).toEqual({ kind: 'error', message: 'Supabase is not configured' })
    // Sign-in state changes to null reset to idle, not to a stale error.
    controller.setIdentity(null)
    expect(controller.getPhase()).toEqual({ kind: 'idle' })
  })
})
