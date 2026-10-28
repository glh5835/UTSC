import type { SupabaseClient } from '@supabase/supabase-js'

export type ConfirmationSource = 'course' | 'experience' | 'manual'

export interface ExperienceRecord {
  id: string
  text: string
  created_at: string
  updated_at: string
}

export interface UserSkillRecord {
  id: string
  skill_id: string
  source: ConfirmationSource
  source_id: string | null
  confirmed_at: string
}

export interface PersonalSkillsSnapshot {
  experiences: ExperienceRecord[]
  skills: UserSkillRecord[]
}

export type PersonalSkillsPhase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: PersonalSkillsSnapshot }

export interface ConfirmationInput {
  skillId: string
  source: ConfirmationSource
  sourceId: string | null
}

export interface ActionResult {
  ok: boolean
  message?: string
  staleOwner?: boolean
  refreshFailed?: boolean
}

export interface PersonalSkillsGateway {
  load(): Promise<PersonalSkillsSnapshot>
  createExperience(text: string): Promise<void>
  updateExperience(id: string, text: string): Promise<void>
  deleteExperience(id: string): Promise<void>
  confirmSkill(input: ConfirmationInput): Promise<void>
  revokeSkill(id: string): Promise<void>
}

const EXPERIENCE_COLUMNS = 'id, text, created_at, updated_at'
const SKILL_COLUMNS = 'id, skill_id, source, source_id, confirmed_at'

function messageOf(reason: unknown): string {
  if (reason instanceof Error) return reason.message
  if (reason && typeof reason === 'object' && 'message' in reason) {
    const message = (reason as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return 'Network request failed'
}

export function createSupabasePersonalSkillsGateway(
  getClient: () => SupabaseClient | null,
): PersonalSkillsGateway {
  function client(): SupabaseClient {
    const supabase = getClient()
    if (!supabase) throw new Error('Supabase is not configured')
    return supabase
  }

  async function singleRow<T>(request: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
    const { data, error } = await request
    if (error) throw new Error(error.message)
    if (data === null) throw new Error('The requested personal record no longer exists')
    return data
  }

  return {
    async load() {
      const supabase = client()
      const [experiences, skills] = await Promise.all([
        supabase
          .from('experiences')
          .select(EXPERIENCE_COLUMNS)
          .order('updated_at', { ascending: false }),
        supabase
          .from('user_skills')
          .select(SKILL_COLUMNS)
          .order('confirmed_at', { ascending: false }),
      ])
      if (experiences.error) throw new Error(experiences.error.message)
      if (skills.error) throw new Error(skills.error.message)
      return {
        experiences: (experiences.data ?? []) as ExperienceRecord[],
        skills: (skills.data ?? []) as UserSkillRecord[],
      }
    },

    async createExperience(text) {
      await singleRow(
        client().from('experiences').insert({ text }).select('id').single(),
      )
    },

    async updateExperience(id, text) {
      await singleRow(
        client().from('experiences').update({ text }).eq('id', id).select('id').single(),
      )
    },

    async deleteExperience(id) {
      await singleRow(
        client().from('experiences').delete().eq('id', id).select('id').single(),
      )
    },

    async confirmSkill(input) {
      const { error } = await client().from('user_skills').insert({
        skill_id: input.skillId,
        source: input.source,
        source_id: input.sourceId,
      })
      // The UNIQUE NULLS NOT DISTINCT constraint makes repeated confirmation
      // idempotent. Any other failure must remain visible.
      if (error && error.code !== '23505') throw new Error(error.message)
    },

    async revokeSkill(id) {
      await singleRow(
        client().from('user_skills').delete().eq('id', id).select('id').single(),
      )
    },
  }
}

/**
 * Owner/generation-guarded personal data controller. A response or mutation
 * belongs only to the account that started it; identity changes invalidate
 * both reads and in-flight operation completion before they can touch state.
 */
export function createPersonalSkillsController(getGateway: () => PersonalSkillsGateway) {
  let phase: PersonalSkillsPhase = { kind: 'idle' }
  let owner: string | null = null
  let generation = 0
  const listeners = new Set<() => void>()

  function emit() {
    for (const listener of listeners) listener()
  }

  function apply(gen: number, next: PersonalSkillsPhase) {
    if (gen !== generation) return
    phase = next
    emit()
  }

  function setIdentity(nextOwner: string | null) {
    if (nextOwner === owner) return
    owner = nextOwner
    generation += 1
    phase = nextOwner === null ? { kind: 'idle' } : { kind: 'loading' }
    emit()
    if (nextOwner !== null) void load(generation)
  }

  async function load(gen: number) {
    try {
      const data = await getGateway().load()
      apply(gen, { kind: 'ready', data })
    } catch (reason) {
      apply(gen, { kind: 'error', message: messageOf(reason) })
    }
  }

  async function run(operation: (gateway: PersonalSkillsGateway) => Promise<void>): Promise<ActionResult> {
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
    createExperience: (text: string) => run((gateway) => gateway.createExperience(text)),
    updateExperience: (id: string, text: string) => run((gateway) => gateway.updateExperience(id, text)),
    deleteExperience: (id: string) => run((gateway) => gateway.deleteExperience(id)),
    confirmSkill: (input: ConfirmationInput) => run((gateway) => gateway.confirmSkill(input)),
    revokeSkill: (id: string) => run((gateway) => gateway.revokeSkill(id)),
  }
}
