import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { useProfile } from '../../auth/useProfile'
import { useLanguage } from '../../i18n/LanguageContext'
import { usePageTitle } from '../../usePageTitle'
import type { TxKey } from '../../i18n/en'
import type { Skill } from '../../data/types'
import type { ExperienceSkillExtraction, Interpretation } from '../../lib/skillExtraction'
import {
  experienceTextError,
  EXTRACTION_RULE_SET_VERSION,
  extractExperienceSkills,
  MAX_EXPERIENCE_LENGTH,
} from '../../lib/skillExtraction'
import type { ExperienceRecord, UserSkillRecord } from './personalSkills'
import { useCourseCatalog } from './useCourseCatalog'
import { usePersonalSkills } from './usePersonalSkills'

const INTERPRETATION_KEY = {
  affirmed: 'a3.profile.interpretation.affirmed',
  negated: 'a3.profile.interpretation.negated',
  planned: 'a3.profile.interpretation.planned',
  ambiguous: 'a3.profile.interpretation.ambiguous',
} as const

function sourceLabel(source: string): TxKey {
  if (source === 'course') return 'a3.profile.source.course'
  if (source === 'experience') return 'a3.profile.source.experience'
  return 'a3.profile.source.manual'
}

function summarize(value: string, max = 90): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

export function ProfileSkillsPage() {
  const { t } = useLanguage()
  usePageTitle(t('nav.profile'))
  const auth = useAuth()
  const user = auth.phase.kind === 'signedIn' ? auth.phase.user : null
  const catalog = useCourseCatalog()
  const personal = usePersonalSkills(user?.id ?? null)
  const profile = useProfile(user)
  const [newText, setNewText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [manualSkillId, setManualSkillId] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setNewText('')
    setEditingId(null)
    setEditText('')
    setPendingDelete(null)
    setBusy(null)
    setManualSkillId('')
    setNotice('')
    setError('')
  }, [user?.id])

  const bundle = catalog.phase.phase === 'ok' ? catalog.phase.bundle : null
  const skills = bundle?.skills ?? []
  const data = personal.phase.kind === 'ready' ? personal.phase.data : null
  const confirmedCourses = profile.phase.kind === 'ready' ? profile.phase.data.completed_course_ids : []
  const unknownCourseIds = bundle
    ? confirmedCourses.filter((courseId) => !bundle.courses.some((course) => course.course_id === courseId))
    : []
  const nameFor = (skillId: string) => skills.find((skill) => skill.skill_id === skillId)?.label

  function clearFeedback() {
    setNotice('')
    setError('')
  }

  function actionResultMessage(prefix: TxKey, result: { ok: boolean; message?: string; staleOwner?: boolean; refreshFailed?: boolean }): boolean {
    if (result.staleOwner) return false
    if (result.refreshFailed) {
      setError(t('a3.profile.refreshWarning'))
      return false
    }
    if (!result.ok) {
      setError(`${t(prefix)} ${result.message ?? ''}`.trim())
      return false
    }
    return true
  }

  async function addExperience() {
    clearFeedback()
    const issue = experienceTextError(newText)
    if (issue === 'empty') {
      setError(t('a3.profile.emptyText'))
      return
    }
    if (issue === 'too_long') {
      setError(t('a3.profile.charCount', { count: newText.length, max: MAX_EXPERIENCE_LENGTH }))
      return
    }
    setBusy('create')
    const result = await personal.createExperience(newText)
    if (result.staleOwner) return
    setBusy(null)
    if (!actionResultMessage('a3.profile.actionError', result)) return
    setNewText('')
    setNotice(t('a3.profile.experienceSaved'))
  }

  async function saveExperience(id: string) {
    clearFeedback()
    const issue = experienceTextError(editText)
    if (issue !== null) {
      setError(t('a3.profile.charCount', { count: editText.length, max: MAX_EXPERIENCE_LENGTH }))
      return
    }
    setBusy(id)
    const result = await personal.updateExperience(id, editText)
    if (result.staleOwner) return
    setBusy(null)
    if (!actionResultMessage('a3.profile.actionError', result)) return
    setEditingId(null)
    setEditText('')
    setNotice(t('a3.profile.experienceUpdated'))
  }

  async function deleteExperience(id: string) {
    clearFeedback()
    setBusy(id)
    const result = await personal.deleteExperience(id)
    if (result.staleOwner) return
    setBusy(null)
    if (!actionResultMessage('a3.profile.actionError', result)) return
    setPendingDelete(null)
    setNotice(t('a3.profile.experienceDeleted'))
  }

  async function confirmExperienceSkill(experienceId: string, skillId: string) {
    clearFeedback()
    setBusy(`candidate-${experienceId}-${skillId}`)
    const result = await personal.confirmSkill({ skillId, source: 'experience', sourceId: experienceId })
    if (result.staleOwner) return
    setBusy(null)
    if (!actionResultMessage('a3.profile.actionError', result)) return
    setNotice(t('a3.profile.skillConfirmed'))
  }

  async function confirmManualSkill() {
    if (!manualSkillId) return
    clearFeedback()
    setBusy('manual')
    const result = await personal.confirmSkill({ skillId: manualSkillId, source: 'manual', sourceId: null })
    if (result.staleOwner) return
    setBusy(null)
    if (!actionResultMessage('a3.profile.actionError', result)) return
    setNotice(t('a3.profile.skillConfirmed'))
    setManualSkillId('')
  }

  async function revokeSkill(id: string) {
    clearFeedback()
    setBusy(`revoke-${id}`)
    const result = await personal.revokeSkill(id)
    if (result.staleOwner) return
    setBusy(null)
    if (!actionResultMessage('a3.profile.actionError', result)) return
    setNotice(t('a3.profile.skillRevoked'))
  }

  if (auth.phase.kind === 'loading') {
    return <><h1>{t('nav.profile')}</h1><p className="state">{t('account.loadingSession')}</p></>
  }
  if (auth.phase.kind === 'unconfigured') {
    return <><h1>{t('nav.profile')}</h1><p className="lead">{t('a3.profile.intro')}</p><p className="banner banner-warn">{t('a3.profile.unconfigured')}</p></>
  }
  if (auth.phase.kind === 'signedOut') {
    return (
      <>
        <h1>{t('nav.profile')}</h1>
        <p className="lead">{t('a3.profile.intro')}</p>
        <section className="panel">
          <p>{t('a3.profile.signedOut')}</p>
          <Link to="/account">{t('a3.profile.signIn')}</Link>
        </section>
      </>
    )
  }

  return (
    <>
      <h1>{t('nav.profile')}</h1>
      <p className="lead">{t('a3.profile.intro')}</p>
      <p className="note">{t('a3.profile.ruleVersion', { version: EXTRACTION_RULE_SET_VERSION })}</p>
      {notice ? <p className="state state-ok" role="status">{notice}</p> : null}
      {error ? <p className="banner banner-error" role="alert">{error}</p> : null}

      {personal.phase.kind === 'loading' ? <p className="state">{t('a3.profile.loading')}</p> : null}
      {personal.phase.kind === 'error' ? (
        <section className="panel panel-error">
          <p>{t('a3.profile.loadError')} <code>{personal.phase.message}</code></p>
          <button type="button" onClick={personal.reload}>{t('a3.profile.retry')}</button>
        </section>
      ) : null}
      {catalog.phase.phase === 'loading' ? <p className="state">{t('a3.course.loadingCatalog')}</p> : null}
      {catalog.phase.phase === 'error' || catalog.phase.phase === 'rejected' ? (
        <section className="panel panel-error" role="alert">
          <p>{t('a3.profile.catalogUnavailable')}</p>
          <button type="button" onClick={catalog.reload}>{t('a3.course.retry')}</button>
        </section>
      ) : null}

      <section className="panel" aria-labelledby="a3-experiences-heading">
        <h2 id="a3-experiences-heading">{t('a3.profile.experienceHeading')}</h2>
        <p className="note">{t('a3.profile.experienceNote')}</p>
        <label className="field">
          <span>{t('a3.profile.experienceLabel')}</span>
          <textarea
            rows={5}
            maxLength={MAX_EXPERIENCE_LENGTH}
            value={newText}
            onChange={(event) => setNewText(event.target.value)}
          />
        </label>
        <p className="note">{t('a3.profile.charCount', { count: newText.length, max: MAX_EXPERIENCE_LENGTH })}</p>
        <button type="button" onClick={() => void addExperience()} disabled={busy !== null}>
          {t('a3.profile.add')}
        </button>
        {newText.trim() && bundle ? (
          <CandidateList
            extraction={extractExperienceSkills(newText, skills)}
            skills={skills}
            allowConfirm={false}
          />
        ) : null}

        {!data || data.experiences.length === 0 ? <p className="empty-state">{t('a3.profile.noExperiences')}</p> : (
          <div className="a3-experience-list">
            {data.experiences.map((experience) => (
              <ExperienceItem
                key={experience.id}
                experience={experience}
                skills={skills}
                catalogReady={Boolean(bundle)}
                confirmedSkills={data.skills}
                editing={editingId === experience.id}
                editText={editText}
                pendingDelete={pendingDelete === experience.id}
                busy={busy === experience.id}
                onStartEdit={() => {
                  clearFeedback()
                  setEditingId(experience.id)
                  setEditText(experience.text)
                  setPendingDelete(null)
                }}
                onEditText={setEditText}
                onSave={() => void saveExperience(experience.id)}
                onCancelEdit={() => { setEditingId(null); setEditText('') }}
                onAskDelete={() => { clearFeedback(); setPendingDelete(experience.id); setEditingId(null) }}
                onCancelDelete={() => setPendingDelete(null)}
                onDelete={() => void deleteExperience(experience.id)}
                onConfirmCandidate={(skillId) => void confirmExperienceSkill(experience.id, skillId)}
                candidateBusy={busy?.startsWith(`candidate-${experience.id}-`) ?? false}
              />
            ))}
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="a3-confirmed-heading">
        <h2 id="a3-confirmed-heading">{t('a3.profile.confirmedHeading')}</h2>
        <p className="note">{t('a3.profile.confirmedNote')}</p>
        {!data || data.skills.length === 0 ? <p className="empty-state">{t('a3.profile.noSkills')}</p> : (
          <ul className="a3-skill-list">
            {data.skills.map((skill) => (
              <ConfirmedSkillRow
                key={skill.id}
                skill={skill}
                label={nameFor(skill.skill_id)}
                course={bundle?.courses.find((course) => course.course_id === skill.source_id)}
                experience={data.experiences.find((experience) => experience.id === skill.source_id)}
                busy={busy === `revoke-${skill.id}`}
                onRevoke={() => void revokeSkill(skill.id)}
              />
            ))}
          </ul>
        )}

        <h3>{t('a3.profile.manualHeading')}</h3>
        <p className="note">{t('a3.profile.manualNote')}</p>
        <select aria-label={t('a3.profile.manualSelect')} value={manualSkillId} disabled={!bundle} onChange={(event) => setManualSkillId(event.target.value)}>
          <option value="">{t('a3.profile.manualSelect')}</option>
          {skills.map((skill) => (
            <option key={skill.skill_id} value={skill.skill_id}>
              {skill.label} ({skill.skill_id})
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void confirmManualSkill()} disabled={!bundle || !manualSkillId || busy !== null}>
          {t('a3.profile.manualAdd')}
        </button>
        <p className="note">{t('a3.profile.manualHint')}</p>
      </section>

      <section className="panel" aria-labelledby="a3-courses-heading">
        <h2 id="a3-courses-heading">{t('a3.profile.coursesHeading')}</h2>
        <p className="note">{t('a3.profile.coursesNote')}</p>
        {confirmedCourses.length === 0 ? <p className="empty-state">{t('a3.profile.noCompletedCourses')}</p> : (
          <ul>
            {confirmedCourses.map((courseId) => {
              const course = bundle?.courses.find((entry) => entry.course_id === courseId)
              return (
                <li key={courseId}>
                  {course ? course.title : bundle ? <span className="banner banner-warn">{t('a3.profile.unknownCourse')} <code>{courseId}</code></span> : <code>{courseId}</code>}
                </li>
              )
            })}
          </ul>
        )}
        {unknownCourseIds.length > 0 ? <p className="note">{t('a3.profile.unknownCourses')} <code>{unknownCourseIds.join(', ')}</code></p> : null}
        <Link to="/courses">{t('a3.profile.manageCourses')}</Link>
      </section>
    </>
  )
}

function CandidateList({
  extraction,
  skills,
  allowConfirm,
  confirmedSkills = [],
  experienceId,
  onConfirm,
  busy = false,
}: {
  extraction: ExperienceSkillExtraction
  skills: readonly { skill_id: string; label: string }[]
  allowConfirm: boolean
  confirmedSkills?: readonly UserSkillRecord[]
  experienceId?: string
  onConfirm?: (skillId: string) => void
  busy?: boolean
}) {
  const { t } = useLanguage()
  if (extraction.language_notice) {
    return <p className="banner banner-warn">{t('a3.profile.languageNotice', { language: extraction.input_language })}</p>
  }
  if (extraction.candidates.length === 0) return <p className="note">{t('a3.profile.noCandidates')}</p>
  const hasNonAffirmed = extraction.candidates.some((candidate) => candidate.interpretation !== 'affirmed')
  return (
    <section className="a3-candidates" aria-label={t('a3.profile.candidates')}>
      <h3>{t('a3.profile.candidates')}</h3>
      <p className="note">{t('a3.profile.candidatesNote')}</p>
      <ul>
        {extraction.candidates.map((candidate, index) => {
          const label = skills.find((skill) => skill.skill_id === candidate.skill_id)?.label ?? candidate.skill_id
          const already = Boolean(
            experienceId && confirmedSkills.some(
              (skill) => skill.source === 'experience' && skill.source_id === experienceId && skill.skill_id === candidate.skill_id,
            ),
          )
          return (
            <li key={`${candidate.skill_id}-${index}`} className="a3-candidate">
              <p>
                <strong>{label}</strong> <code className="chip-id">{candidate.skill_id}</code>{' '}
                <span className="chip chip-warning">{t(INTERPRETATION_KEY[candidate.interpretation as Interpretation])}</span>
              </p>
              <blockquote className="user-text">{candidate.evidence_text}</blockquote>
              <p className="note"><code>{candidate.rule_id}</code></p>
              {allowConfirm && experienceId ? (
                candidate.interpretation === 'affirmed' ? (
                  already ? <span className="chip chip-active-all">{t('a3.profile.alreadyConfirmed')}</span> : (
                    <button type="button" disabled={busy} onClick={() => onConfirm?.(candidate.skill_id)}>
                      {t('a3.profile.confirmFromExperience', { skill: label })}
                    </button>
                  )
                ) : (
                  <p className="banner banner-warn">{t('a3.profile.nonAffirmed')}</p>
                )
              ) : null}
            </li>
          )
        })}
      </ul>
      {hasNonAffirmed && !allowConfirm ? <p className="note">{t('a3.profile.nonAffirmed')}</p> : null}
    </section>
  )
}

function ExperienceItem({
  experience,
  skills,
  catalogReady,
  confirmedSkills,
  editing,
  editText,
  pendingDelete,
  busy,
  candidateBusy,
  onStartEdit,
  onEditText,
  onSave,
  onCancelEdit,
  onAskDelete,
  onCancelDelete,
  onDelete,
  onConfirmCandidate,
}: {
  experience: ExperienceRecord
  skills: readonly Skill[]
  catalogReady: boolean
  confirmedSkills: readonly UserSkillRecord[]
  editing: boolean
  editText: string
  pendingDelete: boolean
  busy: boolean
  candidateBusy: boolean
  onStartEdit: () => void
  onEditText: (value: string) => void
  onSave: () => void
  onCancelEdit: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
  onConfirmCandidate: (skillId: string) => void
}) {
  const { t } = useLanguage()
  const sourced = confirmedSkills.filter(
    (skill) => skill.source === 'experience' && skill.source_id === experience.id,
  ).length
  const extraction = extractExperienceSkills(editing ? editText : experience.text, skills)
  return (
    <article className="a3-experience">
      {editing ? (
        <>
          <label className="field">
            <span>{t('a3.profile.experienceLabel')}</span>
            <textarea rows={5} maxLength={MAX_EXPERIENCE_LENGTH} value={editText} onChange={(event) => onEditText(event.target.value)} />
          </label>
          <p className="note">{t('a3.profile.charCount', { count: editText.length, max: MAX_EXPERIENCE_LENGTH })}</p>
          {sourced > 0 ? <p className="banner banner-warn">{t('a3.profile.editWarning', { count: sourced })}</p> : null}
          <div className="account-actions">
            <button type="button" onClick={onSave} disabled={busy}>{t('a3.profile.save')}</button>
            <button type="button" className="link-button" onClick={onCancelEdit}>{t('a3.common.cancel')}</button>
          </div>
          {catalogReady ? (
            <CandidateList extraction={extraction} skills={skills} allowConfirm={false} />
          ) : <p className="note">{t('a3.profile.catalogUnavailable')}</p>}
        </>
      ) : (
        <>
          <p className="user-text a3-experience-text">{experience.text}</p>
          <dl className="def-list">
            <div className="def-row"><dt>{t('a3.profile.created')}</dt><dd><code>{experience.created_at}</code></dd></div>
            <div className="def-row"><dt>{t('a3.profile.updated')}</dt><dd><code>{experience.updated_at}</code></dd></div>
          </dl>
          {catalogReady ? (
            <CandidateList
              extraction={extraction}
              skills={skills}
              allowConfirm
              experienceId={experience.id}
              confirmedSkills={confirmedSkills}
              onConfirm={onConfirmCandidate}
              busy={candidateBusy}
            />
          ) : <p className="note">{t('a3.profile.catalogUnavailable')}</p>}
          <div className="account-actions">
            <button type="button" className="link-button" onClick={onStartEdit} disabled={busy}>{t('a3.profile.edit')}</button>
            <button type="button" className="link-button" onClick={onAskDelete} disabled={busy}>{t('a3.profile.delete')}</button>
          </div>
          {pendingDelete ? (
            <div className="banner banner-warn" role="alert">
              <p>{t('a3.profile.deleteWarning', { count: sourced })}</p>
              <div className="account-actions">
                <button type="button" onClick={onDelete} disabled={busy}>{t('a3.profile.confirmDelete')}</button>
                <button type="button" className="link-button" onClick={onCancelDelete}>{t('a3.common.cancel')}</button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </article>
  )
}

function ConfirmedSkillRow({
  skill,
  label,
  course,
  experience,
  busy,
  onRevoke,
}: {
  skill: UserSkillRecord
  label: string | undefined
  course: { course_id: string; title: string } | undefined
  experience: ExperienceRecord | undefined
  busy: boolean
  onRevoke: () => void
}) {
  const { t } = useLanguage()
  return (
    <li className="a3-confirmed-skill">
      <p>
        <strong>{label ?? t('a3.profile.unknownSkill')}</strong>{' '}
        <code className="chip-id">{skill.skill_id}</code>{' '}
        <span className="chip">{t(sourceLabel(skill.source))}</span>
      </p>
      <p>
        {skill.source === 'course' ? (
          course ? <>{course.title} <code>{skill.source_id}</code></> : <span className="banner banner-warn">{t('a3.profile.unknownCourse')} <code>{skill.source_id}</code></span>
        ) : skill.source === 'experience' ? (
          experience ? <><span className="muted">{t('a3.profile.experienceSourceExcerpt')}: </span>{summarize(experience.text)} <code>{skill.source_id}</code></> : <span className="banner banner-error">{t('a3.profile.missingExperience')} <code>{skill.source_id}</code></span>
        ) : t('a3.profile.source.manual')}
      </p>
      <p className="note">{t('a3.profile.confirmedAt')} <code>{skill.confirmed_at}</code></p>
      <button type="button" className="link-button" onClick={onRevoke} disabled={busy}>{t('a3.profile.revoke')}</button>
    </li>
  )
}
