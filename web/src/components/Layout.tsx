import { type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { UPSTREAM_DATA_REPO_URL } from '../data/sources'
import { useDataVersion } from '../data/DataVersionContext'
import type { TxKey } from '../i18n/en'
import { LanguageToggle } from './LanguageToggle'
import { ErrorBoundary } from './ErrorBoundary'

interface NavItem {
  to: string
  key: TxKey
  end?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', key: 'nav.home', end: true },
  { to: '/sample', key: 'nav.sample' },
  { to: '/account', key: 'nav.account' },
  { to: '/market', key: 'nav.market' },
  { to: '/compare', key: 'nav.compare' },
  { to: '/courses', key: 'nav.courses' },
  { to: '/opportunities', key: 'nav.opportunities' },
  { to: '/profile', key: 'nav.profile' },
  { to: '/pathways', key: 'nav.pathways' },
]

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useLanguage()
  const { config } = useDataVersion()
  return (
    <div className="site">
      <a className="skip-link" href="#main-content">
        {t('app.skipToContent')}
      </a>
      <header className="site-header">
        <div className="site-header-row">
          <Link to="/" className="site-title">
            {t('app.title')}
          </Link>
          <LanguageToggle />
        </div>
        <p className="site-tagline">{t('app.tagline')}</p>
        <nav aria-label={t('app.primaryNav')} className="site-nav">
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end}>
                  {t(item.key)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <p className="synthetic-banner" role="note">
          {t(config.mode === 'integration' ? 'app.integrationBanner' : 'app.syntheticBanner')}
        </p>
      </header>
      <main id="main-content" className="site-main">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
      <footer className="site-footer">
        <p>{t('footer.preview')}</p>
        <p>{t('footer.contract', { commit: config.contractCommit })}</p>
        <p>
          <a href={UPSTREAM_DATA_REPO_URL} target="_blank" rel="noreferrer">
            {t('footer.dataRepo')}
          </a>
          {' · '}
          <a
            href="https://github.com/glh5835/UTSC"
            target="_blank"
            rel="noreferrer"
          >
            {t('footer.websiteRepo')}
          </a>
          {' · '}
          <a href="/contracts/PROVENANCE.md" target="_blank" rel="noreferrer">
            {t('footer.provenance')}
          </a>
        </p>
        <p className="footer-note">{t('footer.langNote')}</p>
      </footer>
    </div>
  )
}
