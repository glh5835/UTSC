import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { LanguageProvider } from './i18n/LanguageContext'
import { AuthProvider } from './auth/AuthContext'
import { DataVersionProvider } from './data/DataVersionContext'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <LanguageProvider>
        <AuthProvider>
          <DataVersionProvider>
            <App />
          </DataVersionProvider>
        </AuthProvider>
      </LanguageProvider>
    </HashRouter>
  </StrictMode>,
)
