import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabase'

export interface ProfileData {
  display_name: string | null
  completed_course_ids: string[]
  updated_at: string
}

type ProfilePhase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: ProfileData }

/**
 * Loads and saves the signed-in user's profile row. The cache is strictly
 * keyed on the user id: when the signed-in account changes, the previous
 * account's data is dropped immediately, and a response that arrives after an
 * account switch is discarded instead of being shown for the wrong account.
 */
export function useProfile(user: User | null | undefined) {
  const [phase, setPhase] = useState<ProfilePhase>({ kind: 'idle' })

  useEffect(() => {
    if (!user) {
      setPhase({ kind: 'idle' })
      return
    }
    const supabase = getSupabase()
    if (!supabase) {
      setPhase({ kind: 'error', message: 'Supabase is not configured' })
      return
    }
    const ownerKey = user.id
    let cancelled = false
    setPhase({ kind: 'loading' })
    supabase
      .from('profiles')
      .select('display_name, completed_course_ids, updated_at')
      .eq('id', ownerKey)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setPhase({ kind: 'error', message: error.message })
          return
        }
        const row = data as {
          display_name: string | null
          completed_course_ids: string[]
          updated_at: string
        } | null
        setPhase({
          kind: 'ready',
          data: {
            display_name: row?.display_name ?? null,
            completed_course_ids: Array.isArray(row?.completed_course_ids)
              ? row.completed_course_ids
              : [],
            updated_at: row?.updated_at ?? '',
          },
        })
      })
    return () => {
      cancelled = true
    }
  }, [user?.id])

  async function save(update: { display_name: string | null; completed_course_ids: string[] }) {
    const supabase = getSupabase()
    if (!supabase || !user) {
      return { ok: false as const, message: 'Not signed in' }
    }
    const ownerKey = user.id
    const { error } = await supabase.from('profiles').update(update).eq('id', ownerKey)
    if (error) {
      return { ok: false as const, message: error.message }
    }
    // Re-read so the displayed cache always reflects the database and only
    // applies while this account is still the signed-in one.
    const { data, error: readError } = await supabase
      .from('profiles')
      .select('display_name, completed_course_ids, updated_at')
      .eq('id', ownerKey)
      .single()
    if (readError) {
      return { ok: false as const, message: readError.message }
    }
    const row = data as {
      display_name: string | null
      completed_course_ids: string[]
      updated_at: string
    } | null
    if (user.id !== ownerKey) {
      return { ok: true as const, staleOwner: true }
    }
    setPhase({
      kind: 'ready',
      data: {
        display_name: row?.display_name ?? null,
        completed_course_ids: Array.isArray(row?.completed_course_ids)
          ? row.completed_course_ids
          : [],
        updated_at: row?.updated_at ?? '',
      },
    })
    return { ok: true as const }
  }

  return { phase, save }
}
