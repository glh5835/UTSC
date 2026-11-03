import { createContext, useContext } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../i18n/LanguageContext'
import type { FavoriteType, FavoritesPhase } from './controller'

export interface FavoritesContextValue {
  phase: FavoritesPhase
  userId: string | null
  configured: boolean
  busy: string | null
  error: string
  toggle: (type: FavoriteType, id: string, saved: boolean) => Promise<void>
  reload: () => void
}
export const FavoritesContext = createContext<FavoritesContextValue | null>(null)
export const useFavorites = () => useContext(FavoritesContext)
export function FavoriteButton({ type, id }: { type: FavoriteType; id: string }) {
  const state = useFavorites(), { t } = useLanguage()
  if (!state?.configured) return <span className="note">{t('fav.preview')}</span>
  if (!state.userId) return <Link to="/account">{t('fav.signIn')}</Link>
  const saved = state.phase.kind === 'ready' && state.phase.items.some(item => item.target_type === type && item.target_id === id)
  return <button type="button" disabled={state.phase.kind !== 'ready' || state.busy !== null} aria-pressed={saved}
    onClick={() => void state.toggle(type, id, saved)}>{t(saved ? 'fav.remove' : 'fav.save')}</button>
}

export function FavoriteFeedback() {
  const state = useFavorites()
  return state?.error ? <p role="alert" className="banner banner-warn">{state.error}</p> : null
}
