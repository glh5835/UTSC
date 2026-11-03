import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { getSupabase } from '../../lib/supabase'
import { createFavoritesController, type Favorite, type FavoritesPhase } from './controller'
import { FavoritesContext } from './FavoritesContext'

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const auth = useAuth(), userId = auth.phase.kind === 'signedIn' ? auth.phase.user.id : null
  return <FavoritesState key={userId ?? auth.phase.kind} userId={userId} configured={auth.phase.kind !== 'unconfigured'}>{children}</FavoritesState>
}

function FavoritesState({ children, userId, configured }: { children: ReactNode; userId: string | null; configured: boolean }) {
  const controller = useRef<ReturnType<typeof createFavoritesController> | null>(null)
  controller.current ??= createFavoritesController({
    async load() { const { data, error } = await getSupabase()!.from('favorites').select('target_type, target_id, created_at').order('created_at', { ascending: false }); if (error) throw error; return (data ?? []) as Favorite[] },
    async add(type, id) { const { error } = await getSupabase()!.from('favorites').insert({ target_type: type, target_id: id }); if (error && error.code !== '23505') throw error },
    async remove(type, id) { const { error } = await getSupabase()!.from('favorites').delete().eq('target_type', type).eq('target_id', id); if (error) throw error },
  })
  const current = controller.current
  const [phase, setPhase] = useState<FavoritesPhase>(current.getPhase()), [busy, setBusy] = useState<string | null>(null), [error, setError] = useState('')
  const owner = useRef(userId); owner.current = userId
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => current.subscribe(() => setPhase(current.getPhase())), [current])
  useEffect(() => { current.setIdentity(userId); setBusy(null); setError(''); return () => current.setIdentity(null) }, [current, userId])
  return <FavoritesContext.Provider value={{ phase, userId, configured, busy, error, reload: current.reload,
    async toggle(type, id, saved) {
      const captured = userId
      setBusy(`${type}:${id}`); setError('')
      const result = await current.toggle(type, id, saved)
      if (!mounted.current || owner.current !== captured || result.staleOwner) return
      if (result.pending) return
      setBusy(null); if (!result.ok && !result.pending) setError(result.message ?? 'Request failed')
    },
  }}>{children}</FavoritesContext.Provider>
}
