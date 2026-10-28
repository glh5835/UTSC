import { useLanguage } from '../../i18n/LanguageContext'
import { labelFor, RUN_STATUS_LABELS } from '../../data/labels'
import type { UtscBundle } from '../../data/types'

/**
 * Dataset identity + freshness panel: dataset version, generation time,
 * collection window, posting-date coverage window and run status — each
 * labelled as its own kind of time. Generation time is never presented as
 * data freshness beyond the explicit staleness banner (which is computed
 * from manifest.generated_at only).
 */
export function DatasetPanel({ bundle, stale }: { bundle: UtscBundle; stale: { ageDays: number; stale: boolean; thresholdDays: number } | null }) {
  const { t, lang } = useLanguage()
  const manifest = bundle.manifest
  return (
    <section className="panel" aria-labelledby="market-dataset-heading">
      <h2 id="market-dataset-heading">{t('market.datasetHeading')}</h2>
      <dl className="def-list manifest">
        <div className="def-row">
          <dt>{t('manifest.datasetVersion')}</dt>
          <dd>
            <code>{manifest.dataset_version}</code>
          </dd>
        </div>
        <div className="def-row">
          <dt>{t('manifest.generatedAt')}</dt>
          <dd>
            <code>{manifest.generated_at}</code>
          </dd>
        </div>
        <div className="def-row">
          <dt>{t('manifest.collectedFrom')}</dt>
          <dd>{manifest.collected_from ? <code>{manifest.collected_from}</code> : <span className="none">—</span>}</dd>
        </div>
        <div className="def-row">
          <dt>{t('manifest.collectedTo')}</dt>
          <dd>{manifest.collected_to ? <code>{manifest.collected_to}</code> : <span className="none">—</span>}</dd>
        </div>
        <div className="def-row">
          <dt>{t('manifest.postingFrom')}</dt>
          <dd>{manifest.posting_from ? <code>{manifest.posting_from}</code> : <span className="none">—</span>}</dd>
        </div>
        <div className="def-row">
          <dt>{t('manifest.postingTo')}</dt>
          <dd>{manifest.posting_to ? <code>{manifest.posting_to}</code> : <span className="none">—</span>}</dd>
        </div>
        <div className="def-row">
          <dt>{t('manifest.runStatus')}</dt>
          <dd>
            {labelFor(RUN_STATUS_LABELS, manifest.run_status, lang)}
            {manifest.run_status !== 'complete' ? <span className="chip chip-warning">{t('market.runStatusCaveat')}</span> : null}
          </dd>
        </div>
      </dl>
      <p className="note">{t('market.timesNote')}</p>
      {stale?.stale ? (
        <p className="banner banner-warn" role="status">
          {t('stale.banner', { days: stale.ageDays, threshold: stale.thresholdDays })}
        </p>
      ) : null}
      {manifest.run_status === 'partial' ? (
        <p className="banner banner-warn" role="status">
          {t('market.partialBanner')}
        </p>
      ) : null}
    </section>
  )
}
