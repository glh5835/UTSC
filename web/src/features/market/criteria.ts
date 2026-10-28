import type { MarketJob, UtscBundle } from '../../data/types'

/**
 * Formal-scope inclusion and filter matching for the A2 market pages.
 *
 * Formal market statistics (frozen plan, 市场指标 + A2):
 * - role_classification_status must be "classified" AND role_id must be one
 *   of the eight canonical role ids. financial_analysis / risk_analysis are
 *   sub-labels of financial_risk_analyst (role_subtype), never extra
 *   categories.
 * - career_level_status must be "classified" AND career_level must be one of
 *   internship / new_grad / entry_level.
 * - needs_review, outside_scope, unknown and potential_senior NEVER enter
 *   formal role or level statistics. They are reported separately as
 *   exclusions, never packaged as a ninth role.
 *
 * Filter semantics (frozen plan A2):
 * - within one dimension, multiple selections are OR;
 * - across dimensions, filters are AND;
 * - an empty dimension selection means "no restriction" (全部) — the UI must
 *   present it exactly that way;
 * - posted-date bounds are inclusive of both endpoints, matched on
 *   posted_date (contract date), never on first_seen_at/collected/generated
 *   times, and never by inventing a time-of-day for date-only values;
 * - a job with unknown posted date (posted_date null / precision "unknown")
 *   can never satisfy a date filter, so it is excluded while any date bound
 *   is active.
 */

export const CANONICAL_ROLE_IDS = [
  'data_analyst',
  'business_analyst',
  'bi_analyst',
  'data_scientist',
  'data_engineer',
  'product_analyst',
  'operations_analyst',
  'financial_risk_analyst',
] as const

export type CanonicalRoleId = (typeof CANONICAL_ROLE_IDS)[number]

export const FORMAL_CAREER_LEVELS = ['internship', 'new_grad', 'entry_level'] as const
export type FormalCareerLevel = (typeof FORMAL_CAREER_LEVELS)[number]

export const MARKET_AREAS = ['toronto_gta', 'montreal_metro', 'other_canada', 'unknown'] as const
export type MarketArea = (typeof MARKET_AREAS)[number]

/** Date regex mirror of the contract date format (schema also enforces it). */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isFormalScopeJob(job: MarketJob): boolean {
  return (
    job.role_classification_status === 'classified' &&
    job.role_id !== null &&
    (CANONICAL_ROLE_IDS as readonly string[]).includes(job.role_id) &&
    job.career_level_status === 'classified' &&
    (FORMAL_CAREER_LEVELS as readonly string[]).includes(job.career_level)
  )
}

export type ExclusionReason =
  | 'role_needs_review'
  | 'role_outside_scope'
  | 'level_needs_review'
  | 'level_not_formal'

export interface ScopeExclusions {
  roleNeedsReview: number
  roleOutsideScope: number
  levelNeedsReview: number
  levelNotFormal: number
}

/**
 * How many jobs the formal-scope rule excluded, by reason. A job can hit more
 * than one rule (e.g. role needs review AND level unknown); for the summary
 * line the primary role exclusion wins so counts never double-report a job.
 */
export function scopeExclusions(bundle: UtscBundle): ScopeExclusions {
  let roleNeedsReview = 0
  let roleOutsideScope = 0
  let levelNeedsReview = 0
  let levelNotFormal = 0
  for (const job of bundle.market_jobs) {
    if (isFormalScopeJob(job)) continue
    if (job.role_classification_status === 'needs_review') roleNeedsReview += 1
    else if (job.role_classification_status === 'outside_scope') roleOutsideScope += 1
    else if (job.career_level_status === 'needs_review') levelNeedsReview += 1
    else levelNotFormal += 1
  }
  return { roleNeedsReview, roleOutsideScope, levelNeedsReview, levelNotFormal }
}

export interface MarketFilter {
  /** Canonical role ids; empty = no restriction (全部). */
  roles: CanonicalRoleId[]
  /** Market areas; empty = no restriction (全部). */
  areas: MarketArea[]
  /** Formal career levels; empty = no restriction (全部). */
  levels: FormalCareerLevel[]
  /** Inclusive posted_date lower bound (YYYY-MM-DD) or null. */
  postedFrom: string | null
  /** Inclusive posted_date upper bound (YYYY-MM-DD) or null. */
  postedTo: string | null
}

export const EMPTY_FILTER: MarketFilter = {
  roles: [],
  areas: [],
  levels: [],
  postedFrom: null,
  postedTo: null,
}

export function isFilterEmpty(filter: MarketFilter): boolean {
  return (
    filter.roles.length === 0 &&
    filter.areas.length === 0 &&
    filter.levels.length === 0 &&
    filter.postedFrom === null &&
    filter.postedTo === null
  )
}

function isValidDateBound(value: string | null): boolean {
  return value === null || DATE_RE.test(value)
}

/** A job satisfies an active date bound only when its posted_date exists and
 * falls inside [from, to] inclusive. Date-only precision compares the plain
 * calendar date; no time-of-day is invented for it. Unknown dates cannot
 * masquerade as matching. */
export function matchesPostedDate(job: MarketJob, filter: MarketFilter): boolean {
  if (filter.postedFrom === null && filter.postedTo === null) return true
  if (job.posted_date === null || job.posted_precision === 'unknown') return false
  const date = job.posted_date
  if (!DATE_RE.test(date)) return false
  if (filter.postedFrom !== null && !DATE_RE.test(filter.postedFrom)) return false
  if (filter.postedTo !== null && !DATE_RE.test(filter.postedTo)) return false
  // Contract dates are YYYY-MM-DD, so lexicographic order is chronological.
  if (filter.postedFrom !== null && date < filter.postedFrom) return false
  if (filter.postedTo !== null && date > filter.postedTo) return false
  return true
}

/** Throws on malformed filters: the callers build these from parsed URL state
 * and a malformed bound must fail loudly rather than silently match nothing. */
export function assertFilterBounds(filter: MarketFilter): void {
  if (!isValidDateBound(filter.postedFrom) || !isValidDateBound(filter.postedTo)) {
    throw new Error(`Invalid posted-date bound: ${String(filter.postedFrom)} … ${String(filter.postedTo)}`)
  }
  if (
    filter.postedFrom !== null &&
    filter.postedTo !== null &&
    filter.postedFrom > filter.postedTo
  ) {
    throw new Error('postedFrom is after postedTo')
  }
}

/** OR within a dimension, AND across dimensions. Callers must apply this only
 * to formal-scope jobs for formal statistics. */
export function matchesFilter(job: MarketJob, filter: MarketFilter): boolean {
  assertFilterBounds(filter)
  if (filter.roles.length > 0 && !(filter.roles as string[]).includes(job.role_id ?? '')) return false
  if (filter.areas.length > 0 && !filter.areas.includes(job.market_area)) return false
  if (filter.levels.length > 0 && !(filter.levels as string[]).includes(job.career_level)) return false
  return matchesPostedDate(job, filter)
}

/** Formal-scope jobs passing the filter — the F set (job_key uniqueness is
 * already guaranteed by the validation layer). */
export function formalJobs(bundle: UtscBundle, filter: MarketFilter): MarketJob[] {
  return bundle.market_jobs.filter((job) => isFormalScopeJob(job) && matchesFilter(job, filter))
}
