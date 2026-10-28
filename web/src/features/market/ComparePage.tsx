import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLanguage } from '../../i18n/LanguageContext'
import { usePageTitle } from '../../usePageTitle'
import { labelFor, ROLE_LABELS } from '../../data/labels'
import { CANONICAL_ROLE_IDS, type CanonicalRoleId, type MarketFilter } from './criteria'
import { compareRoles, formatPercent, SMALL_SAMPLE_THRESHOLD, type MarketStats, type RoleComparisonRow } from './stats'
import { parseFilter, serializeComparisonParams } from './filterParams'
import { DatasetPicker, MARKET_DATASETS } from './DatasetPicker'
import { DatasetPanel } from './DatasetPanel'
import { FilterPanel } from './FilterPanel'
import { DatasetStatePanels, useMarketBundle } from './useMarketBundle'

/**
 * A2 role comparison (/compare). Selects two or more of the eight canonical
 * roles and compares skill mention rates under the SAME area/level/date
 * filter. Every row uses that role's own sample (F) and its own analyzable
 * description count (D) as denominator — never a shared market-wide one.
 *
 * The shared filter (area/level/date) lives in the URL exactly as on
 * /market; the selected roles live in the `compare` parameter. The role
 * dimension of the shared filter is intentionally not offered here.
 */

interface ComparisonTableSpec {
  titleKey: 'compare.techHeading' | 'compare.softHeading'
  pick: (stats: MarketStats) => { skillId: string; n: number; rate: number | null }[]
}

const TABLE_SPECS: ComparisonTableSpec[] = [
  { titleKey: 'compare.techHeading', pick: (stats) => stats.technical },
  { titleKey: 'compare.softHeading', pick: (stats) => stats.soft },
]

function ComparisonTable({ spec, rows }: { spec: ComparisonTableSpec; rows: RoleComparisonRow[] }) {
  const { t, lang } = useLanguage()
  const dZero = rows.every((row) => row.stats.d === 0)
  if (dZero) {
    return (
      <section className="panel" aria-labelledby={`compare-${spec.titleKey}`}>
        <h2 id={`compare-${spec.titleKey}`}>{t(spec.titleKey)}</h2>
        <p className="empty-state">{t('market.noAnalyzableData')}</p>
      </section>
    )
  }
  // Union of skills mentioned by ANY selected role, ordered by the highest
  // mention count across rows (ties by canonical id) so the table stays
  // readable; a skill no selected role mentions is not listed.
  const skillIds = new Map<string, number>()
  for (const row of rows) {
    for (const stat of spec.pick(row.stats)) {
      skillIds.set(stat.skillId, Math.max(skillIds.get(stat.skillId) ?? 0, stat.n))
    }
  }
  const ordered = [...skillIds.entries()]
    .filter(([, maxN]) => maxN > 0)
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
    .map(([skillId]) => skillId)
  const smallSample = rows.some((row) => row.stats.d > 0 && row.stats.d < SMALL_SAMPLE_THRESHOLD)
  return (
    <section className="panel" aria-labelledby={`compare-${spec.titleKey}`}>
      <h2 id={`compare-${spec.titleKey}`}>{t(spec.titleKey)}</h2>
      {smallSample ? (
        <p className="banner banner-warn" role="status">
          {t('compare.smallSampleNote', { threshold: SMALL_SAMPLE_THRESHOLD })}
        </p>
      ) : null}
      <div className="compare-scroll">
        <table className="market-table compare-table">
          <thead>
            <tr>
              <th scope="col">{t('compare.col.metric')}</th>
              {rows.map((row) => (
                <th scope="col" key={row.roleId}>
                  {labelFor(ROLE_LABELS, row.roleId, lang)}
                  <br />
                  <code className="chip-id">{row.roleId}</code>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{t('compare.row.sample')}</th>
              {rows.map((row) => (
                <td className="num" key={row.roleId}>{row.stats.f}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">{t('compare.row.analyzable')}</th>
              {rows.map((row) => (
                <td className="num" key={row.roleId}>{row.stats.d}</td>
              ))}
            </tr>
            {ordered.map((skillId) => (
              <tr key={skillId}>
                <th scope="row">{skillId}</th>
                {rows.map((row) => {
                  const stat = spec.pick(row.stats).find((entry) => entry.skillId === skillId)
                  return (
                    <td className="num" key={row.roleId}>
                      {row.stats.d === 0 ? (
                        <span className="muted">{t('market.noAnalyzableDataShort')}</span>
                      ) : (
                        `${stat?.n ?? 0}/${row.stats.d} · ${formatPercent(stat?.rate ?? null)}`
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">{t('compare.note')}</p>
    </section>
  )
}

export function ComparePage() {
  const { t, lang } = useLanguage()
  usePageTitle(t('nav.compare'))
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState(MARKET_DATASETS[0].id)
  const dataset = MARKET_DATASETS.find((entry) => entry.id === selectedId) ?? MARKET_DATASETS[0]
  const { phase, stale, reload } = useMarketBundle(dataset.path)

  const sharedFilter = useMemo<MarketFilter>(() => {
    const parsed = parseFilter(searchParams)
    // The role dimension belongs to the comparison picker here.
    return { ...parsed, roles: [] }
  }, [searchParams])

  const compareParam = searchParams.get('compare') ?? ''
  const selected = useMemo(
    () => CANONICAL_ROLE_IDS.filter((role) => compareParam.split(',').includes(role)),
    [compareParam],
  )

  function changeSharedFilter(next: MarketFilter) {
    setSearchParams(serializeComparisonParams(next, selected), { replace: false })
  }

  function toggleRole(id: CanonicalRoleId) {
    const next = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]
    setSearchParams(serializeComparisonParams(sharedFilter, next), { replace: false })
  }

  const rows = useMemo(
    () => (phase.phase === 'ok' ? compareRoles(phase.bundle, sharedFilter, selected) : []),
    [phase, sharedFilter, selected],
  )

  return (
    <>
      <h1>{t('nav.compare')}</h1>
      <p className="lead">{t('compare.intro')}</p>

      <DatasetPicker selected={selectedId} onSelect={setSelectedId} />
      <DatasetStatePanels phase={phase} onRetry={reload} />

      {phase.phase === 'ok' ? (
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
            <DatasetPanel bundle={phase.bundle} stale={stale} />
            <section className="panel" aria-labelledby="compare-roles-heading">
              <h2 id="compare-roles-heading">{t('compare.pickHeading')}</h2>
              <p className="note">{t('compare.pickNote')}</p>
              <div className="market-option-row">
                {CANONICAL_ROLE_IDS.map((roleId) => (
                  <label key={roleId} className="market-option">
                    <input type="checkbox" checked={selected.includes(roleId)} onChange={() => toggleRole(roleId)} />
                    <span>
                      {labelFor(ROLE_LABELS, roleId, lang)} <code className="chip-id">{roleId}</code>
                    </span>
                  </label>
                ))}
              </div>
            </section>
            <FilterPanel filter={sharedFilter} onChange={changeSharedFilter} compareMode />
            {selected.length < 2 ? (
              <p className="empty-state" role="status">
                {t('compare.pickMore')}
              </p>
            ) : rows.every((row) => row.stats.f === 0) ? (
              <p className="empty-state" role="status">
                {t('market.noMatchingJobs')}
              </p>
            ) : (
              TABLE_SPECS.map((spec) => <ComparisonTable key={spec.titleKey} spec={spec} rows={rows} />)
            )}
          </>
        )
      ) : null}
    </>
  )
}
