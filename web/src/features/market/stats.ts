import type { MarketJob, Skill, UtscBundle } from '../../data/types'
import {
  CANONICAL_ROLE_IDS,
  formalJobs,
  isFormalScopeJob,
  matchesFilter,
  type CanonicalRoleId,
  type MarketFilter,
  type ScopeExclusions,
} from './criteria'
import { scopeExclusions } from './criteria'

/**
 * Frozen-plan market metrics (市场指标 / A2), computed over one filter result:
 *
 *   F = distinct jobs matching the formal-scope rule AND the active filter
 *   D = jobs in F with description_analyzable = true
 *   N = jobs in D mentioning a given skill (a job counts at most once per
 *       skill, and only jobs that are inside the D denominator may contribute
 *       to any N)
 *   mention rate = N / D; when D = 0 the rate is null (the UI shows
 *   "暂无可分析数据", never a fabricated 0%).
 *
 * The same D is also the denominator for EVERY skill of that selection; a
 * role's rate always uses that role's own D, never a market-wide denominator.
 * manifest.sample_count is an ingestion count and is never substituted for F.
 *
 * Raw fractions are kept at full precision; rounding happens only at display
 * time (formatPercent in this module is the single display-formatting point).
 */

export interface SkillStat {
  skillId: string
  /** Jobs in the D set mentioning this skill. */
  n: number
  /** N / D at full precision, or null when D = 0. */
  rate: number | null
}

export interface NotAnalyzableBreakdown {
  /** description_status "missing": the posting had no description text. */
  missing: number
  /** description_status "unavailable": e.g. removed or paywalled. */
  unavailable: number
  /** description present but flagged not analyzable (analyzable = false with
   * status "available"). Kept distinct so 缺描述 and 不可分析 never blur. */
  presentButNotAnalyzable: number
}

export interface MarketStats {
  /** F: formal-scope jobs matching the filter. */
  f: number
  /** D: F ∩ description_analyzable. */
  d: number
  /** D / F at full precision, or null when F = 0. */
  descriptionCoverage: number | null
  notAnalyzable: NotAnalyzableBreakdown
  technical: SkillStat[]
  soft: SkillStat[]
}

export interface RoleDistributionRow {
  roleId: CanonicalRoleId
  count: number
  d: number
}

export interface MarketOverview {
  stats: MarketStats
  /** Per-role sample distribution. The role dimension of the filter is NOT
   * applied here (all eight rows always shown); area/level/date filters are. */
  roleDistribution: RoleDistributionRow[]
  /** Jobs excluded from formal scope, by primary reason. */
  exclusions: ScopeExclusions
  /** Formal-scope jobs total (before filters) for context. */
  formalTotal: number
}

function skillStats(
  dJobs: readonly MarketJob[],
  skills: readonly Skill[],
  category: Skill['category'],
): SkillStat[] {
  const d = dJobs.length
  const stats: SkillStat[] = skills
    .filter((skill) => skill.category === category)
    .map((skill) => {
      // The two extraction arrays are evidence sources, not display categories.
      // Union first so a skill counts once even when it appears in both arrays.
      const n = dJobs.filter((job) => {
        const ids = new Set([...job.technical_skill_ids, ...job.soft_skill_ids])
        return ids.has(skill.skill_id)
      }).length
      return { skillId: skill.skill_id, n, rate: d === 0 ? null : n / d }
    })
  // Stable display order: most mentioned first, ties by canonical id.
  return stats.sort((a, b) => (b.n !== a.n ? b.n - a.n : a.skillId.localeCompare(b.skillId)))
}

function notAnalyzableBreakdown(jobs: readonly MarketJob[]): NotAnalyzableBreakdown {
  let missing = 0
  let unavailable = 0
  let presentButNotAnalyzable = 0
  for (const job of jobs) {
    if (job.description_analyzable) continue
    if (job.description_status === 'missing') missing += 1
    else if (job.description_status === 'unavailable') unavailable += 1
    else presentButNotAnalyzable += 1
  }
  return { missing, unavailable, presentButNotAnalyzable }
}

function statsFor(jobs: readonly MarketJob[], skills: readonly Skill[]): MarketStats {
  const f = jobs.length
  const dJobs = jobs.filter((job) => job.description_analyzable)
  const d = dJobs.length
  return {
    f,
    d,
    descriptionCoverage: f === 0 ? null : d / f,
    notAnalyzable: notAnalyzableBreakdown(jobs),
    technical: skillStats(dJobs, skills, 'technical'),
    soft: skillStats(dJobs, skills, 'soft'),
  }
}

export function computeMarketStats(bundle: UtscBundle, filter: MarketFilter): MarketStats {
  return statsFor(formalJobs(bundle, filter), bundle.skills)
}

export function computeMarketOverview(bundle: UtscBundle, filter: MarketFilter): MarketOverview {
  const formal = bundle.market_jobs.filter(isFormalScopeJob)
  // Role distribution ignores the role dimension (so all eight rows always
  // render) and keeps the shared area/level/date dimensions.
  const distributionFilter: MarketFilter = { ...filter, roles: [] }
  const roleDistribution = CANONICAL_ROLE_IDS.map((roleId) => {
    const rows = formal.filter(
      (job) => job.role_id === roleId && matchesFilter(job, distributionFilter),
    )
    return {
      roleId,
      count: rows.length,
      d: rows.filter((job) => job.description_analyzable).length,
    }
  })
  return {
    stats: statsFor(
      formal.filter((job) => matchesFilter(job, filter)),
      bundle.skills,
    ),
    roleDistribution,
    exclusions: scopeExclusions(bundle),
    formalTotal: formal.length,
  }
}

export interface RoleComparisonRow {
  roleId: CanonicalRoleId
  stats: MarketStats
}

/** One row per selected role, each computed with ITS OWN sample and ITS OWN
 * description denominator under the shared area/level/date filter. The role
 * dimension of the shared filter is deliberately replaced per row. */
export function compareRoles(
  bundle: UtscBundle,
  sharedFilter: MarketFilter,
  roles: readonly CanonicalRoleId[],
): RoleComparisonRow[] {
  return roles.map((roleId) => ({
    roleId,
    stats: statsFor(
      formalJobs(bundle, { ...sharedFilter, roles: [roleId] }),
      bundle.skills,
    ),
  }))
}

/**
 * Display-only rounding: one decimal place on percentages, applied at render
 * time — never to the stored/compared values.
 */
export function formatPercent(value: number | null): string {
  if (value === null) return '—'
  const rounded = Math.round(value * 1000) / 10
  return `${rounded.toFixed(1)}%`
}

/** Product hint threshold (frozen plan: 提及率样本提示). A UI notice only —
 * it does not imply statistical significance and gates nothing. */
export const SMALL_SAMPLE_THRESHOLD = 20
