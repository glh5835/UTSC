import { Link } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import type { TxKey } from '../i18n/en'

export interface PlaceholderSpec {
  navKey: TxKey
  descKey: TxKey
  /** Frozen-plan task reference, shown verbatim (e.g. "A2"). */
  planRef: string
}

export function PlaceholderPage({ spec }: { spec: PlaceholderSpec }) {
  const { t } = useLanguage()
  return (
    <>
      <h1>{t(spec.navKey)}</h1>
      <p className="lead">{t(spec.descKey)}</p>
      <section className="panel panel-placeholder">
        <h2>{t('ph.title', { page: t(spec.navKey) })}</h2>
        <p>
          <code className="chip">{t('ph.planRef', { ref: spec.planRef })}</code>
        </p>
        <p>{t('ph.noFake')}</p>
        <p>
          <Link to="/">{t('notfound.back')}</Link>
        </p>
      </section>
    </>
  )
}
