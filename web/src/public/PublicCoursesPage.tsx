import { useLanguage } from '../i18n/LanguageContext'
import { usePageTitle } from '../usePageTitle'
import { useCourseCatalog } from '../features/profile/useCourseCatalog'

/** Public browsing does not load identity, course completion or confirmations. */
export function PublicCoursesPage() {
  const { t } = useLanguage()
  usePageTitle(t('nav.courses'))
  const catalog = useCourseCatalog()
  const bundle = catalog.phase.phase === 'ok' ? catalog.phase.bundle : null
  return (
    <>
      <h1>{t('nav.courses')}</h1>
      <p className="lead">{t('public.courses.intro')}</p>
      <p className="banner banner-warn" role="note">{t('a3.course.synthetic')}</p>
      <p className="note">{t('a3.course.historical')}</p>
      {catalog.phase.phase === 'loading' ? <p role="status">{t('a3.course.loadingCatalog')}</p> : null}
      {catalog.phase.phase === 'error' || catalog.phase.phase === 'rejected' ? (
        <section className="panel panel-error" role="alert">
          <p>{t(catalog.phase.phase === 'rejected' ? 'sample.rejectedTitle' : 'a3.course.catalogError')}</p>
          <button type="button" onClick={catalog.reload}>{t('a3.course.retry')}</button>
        </section>
      ) : null}
      {bundle && bundle.courses.length === 0 ? <p className="empty-state">{t('a3.course.empty')}</p> : null}
      {bundle?.courses.map(course => (
        <article className="panel a3-course" key={course.course_id} aria-labelledby={`course-${course.course_id}`}>
          <h2 id={`course-${course.course_id}`}>{course.title}</h2>
          <p><span className="chip chip-synthetic">SYNTHETIC</span></p>
          <dl className="def-list">
            <div className="def-row"><dt>{t('a3.course.courseId')}</dt><dd><code>{course.course_id}</code></dd></div>
            <div className="def-row"><dt>{t('a3.course.calendar')}</dt><dd>{course.calendar_year}</dd></div>
            <div className="def-row"><dt>{t('a3.course.verified')}</dt><dd><code>{course.verified_at}</code></dd></div>
            <div className="def-row"><dt>{t('a3.course.prereq')}</dt><dd>{course.prerequisite_note ?? t('a3.course.none')}</dd></div>
          </dl>
          <p><a href={course.official_url} target="_blank" rel="noreferrer">{t('a3.course.official')}</a></p>
          <h3>{t('a3.course.evidence')}</h3>
          <p className="user-text">{course.evidence_text}</p>
          <h3>{t('a3.course.candidateHeading')}</h3>
          <p className="note">{t('a3.course.candidateNote')}</p>
          {course.candidate_skill_ids.length === 0 ? <p>{t('a3.course.noCandidates')}</p> : (
            <ul className="chip-list">
              {course.candidate_skill_ids.map(id => (
                <li className="chip" key={id}>{bundle.skills.find(skill => skill.skill_id === id)?.label ?? id} <code>{id}</code></li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </>
  )
}
