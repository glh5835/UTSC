/**
 * TypeScript views of the shared v1 data contract (upstream commit
 * b828553f91cf6cd6ae5b0766e7fbf4c6b1822535). These types are for display and
 * editor convenience only. They are NOT a substitute for runtime validation:
 * every bundle is checked at runtime with the upstream JSON Schemas plus
 * cross-record checks in src/data/validation.ts before it is displayed.
 *
 * Keep this file in sync with the synced schema copies under
 * public/contracts/schemas/ (see public/contracts/PROVENANCE.md). The website
 * must not invent contract fields or relax contract constraints locally.
 */

export interface Manifest {
  schema_version: string
  dataset_version: string
  generated_at: string
  collected_from: string | null
  collected_to: string | null
  posting_from: string | null
  posting_to: string | null
  query_config_version: string
  run_status: 'complete' | 'partial'
  sample_count: number
}

export interface MarketJob {
  job_key: string
  source: string
  source_job_id: string | null
  job_title: string
  employer_name: string | null
  source_url: string | null
  role_id: string | null
  role_subtype: 'financial_analysis' | 'risk_analysis' | null
  role_classification_status: 'classified' | 'needs_review' | 'outside_scope'
  role_classification_label:
    | 'hybrid'
    | 'adjacent_hybrid'
    | 'other'
    | 'outside_scope'
    | null
  classification_reasons: string[]
  career_level:
    | 'internship'
    | 'new_grad'
    | 'entry_level'
    | 'unknown'
    | 'potential_senior'
  career_level_status: 'classified' | 'needs_review'
  market_area: 'toronto_gta' | 'montreal_metro' | 'other_canada' | 'unknown'
  posted_at: string | null
  posted_date: string | null
  posted_precision: 'datetime' | 'date' | 'unknown'
  source_timezone: string | null
  first_seen_at: string
  last_seen_at: string
  technical_skill_ids: string[]
  soft_skill_ids: string[]
  description_status: 'available' | 'missing' | 'unavailable'
  description_analyzable: boolean
}

export interface Skill {
  skill_id: string
  label: string
  category: 'technical' | 'soft'
  aliases: string[]
}

export interface Course {
  course_id: string
  title: string
  official_url: string
  calendar_year: string
  candidate_skill_ids: string[]
  evidence_text: string
  verified_at: string
  prerequisite_note: string | null
}

export interface Resource {
  resource_id: string
  title: string
  resource_type:
    | 'course'
    | 'tutorial'
    | 'project'
    | 'competition'
    | 'club'
    | 'event'
    | 'documentation'
    | 'other'
  skill_ids: string[]
  level: 'beginner' | 'intermediate' | 'advanced' | 'unknown'
  eligibility_note: string | null
  source_url: string
  verified_at: string
}

export interface Opportunity {
  opportunity_id: string
  kind: 'event' | 'ongoing_opportunity'
  title: string
  organizer_id: string
  source_url: string
  source_post_id: string | null
  source_post_ids: string[]
  description: string | null
  activity_type_ids: string[]
  topic_ids: string[]
  skill_ids: string[]
  beginner_level: 'beginner_friendly' | 'prerequisites_required' | 'unknown'
  eligibility_note: string | null
  format: 'online' | 'in_person' | 'hybrid' | 'unknown'
  location: string | null
  start_at: string | null
  end_at: string | null
  deadline_at: string | null
  timezone: string | null
  date_precision: 'datetime' | 'date' | 'unknown'
  start_date: string | null
  end_date: string | null
  deadline_date: string | null
  start_precision: 'datetime' | 'date' | 'unknown'
  end_precision: 'datetime' | 'date' | 'unknown'
  deadline_precision: 'datetime' | 'date' | 'unknown'
  start_date_text: string | null
  end_date_text: string | null
  deadline_date_text: string | null
  verified_at: string
  review_status: string
  classification_reasons: string[]
  registration_url: string | null
  source_updated_at: string | null
  content_revision: number
  change_pending: boolean
}

export interface UtscBundle {
  manifest: Manifest
  market_jobs: MarketJob[]
  skills: Skill[]
  courses: Course[]
  resources: Resource[]
  opportunities: Opportunity[]
}
