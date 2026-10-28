import { useMemo, type ReactNode } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { labelFor } from '../data/labels'
import {
  ACTIVITY_TYPE_LABELS,
  BEGINNER_LEVEL_LABELS,
  CAREER_LEVEL_LABELS,
  DATE_PRECISION_LABELS,
  DESCRIPTION_STATUS_LABELS,
  FORMAT_LABELS,
  LEVEL_LABELS,
  MARKET_AREA_LABELS,
  OPPORTUNITY_KIND_LABELS,
  RESOURCE_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
  ROLE_CLASSIFICATION_STATUS_LABELS,
  ROLE_LABELS,
  ROLE_SUBTYPE_LABELS,
  SKILL_CATEGORY_LABELS,
  TOPIC_LABELS,
} from '../data/labels'
import type { Course, MarketJob, Opportunity, Resource, Skill } from '../data/types'

/**
 * Read-only views of a validated bundle. Official names, evidence texts and
 * URLs are shown verbatim (original language); only UI labels are translated.
 * Canonical IDs always stay visible next to translated labels.
 */

export function useSkillLookup(skills: Skill[]): Map<string, Skill> {
  return useMemo(() => new Map(skills.map((s) => [s.skill_id, s])), [skills])
}

function SkillChip({ id, skill }: { id: string; skill: Skill | undefined }) {
  if (!skill) {
    // Not reachable for validated bundles (missing_skill_ref check), kept as
    // a visible guard rather than a silent blank.
    return (
      <span className="chip chip-warning">
        <code>{id}</code>
      </span>
    )
  }
  return (
    <span className="chip">
      {skill.label}
      <code className="chip-id">{skill.skill_id}</code>
    </span>
  )
}

function SkillIdList({ ids, lookup }: { ids: string[]; lookup: Map<string, Skill> }) {
  if (ids.length === 0) return <span className="none">—</span>
  return (
    <span className="chip-list">
      {ids.map((id) => (
        <SkillChip key={id} id={id} skill={lookup.get(id)} />
      ))}
    </span>
  )
}

export function DateValue({
  value,
  precision,
  precisionLabel,
}: {
  value: string | null
  precision: string
  precisionLabel?: string
}) {
  const { t, lang } = useLanguage()
  if (value === null) {
    return <span className="none">{t('field.notSet')}</span>
  }
  const precisionText =
    precisionLabel ?? labelFor(DATE_PRECISION_LABELS, precision, lang)
  return (
    <span className="date-value">
      <code>{value}</code> <span className="precision">({precisionText})</span>
    </span>
  )
}

export function EmptySection({ message }: { message: string }) {
  return <p className="empty-state">{message}</p>
}

export function SkillsTable({ skills }: { skills: Skill[] }) {
  const { t, lang } = useLanguage()
  return (
    <div className="table-scroll">
      <table>
        <caption className="visually-hidden">{t('section.skills', { count: skills.length })}</caption>
        <thead>
          <tr>
            <th scope="col">{t('skill.label')}</th>
            <th scope="col">{t('skill.id')}</th>
            <th scope="col">{t('skill.category')}</th>
            <th scope="col">{t('skill.aliases')}</th>
          </tr>
        </thead>
        <tbody>
          {skills.map((skill) => (
            <tr key={skill.skill_id}>
              <th scope="row">{skill.label}</th>
              <td>
                <code>{skill.skill_id}</code>
              </td>
              <td>{labelFor(SKILL_CATEGORY_LABELS, skill.category, lang)}</td>
              <td>{skill.aliases.join(', ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DefinitionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="def-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export function JobsSection({ jobs, lookup }: { jobs: MarketJob[]; lookup: Map<string, Skill> }) {
  const { t, lang } = useLanguage()
  return (
    <>
      {jobs.map((job) => (
        <article key={job.job_key} className="card">
          <h3>
            {job.job_title}
            {job.employer_name ? <span className="muted"> — {job.employer_name}</span> : null}
          </h3>
          <dl className="def-list">
            <DefinitionRow label={t('field.role')}>
              {job.role_id ? (
                <span className="chip">
                  {labelFor(ROLE_LABELS, job.role_id, lang)}
                  <code className="chip-id">{job.role_id}</code>
                </span>
              ) : (
                <span className="chip chip-unknown">{t('field.noRoleId')}</span>
              )}
              {job.role_subtype ? ` · ${labelFor(ROLE_SUBTYPE_LABELS, job.role_subtype, lang)}` : null}
              {` · ${labelFor(ROLE_CLASSIFICATION_STATUS_LABELS, job.role_classification_status, lang)}`}
            </DefinitionRow>
            <DefinitionRow label={t('field.careerLevel')}>
              {labelFor(CAREER_LEVEL_LABELS, job.career_level, lang)}
            </DefinitionRow>
            <DefinitionRow label={t('field.marketArea')}>
              {labelFor(MARKET_AREA_LABELS, job.market_area, lang)}
            </DefinitionRow>
            <DefinitionRow label={t('field.posted')}>
              <DateValue value={job.posted_at ?? job.posted_date} precision={job.posted_precision} />
              {job.source_timezone ? (
                <span className="muted"> · {t('field.timezone')}: {job.source_timezone}</span>
              ) : null}
            </DefinitionRow>
            <DefinitionRow label={t('field.firstSeen')}>
              <code>{job.first_seen_at}</code>
            </DefinitionRow>
            <DefinitionRow label={t('field.lastSeen')}>
              <code>{job.last_seen_at}</code>
            </DefinitionRow>
            <DefinitionRow label={t('field.technicalSkills')}>
              <SkillIdList ids={job.technical_skill_ids} lookup={lookup} />
            </DefinitionRow>
            <DefinitionRow label={t('field.softSkills')}>
              <SkillIdList ids={job.soft_skill_ids} lookup={lookup} />
            </DefinitionRow>
            <DefinitionRow label={t('field.descriptionStatus')}>
              {labelFor(DESCRIPTION_STATUS_LABELS, job.description_status, lang)}
              {' · '}
              {t('field.analyzable')}: {job.description_analyzable ? t('field.yes') : t('field.no')}
            </DefinitionRow>
            <DefinitionRow label={t('field.source')}>
              {job.source}
              {job.source_job_id ? (
                <>
                  {' · '}
                  {t('field.sourceJobId')}: <code>{job.source_job_id}</code>
                </>
              ) : null}
            </DefinitionRow>
            {job.source_url ? (
              <DefinitionRow label={t('field.sourceUrl')}>
                <a href={job.source_url} target="_blank" rel="noreferrer">
                  {job.source_url}
                </a>
              </DefinitionRow>
            ) : null}
          </dl>
        </article>
      ))}
    </>
  )
}

export function CoursesSection({ courses, lookup }: { courses: Course[]; lookup: Map<string, Skill> }) {
  const { t } = useLanguage()
  return (
    <>
      {courses.map((course) => (
        <article key={course.course_id} className="card">
          <h3>{course.title}</h3>
          <dl className="def-list">
            <DefinitionRow label={t('field.officialUrl')}>
              <a href={course.official_url} target="_blank" rel="noreferrer">
                {course.official_url}
              </a>
            </DefinitionRow>
            <DefinitionRow label={t('field.calendarYear')}>
              <code>{course.calendar_year}</code>
            </DefinitionRow>
            <DefinitionRow label={t('field.candidateSkills')}>
              <SkillIdList ids={course.candidate_skill_ids} lookup={lookup} />
            </DefinitionRow>
            <DefinitionRow label={t('field.evidence')}>{course.evidence_text}</DefinitionRow>
            <DefinitionRow label={t('field.verifiedAt')}>
              <code>{course.verified_at}</code>
            </DefinitionRow>
            <DefinitionRow label={t('field.prerequisiteNote')}>
              {course.prerequisite_note ?? <span className="none">—</span>}
            </DefinitionRow>
          </dl>
        </article>
      ))}
    </>
  )
}

export function ResourcesSection({ resources, lookup }: { resources: Resource[]; lookup: Map<string, Skill> }) {
  const { t, lang } = useLanguage()
  return (
    <>
      {resources.map((resource) => (
        <article key={resource.resource_id} className="card">
          <h3>{resource.title}</h3>
          <dl className="def-list">
            <DefinitionRow label={t('field.resourceType')}>
              {labelFor(RESOURCE_TYPE_LABELS, resource.resource_type, lang)}
            </DefinitionRow>
            <DefinitionRow label={t('field.level')}>
              {labelFor(LEVEL_LABELS, resource.level, lang)}
            </DefinitionRow>
            <DefinitionRow label={t('field.skills')}>
              <SkillIdList ids={resource.skill_ids} lookup={lookup} />
            </DefinitionRow>
            <DefinitionRow label={t('field.eligibilityNote')}>
              {resource.eligibility_note ?? <span className="none">—</span>}
            </DefinitionRow>
            <DefinitionRow label={t('field.sourceUrl')}>
              <a href={resource.source_url} target="_blank" rel="noreferrer">
                {resource.source_url}
              </a>
            </DefinitionRow>
            <DefinitionRow label={t('field.verifiedAt')}>
              <code>{resource.verified_at}</code>
            </DefinitionRow>
          </dl>
        </article>
      ))}
    </>
  )
}

export function OpportunitiesSection({ opportunities, lookup }: { opportunities: Opportunity[]; lookup: Map<string, Skill> }) {
  const { t, lang } = useLanguage()
  return (
    <>
      {opportunities.map((opportunity) => (
        <article key={opportunity.opportunity_id} className="card">
          <h3>
            {opportunity.title}
            {opportunity.change_pending ? (
              <span className="chip chip-warning">{t('field.changePending')}</span>
            ) : null}
          </h3>
          <dl className="def-list">
            <DefinitionRow label={t('field.kind')}>
              {labelFor(OPPORTUNITY_KIND_LABELS, opportunity.kind, lang)}
            </DefinitionRow>
            <DefinitionRow label={t('field.activityTypes')}>
              {opportunity.activity_type_ids.map((id) => labelFor(ACTIVITY_TYPE_LABELS, id, lang)).join('、') ||
                '—'}
            </DefinitionRow>
            <DefinitionRow label={t('field.topics')}>
              {opportunity.topic_ids.map((id) => labelFor(TOPIC_LABELS, id, lang)).join('、') || '—'}
            </DefinitionRow>
            <DefinitionRow label={t('field.skills')}>
              <SkillIdList ids={opportunity.skill_ids} lookup={lookup} />
            </DefinitionRow>
            <DefinitionRow label={t('field.beginnerLevel')}>
              {labelFor(BEGINNER_LEVEL_LABELS, opportunity.beginner_level, lang)}
            </DefinitionRow>
            <DefinitionRow label={t('field.format')}>
              {labelFor(FORMAT_LABELS, opportunity.format, lang)}
            </DefinitionRow>
            <DefinitionRow label={t('field.location')}>
              {opportunity.location ?? <span className="none">—</span>}
            </DefinitionRow>
            <DefinitionRow label={t('field.start')}>
              <DateValue
                value={opportunity.start_at ?? opportunity.start_date ?? opportunity.start_date_text}
                precision={opportunity.start_precision}
              />
              {opportunity.timezone ? (
                <span className="muted"> · {t('field.timezone')}: {opportunity.timezone}</span>
              ) : null}
            </DefinitionRow>
            <DefinitionRow label={t('field.end')}>
              <DateValue
                value={opportunity.end_at ?? opportunity.end_date ?? opportunity.end_date_text}
                precision={opportunity.end_precision}
              />
            </DefinitionRow>
            <DefinitionRow label={t('field.deadline')}>
              <DateValue
                value={opportunity.deadline_at ?? opportunity.deadline_date ?? opportunity.deadline_date_text}
                precision={opportunity.deadline_precision}
              />
            </DefinitionRow>
            <DefinitionRow label={t('field.reviewStatus')}>
              {labelFor(REVIEW_STATUS_LABELS, opportunity.review_status, lang)}
            </DefinitionRow>
            <DefinitionRow label={t('field.verifiedAt')}>
              <code>{opportunity.verified_at}</code>
            </DefinitionRow>
            {opportunity.classification_reasons.length > 0 ? (
              <DefinitionRow label={t('field.reasons')}>
                <ul className="reason-list">
                  {opportunity.classification_reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </DefinitionRow>
            ) : null}
            <DefinitionRow label={t('field.sourceUrl')}>
              <a href={opportunity.source_url} target="_blank" rel="noreferrer">
                {opportunity.source_url}
              </a>
            </DefinitionRow>
            {opportunity.registration_url ? (
              <DefinitionRow label={t('field.registrationUrl')}>
                <a href={opportunity.registration_url} target="_blank" rel="noreferrer">
                  {opportunity.registration_url}
                </a>
              </DefinitionRow>
            ) : null}
          </dl>
        </article>
      ))}
    </>
  )
}
