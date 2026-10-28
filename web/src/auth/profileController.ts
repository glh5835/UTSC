import type { SupabaseClient, User } from '@supabase/supabase-js'

export interface ProfileData {
  display_name: string | null
  completed_course_ids: string[]
  updated_at: string
}

export type ProfilePhase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: ProfileData }

export type ProfileUpdate = { display_name: string | null; completed_course_ids: string[] }

export type SaveResult =
  | { ok: false; message: string; staleOwner?: true }
  | { ok: true; staleOwner?: true }

const PROFILE_COLUMNS = 'display_name, completed_course_ids, updated_at'

type Listener = () => void

/**
 * Framework-free owner of the signed-in user's profile cache. All reads and
 * writes re-check the LIVE signed-in account (and a generation counter that
 * ticks on every identity change) before mutating state — a response that
 * lands after the account switched is discarded, never displayed for the new
 * account. The comparison is always "captured-at-request-time owner vs.
 * current owner", never two values from the same stale closure (the defect
 * found in the 2026-10-28 review).
 */
export function createProfileController(getClient: () => SupabaseClient | null) {
  let phase: ProfilePhase = { kind: 'idle' }
  let owner: string | null = null
  let generation = 0
  const listeners = new Set<Listener>()

  function getPhase(): ProfilePhase {
    return phase
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  /** The only writer of the live owner. Called on every identity change,
   * including sign-out. Dropping the previous account's cache here is what
   * isolates it immediately, before any network response arrives. */
  function setIdentity(user: User | null | undefined): void {
    const nextOwner = user?.id ?? null
    if (nextOwner === owner) return
    owner = nextOwner
    generation += 1
    phase = nextOwner === null ? { kind: 'idle' } : { kind: 'loading' }
    emit()
    if (nextOwner !== null) void load(nextOwner, generation)
  }

  async function load(ownerKey: string, gen: number): Promise<void> {
    const supabase = getClient()
    if (!supabase) {
      apply(gen, { kind: 'error', message: 'Supabase is not configured' })
      return
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', ownerKey)
        .single()
      if (gen !== generation) return
      if (error) {
        apply(gen, { kind: 'error', message: error.message })
        return
      }
      apply(gen, { kind: 'ready', data: toProfileData(data) })
    } catch (reason) {
      // Network-level rejection: still generation-guarded, so a failure of a
      // previous account can never surface on the current account's page.
      if (gen !== generation) return
      apply(gen, { kind: 'error', message: toMessage(reason) })
    }
  }

  function staleResult(ok: boolean, message = ''): SaveResult {
    return ok
      ? { ok: true, staleOwner: true }
      : { ok: false, message, staleOwner: true }
  }

  async function save(update: ProfileUpdate): Promise<SaveResult> {
    const supabase = getClient()
    const ownerKey = owner
    const gen = generation
    if (!supabase || ownerKey === null) {
      return { ok: false, message: 'Not signed in' }
    }
    try {
      const { error } = await supabase.from('profiles').update(update).eq('id', ownerKey)
      // Every completion branch checks the live generation before inspecting
      // or exposing the result. A stale UPDATE error is not the new account's
      // error, so the caller must be able to discard it.
      if (gen !== generation) {
        return staleResult(error === null, error?.message ?? '')
      }
      if (error) {
        return { ok: false, message: error.message }
      }

      // Re-read so the displayed cache always reflects the database.
      const { data, error: readError } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', ownerKey)
        .single()
      if (gen !== generation) {
        return staleResult(readError === null, readError?.message ?? '')
      }
      if (readError) {
        return { ok: false, message: readError.message }
      }
      apply(gen, { kind: 'ready', data: toProfileData(data) })
      return { ok: true }
    } catch (reason) {
      if (gen !== generation) {
        return staleResult(false, toMessage(reason))
      }
      return { ok: false, message: toMessage(reason) }
    }
  }

  /** Generation guard on every state write: nothing from an older account
   * generation can ever land in `phase`, on any code path. */
  function apply(gen: number, next: ProfilePhase): void {
    if (gen !== generation) return
    phase = next
    emit()
  }

  function emit(): void {
    for (const listener of listeners) listener()
  }

  return { getPhase, subscribe, setIdentity, save }
}

function toProfileData(row: unknown): ProfileData {
  const value = (row ?? {}) as Partial<ProfileData> | null
  return {
    display_name: value?.display_name ?? null,
    completed_course_ids: Array.isArray(value?.completed_course_ids)
      ? value.completed_course_ids
      : [],
    updated_at: value?.updated_at ?? '',
  }
}

function toMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message
  if (reason && typeof reason === 'object' && 'message' in reason && typeof (reason as { message: unknown }).message === 'string') {
    return (reason as { message: string }).message
  }
  return 'Network request failed'
}
