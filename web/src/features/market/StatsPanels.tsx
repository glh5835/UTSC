import { useLanguage } from '../../i18n/LanguageContext'
import { labelFor, ROLE_SUBTYPE_LABELS, ROLE_LABELS } from '../../data/labels'
import { formatPercent, SMALL_SAMPLE_THRESHOLD, type MarketOverview, type MarketStats, type SkillStat } from './stats'
import type { MarketJob, UtscBundle } from '../../data/types'

/** Summary line: F, D, D/F and the not-analyzable split (缺描述 vs 不可分析
 * vs present-but-not-analyzable), each rendered as text — no hover-only
 * information anywhere on the page. */
export function StatsSummary({ stats, formalTotal }: { stats: MarketStats; formalTotal: number }) {
  const { t } = useLanguage()
  return (
    <section className="panel" aria-labelledby="market-summary-heading">
      <h2 id="market-summary-heading">{t('market.summaryHeading')}</h2>
      <dl className="def-list">
        <div className="def-row">
          <dt>{t('market.formalSample')}</dt>
          <dd>
            <strong>{stats.f}</strong> <span className="muted">({t('market.formalOutOfFormal', { total: formalTotal })})</span>
          </dd>
        </div>
        <div className="def-row">
          <dt>{t('market.analyzableDescriptions')}</dt>
          <dd>
            <strong>{stats.d}</strong> <span className="muted">({formatPercent(stats.descriptionCoverage)})</span>
          </dd>
        </div>
        <div className="def-row">
          <dt>{t('market.notAnalyzable')}</dt>
          <dd>
            {stats.f - stats.d}{' '}
            <span className="muted">
              {t('market.notAnalyzableSplit', {
                missing: stats.notAnalyzable.missing,
                unavailable: stats.notAnalyzable.unavailable,
                present: stats.notAnalyzable.presentButNotAnalyzable,
              })}
            </span>
          </dd>
        </div>
      </dl>
      <p className="note">{t('market.metricsNote')}</p>
    </section>
  )
}

/** Role distribution over the eight canonical roles (role filter not applied;
 * shared area/level/date filters are). Values are printed as text. */
export function RoleDistribution({ overview }: { overview: MarketOverview }) {
  const { t, lang } = useLanguage()
  const max = Math.max(1, ...overview.roleDistribution.map((row) => row.count))
  return (
    <section className="panel" aria-labelledby="market-roles-heading">
      <h2 id="market-roles-heading">{t('market.rolesHeading')}</h2>
      <p className="note">{t('market.roleDistributionNote')}</p>
      <div className="compare-scroll">
      <table className="market-table">
        <thead>
          <tr>
            <th scope="col">{t('market.col.role')}</th>
            <th scope="col">{t('market.col.sample')}</th>
            <th scope="col">{t('market.col.analyzable')}</th>
            <th scope="col" className="sr-only-sm">{t('market.col.bar')}</th>
          </tr>
        </thead>
        <tbody>
          {overview.roleDistribution.map((row) => (
            <tr key={row.roleId}>
              <td>
                {labelFor(ROLE_LABELS, row.roleId, lang)} <code className="chip-id">{row.roleId}</code>
              </td>
              <td className="num">{row.count}</td>
              <td className="num">{row.d}</td>
              <td className="bar-cell">
                <div className="bar-track" role="presentation">
                  <div className="bar-fill" style={{ width: `${Math.round((row.count / max) * 100)}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="note">
        {t('market.exclusionsNote', {
          roleReview: overview.exclusions.roleNeedsReview,
          roleOutside: overview.exclusions.roleOutsideScope,
          levelReview: overview.exclusions.levelNeedsReview + overview.exclusions.levelNotFormal,
        })}
      </p>
    </section>
  )
}

function SkillStatsTable({ stats, categoryKey, rows }: { stats: MarketStats; categoryKey: 'market.techSkills' | 'market.softSkills'; rows: SkillStat[] }) {
  const { t } = useLanguage()
  const smallSample = stats.d > 0 && stats.d < SMALL_SAMPLE_THRESHOLD
  return (
    <section className="panel" aria-labelledby={`skills-${categoryKey}`}>
      <h2 id={`skills-${categoryKey}`}>{t(categoryKey, { count: rows.length })}</h2>
      {stats.d === 0 ? (
        <p className="empty-state">{t('market.noAnalyzableData')}</p>
      ) : (
        <>
          {smallSample ? (
            <p className="banner banner-warn" role="status">
              {t('market.smallSampleHint', { d: stats.d, threshold: SMALL_SAMPLE_THRESHOLD })}
            </p>
          ) : null}
          <div className="compare-scroll">
          <table className="market-table">
            <thead>
              <tr>
                <th scope="col">{t('market.col.skill')}</th>
                <th scope="col">{t('market.col.jobsMentioning')}</th>
                <th scope="col">{t('market.col.rate')}</th>
                <th scope="col" className="sr-only-sm">{t('market.col.bar')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.skillId}>
                  <td>
                    {row.skillId}
                  </td>
                  <td className="num">
                    {row.n}/{stats.d}
                  </td>
                  <td className="num">{formatPercent(row.rate)}</td>
                  <td className="bar-cell">
                    <div className="bar-track" role="presentation">
                      <div className="bar-fill" style={{ width: `${Math.round((row.rate ?? 0) * 100)}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p className="note">{t('market.rateNote', { d: stats.d })}</p>
        </>
      )}
    </section>
  )
}

export function SkillStatsPanels({ stats }: { stats: MarketStats }) {
  return (
    <>
      <SkillStatsTable stats={stats} categoryKey="market.techSkills" rows={stats.technical} />
      <SkillStatsTable stats={stats} categoryKey="market.softSkills" rows={stats.soft} />
    </>
  )
}

/** Dataset identity chip row: SYNTHETIC marker + subtype legend where the
 * two financial/risk sub-labels are shown as children of
 * financial_risk_analyst, never as extra categories. */
export function SubtypeLegend({ bundle }: { bundle: UtscBundle }) {
  const { t, lang } = useLanguage()
  const subtypes = [
    ...new Set(
      bundle.market_jobs.flatMap((job: MarketJob) => (job.role_subtype !== null ? [job.role_subtype] : [])),
    ),
  ]
  if (subtypes.length === 0) return null
  return (
    <p className="note">
      {t('market.subtypeLegend', { role: labelFor(ROLE_LABELS, 'financial_risk_analyst', lang) })}{' '}
      {subtypes.map((subtype) => (
        <code key={subtype} className="chip">
          {labelFor(ROLE_SUBTYPE_LABELS, subtype, lang)} ({subtype})
        </code>
      ))}
    </p>
  )
}
