import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { useAuth } from '../../auth/AuthContext'
import { useProfile } from '../../auth/useProfile'
import { useLanguage } from '../../i18n/LanguageContext'
import { usePageTitle } from '../../usePageTitle'
import type { Course, Skill } from '../../data/types'
import { DATA_CONFIG } from '../../data/sources'
import { useCourseCatalog } from './useCourseCatalog'
import { usePersonalSkills } from './usePersonalSkills'

function skillName(skillId: string, skills: readonly Skill[]): string {
  return skills.find((skill) => skill.skill_id === skillId)?.label ?? skillId
}

export function CoursesPage() {
  const { t } = useLanguage()
  usePageTitle(t('nav.courses'))
  const auth = useAuth()
  const catalog = useCourseCatalog()
  const user = auth.phase.kind === 'signedIn' ? auth.phase.user : null
  const authNotice =
    auth.phase.kind === 'unconfigured'
      ? t('a3.course.unconfigured')
      : auth.phase.kind === 'signedOut'
        ? t('a3.course.signInHint')
        : null
  return (
    <CoursesPageContent
      key={user?.id ?? auth.phase.kind}
      user={user}
      catalog={catalog}
      authNotice={authNotice}
      showSignIn={auth.phase.kind === 'signedOut'}
    />
  )
}

/** Entire form/action state is keyed by live account (never by language), so
 * switching accounts unmounts the old instance before stale responses can
 * write a notice, error or busy flag into the new account's view. */
function CoursesPageContent({
  user,
  catalog,
  authNotice,
  showSignIn,
}: {
  user: User | null
  catalog: ReturnType<typeof useCourseCatalog>
  authNotice: string | null
  showSignIn: boolean
}) {
  const { t } = useLanguage()
  const profile = useProfile(user)
  const personal = usePersonalSkills(user?.id ?? null)
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null)
  const [busyCourse, setBusyCourse] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const bundle = catalog.phase.phase === 'ok' ? catalog.phase.bundle : null
  const completedCourses = profile.phase.kind === 'ready' ? profile.phase.data.completed_course_ids : []
  const confirmedSkills = personal.phase.kind === 'ready' ? personal.phase.data.skills : []

  function courseSourcedCount(courseId: string): number {
    return confirmedSkills.filter(
      (skill) => skill.source === 'course' && skill.source_id === courseId,
    ).length
  }

  async function saveCourseCompletion(courseId: string, complete: boolean) {
    if (!user || profile.phase.kind !== 'ready') return
    setBusyCourse(courseId)
    setError('')
    const nextIds = complete
      ? [...new Set([...completedCourses, courseId])]
      : completedCourses.filter((id) => id !== courseId)
    const result = await profile.save({
      display_name: profile.phase.data.display_name,
      completed_course_ids: nextIds,
    })
    if ('staleOwner' in result && result.staleOwner) return
    setBusyCourse(null)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setPendingRemoval(null)
    setNotice(complete ? t('a3.course.marked') : t('a3.course.removed'))
    // A withdrawal trigger may have removed course-sourced confirmations.
    personal.reload()
  }

  function chooseRemoval(courseId: string) {
    if (courseSourcedCount(courseId) === 0) {
      void saveCourseCompletion(courseId, false)
    } else {
      setPendingRemoval(courseId)
      setNotice('')
      setError('')
    }
  }

  function toggleCandidate(courseId: string, skillId: string) {
    setSelected((current) => {
      const values = current[courseId] ?? []
      return {
        ...current,
        [courseId]: values.includes(skillId)
          ? values.filter((value) => value !== skillId)
          : [...values, skillId],
      }
    })
  }

  async function confirmCourseCandidates(courseId: string) {
    if (!user || profile.phase.kind !== 'ready' || !completedCourses.includes(courseId)) return
    const choices = selected[courseId] ?? []
    if (choices.length === 0) return
    setBusyCourse(courseId)
    setError('')
    for (const skillId of choices) {
      const result = await personal.confirmSkill({ skillId, source: 'course', sourceId: courseId })
      if (result.staleOwner) return
      if (!result.ok) {
        setBusyCourse(null)
        setError(result.refreshFailed ? t('a3.profile.refreshWarning') : `${t('a3.course.saveError')} ${result.message ?? ''}`)
        return
      }
    }
    setBusyCourse(null)
    setSelected((current) => ({ ...current, [courseId]: [] }))
    setNotice(t('a3.profile.skillConfirmed'))
  }

  return (
    <>
      <h1>{t('nav.courses')}</h1>
      <p className="lead">{t('a3.course.intro')}</p>
      <p className="banner banner-warn" role="note">
        {t(DATA_CONFIG.mode === 'demo'
          ? 'a3.course.synthetic'
          : DATA_CONFIG.mode === 'integration'
            ? 'a3.course.integration'
            : 'a3.course.published')}
      </p>
      <p className="note">{t('a3.course.historical')}</p>

      {authNotice ? (
        <section className="panel" aria-live="polite">
          <p>{authNotice}</p>
          {showSignIn ? <Link to="/account">{t('a3.course.signIn')}</Link> : null}
        </section>
      ) : null}

      {notice ? <p className="state state-ok" role="status">{notice}</p> : null}
      {error ? <p className="banner banner-error" role="alert">{error}</p> : null}

      {user && profile.phase.kind === 'error' ? (
        <p className="banner banner-error" role="alert">
          {t('account.profileLoadFailed')} <code>{profile.phase.message}</code>
        </p>
      ) : null}

      {catalog.phase.phase === 'loading' ? <p className="state">{t('a3.course.loadingCatalog')}</p> : null}
      {catalog.phase.phase === 'error' ? (
        <section className="panel panel-error">
          <p>{t('a3.course.catalogError')}</p>
          <button type="button" onClick={catalog.reload}>{t('a3.course.retry')}</button>
        </section>
      ) : null}
      {catalog.phase.phase === 'rejected' ? (
        <section className="panel panel-error" role="alert">
          <p>{t('sample.rejectedTitle')}</p>
          <ul className="issue-list">
            {catalog.phase.issues.slice(0, 10).map((issue, index) => (
              <li key={index}><code>{issue.code}</code> {issue.message}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {bundle ? (
        bundle.courses.length === 0 ? <p className="empty-state">{t('a3.course.empty')}</p> : (
          <div className="a3-course-list">
            {bundle.courses.map((course) => (
              <CourseCard
                key={course.course_id}
                course={course}
                skills={bundle.skills}
                signedIn={Boolean(user)}
                profileLoading={Boolean(user) && profile.phase.kind === 'loading'}
                profileReady={!user || profile.phase.kind === 'ready'}
                completed={completedCourses.includes(course.course_id)}
                candidates={selected[course.course_id] ?? []}
                confirmedSkills={confirmedSkills}
                pendingRemoval={pendingRemoval === course.course_id}
                busy={busyCourse === course.course_id}
                onToggle={toggleCandidate}
                onMark={() => void saveCourseCompletion(course.course_id, true)}
                onRemove={() => chooseRemoval(course.course_id)}
                onConfirmRemoval={() => void saveCourseCompletion(course.course_id, false)}
                onCancelRemoval={() => setPendingRemoval(null)}
                onConfirmCandidates={() => void confirmCourseCandidates(course.course_id)}
              />
            ))}
          </div>
        )
      ) : null}
    </>
  )
}

function CourseCard({
  course,
  skills,
  signedIn,
  profileLoading,
  profileReady,
  completed,
  candidates,
  confirmedSkills,
  pendingRemoval,
  busy,
  onToggle,
  onMark,
  onRemove,
  onConfirmRemoval,
  onCancelRemoval,
  onConfirmCandidates,
}: {
  course: Course
  skills: readonly Skill[]
  signedIn: boolean
  profileLoading: boolean
  profileReady: boolean
  completed: boolean
  candidates: string[]
  confirmedSkills: readonly { skill_id: string; source: string; source_id: string | null }[]
  pendingRemoval: boolean
  busy: boolean
  onToggle: (courseId: string, skillId: string) => void
  onMark: () => void
  onRemove: () => void
  onConfirmRemoval: () => void
  onCancelRemoval: () => void
  onConfirmCandidates: () => void
}) {
  const { t } = useLanguage()
  const sourcedCount = confirmedSkills.filter(
    (skill) => skill.source === 'course' && skill.source_id === course.course_id,
  ).length
  return (
    <article className="panel a3-course" aria-labelledby={`course-${course.course_id}`}>
      <h2 id={`course-${course.course_id}`}>{course.title}</h2>
      <p>
        {DATA_CONFIG.mode === 'demo' ? <span className="chip chip-synthetic">SYNTHETIC</span> : null}
        {DATA_CONFIG.mode === 'integration' ? <span className="chip chip-warning">INTERNAL</span> : null}
      </p>
      <dl className="def-list">
        <div className="def-row"><dt>{t('a3.course.courseId')}</dt><dd><code>{course.course_id}</code></dd></div>
        <div className="def-row"><dt>{t('a3.course.calendar')}</dt><dd>{course.calendar_year}</dd></div>
        <div className="def-row"><dt>{t('a3.course.verified')}</dt><dd><code>{course.verified_at}</code></dd></div>
        <div className="def-row"><dt>{t('a3.course.prereq')}</dt><dd>{course.prerequisite_note ?? t('a3.course.none')}</dd></div>
      </dl>
      <p>
        <a href={course.official_url} target="_blank" rel="noreferrer">{t('a3.course.official')}</a>
      </p>
      <section aria-labelledby={`course-evidence-${course.course_id}`}>
        <h3 id={`course-evidence-${course.course_id}`}>{t('a3.course.evidence')}</h3>
        <p className="user-text">{course.evidence_text}</p>
      </section>
      <section aria-labelledby={`course-candidates-${course.course_id}`}>
        <h3 id={`course-candidates-${course.course_id}`}>{t('a3.course.candidateHeading')}</h3>
        <p className="note">{t('a3.course.candidateNote')}</p>
        {course.candidate_skill_ids.length === 0 ? <p>{t('a3.course.noCandidates')}</p> : (
          <div className="market-option-row">
            {course.candidate_skill_ids.map((skillId) => {
              const already = confirmedSkills.some(
                (skill) => skill.source === 'course' && skill.source_id === course.course_id && skill.skill_id === skillId,
              )
              return (
                <label className="market-option" key={skillId}>
                  <input
                    type="checkbox"
                    checked={already || candidates.includes(skillId)}
                    disabled={!completed || already || busy}
                    onChange={() => onToggle(course.course_id, skillId)}
                  />
                  <span>
                    {skillName(skillId, skills)} <code className="chip-id">{skillId}</code>
                    {already ? <><br /><span className="muted">{t('a3.course.alreadyConfirmed')}</span></> : null}
                  </span>
                </label>
              )
            })}
          </div>
        )}
        {signedIn && course.candidate_skill_ids.length > 0 ? (
          <button
            type="button"
            disabled={!profileReady || !completed || busy || candidates.length === 0}
            onClick={onConfirmCandidates}
          >
            {t('a3.course.confirmSelected')}
          </button>
        ) : null}
      </section>
      {signedIn ? (
        <div className="account-actions">
          {profileLoading ? <span className="state">{t('a3.course.loadingProfile')}</span> : completed ? (
            <>
              <span className="chip chip-active-all">{t('a3.course.completed')}</span>
              {!pendingRemoval ? (
                <button type="button" className="link-button" onClick={onRemove} disabled={busy || !profileReady}>
                  {t('a3.course.remove')}
                </button>
              ) : null}
            </>
          ) : (
            <button type="button" onClick={onMark} disabled={busy || !profileReady}>
              {t('a3.course.markCompleted')}
            </button>
          )}
        </div>
      ) : null}
      {pendingRemoval ? (
        <section className="banner banner-warn" aria-live="assertive">
          <p>{t('a3.course.removeWarning', { count: sourcedCount })}</p>
          <div className="account-actions">
            <button type="button" onClick={onConfirmRemoval} disabled={busy}>{t('a3.course.confirmRemove')}</button>
            <button type="button" className="link-button" onClick={onCancelRemoval}>{t('a3.common.cancel')}</button>
          </div>
        </section>
      ) : null}
    </article>
  )
}
