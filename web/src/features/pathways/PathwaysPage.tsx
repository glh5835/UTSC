import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { useLanguage } from '../../i18n/LanguageContext'
import { usePageTitle } from '../../usePageTitle'
import type { TxKey } from '../../i18n/en'
import { useDataVersion } from '../../data/DataVersionContext'
import { labelFor, LEVEL_LABELS, RESOURCE_TYPE_LABELS, ROLE_LABELS } from '../../data/labels'
import type { Resource, UtscBundle } from '../../data/types'
import {
  RECOMMENDATION_RULE_SET_VERSION,
  RECOMMENDATION_RULE_UPSTREAM_PATH,
  recommendResources,
  roleSkillOverview,
  type BeginnerFit,
} from '../../lib/recommend'
import { CANONICAL_ROLE_IDS, type CanonicalRoleId } from '../market/criteria'
import { formatPercent } from '../market/stats'
import { DatasetStatePanels, useMarketBundle } from '../market/useMarketBundle'
import { usePersonalSkills } from '../profile/usePersonalSkills'
import type { UserSkillRecord } from '../profile/personalSkills'
import type { PathItemInput, PathItemRecord, PathItemStatus } from './learningPaths'
import { PATH_ITEM_STATUSES } from './learningPaths'
import { useLearningPaths } from './useLearningPaths'

const FIT_LABEL_KEY: Record<BeginnerFit, TxKey> = {
  beginner_friendly: 'a4.pathways.fit.beginner_friendly',
  unknown: 'a4.pathways.fit.unknown',
  prerequisites_required: 'a4.pathways.fit.prerequisites_required',
}

const STATUS_LABEL_KEY: Record<PathItemStatus, TxKey> = {
  not_started: 'a4.pathways.status.not_started',
  in_progress: 'a4.pathways.status.in_progress',
  completed: 'a4.pathways.status.completed',
}

function confirmSourceKey(source: string): TxKey {
  if (source === 'course') return 'a3.profile.source.course'
  if (source === 'experience') return 'a3.profile.source.experience'
  return 'a3.profile.source.manual'
}

interface PartialSaveState {
  pathId: string
  saved: number
  total: number
  items: PathItemInput[]
}

/**
 * A4 pathways page (推荐与学习路径). Public browsing and target-skill
 * selection need no account; saving and maintaining learning paths requires a
 * signed-in account and a configured Supabase endpoint. All personal writes
 * are explicit user actions; nothing is preselected or auto-saved.
 */
export function PathwaysPage() {
  const { t, lang } = useLanguage()
  const { config } = useDataVersion()
  usePageTitle(t('nav.pathways'))
  const auth = useAuth()
  const user = auth.phase.kind === 'signedIn' ? auth.phase.user : null
  const catalog = useMarketBundle(config.pathwaysBundlePath)
  const paths = useLearningPaths(user?.id ?? null)
  const personal = usePersonalSkills(user?.id ?? null)

  // Drafts (role, targets, ticked resources) are personal input: they reset
  // only when the account identity changes, never on a language switch.
  const [roleId, setRoleId] = useState<CanonicalRoleId | null>(null)
  const [targets, setTargets] = useState<string[]>([])
  const [checkedResources, setCheckedResources] = useState<string[]>([])
  const [activePathId, setActivePathId] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [pendingDeletePathId, setPendingDeletePathId] = useState<string | null>(null)
  const [partialSave, setPartialSave] = useState<PartialSaveState | null>(null)
  const saveInFlight = useRef(false)

  useEffect(() => {
    setRoleId(null)
    setTargets([])
    setCheckedResources([])
    setActivePathId('')
    setBusy(null)
    setNotice('')
    setError('')
    setPendingDeletePathId(null)
    setPartialSave(null)
  }, [user?.id])

  const bundle = catalog.phase.phase === 'ok' ? catalog.phase.bundle : null
  const personalData = personal.phase.kind === 'ready' ? personal.phase.data : null

  const confirmedBySkill = useMemo(() => {
    const map = new Map<string, UserSkillRecord[]>()
    for (const skill of personalData?.skills ?? []) {
      const list = map.get(skill.skill_id) ?? []
      list.push(skill)
      map.set(skill.skill_id, list)
    }
    return map
  }, [personalData])

  const overview = useMemo(
    () => (bundle && roleId ? roleSkillOverview(bundle, roleId) : null),
    [bundle, roleId],
  )

  const recommendations = useMemo(
    () => (bundle ? recommendResources(bundle, targets) : null),
    [bundle, targets],
  )

  const savedPaths = paths.phase.kind === 'ready' ? paths.phase.data.paths : []
  const nameOf = (skillId: string) => skillsLabel(bundle, skillId)

  function clearFeedback() {
    setNotice('')
    setError('')
  }

  function targetsMessage(result: {
    ok: boolean
    message?: string
    staleOwner?: boolean
    refreshFailed?: boolean
    savedCount?: number
    failedCount?: number
  }): boolean {
    if (result.staleOwner) return false
    if (result.refreshFailed && result.ok) {
      setError(t('a4.pathways.refreshWarning'))
      return false
    }
    return result.ok
  }

  async function saveAsPath() {
    // Synchronous in-flight guard: two clicks in the same tick must not
    // create two paths (the disabled attribute alone has a re-render gap).
    if (saveInFlight.current) return
    if (auth.phase.kind !== 'signedIn') return
    if (!roleId) return
    clearFeedback()
    const items: PathItemInput[] = [
      ...targets.map((skillId) => ({ resourceId: null, skillId })),
      ...checkedResources.map((resourceId) => ({ resourceId, skillId: null })),
    ]
    if (items.length === 0) {
      setError(t('a4.pathways.nothingToSave'))
      return
    }
    saveInFlight.current = true
    setBusy('save')
    const result = await paths.createPathWithItems(roleId, items)
    saveInFlight.current = false
    if (result.staleOwner) return
    setBusy(null)
    if (result.ok) {
      setPartialSave(null)
      setCheckedResources([])
      setNotice(t('a4.pathways.savedFull', { count: result.savedCount ?? items.length }))
      return
    }
    if (result.pathId !== undefined) {
      setPartialSave({
        pathId: result.pathId,
        saved: result.savedCount ?? 0,
        total: items.length,
        items,
      })
      setError(
        t('a4.pathways.savedPartial', {
          saved: result.savedCount ?? 0,
          total: items.length,
        }),
      )
      return
    }
    setError(`${t('a4.pathways.saveError')} ${result.message ?? ''}`.trim())
  }

  async function retryPartialSave() {
    if (!partialSave) return
    clearFeedback()
    setBusy('retry')
    const result = await paths.addItemsToPath(partialSave.pathId, partialSave.items)
    if (result.staleOwner) return
    setBusy(null)
    if (result.ok) {
      setPartialSave(null)
      setCheckedResources([])
      setNotice(t('a4.pathways.savedFull', { count: result.savedCount ?? 0 }))
      return
    }
    setPartialSave((current) =>
      current
        ? {
            ...current,
            saved: result.savedCount ?? current.saved,
          }
        : current,
    )
    setError(
      t('a4.pathways.savedPartial', {
        saved: result.savedCount ?? partialSave.saved,
        total: partialSave.total,
      }),
    )
  }

  async function addResourceToPath(resourceId: string) {
    if (!activePathId) return
    clearFeedback()
    setBusy(`add-${resourceId}`)
    const result = await paths.addItemsToPath(activePathId, [{ resourceId, skillId: null }])
    if (result.staleOwner) return
    setBusy(null)
    if (targetsMessage(result)) {
      const message = result.alreadyPresent
        ? t('a4.pathways.alreadyPresent')
        : t('a4.pathways.addItemSuccess', { count: result.savedCount ?? 1 })
      setNotice(message)
    } else {
      setError(`${t('a4.pathways.itemActionError')} ${result.message ?? ''}`.trim())
    }
  }

  async function updateItemStatus(item: PathItemRecord, status: PathItemStatus) {
    clearFeedback()
    setBusy(`status-${item.id}`)
    const result = await paths.updatePathItemStatus(item.id, status)
    if (result.staleOwner) return
    setBusy(null)
    if (targetsMessage(result)) {
      setNotice(t('a4.pathways.statusSaved', { status: t(STATUS_LABEL_KEY[status]) }))
    } else {
      setError(`${t('a4.pathways.itemActionError')} ${result.message ?? ''}`.trim())
    }
  }

  async function removeItem(item: PathItemRecord) {
    clearFeedback()
    setBusy(`remove-${item.id}`)
    const result = await paths.removePathItem(item.id)
    if (result.staleOwner) return
    setBusy(null)
    if (targetsMessage(result)) {
      setNotice(t('a4.pathways.itemRemoved'))
    } else {
      setError(`${t('a4.pathways.itemActionError')} ${result.message ?? ''}`.trim())
    }
  }

  async function deletePath(pathId: string) {
    clearFeedback()
    setBusy(`delete-${pathId}`)
    const result = await paths.deletePath(pathId)
    if (result.staleOwner) return
    setBusy(null)
    setPendingDeletePathId(null)
    if (targetsMessage(result)) {
      if (activePathId === pathId) setActivePathId('')
      setNotice(t('a4.pathways.pathDeleted'))
    } else {
      setError(`${t('a4.pathways.itemActionError')} ${result.message ?? ''}`.trim())
    }
  }

  function toggleTarget(skillId: string) {
    clearFeedback()
    setTargets((current) =>
      current.includes(skillId)
        ? current.filter((id) => id !== skillId)
        : [...current, skillId],
    )
  }

  function toggleResourceCheck(resourceId: string) {
    setCheckedResources((current) =>
      current.includes(resourceId)
        ? current.filter((id) => id !== resourceId)
        : [...current, resourceId],
    )
  }

  const signedIn = auth.phase.kind === 'signedIn'
  const canSave = signedIn && roleId !== null && busy === null

  return (
    <>
      <h1>{t('nav.pathways')}</h1>
      <p className="lead">{t('a4.pathways.intro')}</p>
      <p className="note">
        {t('a4.pathways.ruleNote', {
          version: RECOMMENDATION_RULE_SET_VERSION,
          path: RECOMMENDATION_RULE_UPSTREAM_PATH,
        })}
      </p>
      <p className={config.mode === 'demo' ? 'chip chip-synthetic' : 'chip'}>
        {t(
          config.mode === 'integration'
            ? 'a4.pathways.integrationBadge'
            : config.mode === 'published'
              ? 'a4.pathways.publishedBadge'
              : 'sample.syntheticBadge',
        )}
        {' '}
        {t(
          config.mode === 'integration'
            ? 'a4.pathways.integrationNote'
            : config.mode === 'published'
              ? 'a4.pathways.publishedNote'
              : 'a4.pathways.demoNote',
        )}
      </p>

      <DatasetStatePanels phase={catalog.phase} onRetry={catalog.reload} />

      <section className="panel" aria-labelledby="a4-role-heading">
        <h2 id="a4-role-heading">{t('a4.pathways.roleHeading')}</h2>
        <p className="note">{t('a4.pathways.roleNote')}</p>
        <div className="chip-list" role="radiogroup" aria-label={t('a4.pathways.roleHeading')}>
          {CANONICAL_ROLE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={roleId === id}
              className={roleId === id ? 'chip chip-active-all' : 'chip chip-muted'}
              onClick={() => {
                clearFeedback()
                setRoleId(id)
              }}
            >
              {labelFor(ROLE_LABELS, id, lang)} <code className="chip-id">{id}</code>
            </button>
          ))}
        </div>
        {roleId === null ? <p className="banner banner-warn">{t('a4.pathways.noRole')}</p> : null}
      </section>

      {roleId !== null && overview ? (
        <section className="panel" aria-labelledby="a4-skills-heading">
          <h2 id="a4-skills-heading">{t('a4.pathways.skillsHeading')}</h2>
          <p className="note">{t('a4.pathways.skillsNote')}</p>
          <dl className="def-list">
            <div className="def-row">
              <dt>{t('a4.pathways.statSample')}</dt>
              <dd>
                <strong>{overview.f}</strong>
              </dd>
            </div>
            <div className="def-row">
              <dt>{t('a4.pathways.statAnalyzable')}</dt>
              <dd>
                <strong>{overview.d}</strong>
              </dd>
            </div>
          </dl>
          {overview.d === 0 ? (
            <p className="empty-state">{t('market.noAnalyzableData')}</p>
          ) : (
            <div className="compare-scroll">
              <table className="market-table">
                <caption className="sr-only-sm">{t('a4.pathways.skillsHeading')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('a4.pathways.colSkill')}</th>
                    <th scope="col" className="num">{t('a4.pathways.colMentioning')}</th>
                    <th scope="col" className="num">{t('market.col.rate')}</th>
                    <th scope="col">{t('a4.pathways.colConfirmState')}</th>
                    <th scope="col">{t('a4.pathways.colTarget')}</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.rows.map(({ skill, stat }) => {
                    const confirmations = confirmedBySkill.get(skill.skill_id) ?? []
                    const selected = targets.includes(skill.skill_id)
                    return (
                      <tr key={skill.skill_id}>
                        <td>
                          {skill.label} <code className="chip-id">{skill.skill_id}</code>
                        </td>
                        <td className="num">{stat.n}/{overview.d}</td>
                        <td className="num">{formatPercent(stat.rate)}</td>
                        <td>
                          {confirmations.length > 0 ? (
                            <span className="chip chip-active-all">
                              {t('a4.pathways.confirmedChip', {
                                source: confirmations
                                  .map((entry) => t(confirmSourceKey(entry.source)))
                                  .join(', '),
                              })}
                            </span>
                          ) : (
                            <span className="chip chip-muted">{t('a4.pathways.unconfirmedChip')}</span>
                          )}
                        </td>
                        <td>
                          <label className="market-option">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleTarget(skill.skill_id)}
                              aria-label={t('a4.pathways.targetToggle', {
                                skill: `${skill.label} (${skill.skill_id})`,
                              })}
                            />
                            {t(selected ? 'a4.pathways.targetOn' : 'a4.pathways.targetOff')}
                          </label>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="note">{t('a4.pathways.confirmNote')}</p>
          {targets.length === 0 ? (
            <p className="banner banner-warn" role="status">{t('a4.pathways.noTargets')}</p>
          ) : (
            <p className="state state-ok" role="status">
              {t('a4.pathways.targetsSelected', { count: targets.length, skills: targets.map(nameOf).join(', ') })}
            </p>
          )}
        </section>
      ) : null}

      {recommendations ? (
        <section className="panel" aria-labelledby="a4-recs-heading">
          <h2 id="a4-recs-heading">{t('a4.pathways.recommendationsHeading')}</h2>
          <p className="note">{t('a4.pathways.recommendationsNote')}</p>
          {targets.length === 0 ? (
            <p className="banner banner-warn" role="status">{t('a4.pathways.noTargets')}</p>
          ) : (
            <>
              {signedIn && savedPaths.length > 0 ? (
                <div className="a4-add-row">
                  <label className="field">
                    <span>{t('a4.pathways.addItemSelect')}</span>
                    <select value={activePathId} onChange={(event) => setActivePathId(event.target.value)}>
                      <option value="">{t('a4.pathways.addItemSelect')}</option>
                      {savedPaths.map((path) => (
                        <option key={path.id} value={path.id}>
                          {labelFor(ROLE_LABELS, path.target_role_id, lang)} · {path.id.slice(0, 8)} ·{' '}
                          {path.items.length}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
              {recommendations.unknownTargetSkillIds.length > 0 ? (
                <p className="banner banner-warn">
                  {t('a4.pathways.unknownTargets', { ids: recommendations.unknownTargetSkillIds.join(', ') })}
                </p>
              ) : null}
              {recommendations.recommendations.length === 0 ? (
                <p className="empty-state" role="status">
                  {t('a4.pathways.noMatches')}
                </p>
              ) : (
                <ol className="reason-list">
                  {recommendations.recommendations.map((entry) => (
                    <li key={entry.resource.resource_id} className="a4-recommendation">
                      <ResourceCard
                        resource={entry.resource}
                        matchedSkillLabels={entry.matchedTargetSkillIds.map(nameOf)}
                        fit={entry.beginnerFit}
                      />
                      {signedIn && savedPaths.length > 0 && activePathId ? (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void addResourceToPath(entry.resource.resource_id)}
                        >
                          {busy === `add-${entry.resource.resource_id}`
                            ? t('a4.pathways.saving')
                            : t('a4.pathways.addItemButton')}
                        </button>
                      ) : null}
                      <label className="market-option">
                        <input
                          type="checkbox"
                          checked={checkedResources.includes(entry.resource.resource_id)}
                          onChange={() => toggleResourceCheck(entry.resource.resource_id)}
                          aria-label={t('a4.pathways.checkResource', { title: entry.resource.title })}
                        />
                        {t('a4.pathways.checkResourceLabel')}
                      </label>
                    </li>
                  ))}
                </ol>
              )}
              {recommendations.unmatchedTargetSkillIds.length > 0 ? (
                <p className="note">
                  {t('a4.pathways.unmatchedTargets', {
                    skills: recommendations.unmatchedTargetSkillIds
                      .map((id) => `${nameOf(id)} (${id})`)
                      .join(', '),
                  })}
                </p>
              ) : null}
              <p className="note">{t('a4.pathways.fitBasisNote')}</p>
              <p className="note">{t('a4.pathways.noProbabilityNote')}</p>
            </>
          )}
        </section>
      ) : null}

      <section className="panel" aria-labelledby="a4-paths-heading">
        <h2 id="a4-paths-heading">{t('a4.pathways.pathsHeading')}</h2>
        <p className="note">{t('a4.pathways.pathsNote')}</p>
        {auth.phase.kind === 'unconfigured' ? (
          <p className="banner banner-warn">{t('a4.pathways.unconfigured')}</p>
        ) : auth.phase.kind === 'loading' ? (
          <p className="state">{t('account.loadingSession')}</p>
        ) : !signedIn ? (
          <p className="banner banner-warn">
            {t('a4.pathways.signedOut')}{' '}
            <Link to="/account">{t('a4.pathways.signIn')}</Link>
          </p>
        ) : (
          <>
            {roleId !== null ? (
              <div className="a4-save-row">
                <button type="button" onClick={() => void saveAsPath()} disabled={!canSave}>
                  {busy === 'save' ? t('a4.pathways.saving') : t('a4.pathways.saveSelection')}
                </button>
                <p className="note">{t('a4.pathways.saveHint', { role: labelFor(ROLE_LABELS, roleId, lang) })}</p>
              </div>
            ) : null}
            {partialSave ? (
              <div className="banner banner-warn" role="alert">
                <p>
                  {t('a4.pathways.savedPartial', { saved: partialSave.saved, total: partialSave.total })}
                </p>
                <button type="button" onClick={() => void retryPartialSave()} disabled={busy !== null}>
                  {busy === 'retry' ? t('a4.pathways.saving') : t('a4.pathways.retryItems')}
                </button>
              </div>
            ) : null}
            {paths.phase.kind === 'loading' ? <p className="state">{t('a4.pathways.loading')}</p> : null}
            {paths.phase.kind === 'error' ? (
              <section className="panel panel-error">
                <p>
                  {t('a4.pathways.loadError')} <code>{paths.phase.message}</code>
                </p>
                <button type="button" onClick={paths.reload}>{t('a4.pathways.retry')}</button>
              </section>
            ) : null}
            {paths.phase.kind === 'ready' && savedPaths.length === 0 ? (
              <p className="empty-state">{t('a4.pathways.noPaths')}</p>
            ) : null}
            {savedPaths.map((path) => (
              <article key={path.id} className="a4-path card">
                <h3>
                  {labelFor(ROLE_LABELS, path.target_role_id, lang)}{' '}
                  <code className="chip-id">{path.target_role_id}</code>
                </h3>
                <p className="note">
                  {t('a4.pathways.pathCreated')} <code>{path.created_at}</code> ·{' '}
                  {t('a4.pathways.itemCount', { count: path.items.length })}
                </p>
                {path.items.length === 0 ? (
                  <p className="empty-state">{t('a4.pathways.noItems')}</p>
                ) : (
                  <ul className="a4-item-list">
                    {path.items.map((item) => (
                      <PathItemRow
                        key={item.id}
                        item={item}
                        bundle={bundle}
                        busy={busy === `status-${item.id}` || busy === `remove-${item.id}`}
                        onStatus={(status) => void updateItemStatus(item, status)}
                        onRemove={() => void removeItem(item)}
                      />
                    ))}
                  </ul>
                )}
                <p className="note">{t('a4.pathways.progressNote')}</p>
                {pendingDeletePathId === path.id ? (
                  <div className="banner banner-warn" role="alert">
                    <p>{t('a4.pathways.deletePathConfirm')}</p>
                    <div className="account-actions">
                      <button type="button" onClick={() => void deletePath(path.id)} disabled={busy !== null}>
                        {t('a4.pathways.confirmDelete')}
                      </button>
                      <button type="button" className="link-button" onClick={() => setPendingDeletePathId(null)}>
                        {t('a3.common.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      clearFeedback()
                      setPendingDeletePathId(path.id)
                    }}
                    disabled={busy !== null}
                  >
                    {t('a4.pathways.deletePath')}
                  </button>
                )}
              </article>
            ))}
            {notice ? <p className="state state-ok" role="status">{notice}</p> : null}
            {error ? <p className="banner banner-error" role="alert">{error}</p> : null}
          </>
        )}
      </section>
    </>
  )
}

function skillsLabel(bundle: UtscBundle | null, skillId: string): string {
  return bundle?.skills.find((skill) => skill.skill_id === skillId)?.label ?? skillId
}

function ResourceCard({
  resource,
  matchedSkillLabels,
  fit,
}: {
  resource: Resource
  matchedSkillLabels: string[]
  fit: BeginnerFit
}) {
  const { t, lang } = useLanguage()
  return (
    <article className="a4-resource">
      <p>
        <strong>{resource.title}</strong>{' '}
        <span className="chip">{labelFor(RESOURCE_TYPE_LABELS, resource.resource_type, lang)}</span>{' '}
        <span className="chip chip-muted">
          {t('field.level')}: {labelFor(LEVEL_LABELS, resource.level, lang)}
        </span>
      </p>
      <p>
        {t('a4.pathways.reasonMatches', {
          count: matchedSkillLabels.length,
          skills: matchedSkillLabels.join(', '),
        })}
      </p>
      <p>
        {t('field.level')} → {t(FIT_LABEL_KEY[fit])}
      </p>
      {resource.eligibility_note !== null ? (
        <p className="banner banner-warn">
          {t('a4.pathways.eligibilityKnown', { note: resource.eligibility_note })}
        </p>
      ) : (
        <p className="banner banner-warn">{t('a4.pathways.eligibilityUnknown')}</p>
      )}
      <p className="note">
        {t('a4.pathways.verifiedAt')} <code>{resource.verified_at}</code> ·{' '}
        <a href={resource.source_url} target="_blank" rel="noreferrer">
          {t('field.sourceUrl')}
        </a>{' '}
        <code className="chip-id">{resource.resource_id}</code>
      </p>
    </article>
  )
}

function PathItemRow({
  item,
  bundle,
  busy,
  onStatus,
  onRemove,
}: {
  item: PathItemRecord
  bundle: UtscBundle | null
  busy: boolean
  onStatus: (status: PathItemStatus) => void
  onRemove: () => void
}) {
  const { t } = useLanguage()
  const resource =
    item.resource_id !== null
      ? bundle?.resources.find((entry) => entry.resource_id === item.resource_id)
      : undefined
  const skillLabel =
    item.skill_id !== null ? bundle?.skills.find((skill) => skill.skill_id === item.skill_id)?.label : undefined
  return (
    <li className="a4-item">
      {item.resource_id !== null ? (
        resource ? (
          <p>
            <strong>{resource.title}</strong> <code className="chip-id">{item.resource_id}</code>
          </p>
        ) : (
          <p>
            <span className="banner banner-warn">{t('a4.pathways.sourceUnavailable')}</span>{' '}
            <code className="chip-id">{item.resource_id}</code>
          </p>
        )
      ) : (
        <p>
          {skillLabel ? (
            <>
              <strong>{skillLabel}</strong> <code className="chip-id">{item.skill_id}</code>
            </>
          ) : (
            <>
              <span className="banner banner-warn">{t('a3.profile.unknownSkill')}</span>{' '}
              <code className="chip-id">{item.skill_id}</code>
            </>
          )}
        </p>
      )}
      <p className="note">
        {t('a4.pathways.itemUpdated')} <code>{item.updated_at}</code>
      </p>
      <div className="account-actions">
        <label className="field">
          <span className="sr-only-sm">{t('a4.pathways.itemStatus')}</span>
          <select
            value={item.status}
            disabled={busy}
            onChange={(event) => onStatus(event.target.value as PathItemStatus)}
            aria-label={t('a4.pathways.itemStatus')}
          >
            {PATH_ITEM_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(STATUS_LABEL_KEY[status])}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="link-button" onClick={onRemove} disabled={busy}>
          {t('a4.pathways.removeItem')}
        </button>
      </div>
    </li>
  )
}
