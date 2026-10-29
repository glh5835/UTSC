import { Link } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { usePageTitle } from '../usePageTitle'
import type { TxKey } from '../i18n/en'

const PENDING: TxKey[] = [
  'home.pendingA1',
  'home.pendingA2',
  'home.pendingA3',
  'home.pendingA4',
  'home.pendingA5',
  'home.pendingA6',
  'home.pendingA7',
  'home.pendingA8',
]

const WORKING: TxKey[] = [
  'home.workingItem1',
  'home.workingItem2',
  'home.workingItem3',
  'home.workingItem4',
]

export function HomePage() {
  const { t } = useLanguage()
  usePageTitle(t('home.title'))
  return (
    <>
      <h1>{t('home.title')}</h1>
      <p className="lead">{t('home.intro')}</p>

      <section aria-labelledby="working-heading">
        <h2 id="working-heading">{t('home.workingTitle')}</h2>
        <ul>
          {WORKING.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
        <p>
          <Link className="button" to="/sample">
            {t('home.sampleCta')}
          </Link>
        </p>
        <p>
          <Link className="button" to="/pathways">
            {t('nav.pathways')}
          </Link>
        </p>
      </section>

      <section aria-labelledby="pending-heading">
        <h2 id="pending-heading">{t('home.pendingTitle')}</h2>
        <ul>
          {PENDING.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </section>

      <p className="note">{t('home.honestyNote')}</p>
    </>
  )
}
