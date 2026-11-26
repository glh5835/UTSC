import { useDataVersion } from '../../data/DataVersionContext'
import { labelFor, LEVEL_LABELS, RESOURCE_TYPE_LABELS } from '../../data/labels'
import { useLanguage } from '../../i18n/LanguageContext'
import { usePageTitle } from '../../usePageTitle'
import { FavoriteButton } from '../favorites/FavoritesContext'
import { DatasetStatePanels, useMarketBundle } from '../market/useMarketBundle'

export function ResourcesPage() {
  const { t, lang } = useLanguage()
  usePageTitle(t('nav.resources'))
  const { config } = useDataVersion()
  const { phase, reload } = useMarketBundle(config.pathwaysBundlePath)
  const resources = phase.phase === 'ok' ? phase.bundle.resources : null

  return (
    <>
      <h1>{t('nav.resources')}</h1>
      <DatasetStatePanels phase={phase} onRetry={reload} />
      {resources?.length === 0 ? <p role="status">{t('resources.empty')}</p> : null}
      {resources?.map(resource => (
        <article className="panel" key={resource.resource_id}>
          <h2>{resource.title}</h2>
          <p>
            {labelFor(RESOURCE_TYPE_LABELS, resource.resource_type, lang)} · {labelFor(LEVEL_LABELS, resource.level, lang)}
          </p>
          <p>{t(resource.eligibility_note ? 'a4.pathways.eligibilityKnown' : 'a4.pathways.eligibilityUnknown', { note: resource.eligibility_note ?? '' })}</p>
          <p className="note">{t('a4.pathways.verifiedAt')} <code>{resource.verified_at}</code></p>
          <p className="account-actions">
            <a href={resource.source_url} target="_blank" rel="noreferrer">{t('field.sourceUrl')}</a>
            <FavoriteButton type="resource" id={resource.resource_id} />
          </p>
        </article>
      ))}
    </>
  )
}
