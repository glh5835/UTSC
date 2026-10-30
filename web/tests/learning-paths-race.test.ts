import { describe, expect, it } from 'vitest'
import {
  createLearningPathsController,
  createSupabaseLearningPathsGateway,
  itemKeyOf,
  type LearningPathsGateway,
  type LearningPathRecord,
  type PathItemRecord,
  type PathsSnapshot,
} from '../src/features/pathways/learningPaths'

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

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function item(
  id: string,
  pathId: string,
  key: { resourceId?: string; skillId?: string },
  status: PathItemRecord['status'] = 'not_started',
): PathItemRecord {
  return {
    id,
    path_id: pathId,
    resource_id: key.resourceId ?? null,
    skill_id: key.skillId ?? null,
    status,
    updated_at: '2026-10-29T10:00:00Z',
  }
}

function singlePathSnapshot(label: string): PathsSnapshot {
  const path: LearningPathRecord = {
    id: `path-${label}`,
    target_role_id: 'data_analyst',
    created_at: '2026-10-29T09:00:00Z',
    items: [item(`item-${label}`, `path-${label}`, { skillId: 'sql' })],
  }
  return { paths: [path] }
}

interface CallLog {
  kind: string
  args: unknown[]
}

interface AutoGatewayOptions {
  /** Return an error message to reject that call, or null to let it succeed. */
  failCall?: (call: CallLog, index: number) => string | null
  /** Make the Nth load (1-based) fail with this message. */
  rejectLoadAt?: { nth: number; message: string }
}

/**
 * Gateway whose operations complete immediately and whose loads return a
 * mutable shared state object — used for deterministic CRUD/idempotency flows.
 * Every call is recorded in order for assertions.
 */
function autoGateway(initial: PathsSnapshot, options: AutoGatewayOptions = {}) {
  const state = initial
  const calls: CallLog[] = []
  let loadCount = 0
  const gateway: LearningPathsGateway = {
    async load() {
      loadCount += 1
      if (options.rejectLoadAt && loadCount === options.rejectLoadAt.nth) {
        throw new Error(options.rejectLoadAt.message)
      }
      return state
    },
    async createPath(targetRoleId) {
      calls.push({ kind: 'createPath', args: [targetRoleId] })
      const failure = options.failCall?.(calls[calls.length - 1], calls.length - 1)
      if (failure) throw new Error(failure)
      const record: LearningPathRecord = {
        id: 'new-path-id',
        target_role_id: targetRoleId,
        created_at: '2026-10-29T09:30:00Z',
        items: [],
      }
      state.paths.push(record)
      return record.id
    },
    async deletePath(pathId) {
      calls.push({ kind: 'deletePath', args: [pathId] })
      const failure = options.failCall?.(calls[calls.length - 1], calls.length - 1)
      if (failure) throw new Error(failure)
      return
    },
    async addPathItem(pathId, input) {
      calls.push({ kind: 'addPathItem', args: [pathId, input] })
      const failure = options.failCall?.(calls[calls.length - 1], calls.length - 1)
      if (failure) throw new Error(failure)
      state.paths.find((path) => path.id === pathId)?.items.push(
        item(`auto-${calls.length}`, pathId, {
          resourceId: input.resourceId ?? undefined,
          skillId: input.skillId ?? undefined,
        }),
      )
      return
    },
    async removePathItem(itemId) {
      calls.push({ kind: 'removePathItem', args: [itemId] })
      const failure = options.failCall?.(calls[calls.length - 1], calls.length - 1)
      if (failure) throw new Error(failure)
      for (const path of state.paths) {
        path.items = path.items.filter((entry) => entry.id !== itemId)
      }
      return
    },
    async updatePathItemStatus(itemId, status) {
      calls.push({ kind: 'updatePathItemStatus', args: [itemId, status] })
      const failure = options.failCall?.(calls[calls.length - 1], calls.length - 1)
      if (failure) throw new Error(failure)
      for (const path of state.paths) {
        for (const entry of path.items) {
          if (entry.id === itemId) entry.status = status
        }
      }
      return
    },
  }
  return { gateway, calls, state }
}

async function readyAuto(initial: PathsSnapshot, options: AutoGatewayOptions = {}, owner = 'A') {
  const fake = autoGateway(initial, options)
  const controller = createLearningPathsController(() => fake.gateway)
  controller.setIdentity(owner)
  await tick()
  return { controller, ...fake }
}

/** Manual deferred gateway for late-response scenarios (A1-style). */
function manualGateway() {
  const reads: Deferred<PathsSnapshot>[] = []
  const calls: { kind: string; args: unknown[]; deferred: Deferred<unknown> }[] = []
  const gateway: LearningPathsGateway = {
    load: () => {
      const d = deferred<PathsSnapshot>()
      reads.push(d)
      return d.promise
    },
    createPath: (targetRoleId) => {
      const d = deferred<string>()
      calls.push({ kind: 'createPath', args: [targetRoleId], deferred: d as Deferred<unknown> })
      return d.promise
    },
    deletePath: (pathId) => {
      const d = deferred<void>()
      calls.push({ kind: 'deletePath', args: [pathId], deferred: d as Deferred<unknown> })
      return d.promise
    },
    addPathItem: (pathId, input) => {
      const d = deferred<void>()
      calls.push({ kind: 'addPathItem', args: [pathId, input], deferred: d as Deferred<unknown> })
      return d.promise
    },
    removePathItem: (itemId) => {
      const d = deferred<void>()
      calls.push({ kind: 'removePathItem', args: [itemId], deferred: d as Deferred<unknown> })
      return d.promise
    },
    updatePathItemStatus: (itemId, status) => {
      const d = deferred<void>()
      calls.push({
        kind: 'updatePathItemStatus',
        args: [itemId, status],
        deferred: d as Deferred<unknown>,
      })
      return d.promise
    },
  }
  return { gateway, reads, calls }
}

async function readyManual(label: string) {
  const fake = manualGateway()
  const controller = createLearningPathsController(() => fake.gateway)
  controller.setIdentity(label)
  fake.reads[0].resolve(singlePathSnapshot(label))
  await tick()
  return { controller, fake }
}

describe('learning paths: save, update, restore and delete', () => {
  it('creates a path and every requested item, then reloads the real state', async () => {
    const { controller, calls } = await readyAuto({ paths: [] })
    const result = await controller.createPathWithItems('data_analyst', [
      { resourceId: null, skillId: 'sql' },
      { resourceId: 'r1', skillId: null },
    ])
    expect(calls[0]).toMatchObject({ kind: 'createPath', args: ['data_analyst'] })
    expect(calls[1]).toMatchObject({
      kind: 'addPathItem',
      args: ['new-path-id', { resourceId: null, skillId: 'sql' }],
    })
    expect(calls[2]).toMatchObject({
      kind: 'addPathItem',
      args: ['new-path-id', { resourceId: 'r1', skillId: null }],
    })
    expect(result.ok).toBe(true)
    expect(result.savedCount).toBe(2)
    expect(result.failedCount).toBe(0)
    const phase = controller.getPhase()
    expect(phase.kind).toBe('ready')
  })

  it('updates an item status, removes an item and deletes a path', async () => {
    const { controller, calls, state } = await readyAuto(singlePathSnapshot('A'))
    const status = await controller.updatePathItemStatus('item-A', 'in_progress')
    expect(status.ok).toBe(true)
    expect(state.paths[0].items[0].status).toBe('in_progress')

    const removed = await controller.removePathItem('item-A')
    expect(removed.ok).toBe(true)
    expect(state.paths[0].items).toHaveLength(0)

    const deleted = await controller.deletePath('path-A')
    expect(deleted.ok).toBe(true)
    expect(calls.at(-1)).toMatchObject({ kind: 'deletePath', args: ['path-A'] })
  })

  it('treats a zero-row update or delete as a failure, never as success', async () => {
    // Emulates the real gateway: .select().single() with zero rows throws
    // "The requested learning-path record no longer exists".
    const { controller } = await readyAuto(singlePathSnapshot('A'), {
      failCall: (call) =>
        call.kind === 'updatePathItemStatus' || call.kind === 'removePathItem'
          ? 'The requested learning-path record no longer exists'
          : null,
    })
    const status = await controller.updatePathItemStatus('gone-item', 'completed')
    expect(status.ok).toBe(false)
    expect(status.message).toContain('no longer exists')
    const removed = await controller.removePathItem('gone-item')
    expect(removed.ok).toBe(false)
    // The ready snapshot is preserved; no success was reported.
    expect(controller.getPhase().kind).toBe('ready')
  })
})

describe('learning paths: idempotency', () => {
  const withExisting = (): PathsSnapshot => ({
    paths: [
      {
        id: 'path-A',
        target_role_id: 'data_analyst',
        created_at: '2026-10-29T09:00:00Z',
        items: [
          item('item-existing', 'path-A', { skillId: 'sql' }, 'in_progress'),
          item('item-res', 'path-A', { resourceId: 'r1' }, 'completed'),
        ],
      },
    ],
  })

  it('skips items the path already contains and never resets their status', async () => {
    const { controller, calls } = await readyAuto(withExisting())
    const result = await controller.addItemsToPath('path-A', [
      { resourceId: null, skillId: 'sql' },
      { resourceId: 'r1', skillId: null },
    ])
    expect(result.ok).toBe(true)
    expect(result.alreadyPresent).toBe(true)
    expect(result.savedCount).toBe(0)
    expect(calls.filter((call) => call.kind === 'addPathItem')).toHaveLength(0)
    expect(calls.filter((call) => call.kind === 'updatePathItemStatus')).toHaveLength(0)
    const phase = controller.getPhase()
    if (phase.kind !== 'ready') throw new Error('expected ready')
    expect(phase.data.paths[0].items.find((entry) => entry.id === 'item-existing')?.status).toBe(
      'in_progress',
    )
    expect(phase.data.paths[0].items.find((entry) => entry.id === 'item-res')?.status).toBe(
      'completed',
    )
  })

  it('collapses duplicate inputs within one request into single inserts', async () => {
    const { controller, calls } = await readyAuto({ paths: [] })
    const result = await controller.createPathWithItems('data_analyst', [
      { resourceId: 'r1', skillId: null },
      { resourceId: 'r1', skillId: null },
      { resourceId: null, skillId: 'sql' },
    ])
    expect(result.ok).toBe(true)
    expect(result.savedCount).toBe(2)
    expect(calls.filter((call) => call.kind === 'addPathItem')).toHaveLength(2)
  })

  it('surfaces a rejected duplicate insert as a partial failure at controller level', async () => {
    const { controller, calls } = await readyAuto(withExisting(), {
      failCall: (call) => (call.kind === 'addPathItem' ? 'duplicate key value' : null),
    })
    const result = await controller.addItemsToPath('path-A', [
      { resourceId: 'r9', skillId: null },
    ])
    // The controller never invents success for a rejected insert; converting
    // the constraint violation into idempotent success is the gateway's job
    // (23505), covered in the gateway test below and by the real RLS matrix.
    expect(result.ok).toBe(false)
    expect(result.failedCount).toBe(1)
    expect(result.message).toContain('duplicate key value')
    expect(calls.filter((call) => call.kind === 'addPathItem')).toHaveLength(1)
  })

  it('retries a partial save without duplicating already saved items', async () => {
    const state: PathsSnapshot = { paths: [] }
    let failInserts = 1 // the second insert fails once
    const { controller, calls } = await readyAuto(state, {
      failCall: (call, index) => {
        if (call.kind === 'addPathItem' && failInserts > 0) {
          // count only post-create inserts; index 0 is createPath
          const insertIndex = index - 1
          if (insertIndex === 1) {
            failInserts -= 1
            return 'network dropped'
          }
        }
        return null
      },
    })
    const first = await controller.createPathWithItems('data_analyst', [
      { resourceId: null, skillId: 'sql' },
      { resourceId: 'r1', skillId: null },
      { resourceId: 'r2', skillId: null },
    ])
    expect(first.ok).toBe(false)
    expect(first.pathId).toBe('new-path-id')
    expect(first.savedCount).toBe(2)
    expect(first.failedCount).toBe(1)

    const retry = await controller.addItemsToPath('new-path-id', [
      { resourceId: null, skillId: 'sql' },
      { resourceId: 'r1', skillId: null },
      { resourceId: 'r2', skillId: null },
    ])
    expect(retry.ok).toBe(true)
    expect(retry.savedCount).toBe(1)
    expect(retry.failedCount).toBe(0)
    const inserts = calls.filter((call) => call.kind === 'addPathItem')
    expect(inserts).toHaveLength(4)
    expect(inserts[1].args[1]).toEqual({ resourceId: 'r1', skillId: null })
    expect(inserts[3].args[1]).toEqual({ resourceId: 'r1', skillId: null })
    expect(state.paths[0].items).toHaveLength(3)
  })

  it('reports a partial save as partial, not as a full save', async () => {
    const { controller } = await readyAuto({ paths: [] }, {
      failCall: (call, index) =>
        call.kind === 'addPathItem' && index === 2 ? 'insert denied' : null,
    })
    const result = await controller.createPathWithItems('bi_analyst', [
      { resourceId: null, skillId: 'sql' },
      { resourceId: null, skillId: 'power_bi' },
    ])
    expect(result.ok).toBe(false)
    expect(result.savedCount).toBe(1)
    expect(result.failedCount).toBe(1)
    expect(result.message).toContain('insert denied')
    expect(result.pathId).toBe('new-path-id')
  })

  it('reports a failed path creation with nothing half-created', async () => {
    const { controller, calls } = await readyAuto({ paths: [] }, {
      failCall: (call) => (call.kind === 'createPath' ? 'insert denied' : null),
    })
    const result = await controller.createPathWithItems('data_analyst', [
      { resourceId: null, skillId: 'sql' },
    ])
    expect(result.ok).toBe(false)
    expect(result.pathId).toBeUndefined()
    expect(calls.filter((call) => call.kind === 'addPathItem')).toHaveLength(0)
  })
})

describe('learning paths: catalog changes never rewrite personal records', () => {
  it('keeps items whose resource disappeared and issues no delete or rewrite', async () => {
    const { controller, calls } = await readyAuto({
      paths: [
        {
          id: 'path-A',
          target_role_id: 'data_analyst',
          created_at: '2026-10-29T09:00:00Z',
          items: [
            item('item-kept', 'path-A', { resourceId: 'removed-resource' }, 'in_progress'),
          ],
        },
      ],
    })
    await controller.reload()
    const phase = controller.getPhase()
    if (phase.kind !== 'ready') throw new Error('expected ready')
    expect(phase.data.paths[0].items).toHaveLength(1)
    expect(phase.data.paths[0].items[0].resource_id).toBe('removed-resource')
    expect(phase.data.paths[0].items[0].status).toBe('in_progress')
    expect(calls.filter((call) => call.kind === 'removePathItem')).toHaveLength(0)
    expect(calls.filter((call) => call.kind === 'updatePathItemStatus')).toHaveLength(0)
  })
})

describe('learning paths: account and late-response isolation', () => {
  it('discards A data when B replaces the identity before A loads', async () => {
    const fake = manualGateway()
    const controller = createLearningPathsController(() => fake.gateway)
    controller.setIdentity('A')
    const aRead = fake.reads[0]
    controller.setIdentity('B')
    const bRead = fake.reads[1]
    expect(controller.getPhase()).toEqual({ kind: 'loading' })

    aRead.resolve(singlePathSnapshot('A'))
    await tick()
    expect(controller.getPhase()).toEqual({ kind: 'loading' })

    bRead.resolve(singlePathSnapshot('B'))
    await tick()
    const phase = controller.getPhase()
    expect(phase.kind).toBe('ready')
    if (phase.kind === 'ready') expect(phase.data.paths[0].id).toBe('path-B')
  })

  it('A→B→A reloads A fresh and drops the first A read', async () => {
    const fake = manualGateway()
    const controller = createLearningPathsController(() => fake.gateway)
    controller.setIdentity('A')
    const firstA = fake.reads[0]
    controller.setIdentity('B')
    const bRead = fake.reads[1]
    controller.setIdentity('A')
    expect(fake.reads).toHaveLength(3)
    const secondA = fake.reads[2]

    firstA.resolve(singlePathSnapshot('STALE-A'))
    bRead.resolve(singlePathSnapshot('B'))
    await tick()
    expect(controller.getPhase()).toEqual({ kind: 'loading' })

    secondA.resolve(singlePathSnapshot('FRESH-A'))
    await tick()
    const phase = controller.getPhase()
    expect(phase.kind).toBe('ready')
    if (phase.kind === 'ready') expect(phase.data.paths[0].id).toBe('path-FRESH-A')
  })

  it('ignores a late save success and a late save failure after sign-out', async () => {
    const { controller, fake } = await readyManual('A')

    const save = controller.updatePathItemStatus('item-A', 'completed')
    const op = fake.calls.at(-1)
    controller.setIdentity(null)
    expect(controller.getPhase()).toEqual({ kind: 'idle' })
    op?.deferred.resolve(undefined)
    expect(await save).toEqual({ ok: true, staleOwner: true })
    expect(controller.getPhase()).toEqual({ kind: 'idle' })

    controller.setIdentity('A')
    fake.reads.at(-1)?.resolve(singlePathSnapshot('A'))
    await tick()
    const failing = controller.deletePath('path-A')
    const failingOp = fake.calls.at(-1)
    controller.setIdentity('B')
    fake.reads.at(-1)?.resolve(singlePathSnapshot('B'))
    await tick()
    failingOp?.deferred.reject(new Error('A delayed failure'))
    const result = await failing
    expect(result.ok).toBe(false)
    expect(result.staleOwner).toBe(true)
    const phase = controller.getPhase()
    expect(phase.kind).toBe('ready')
    if (phase.kind === 'ready') expect(phase.data.paths[0].id).toBe('path-B')
  })

  it('reports a read-back failure after a successful save instead of pretending', async () => {
    const fake = manualGateway()
    const controller = createLearningPathsController(() => fake.gateway)
    controller.setIdentity('A')
    fake.reads[0].resolve(singlePathSnapshot('A'))
    await tick()

    const save = controller.updatePathItemStatus('item-A', 'completed')
    fake.calls.at(-1)?.deferred.resolve(undefined)
    await tick() // let the controller reach its post-operation read-back
    // The post-operation read-back fails.
    fake.reads.at(-1)?.reject(new Error('reload failed'))
    const result = await save
    expect(result.ok).toBe(true)
    expect(result.refreshFailed).toBe(true)
    expect(result.message).toContain('reload failed')
    const phase = controller.getPhase()
    expect(phase.kind).toBe('ready')
    if (phase.kind === 'ready') expect(phase.data.paths[0].id).toBe('path-A')
  })

  it('returns idle on sign-out and refuses operations while signed out', async () => {
    const fake = manualGateway()
    const controller = createLearningPathsController(() => fake.gateway)
    controller.setIdentity('A')
    expect(controller.getPhase()).toEqual({ kind: 'loading' })
    controller.setIdentity(null)
    expect(controller.getPhase()).toEqual({ kind: 'idle' })

    const result = await controller.createPathWithItems('data_analyst', [])
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Not signed in')
  })

  it('surfaces a foreign-path binding rejection as a failure without success', async () => {
    const { controller, calls } = await readyAuto(singlePathSnapshot('A'), {
      failCall: (call) => (call.kind === 'addPathItem' ? 'foreign key violation' : null),
    })
    const result = await controller.addItemsToPath('path-OF-OTHER-USER', [
      { resourceId: 'r1', skillId: null },
    ])
    expect(result.ok).toBe(false)
    expect(result.failedCount).toBe(1)
    expect(result.message).toContain('foreign key violation')
    const phase = controller.getPhase()
    expect(phase.kind).toBe('ready')
    if (phase.kind === 'ready') expect(phase.data.paths[0].id).toBe('path-A')
    expect(calls.at(-1)?.args[0]).toBe('path-OF-OTHER-USER')
  })
})

describe('learning paths: unconfigured Supabase', () => {
  it('reports an explicit unconfigured failure without fake data', async () => {
    const failingGateway: LearningPathsGateway = {
      load: () => Promise.reject(new Error('Supabase is not configured')),
      createPath: () => Promise.reject(new Error('Supabase is not configured')),
      deletePath: () => Promise.reject(new Error('Supabase is not configured')),
      addPathItem: () => Promise.reject(new Error('Supabase is not configured')),
      removePathItem: () => Promise.reject(new Error('Supabase is not configured')),
      updatePathItemStatus: () => Promise.reject(new Error('Supabase is not configured')),
    }
    const controller = createLearningPathsController(() => failingGateway)
    controller.setIdentity('A')
    await tick()
    const phase = controller.getPhase()
    expect(phase.kind).toBe('error')
    if (phase.kind === 'error') expect(phase.message).toContain('not configured')

    const save = await controller.createPathWithItems('data_analyst', [])
    expect(save.ok).toBe(false)
    expect(save.message).toContain('not configured')
  })
})

describe('supabase gateway: duplicate insert is idempotent, other errors stay', () => {
  function stubClient(insertResult: { data: unknown; error: { message: string; code?: string } | null }) {
    const recorded: { table: string; values: unknown }[] = []
    const client = {
      from(table: string) {
        return {
          insert(values: unknown) {
            recorded.push({ table, values })
            return insertResult
          },
        }
      },
    }
    return { client: client as unknown as import('@supabase/supabase-js').SupabaseClient, recorded }
  }

  it('resolves a normal insert', async () => {
    const { client, recorded } = stubClient({ data: null, error: null })
    const gateway = createSupabaseLearningPathsGateway(() => client)
    await gateway.addPathItem('p1', { resourceId: 'r1', skillId: null })
    expect(recorded[0].table).toBe('path_items')
    expect(recorded[0].values).toMatchObject({ path_id: 'p1', resource_id: 'r1', skill_id: null })
  })

  it('converts a 23505 duplicate into idempotent success', async () => {
    const { client } = stubClient({
      data: null,
      error: { message: 'duplicate key value violates unique constraint', code: '23505' },
    })
    const gateway = createSupabaseLearningPathsGateway(() => client)
    await expect(
      gateway.addPathItem('p1', { resourceId: null, skillId: 'sql' }),
    ).resolves.toBeUndefined()
  })

  it('keeps every other error visible', async () => {
    const { client } = stubClient({
      data: null,
      error: { message: 'new row violates row-level security policy', code: '42501' },
    })
    const gateway = createSupabaseLearningPathsGateway(() => client)
    await expect(
      gateway.addPathItem('p1', { resourceId: null, skillId: 'sql' }),
    ).rejects.toThrow('row-level security')
  })
})

describe('itemKeyOf', () => {
  it('distinguishes resource items from skill items', () => {
    expect(itemKeyOf({ resource_id: 'r1', skill_id: null })).toBe('resource:r1')
    expect(itemKeyOf({ resource_id: null, skill_id: 'sql' })).toBe('skill:sql')
    expect(itemKeyOf({ resource_id: 'r1', skill_id: 'sql' })).toBe('resource:r1')
  })
})
