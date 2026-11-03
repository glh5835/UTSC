import type { Opportunity } from '../../data/types'

export const REVIEW_AFTER_DAYS = 30
export type OpportunityState = 'open' | 'registration_closed' | 'ended' | 'needs_review' | 'date_unknown'
export interface OpportunityFilter {
  q: string
  kind: string[]
  types: string[]
  topics: string[]
  skills: string[]
  levels: string[]
  formats: string[]
  from: string
  to: string
  view: 'current' | 'history' | 'all'
}
export const EMPTY_OPPORTUNITY_FILTER: OpportunityFilter = {
  q: '', kind: [], types: [], topics: [], skills: [], levels: [], formats: [], from: '', to: '', view: 'current',
}
export function localDay(now: Date, timezone: string | null): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone ?? 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now)
    return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)?.value).join('-')
  } catch { return now.toISOString().slice(0, 10) }
}
function past(item: Opportunity, field: 'end' | 'deadline', now: Date): boolean {
  const precision = item[`${field}_precision`]
  if (precision === 'datetime') {
    const at = item[`${field}_at`]
    return at !== null && Date.parse(at) <= now.getTime()
  }
  if (precision === 'date') {
    const day = item[`${field}_date`]
    return day !== null && day < localDay(now, item.timezone)
  }
  return false
}
export function opportunityState(item: Opportunity, now = new Date()): OpportunityState {
  if (item.end_precision === 'date' || item.deadline_precision === 'date') {
    try { if (!item.timezone) return 'needs_review'; new Intl.DateTimeFormat('en', { timeZone: item.timezone }) }
    catch { return 'needs_review' }
  }
  if (item.kind === 'event' && past(item, 'end', now)) return 'ended'
  if (past(item, 'deadline', now)) return 'registration_closed'
  if (item.change_pending || (item.source_updated_at !== null && Date.parse(item.source_updated_at) > Date.parse(item.verified_at))) return 'needs_review'
  if (item.kind === 'ongoing_opportunity') {
    const verified = Date.parse(item.verified_at)
    return !Number.isFinite(verified) || now.getTime() - verified > REVIEW_AFTER_DAYS * 86400000 ? 'needs_review' : 'open'
  }
  return item.start_precision === 'unknown' ? 'date_unknown' : 'open'
}
export function filterOpportunities(items: readonly Opportunity[], filter: OpportunityFilter, now = new Date()): Opportunity[] {
  const intersects = (selected: string[], values: string[]) => selected.length === 0 || selected.some(value => values.includes(value))
  return items.filter(item => {
    if (item.review_status !== 'approved') return false
    const state = opportunityState(item, now)
    if (filter.view === 'current' && state === 'ended') return false
    if (filter.view === 'history' && state !== 'ended') return false
    if (filter.q.trim() && ![item.title, item.description ?? '', item.organizer_id].join(' ').toLowerCase().includes(filter.q.trim().toLowerCase())) return false
    if (!intersects(filter.kind, [item.kind]) || !intersects(filter.types, item.activity_type_ids) ||
      !intersects(filter.topics, item.topic_ids) || !intersects(filter.skills, item.skill_ids) ||
      !intersects(filter.levels, [item.beginner_level]) || !intersects(filter.formats, [item.format])) return false
    if (filter.from || filter.to) {
      if (item.start_precision === 'unknown' || item.start_date === null) return false
      if (filter.from && item.start_date < filter.from) return false
      if (filter.to && item.start_date > filter.to) return false
    }
    return true
  }).sort((a, b) => (a.start_date ?? '9999').localeCompare(b.start_date ?? '9999') || a.opportunity_id.localeCompare(b.opportunity_id))
}
export function readOpportunityFilter(params: URLSearchParams): OpportunityFilter {
  const list = (key: string) => [...new Set(params.getAll(key))].filter(Boolean)
  const date = (key: string) => /^\d{4}-\d{2}-\d{2}$/.test(params.get(key) ?? '') ? params.get(key)! : ''
  const view = params.get('view')
  return { q: params.get('q') ?? '', kind: list('kind'), types: list('type'), topics: list('topic'), skills: list('skill'),
    levels: list('level'), formats: list('format'), from: date('from'), to: date('to'), view: view === 'history' || view === 'all' ? view : 'current' }
}
export function writeOpportunityFilter(filter: OpportunityFilter): URLSearchParams {
  const params = new URLSearchParams()
  if (filter.q) params.set('q', filter.q)
  if (filter.from) params.set('from', filter.from)
  if (filter.to) params.set('to', filter.to)
  if (filter.view !== 'current') params.set('view', filter.view)
  for (const [key, values] of [['kind', filter.kind], ['type', filter.types], ['topic', filter.topics], ['skill', filter.skills], ['level', filter.levels], ['format', filter.formats]] as const) {
    for (const value of values) params.append(key, value)
  }
  return params
}
