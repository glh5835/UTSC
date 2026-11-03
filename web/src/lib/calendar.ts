import type { Opportunity } from '../data/types'
import { opportunityState } from '../features/opportunities/criteria'

export function safeExternalUrl(value: string | null): string | null {
  if (!value) return null
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null } catch { return null }
}
export function calendarIssue(item: Opportunity, now = new Date()): string | null {
  if (item.review_status !== 'approved' || item.change_pending || opportunityState(item, now) === 'needs_review') return 'review'
  if (item.kind !== 'event' || item.start_precision !== 'datetime' || item.end_precision !== 'datetime') return 'exact_time'
  const start = Date.parse(item.start_at ?? ''), end = Date.parse(item.end_at ?? '')
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'exact_time'
  if (end <= now.getTime()) return 'ended'
  if (!safeExternalUrl(item.source_url)) return 'source'
  return null
}
const escapeText = (value: string) => value.replaceAll('\\', '\\\\').replace(/\r\n|\r|\n/g, '\\n').replaceAll(';', '\\;').replaceAll(',', '\\,')
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
/** RFC 5545: fold at 75 octets without splitting UTF-8 characters. */
export function foldCalendarLine(line: string): string {
  const parts: string[] = []; let current = ''; let bytes = 0
  for (const character of line) {
    const size = new TextEncoder().encode(character).length
    if (bytes + size > 75) { parts.push(current); current = ' '; bytes = 1 }
    current += character; bytes += size
  }
  parts.push(current)
  return parts.join('\r\n')
}
export function createCalendar(item: Opportunity, now = new Date()): string {
  const issue = calendarIssue(item, now)
  if (issue) throw new Error(`Calendar export unavailable: ${issue}`)
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UTSC Career Navigator//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${encodeURIComponent(item.opportunity_id)}@utsc-career-navigator`, `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(new Date(item.start_at!))}`, `DTEND:${stamp(new Date(item.end_at!))}`,
    `SEQUENCE:${item.content_revision}`, `SUMMARY:${escapeText(item.title)}`,
    `DESCRIPTION:${escapeText([item.description ?? '', item.source_url, 'Exported snapshot. Organizer changes do not update this calendar automatically.'].join('\n'))}`,
    `URL:${safeExternalUrl(item.source_url)}`, `LOCATION:${escapeText(item.location ?? '')}`, 'END:VEVENT', 'END:VCALENDAR']
  return lines.map(foldCalendarLine).join('\r\n') + '\r\n'
}
export function downloadCalendar(item: Opportunity): void {
  const url = URL.createObjectURL(new Blob([createCalendar(item)], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = `utsc-${encodeURIComponent(item.opportunity_id)}.ics`; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
