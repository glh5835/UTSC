import type { Resource, Skill, UtscBundle } from '../data/types'
import { EMPTY_FILTER, type CanonicalRoleId } from '../features/market/criteria'
import { computeMarketStats, type SkillStat } from '../features/market/stats'

/**
 * A4 resource recommendations over one versioned contract bundle, following
 * the shared recommendation rule set. The rule file itself is a verbatim copy
 * of upstream `contracts/rules/recommendation.json` at the jointly reviewed
 * commit b828553f91cf6cd6ae5b0766e7fbf4c6b1822535 (see
 * public/contracts/PROVENANCE.md and the integrity test in
 * tests/recommend.test.ts); the constants below mirror that frozen rule so the
 * page stays synchronous and testable:
 *
 * - matching.required_input = user_selected_target_skill_ids: nothing is ever
 *   recommended without the user explicitly choosing target skills. There is
 *   no default selection and no "all skills" fallback.
 * - matching.match_field = skill_ids: a resource matches when its own
 *   structured skill_ids intersect the selected targets. Titles and free text
 *   are never used for matching.
 * - matching.unconfirmed_user_skills_are_not_assumed_absent: personal
 *   confirmation state is display-only metadata; it never filters,
 *   penalizes or ranks resources, and unconfirmed skills are never presented
 *   as ability gaps.
 * - sort_priority = target_skill_coverage_count_desc, beginner_fit_desc,
 *   verified_at_desc, with resource_id ascending as the deterministic
 *   tie-break so the same input always yields the same order.
 * - explanation.employment_probability = false and
 *   explanation.guaranteed_course_eligibility = false: no score, probability
 *   or eligibility promise is produced anywhere in this module.
 */

export const RECOMMENDATION_RULE_SET_VERSION = '1.0.0'

/** Upstream location of the frozen rule file (upstream commit b828553f…). */
export const RECOMMENDATION_RULE_UPSTREAM_PATH = 'contracts/rules/recommendation.json'

/** Browser path of the synced verbatim copy. */
export const RECOMMENDATION_RULE_PATH = '/contracts/rules/recommendation.json'

/** SHA-256 over the exact upstream bytes of the synced rule file. */
export const RECOMMENDATION_RULE_SHA256 =
  '2ca67cddcc605689749bb38221d357fc005efaf6c44be82254fc69779a260d54'

/**
 * beginner_fit_order from the rule file, best first. Rank = index; a lower
 * rank sorts before a higher one ("beginner_fit_desc").
 */
export const BEGINNER_FIT_ORDER = ['beginner_friendly', 'unknown', 'prerequisites_required'] as const

export type BeginnerFit = (typeof BEGINNER_FIT_ORDER)[number]

export function beginnerFitRank(fit: BeginnerFit): number {
  return BEGINNER_FIT_ORDER.indexOf(fit)
}

/**
 * Conservative beginner-fit mapping. The upstream rule defines only the ORDER
 * of the three fit values, not a field mapping, so this website-side mapping
 * is deliberately conservative and documented here:
 *
 * - `level: "beginner"` is an explicit structured beginner marker on the
 *   resource record → beginner_friendly.
 * - `level: "intermediate" | "advanced" | "unknown"` → unknown. Difficulty is
 *   NOT interpreted as "has formal prerequisites": the 1.0.0 resource schema
 *   carries no structured prerequisite field, and eligibility_note /
 *   free text must never be parsed into structured meaning.
 * - `prerequisites_required` is therefore never derived under the 1.0.0
 *   contract. It stays in the order table because the shared rule defines it;
 *   a future contract version with an explicit structured prerequisite field
 *   would map through a jointly agreed definition, not this guess.
 *
 * This is a derived display field: it is computed at render time and never
 * written back into any shared contract data.
 */
export function beginnerFitFor(resource: Resource): BeginnerFit {
  return resource.level === 'beginner' ? 'beginner_friendly' : 'unknown'
}

export interface ResourceRecommendation {
  resource: Resource
  /** Selected target skill ids matched by this resource, canonical ids,
   * deduplicated, in the catalog's skill order. */
  matchedTargetSkillIds: string[]
  beginnerFit: BeginnerFit
  /** True when the resource states an eligibility note. Stated or not, this
   * never means the current user is eligible — only that the constraint is
   * published at all. */
  hasEligibilityNote: boolean
}

export interface RecommendationResult {
  recommendations: ResourceRecommendation[]
  /** Selected ids that exist in the catalog but match no resource in this
   * bundle. Shown as an honest empty result, never filled with substitutes. */
  unmatchedTargetSkillIds: string[]
  /** Selected ids that are not in the catalog at all (stale drafts, renamed
   * ids). They can never match anything and are reported instead of being
   * silently dropped. */
  unknownTargetSkillIds: string[]
}

function compareInstantsDesc(a: string, b: string): number {
  // Contract instants are UTC ISO-8601 strings ending in Z, so lexicographic
  // order equals chronological order.
  if (a < b) return 1
  if (a > b) return -1
  return 0
}

/**
 * Rank resources of one bundle against explicitly selected target skills.
 * Resources without at least one matched target skill are not recommended;
 * nothing is synthesized to fill gaps. Pure function: same inputs, same order.
 */
export function recommendResources(
  bundle: UtscBundle,
  selectedTargetSkillIds: readonly string[],
): RecommendationResult {
  // Canonical-id dedup of the user's own selection (their order is kept for
  // reporting, first occurrence wins).
  const seen = new Set<string>()
  const targets: string[] = []
  for (const id of selectedTargetSkillIds) {
    if (!seen.has(id)) {
      seen.add(id)
      targets.push(id)
    }
  }

  const catalogIds = new Set(bundle.skills.map((skill) => skill.skill_id))
  const unknownTargetSkillIds = targets.filter((id) => !catalogIds.has(id))
  const unmatchedTargetSkillIds: string[] = []

  const recommendations: ResourceRecommendation[] = []
  for (const resource of bundle.resources) {
    const matched = resource.skill_ids.filter(
      (id, index) => targets.includes(id) && resource.skill_ids.indexOf(id) === index,
    )
    if (matched.length === 0) continue
    recommendations.push({
      resource,
      matchedTargetSkillIds: matched,
      beginnerFit: beginnerFitFor(resource),
      hasEligibilityNote: resource.eligibility_note !== null,
    })
  }

  for (const id of targets) {
    if (unknownTargetSkillIds.includes(id)) continue
    const matchedSomewhere = recommendations.some((entry) =>
      entry.matchedTargetSkillIds.includes(id),
    )
    if (!matchedSomewhere) unmatchedTargetSkillIds.push(id)
  }

  recommendations.sort((a, b) => {
    if (a.matchedTargetSkillIds.length !== b.matchedTargetSkillIds.length) {
      return b.matchedTargetSkillIds.length - a.matchedTargetSkillIds.length
    }
    const fitDelta = beginnerFitRank(a.beginnerFit) - beginnerFitRank(b.beginnerFit)
    if (fitDelta !== 0) return fitDelta
    const verifiedDelta = compareInstantsDesc(a.resource.verified_at, b.resource.verified_at)
    if (verifiedDelta !== 0) return verifiedDelta
    return a.resource.resource_id < b.resource.resource_id
      ? -1
      : a.resource.resource_id > b.resource.resource_id
        ? 1
        : 0
  })

  return { recommendations, unmatchedTargetSkillIds, unknownTargetSkillIds }
}

export interface RoleSkillRow {
  skill: Skill
  stat: SkillStat
}

export interface RoleSkillOverview {
  roleId: CanonicalRoleId
  /** F: formal-scope jobs for this role (no other filter). */
  f: number
  /** D: analyzable-description denominator for this role. */
  d: number
  rows: RoleSkillRow[]
}

/**
 * Per-role market skill view for the pathways page, computed with the same
 * frozen A2 statistics (formal scope, D denominator, one count per job per
 * skill). Display order follows the existing market convention: N descending,
 * ties by canonical skill id.
 */
export function roleSkillOverview(bundle: UtscBundle, roleId: CanonicalRoleId): RoleSkillOverview {
  const stats = computeMarketStats(bundle, { ...EMPTY_FILTER, roles: [roleId] })
  const rows = bundle.skills
    .map((skill) => {
      const merged = [...stats.technical, ...stats.soft]
      const stat = merged.find((entry) => entry.skillId === skill.skill_id)
      return { skill, stat: stat ?? { skillId: skill.skill_id, n: 0, rate: null } }
    })
    .sort((a, b) => (b.stat.n !== a.stat.n ? b.stat.n - a.stat.n : a.skill.skill_id.localeCompare(b.skill.skill_id)))
  return { roleId, f: stats.f, d: stats.d, rows }
}
