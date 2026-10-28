import {
  CANONICAL_ROLE_IDS,
  FORMAL_CAREER_LEVELS,
  MARKET_AREAS,
  type MarketFilter,
} from './criteria'

/**
 * URL round-trip for market filters. Filters live in the router's query
 * string (inside the hash route), e.g.
 *
 *   #/market?role=data_analyst,bi_analyst&area=toronto_gta&from=2026-09-01
 *
 * The `lang` parameter lives on the real query string (before the hash) and
 * is owned by the LanguageContext, so the two never collide: switching
 * language rewrites only ?lang=, browser back/forward restores filters.
 *
 * Values are validated strictly: unknown ids, malformed dates and reversed
 * bounds are dropped individually, so a hand-edited URL degrades to "no
 * restriction on that dimension" instead of throwing or matching wrongly.
 * Absent parameters mean 全部 (no restriction).
 */

const FILTER_PARAM_KEYS = ['role', 'area', 'level', 'from', 'to'] as const
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseIdList<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return []
  const picked: T[] = []
  for (const token of raw.split(',')) {
    const value = token.trim()
    if ((allowed as readonly string[]).includes(value) && !picked.includes(value as T)) {
      picked.push(value as T)
    }
  }
  return picked
}

/** A usable inclusive bound: exact YYYY-MM-DD and a real calendar date. */
export function isValidDateBound(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10))
  const asUtc = new Date(Date.UTC(year, month - 1, day))
  const reconstructed = `${asUtc.getUTCFullYear()}-${String(asUtc.getUTCMonth() + 1).padStart(2, '0')}-${String(asUtc.getUTCDate()).padStart(2, '0')}`
  return reconstructed === value
}

export type DateRangeIssue = 'invalid_date' | 'reversed_range' | null

/** Validation for the editable draft. Empty bounds mean "no restriction". */
export function validateDateRange(from: string, to: string): DateRangeIssue {
  const start = from.trim()
  const end = to.trim()
  if ((start && !isValidDateBound(start)) || (end && !isValidDateBound(end))) return 'invalid_date'
  if (start && end && start > end) return 'reversed_range'
  return null
}

function parseDateBound(raw: string | null): string | null {
  if (raw === null) return null
  const value = raw.trim()
  return isValidDateBound(value) ? value : null
}

export function parseFilter(params: URLSearchParams): MarketFilter {
  const filter: MarketFilter = {
    roles: parseIdList(params.get('role'), CANONICAL_ROLE_IDS),
    areas: parseIdList(params.get('area'), MARKET_AREAS),
    levels: parseIdList(params.get('level'), FORMAL_CAREER_LEVELS),
    postedFrom: parseDateBound(params.get('from')),
    postedTo: parseDateBound(params.get('to')),
  }
  // A reversed range cannot be "repaired" silently: drop both bounds so the
  // UI never presents an impossible constraint as if it were active.
  if (filter.postedFrom && filter.postedTo && filter.postedFrom > filter.postedTo) {
    filter.postedFrom = null
    filter.postedTo = null
  }
  return filter
}

export function serializeFilter(filter: MarketFilter): URLSearchParams {
  const params = new URLSearchParams()
  if (filter.roles.length > 0) params.set('role', filter.roles.join(','))
  if (filter.areas.length > 0) params.set('area', filter.areas.join(','))
  if (filter.levels.length > 0) params.set('level', filter.levels.join(','))
  if (filter.postedFrom) params.set('from', filter.postedFrom)
  if (filter.postedTo) params.set('to', filter.postedTo)
  return params
}

export function serializeComparisonParams(
  sharedFilter: MarketFilter,
  selectedRoles: MarketFilter['roles'],
): URLSearchParams {
  const params = serializeFilter({ ...sharedFilter, roles: [] })
  const ordered = CANONICAL_ROLE_IDS.filter((role) => selectedRoles.includes(role))
  if (ordered.length > 0) params.set('compare', ordered.join(','))
  return params
}

/** True when the params hold nothing beyond the default 全部 state. */
export function isDefaultParams(params: URLSearchParams): boolean {
  return FILTER_PARAM_KEYS.every((key) => params.get(key) === null)
}

/**
 * Toggles one id inside a dimension and returns the new filter. Multi-select
 * within a dimension is OR; selecting then deselecting returns to 全部.
 */
export function toggleInDimension<T extends string>(current: T[], id: T): T[] {
  return current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
}
