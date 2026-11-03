import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Opportunity, UtscBundle } from '../src/data/types'
import { filterOpportunities, opportunityState, EMPTY_OPPORTUNITY_FILTER, readOpportunityFilter, writeOpportunityFilter, localDay } from '../src/features/opportunities/criteria'
import { createCalendar, calendarIssue, foldCalendarLine, safeExternalUrl } from '../src/lib/calendar'

const bundle = JSON.parse(readFileSync(new URL('../public/demo/a5-opportunities-demo.json', import.meta.url), 'utf8')) as UtscBundle
const now = new Date('2026-11-02T12:00:00Z')
const item = bundle.opportunities[0]
const event = (overrides: Partial<Opportunity> = {}): Opportunity => ({ ...item, ...overrides })

describe('reviewed opportunities and filter semantics', () => {
  it('never reveals unapproved records', () => {
    expect(filterOpportunities([event({ review_status: 'draft' }), event({ review_status: 'rejected' })], { ...EMPTY_OPPORTUNITY_FILTER, view: 'all' }, now)).toEqual([])
  })
  it('uses OR within a dimension and AND across dimensions', () => {
    const filtered = filterOpportunities(bundle.opportunities, { ...EMPTY_OPPORTUNITY_FILTER, types: ['networking', 'workshop'], topics: ['finance'] }, now)
    expect(filtered.map(x => x.opportunity_id)).toEqual(['synthetic_opportunity_2'])
  })
  it('matches keyword, kind, format, skill and level', () => {
    expect(filterOpportunities(bundle.opportunities, { ...EMPTY_OPPORTUNITY_FILTER, q: 'PYTHON DATA', kind: ['event'], formats: ['in_person'], skills: ['python'], levels: ['beginner_friendly'] }, now).map(x => x.opportunity_id)).toEqual(['synthetic_opportunity_1'])
  })
  it('has inclusive date bounds and excludes unknown dates only when dates are active', () => {
    const unknown = event({ start_precision: 'unknown', start_date: null, start_at: null })
    expect(filterOpportunities([item, unknown], { ...EMPTY_OPPORTUNITY_FILTER, from: '2027-03-14', to: '2027-03-14' }, now)).toEqual([item])
    expect(filterOpportunities([unknown], EMPTY_OPPORTUNITY_FILTER, now)).toEqual([unknown])
  })
  it('separates history from a closed registration', () => {
    const closed = event({ deadline_at: '2026-11-01T14:00:00Z' })
    expect(opportunityState(closed, now)).toBe('registration_closed')
    expect(filterOpportunities([closed], EMPTY_OPPORTUNITY_FILTER, now)).toHaveLength(1)
    expect(filterOpportunities(bundle.opportunities, { ...EMPTY_OPPORTUNITY_FILTER, view: 'history' }, now).map(x => x.opportunity_id)).toEqual(['synthetic_opportunity_4'])
  })
  it('keeps date-only deadlines open through their local calendar day', () => {
    const dateOnly = event({ deadline_precision: 'date', deadline_at: null, deadline_date: '2026-11-01' })
    expect(opportunityState(dateOnly, new Date('2026-11-02T04:30:00Z'))).toBe('open')
    expect(opportunityState(dateOnly, new Date('2026-11-02T05:30:00Z'))).toBe('registration_closed')
    expect(localDay(new Date('2026-11-01T06:30:00Z'), 'America/Toronto')).toBe('2026-11-01')
  })
  it('requires reconfirmation for stale ongoing opportunities and pending changes', () => {
    expect(opportunityState(bundle.opportunities[5], now)).toBe('needs_review')
    expect(opportunityState(event({ change_pending: true }), now)).toBe('needs_review')
    expect(opportunityState(bundle.opportunities[4], now)).toBe('open')
    expect(opportunityState(event({ deadline_precision: 'date', deadline_at: null, timezone: null }), now)).toBe('needs_review')
  })
  it('round-trips the shareable URL without translating IDs', () => {
    const filter = { ...EMPTY_OPPORTUNITY_FILTER, q: '数据 Python', types: ['talk', 'workshop'], skills: ['python'], from: '2027-03-01' }
    expect(readOpportunityFilter(writeOpportunityFilter(filter))).toEqual(filter)
  })
})

describe('calendar export', () => {
  it('uses stable UID, UTC instants, content revision and CRLF', () => {
    const text = createCalendar(item, now)
    expect(text).toContain('DTSTART:20270314T160000Z\r\n')
    expect(text).toContain('DTEND:20270314T180000Z\r\n')
    expect(text).toContain(`UID:${item.opportunity_id}@utsc-career-navigator`)
    expect(text).toContain('SEQUENCE:1')
    expect(text.replaceAll('\r\n', '')).not.toContain('\n')
    expect(createCalendar(event({ content_revision: 2 }), now).match(/UID:[^\r]+/)?.[0]).toBe(text.match(/UID:[^\r]+/)?.[0])
  })
  it('retains exact instants across Toronto DST and multi-day events', () => {
    const text = createCalendar(event({ start_at: '2027-03-14T06:30:00Z', end_at: '2027-03-15T14:00:00Z' }), now)
    expect(text).toContain('DTSTART:20270314T063000Z')
    expect(text).toContain('DTEND:20270315T140000Z')
  })
  it.each([
    { start_precision: 'date', start_at: null }, { end_precision: 'unknown', end_at: null },
    { change_pending: true }, { review_status: 'needs_review' }, { kind: 'ongoing_opportunity' },
    { end_at: '2026-01-01T00:00:00Z' }, { source_url: 'javascript:alert(1)' },
  ] as Partial<Opportunity>[])('refuses uncertain or ineligible export: %o', overrides => {
    expect(calendarIssue(event(overrides), now)).not.toBeNull()
    expect(() => createCalendar(event(overrides), now)).toThrow()
  })
  it('escapes text injection and folds by UTF-8 octets', () => {
    const title = '标题'.repeat(40) + '\nBEGIN:VTODO;X,END'
    const text = createCalendar(event({ title }), now)
    expect(text).not.toContain('\r\nBEGIN:VTODO')
    for (const line of text.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(foldCalendarLine('中'.repeat(30)).replaceAll('\r\n ', '')).toBe('中'.repeat(30))
  })
  it('rejects executable, relative and credential-bearing links', () => {
    expect(safeExternalUrl('https://user:pass@example.com')).toBeNull()
    expect(safeExternalUrl('/private')).toBeNull()
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(safeExternalUrl('https://example.com')).toBe('https://example.com/')
  })
})
