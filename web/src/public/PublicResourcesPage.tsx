import { useMemo, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { usePageTitle } from '../usePageTitle'
import { useDataVersion } from '../data/DataVersionContext'
import { labelFor, LEVEL_LABELS, RESOURCE_TYPE_LABELS, ROLE_LABELS } from '../data/labels'
import { CANONICAL_ROLE_IDS, type CanonicalRoleId } from '../features/market/criteria'
import { DatasetStatePanels, useMarketBundle } from '../features/market/useMarketBundle'
import { formatPercent } from '../features/market/stats'
import { recommendResources, roleSkillOverview, type BeginnerFit } from '../lib/recommend'
import type { Resource } from '../data/types'
import type { TxKey } from '../i18n/en'

const FIT_LABELS: Record<BeginnerFit, TxKey> = {
  beginner_friendly: 'a4.pathways.fit.beginner_friendly',
  unknown: 'a4.pathways.fit.unknown',
  prerequisites_required: 'a4.pathways.fit.prerequisites_required',
}

/** Reuse accepted recommendation/statistics functions, without Auth or personal gateways. */
export function PublicResourcesPage() {
  const { t, lang } = useLanguage()
  usePageTitle(t('nav.pathways'))
  const { config } = useDataVersion()
  const catalog = useMarketBundle(config.pathwaysBundlePath)
  const [roleId, setRoleId] = useState<CanonicalRoleId | null>(null)
  const [targets, setTargets] = useState<string[]>([])
  const bundle = catalog.phase.phase === 'ok' ? catalog.phase.bundle : null
  const overview = useMemo(() => bundle && roleId ? roleSkillOverview(bundle, roleId) : null, [bundle, roleId])
  const recommendations = useMemo(() => bundle ? recommendResources(bundle, targets) : null, [bundle, targets])
  const nameOf = (id: string) => bundle?.skills.find(skill => skill.skill_id === id)?.label ?? id
  function toggleTarget(id: string) {
    setTargets(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  }
  return (
    <>
      <h1>{t('nav.pathways')}</h1>
      <p className="lead">{t('public.resources.intro')}</p>
      <p className="banner banner-warn" role="note">{t('a4.pathways.demoNote')}</p>
      <DatasetStatePanels phase={catalog.phase} onRetry={catalog.reload} />
      <section className="panel" aria-labelledby="public-role-heading">
        <h2 id="public-role-heading">{t('a4.pathways.roleHeading')}</h2>
        <p className="note">{t('a4.pathways.roleNote')}</p>
        <div className="chip-list" role="group" aria-label={t('a4.pathways.roleHeading')}>
          {CANONICAL_ROLE_IDS.map(id => (
            <button type="button" key={id} aria-pressed={roleId === id}
              className={roleId === id ? 'chip chip-active-all' : 'chip chip-muted'} onClick={() => setRoleId(id)}>
              {labelFor(ROLE_LABELS, id, lang)} <code className="chip-id">{id}</code>
            </button>
          ))}
        </div>
        {roleId === null ? <p className="note">{t('a4.pathways.noRole')}</p> : null}
      </section>
      {overview ? (
        <section className="panel" aria-labelledby="public-target-heading">
          <h2 id="public-target-heading">{t('a4.pathways.skillsHeading')}</h2>
          <p className="note">{t('a4.pathways.skillsNote')}</p>
          <dl className="def-list">
            <div className="def-row"><dt>{t('a4.pathways.statSample')}</dt><dd><strong>{overview.f}</strong></dd></div>
            <div className="def-row"><dt>{t('a4.pathways.statAnalyzable')}</dt><dd><strong>{overview.d}</strong></dd></div>
          </dl>
          {overview.d === 0 ? <p className="empty-state">{t('market.noAnalyzableData')}</p> : (
            <div className="compare-scroll">
              <table className="market-table">
                <caption className="sr-only-sm">{t('a4.pathways.skillsHeading')}</caption>
                <thead><tr>
                  <th scope="col">{t('a4.pathways.colSkill')}</th>
                  <th scope="col" className="num">{t('a4.pathways.colMentioning')}</th>
                  <th scope="col" className="num">{t('market.col.rate')}</th>
                  <th scope="col">{t('a4.pathways.colTarget')}</th>
                </tr></thead>
                <tbody>{overview.rows.map(({ skill, stat }) => (
                  <tr key={skill.skill_id}>
                    <td>{skill.label} <code className="chip-id">{skill.skill_id}</code></td>
                    <td className="num">{stat.n}/{overview.d}</td>
                    <td className="num">{formatPercent(stat.rate)}</td>
                    <td><label className="market-option">
                      <input type="checkbox" checked={targets.includes(skill.skill_id)} onChange={() => toggleTarget(skill.skill_id)}
                        aria-label={t('a4.pathways.targetToggle', { skill: `${skill.label} (${skill.skill_id})` })} />
                      {t(targets.includes(skill.skill_id) ? 'a4.pathways.targetOn' : 'a4.pathways.targetOff')}
                    </label></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <p className="note">{t('public.resources.targetNote')}</p>
          {targets.length > 0 ? <p role="status">{t('a4.pathways.targetsSelected', { count: targets.length, skills: targets.map(nameOf).join(', ') })}</p> : null}
        </section>
      ) : null}
      <section className="panel" aria-labelledby="public-recs-heading">
        <h2 id="public-recs-heading">{t('a4.pathways.recommendationsHeading')}</h2>
        <p className="note">{t('a4.pathways.recommendationsNote')}</p>
        {targets.length === 0 ? <p role="status">{t('a4.pathways.noTargets')}</p> : (
          <>
            {recommendations?.recommendations.length === 0 ? <p className="empty-state" role="status">{t('a4.pathways.noMatches')}</p> : null}
            <ol className="reason-list">
              {recommendations?.recommendations.map(entry => (
                <li key={entry.resource.resource_id} className="a4-recommendation">
                  <ResourceCard resource={entry.resource} matchedSkillLabels={entry.matchedTargetSkillIds.map(nameOf)} fit={entry.beginnerFit} />
                </li>
              ))}
            </ol>
            {recommendations && recommendations.unmatchedTargetSkillIds.length > 0 ? (
              <p className="note">{t('a4.pathways.unmatchedTargets', { skills: recommendations.unmatchedTargetSkillIds.map(nameOf).join(', ') })}</p>
            ) : null}
            <p className="note">{t('a4.pathways.fitBasisNote')}</p>
            <p className="note">{t('a4.pathways.noProbabilityNote')}</p>
          </>
        )}
      </section>
    </>
  )
}

function ResourceCard({ resource, matchedSkillLabels, fit }: { resource: Resource; matchedSkillLabels: string[]; fit: BeginnerFit }) {
  const { t, lang } = useLanguage()
  return (
    <article className="a4-resource">
      <p><strong>{resource.title}</strong>{' '}
        <span className="chip">{labelFor(RESOURCE_TYPE_LABELS, resource.resource_type, lang)}</span>{' '}
        <span className="chip chip-muted">{t('field.level')}: {labelFor(LEVEL_LABELS, resource.level, lang)}</span>
      </p>
      <p>{t('a4.pathways.reasonMatches', { count: matchedSkillLabels.length, skills: matchedSkillLabels.join(', ') })}</p>
      <p>{t('field.level')} → {t(FIT_LABELS[fit])}</p>
      <p className="banner banner-warn">{t(resource.eligibility_note === null ? 'a4.pathways.eligibilityUnknown' : 'a4.pathways.eligibilityKnown', { note: resource.eligibility_note ?? '' })}</p>
      <p className="note">{t('a4.pathways.verifiedAt')} <code>{resource.verified_at}</code> ·{' '}
        <a href={resource.source_url} target="_blank" rel="noreferrer">{t('field.sourceUrl')}</a>{' '}<code className="chip-id">{resource.resource_id}</code>
      </p>
    </article>
  )
}
