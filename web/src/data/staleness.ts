/**
 * Snapshot freshness. The website shows the actual data times from the
 * manifest and flags stale snapshots based on a configurable age threshold.
 * Build time is never presented as collection time; staleness is computed
 * only from manifest.generated_at versus the viewer's current clock.
 */

/** Default staleness threshold in days. A product-level hint, not a
 * statistical claim. Configurable so future packages can tune it. */
export const STALE_THRESHOLD_DAYS = 180

export interface StalenessInfo {
  generatedAt: string
  ageDays: number
  stale: boolean
  thresholdDays: number
}

const DAY_MS = 24 * 60 * 60 * 1000

export function stalenessInfo(
  generatedAt: string,
  now: Date,
  thresholdDays: number = STALE_THRESHOLD_DAYS,
): StalenessInfo {
  const generated = new Date(generatedAt)
  if (Number.isNaN(generated.getTime())) {
    // Schema validation already rejects malformed instants; treated as stale
    // so a bad value can never silently pass as fresh.
    return { generatedAt, ageDays: Number.NaN, stale: true, thresholdDays }
  }
  const ageDays = Math.max(0, Math.floor((now.getTime() - generated.getTime()) / DAY_MS))
  return { generatedAt, ageDays, stale: ageDays > thresholdDays, thresholdDays }
}
