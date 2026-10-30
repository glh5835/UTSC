import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Personal learning-path storage for A4, reusing the existing A1 tables
 * learning_paths + path_items and their verbatim contract enums
 * (target_role_id: the eight shared role ids; status: not_started /
 * in_progress / completed). No shared field or enum is invented here.
 *
 * Rules encoded in this module:
 * - Every write is triggered by an explicit user action on their own account;
 *   user_id always comes from auth.uid() (never from the client payload).
 * - Re-adding the same resource or skill to one path is idempotent: the
 *   controller skips items it can already see, and the database enforces the
 *   same rule through the A4 partial unique indexes (migration
 *   20261029000000_a4_path_items_idempotency.sql). Duplicate inserts surface
 *   as 23505 and are treated as success. Adding never resets an existing
 *   item's status — only the explicit status update does.
 * - Zero-row UPDATE/DELETE (another account's row, concurrently deleted row,
 *   RLS-filtered row) is an error, never a reported success.
 * - A path creation plus its batch of items is resumable: if some item
 *   inserts fail, the caller receives the persisted path id and the real
 *   saved/failed counts so the UI can show the partial state and retry
 *   safely instead of claiming a full save.
 */

export type PathItemStatus = 'not_started' | 'in_progress' | 'completed'

export const PATH_ITEM_STATUSES: readonly PathItemStatus[] = ['not_started', 'in_progress', 'completed']

export interface PathItemRecord {
  id: string
  path_id: string
  resource_id: string | null
  skill_id: string | null
  status: PathItemStatus
  updated_at: string
}

export interface LearningPathRecord {
  id: string
  target_role_id: string
  created_at: string
  items: PathItemRecord[]
}

export interface PathsSnapshot {
  paths: LearningPathRecord[]
}

export type LearningPathsPhase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: PathsSnapshot }

export interface PathItemInput {
  resourceId: string | null
  skillId: string | null
}

export interface PathActionResult {
  ok: boolean
  message?: string
  staleOwner?: boolean
  refreshFailed?: boolean
  /** Path id for resumable save flows. */
  pathId?: string
  savedCount?: number
  failedCount?: number
  /** True when the item was already on the path (idempotent no-op). */
  alreadyPresent?: boolean
}

export interface LearningPathsGateway {
  load(): Promise<PathsSnapshot>
  createPath(targetRoleId: string): Promise<string>
  deletePath(pathId: string): Promise<void>
  addPathItem(pathId: string, input: PathItemInput): Promise<void>
  removePathItem(itemId: string): Promise<void>
  updatePathItemStatus(itemId: string, status: PathItemStatus): Promise<void>
}

const PATH_COLUMNS = 'id, target_role_id, created_at'
const ITEM_COLUMNS = 'id, path_id, resource_id, skill_id, status, updated_at'

function messageOf(reason: unknown): string {
  if (reason instanceof Error) return reason.message
  if (reason && typeof reason === 'object' && 'message' in reason) {
    const message = (reason as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return 'Network request failed'
}

function errorCode(reason: unknown): string | null {
  if (reason && typeof reason === 'object' && 'code' in reason) {
    const code = (reason as { code?: unknown }).code
    if (typeof code === 'string') return code
  }
  return null
}

export function createSupabaseLearningPathsGateway(
  getClient: () => SupabaseClient | null,
): LearningPathsGateway {
  function client(): SupabaseClient {
    const supabase = getClient()
    if (!supabase) throw new Error('Supabase is not configured')
    return supabase
  }

  async function singleRow<T>(
    request: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  ): Promise<T> {
    const { data, error } = await request
    if (error) throw new Error(error.message)
    if (data === null || data === undefined) {
      throw new Error('The requested learning-path record no longer exists')
    }
    return data as T
  }

  return {
    async load() {
      const supabase = client()
      const [paths, items] = await Promise.all([
        supabase
          .from('learning_paths')
          .select(PATH_COLUMNS)
          .order('created_at', { ascending: true }),
        supabase
          .from('path_items')
          .select(ITEM_COLUMNS)
          .order('path_id', { ascending: true })
          .order('updated_at', { ascending: true }),
      ])
      if (paths.error) throw new Error(paths.error.message)
      if (items.error) throw new Error(items.error.message)
      const grouped = new Map<string, LearningPathRecord>()
      for (const path of (paths.data ?? []) as Omit<LearningPathRecord, 'items'>[]) {
        grouped.set(path.id, { ...path, items: [] })
      }
      for (const item of (items.data ?? []) as PathItemRecord[]) {
        grouped.get(item.path_id)?.items.push(item)
      }
      return { paths: [...grouped.values()] }
    },

    async createPath(targetRoleId) {
      const row = await singleRow<{ id: string }>(
        client().from('learning_paths').insert({ target_role_id: targetRoleId }).select('id').single(),
      )
      return row.id
    },

    async deletePath(pathId) {
      await singleRow(
        client().from('learning_paths').delete().eq('id', pathId).select('id').single(),
      )
    },

    async addPathItem(pathId, input) {
      try {
        const { error } = await client().from('path_items').insert({
          path_id: pathId,
          resource_id: input.resourceId,
          skill_id: input.skillId,
          status: 'not_started',
        })
        if (error) throw Object.assign(new Error(error.message), { code: error.code })
      } catch (reason) {
        // Partial unique indexes (path_id, resource_id / path_id, skill_id)
        // make a repeated add of the same target a no-op instead of a
        // duplicate row; any other failure stays visible.
        if (errorCode(reason) !== '23505') throw reason
      }
    },

    async removePathItem(itemId) {
      await singleRow(
        client().from('path_items').delete().eq('id', itemId).select('id').single(),
      )
    },

    async updatePathItemStatus(itemId, status) {
      await singleRow(
        client().from('path_items').update({ status }).eq('id', itemId).select('id').single(),
      )
    },
  }
}

export function itemKeyOf(item: { resource_id: string | null; skill_id: string | null }): string {
  return item.resource_id !== null ? `resource:${item.resource_id}` : `skill:${item.skill_id ?? ''}`
}

/**
 * Owner/generation-guarded controller. Mirrors the accepted personal-skills
 * controller: a response or mutation belongs only to the account that started
 * it; identity changes invalidate in-flight reads and completions before they
 * can touch state, so A→B→A and sign-out can never apply stale data.
 */
export function createLearningPathsController(getGateway: () => LearningPathsGateway) {
  let phase: LearningPathsPhase = { kind: 'idle' }
  let owner: string | null = null
  let generation = 0
  const listeners = new Set<() => void>()

  function emit() {
    for (const listener of listeners) listener()
  }

  function apply(gen: number, next: LearningPathsPhase) {
    if (gen !== generation) return
    phase = next
    emit()
  }

  function currentItems(pathId: string): Map<string, PathItemRecord> | null {
    if (phase.kind !== 'ready') return null
    const path = phase.data.paths.find((entry) => entry.id === pathId)
    if (!path) return null
    return new Map(path.items.map((item) => [itemKeyOf(item), item]))
  }

  async function load(gen: number) {
    try {
      const data = await getGateway().load()
      apply(gen, { kind: 'ready', data })
    } catch (reason) {
      apply(gen, { kind: 'error', message: messageOf(reason) })
    }
  }

  function setIdentity(nextOwner: string | null) {
    if (nextOwner === owner) return
    owner = nextOwner
    generation += 1
    phase = nextOwner === null ? { kind: 'idle' } : { kind: 'loading' }
    emit()
    if (nextOwner !== null) void load(generation)
  }

  async function run(operation: (gateway: LearningPathsGateway) => Promise<void>): Promise<PathActionResult> {
    const gen = generation
    if (owner === null) return { ok: false, message: 'Not signed in' }
    try {
      await operation(getGateway())
    } catch (reason) {
      if (gen !== generation) return { ok: false, message: messageOf(reason), staleOwner: true }
      return { ok: false, message: messageOf(reason) }
    }
    if (gen !== generation) return { ok: true, staleOwner: true }
    try {
      const data = await getGateway().load()
      if (gen !== generation) return { ok: true, staleOwner: true }
      apply(gen, { kind: 'ready', data })
      return { ok: true }
    } catch (reason) {
      if (gen !== generation) return { ok: true, staleOwner: true }
      return {
        ok: true,
        refreshFailed: true,
        message: `Saved, but the latest view could not be reloaded: ${messageOf(reason)}`,
      }
    }
  }

  return {
    getPhase: () => phase,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setIdentity,
    reload: () => {
      if (owner !== null) void load(generation)
    },

    createPathWithItems: async (
      targetRoleId: string,
      items: readonly PathItemInput[],
    ): Promise<PathActionResult> => {
      const gen = generation
      if (owner === null) return { ok: false, message: 'Not signed in' }
      let pathId: string
      try {
        pathId = await getGateway().createPath(targetRoleId)
      } catch (reason) {
        if (gen !== generation) return { ok: false, message: messageOf(reason), staleOwner: true }
        return { ok: false, message: messageOf(reason) }
      }
      if (gen !== generation) return { ok: false, pathId, staleOwner: true }
      return addItemsToPath(pathId, items, gen)
    },

    addItemsToPath,

    deletePath: (pathId: string) => run((gateway) => gateway.deletePath(pathId)),
    removePathItem: (itemId: string) => run((gateway) => gateway.removePathItem(itemId)),
    updatePathItemStatus: (itemId: string, status: PathItemStatus) =>
      run((gateway) => gateway.updatePathItemStatus(itemId, status)),
  }

  /**
   * Adds each requested item in turn, skipping ones the path already contains
   * (no duplicate row, no status reset), then reloads so the snapshot shows
   * the real persisted state. Partial failures are counted and reported with
   * the path id so the caller can offer an honest retry.
   */
  async function addItemsToPath(
    pathId: string,
    items: readonly PathItemInput[],
    gen?: number,
  ): Promise<PathActionResult> {
    const effectiveGen = gen ?? generation
    if (owner === null) return { ok: false, message: 'Not signed in' }
    // The path may not be in the local snapshot yet (it was just created, or
    // another device added it); an empty local view must not block the save.
    // If the path truly does not exist, every insert fails on the composite
    // foreign key and is reported below.
    const known = currentItems(pathId) ?? new Map<string, PathItemRecord>()
    let savedCount = 0
    let alreadyPresent = false
    const requestedKeys = new Set<string>()
    const pending: PathItemInput[] = []
    for (const item of items) {
      const key = itemKeyOf({ resource_id: item.resourceId, skill_id: item.skillId })
      if (requestedKeys.has(key)) continue
      requestedKeys.add(key)
      if (known?.has(key)) {
        alreadyPresent = true
        continue
      }
      pending.push(item)
    }
    let firstFailure: string | null = null
    for (const item of pending) {
      try {
        await getGateway().addPathItem(pathId, item)
        savedCount += 1
      } catch (reason) {
        if (firstFailure === null) firstFailure = messageOf(reason)
      }
    }
    if (effectiveGen !== generation) {
      return { ok: savedCount > 0, pathId, savedCount, failedCount: pending.length - savedCount, staleOwner: true }
    }
    let refreshFailed = false
    try {
      const data = await getGateway().load()
      if (effectiveGen !== generation) {
        return { ok: savedCount > 0, pathId, savedCount, failedCount: pending.length - savedCount, staleOwner: true }
      }
      apply(effectiveGen, { kind: 'ready', data })
    } catch (reason) {
      refreshFailed = true
      if (effectiveGen === generation) {
        return {
          ok: savedCount > 0,
          pathId,
          savedCount,
          failedCount: pending.length - savedCount,
          refreshFailed: true,
          message: `Saved ${savedCount} item(s), but the latest view could not be reloaded: ${messageOf(reason)}`,
        }
      }
    }
    const failedCount = pending.length - savedCount
    if (failedCount > 0) {
      return {
        ok: false,
        pathId,
        savedCount,
        failedCount,
        refreshFailed,
        message: firstFailure ?? 'Some items could not be saved',
      }
    }
    return { ok: true, pathId, savedCount, failedCount: 0, alreadyPresent, refreshFailed }
  }
}
