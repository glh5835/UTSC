import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { LanguageProvider } from './i18n/LanguageContext'
import { AuthProvider } from './auth/AuthContext'
import { DataVersionProvider } from './data/DataVersionContext'
import { FavoritesProvider } from './features/favorites/FavoritesProvider'
import { accountRoute, type MailCallback } from './auth/emailCallback'
import { getSupabase, initialMailCallback } from './lib/supabase'
import type { DataVersionConfig } from './data/sources'
import './styles.css'

declare const __UTSC_RELEASE_DATA__: DataVersionConfig | undefined

async function mount() {
  let callback: MailCallback | null = initialMailCallback
  if (callback?.kind === 'confirmation-redirect' || callback?.kind === 'recovery-redirect') {
    const client = getSupabase()
    if (!client || import.meta.env.MODE === 'production' || (await client.auth.initialize()).error) {
      callback = { kind: 'invalid' }
    }
  }
  if (callback) window.history.replaceState(window.history.state, '', accountRoute(window.location))
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <HashRouter>
        <LanguageProvider>
          <AuthProvider callback={callback}>
            <DataVersionProvider config={__UTSC_RELEASE_DATA__}>
              <FavoritesProvider><App /></FavoritesProvider>
            </DataVersionProvider>
          </AuthProvider>
        </LanguageProvider>
      </HashRouter>
    </StrictMode>,
  )
}

void mount()
