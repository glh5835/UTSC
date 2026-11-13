import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './PublicApp'
import { LanguageProvider } from './i18n/LanguageContext'
import { DataVersionProvider } from './data/DataVersionContext'
import type { DataVersionConfig } from './data/sources'
import './styles.css'

export function mountPublicApp(config?: DataVersionConfig) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <HashRouter>
        <LanguageProvider>
          <DataVersionProvider config={config}>
            <App />
          </DataVersionProvider>
        </LanguageProvider>
      </HashRouter>
    </StrictMode>,
  )
}
