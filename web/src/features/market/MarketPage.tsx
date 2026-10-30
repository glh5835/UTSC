import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLanguage } from '../../i18n/LanguageContext'
import { usePageTitle } from '../../usePageTitle'
import { useDataVersion } from '../../data/DataVersionContext'
import { isFilterEmpty, type MarketFilter } from './criteria'
import { computeMarketOverview } from './stats'
import { parseFilter, serializeFilter } from './filterParams'
import { DatasetPicker, MARKET_DATASETS } from './DatasetPicker'
import { DatasetPanel } from './DatasetPanel'
import { FilterPanel } from './FilterPanel'
import { RoleDistribution, SkillStatsPanels, StatsSummary, SubtypeLegend } from './StatsPanels'
import { DatasetStatePanels, useMarketBundle } from './useMarketBundle'

/**
 * A2 market overview (/market). Formal market statistics over a versioned
 * contract package: eight-role sample distribution, role/area/level/date
 * filters (OR within a dimension, AND across dimensions) and technical/soft
 * skill mention rates. Public page — no sign-in involved; A1 account state
 * is untouched by this page.
 *
 * Filter state lives in the URL: every change pushes a history entry, so
 * reload and back/forward restore the exact view. The lang parameter is
 * owned by the LanguageContext on the real query string and never overrides
 * filter parameters.
 */
export function MarketPage() {
  const { t } = useLanguage()
  const { config } = useDataVersion()
  usePageTitle(t('nav.market'))
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState(MARKET_DATASETS[0].id)
  const dataset = MARKET_DATASETS.find((entry) => entry.id === selectedId) ?? MARKET_DATASETS[0]
  const { phase, stale, reload } = useMarketBundle(dataset.path)

  const filter = useMemo(() => parseFilter(searchParams), [searchParams])
  function changeFilter(next: MarketFilter) {
    const params = serializeFilter(next)
    // replace:false → each filter change is a history entry; back/forward
    // restores the previous filter set exactly.
    setSearchParams(params, { replace: false })
  }

  const overview = useMemo(
    () => (phase.phase === 'ok' ? computeMarketOverview(phase.bundle, filter) : null),
    [phase, filter],
  )

  return (
    <>
      <h1>{t('nav.market')}</h1>
      <p className="lead">{t('market.intro')}</p>
      <p className="note provenance">
        {t('market.upstreamNote', { commit: config.contractCommit.slice(0, 7) })}
      </p>

      <DatasetPicker selected={selectedId} onSelect={setSelectedId} />
      <DatasetStatePanels phase={phase} onRetry={reload} />

      {phase.phase === 'ok' && overview ? (
        phase.bundle.manifest.run_status === 'failed' ? (
          <section className="panel panel-error" aria-live="assertive">
            <h2>{t('market.failedTitle')}</h2>
            <p>{t('market.failedRefusal')}</p>
          </section>
        ) : phase.bundle.market_jobs.length === 0 ? (
          <p className="empty-state" role="status">
            {t('market.emptyPackage')}
          </p>
        ) : (
          <>
            {isFilterEmpty(filter) ? null : (
              <p className="state state-ok" role="status" aria-live="polite">
                {t('market.filterActive')}
              </p>
            )}
            <DatasetPanel bundle={phase.bundle} stale={stale} />
            <SubtypeLegend bundle={phase.bundle} />
            <FilterPanel filter={filter} onChange={changeFilter} />
            {overview.stats.f === 0 ? (
              <p className="empty-state" role="status">
                {t('market.noMatchingJobs')}
              </p>
            ) : (
              <>
                <StatsSummary stats={overview.stats} formalTotal={overview.formalTotal} />
                <RoleDistribution overview={overview} />
                <SkillStatsPanels stats={overview.stats} />
              </>
            )}
            <p className="note">{t('market.scopeNote')}</p>
          </>
        )
      ) : null}
    </>
  )
}
