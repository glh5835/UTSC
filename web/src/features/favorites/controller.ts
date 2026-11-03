export type FavoriteType = 'resource' | 'opportunity'
export interface Favorite { target_type: FavoriteType; target_id: string; created_at: string }
export interface FavoritesGateway { load(): Promise<Favorite[]>; add(type: FavoriteType, id: string): Promise<void>; remove(type: FavoriteType, id: string): Promise<void> }
export type FavoritesPhase = { kind: 'idle' | 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; items: Favorite[] }
export function createFavoritesController(gateway: FavoritesGateway) {
  let owner: string | null = null, generation = 0
  let phase: FavoritesPhase = { kind: 'idle' }
  const listeners = new Set<() => void>(), pending = new Set<string>()
  const emit = () => listeners.forEach(listener => listener())
  async function load(gen: number) {
    try { const items = await gateway.load(); if (gen !== generation) return; phase = { kind: 'ready', items }; emit() }
    catch (error) { if (gen !== generation) return; phase = { kind: 'error', message: error instanceof Error ? error.message : 'Network error' }; emit() }
  }
  return {
    getPhase: () => phase,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    setIdentity(id: string | null) { if (owner === id) return; owner = id; generation++; pending.clear(); phase = id ? { kind: 'loading' } : { kind: 'idle' }; emit(); if (id) void load(generation) },
    reload() { if (owner) { phase = { kind: 'loading' }; emit(); void load(generation) } },
    async toggle(type: FavoriteType, id: string, saved: boolean) {
      const gen = generation, key = `${gen}:${type}:${id}`
      if (!owner) return { ok: false, message: 'Sign in to save' }
      if (pending.size > 0) return { ok: false, pending: true }
      pending.add(key)
      try {
        if (saved) await gateway.remove(type, id); else await gateway.add(type, id)
        if (gen !== generation) return { ok: false, staleOwner: true }
        const items = await gateway.load()
        if (gen !== generation) return { ok: false, staleOwner: true }
        phase = { kind: 'ready', items }; emit(); return { ok: true }
      } catch (error) {
        if (gen !== generation) return { ok: false, staleOwner: true }
        return { ok: false, message: error instanceof Error ? error.message : 'Network error' }
      } finally { pending.delete(key) }
    },
  }
}
