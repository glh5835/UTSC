import { Link } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { usePageTitle } from '../usePageTitle'
import type { TxKey } from '../i18n/en'
import { useDataVersion } from '../data/DataVersionContext'

const sections: { to: string; title: TxKey; description: TxKey }[] = [
  { to: '/market', title: 'nav.market', description: 'public.home.market' },
  { to: '/compare', title: 'nav.compare', description: 'public.home.compare' },
  { to: '/courses', title: 'nav.courses', description: 'public.home.courses' },
  { to: '/pathways', title: 'nav.pathways', description: 'public.home.resources' },
  { to: '/opportunities', title: 'nav.opportunities', description: 'public.home.opportunities' },
]

export function PublicHomePage() {
  const { t } = useLanguage()
  const { config } = useDataVersion()
  const synthetic = config.mode === 'demo' || config.synthetic === true
  usePageTitle(t('nav.home'))
  return (
    <>
      {config.mode === 'demo' ? <p className="chip chip-synthetic">{t('public.preview')}</p> : null}
      <h1>{t('public.home.title')}</h1>
      <p className="lead">{t('public.home.intro')}</p>
      <div className="public-card-grid">
        {sections.map(section => (
          <section className="panel public-card" key={section.to}>
            <h2><Link to={section.to}>{t(section.title)}</Link></h2>
            <p>{t(section.description)}</p>
          </section>
        ))}
      </div>
      <section className="panel" aria-labelledby="public-scope-heading">
        <h2 id="public-scope-heading">{t('public.home.scopeTitle')}</h2>
        {synthetic ? <p>{t('public.home.scope')}</p> : null}
        <p>{t('public.home.accounts')}</p>
        <p className="note">{t('public.home.localPreferences')}</p>
      </section>
    </>
  )
}
