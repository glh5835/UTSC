import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkCrossRecords, createBundleValidator, loadAndValidateBundle, type SchemaSet } from '../src/data/validation'
import type { UtscBundle } from '../src/data/types'
import { EMPTY_FILTER, formalJobs, type MarketFilter } from '../src/features/market/criteria'
import { compareRoles, computeMarketOverview, formatPercent, SMALL_SAMPLE_THRESHOLD } from '../src/features/market/stats'
import {
  isDefaultParams,
  isValidDateBound,
  parseFilter,
  serializeComparisonParams,
  serializeFilter,
  toggleInDimension,
  validateDateRange,
} from '../src/features/market/filterParams'

/**
 * A2 tests for the website-side SYNTHETIC demo package and the filter URL
 * round-trip. The demo package is hand-constructed (see the generator in
 * artifacts/a2-20261028/make-demo-bundle.py) with numbers fixed BY HAND
 * before these assertions were written:
 *
 *   Formal-scope jobs (no filter)  F = 22  (25 jobs; 3 excluded by scope)
 *   Analyzable descriptions        D = 18  (4 with missing/unavailable desc)
 *   Role distribution (no filter):
 *     data_analyst 7, business_analyst 3, bi_analyst 3, data_scientist 3,
 *     data_engineer 1, product_analyst 2, operations_analyst 1,
 *     financial_risk_analyst 2          (sum = 22)
 *   python N = 6 (da-01,02,05, ds-01, de-01, x-05), rate 6/18 = 33.3%
 *   sql    N = 11, rate 11/18 = 61.1%
 *   excel  N = 7, power_bi 3, tableau 2
 *   communication N = 6, teamwork 4, attention_to_detail N = 0 (real 0%:
 *   D > 0 but no analyzable job mentions it — its only mentioning job has a
 *   missing description)
 *   With date filter 2026-09-01..2026-10-31: F = 20, D = 16 (x-05 unknown
 *   date and x-06 posted 2026-08-15 drop out), python N = 5.
 *   business_analyst ∩ internship: only ba-03 (unavailable desc) → F = 1,
 *   D = 0 → every rate null, displayed as 暂无可分析数据.
 *   financial_risk subtypes: fra-01 financial_analysis, fra-02 risk_analysis
 *   — display-only children of financial_risk_analyst, never extra roles.
 */

const SCHEMA_FILES = [
  'bundle.schema.json',
  'common.schema.json',
  'manifest.schema.json',
  'market-job.schema.json',
  'skill.schema.json',
  'course.schema.json',
  'resource.schema.json',
  'opportunity.schema.json',
] as const

function readJson<T = unknown>(relativeUrl: string): T {
  const path = fileURLToPath(new URL(relativeUrl, import.meta.url))
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

const schemas: SchemaSet = new Map()
for (const file of SCHEMA_FILES) {
  const schema = readJson<{ $id?: string }>(`../public/contracts/schemas/${file}`)
  schemas.set(schema.$id as string, schema)
}
const validate = createBundleValidator(schemas)

const demo = readJson<UtscBundle>('../public/demo/a2-market-demo.json')

function dataUrl(json: unknown): string {
  return `data:application/json;base64,${Buffer.from(JSON.stringify(json), 'utf8').toString('base64')}`
}

describe('demo package conforms to the frozen contract', () => {
  it('passes the upstream bundle schema', () => {
    expect(validate(demo)).toBe(true)
  })

  it('passes every cross-record check (unique keys, skill refs, sample_count, time order)', () => {
    expect(checkCrossRecords(demo)).toEqual([])
  })

  it('a duplicated job_key in the same shape is rejected as a whole', async () => {
    const corrupted: UtscBundle = JSON.parse(JSON.stringify(demo))
    corrupted.market_jobs.push({ ...corrupted.market_jobs[0] })
    const result = await loadAndValidateBundle(dataUrl(corrupted), validate)
    expect(result.status).toBe('rejected')
    if (result.status === 'rejected') {
      expect(result.issues.some((issue) => issue.code === 'duplicate_id')).toBe(true)
    }
  })
})

describe('demo package hand-computed statistics', () => {
  it('no filter: F = 22, D = 18, coverage 18/22 (81.8%)', () => {
    const overview = computeMarketOverview(demo, EMPTY_FILTER)
    expect(overview.stats.f).toBe(22)
    expect(overview.stats.d).toBe(18)
    expect(overview.stats.descriptionCoverage).toBeCloseTo(18 / 22, 12)
    expect(formatPercent(overview.stats.descriptionCoverage)).toBe('81.8%')
    expect(overview.formalTotal).toBe(22)
  })

  it('not-analyzable split: 3 missing + 1 unavailable + 0 present-not-analyzable', () => {
    const overview = computeMarketOverview(demo, EMPTY_FILTER)
    expect(overview.stats.notAnalyzable).toEqual({ missing: 3, unavailable: 1, presentButNotAnalyzable: 0 })
  })

  it('role distribution matches the hand-computed table, eight rows only', () => {
    const overview = computeMarketOverview(demo, EMPTY_FILTER)
    expect(overview.roleDistribution.map((row) => row.count)).toEqual([7, 3, 3, 3, 1, 2, 1, 2])
    expect(overview.roleDistribution).toHaveLength(8)
  })

  it('scope exclusions: 1 role-pending + 1 outside-scope + 1 level-pending', () => {
    const overview = computeMarketOverview(demo, EMPTY_FILTER)
    expect(overview.exclusions).toEqual({ roleNeedsReview: 1, roleOutsideScope: 1, levelNeedsReview: 1, levelNotFormal: 0 })
  })

  it('skill N and rates: python 6/18 (33.3%), sql 11/18 (61.1%), excel 7, power_bi 3, tableau 2', () => {
    const overview = computeMarketOverview(demo, EMPTY_FILTER)
    const byId = new Map(overview.stats.technical.map((s) => [s.skillId, s]))
    expect(byId.get('python')).toEqual({ skillId: 'python', n: 6, rate: 6 / 18 })
    expect(formatPercent(byId.get('python')?.rate ?? null)).toBe('33.3%')
    expect(byId.get('sql')).toEqual({ skillId: 'sql', n: 11, rate: 11 / 18 })
    expect(formatPercent(byId.get('sql')?.rate ?? null)).toBe('61.1%')
    expect(byId.get('excel')?.n).toBe(7)
    expect(byId.get('power_bi')?.n).toBe(3)
    expect(byId.get('tableau')?.n).toBe(2)
  })

  it('soft skills: communication 6, teamwork 4; attention_to_detail is a REAL 0% (D>0, N=0)', () => {
    const overview = computeMarketOverview(demo, EMPTY_FILTER)
    const byId = new Map(overview.stats.soft.map((s) => [s.skillId, s]))
    expect(byId.get('communication')?.n).toBe(6)
    expect(byId.get('teamwork')?.n).toBe(4)
    expect(byId.get('attention_to_detail')).toEqual({ skillId: 'attention_to_detail', n: 0, rate: 0 })
    expect(formatPercent(0)).toBe('0.0%')
  })

  it('date filter 2026-09-01..2026-10-31: F = 20, D = 16, python drops to 5 (unknown date + early posting excluded)', () => {
    const overview = computeMarketOverview(demo, { ...EMPTY_FILTER, postedFrom: '2026-09-01', postedTo: '2026-10-31' })
    expect(overview.stats.f).toBe(20)
    expect(overview.stats.d).toBe(16)
    const python = overview.stats.technical.find((s) => s.skillId === 'python')
    expect(python?.n).toBe(5)
    // boundary days themselves stay inside
    const keys = formalJobs(demo, { ...EMPTY_FILTER, postedFrom: '2026-09-01', postedTo: '2026-10-31' }).map((j) => j.job_key)
    expect(keys).toContain('demo-x-07') // posted exactly 2026-09-01
    expect(keys).toContain('demo-x-08') // posted exactly 2026-10-31
    expect(keys).not.toContain('demo-x-05') // unknown posting date
    expect(keys).not.toContain('demo-x-06') // posted 2026-08-15
  })

  it('business_analyst ∩ internship: F = 1, D = 0 → every rate null (暂无可分析数据, not 0%)', () => {
    const overview = computeMarketOverview(demo, { ...EMPTY_FILTER, roles: ['business_analyst'], levels: ['internship'] })
    expect(overview.stats.f).toBe(1)
    expect(overview.stats.d).toBe(0)
    for (const stat of overview.stats.technical) expect(stat.rate).toBeNull()
    for (const stat of overview.stats.soft) expect(stat.rate).toBeNull()
    expect(formatPercent(overview.stats.technical[0].rate)).toBe('—')
  })

  it('comparison uses per-role denominators (da 7/6 vs ba 3/2; sql 5/6 vs 2/2)', () => {
    const rows = compareRoles(demo, EMPTY_FILTER, ['data_analyst', 'business_analyst'])
    const [da, ba] = rows
    expect(da.stats.f).toBe(7)
    expect(da.stats.d).toBe(6)
    expect(ba.stats.f).toBe(3)
    expect(ba.stats.d).toBe(2)
    const daSql = da.stats.technical.find((s) => s.skillId === 'sql')
    const baSql = ba.stats.technical.find((s) => s.skillId === 'sql')
    // data_analyst sql jobs inside D: da-01, da-03, da-05, x-07, x-08 → 5
    expect(daSql).toEqual({ skillId: 'sql', n: 5, rate: 5 / 6 })
    // business_analyst sql jobs inside D: ba-01 → 1... plus? ba-02 excel only.
    expect(baSql).toEqual({ skillId: 'sql', n: 1, rate: 1 / 2 })
  })

  it('small-sample threshold: D = 6 for ba comparison row is below 20 (hint applies)', () => {
    // documents the product rule: any row with 0 < D < 20 shows the notice
    expect(SMALL_SAMPLE_THRESHOLD).toBe(20)
  })

  it('subtype values appear only under financial_risk_analyst', () => {
    const withSubtype = demo.market_jobs.filter((job) => job.role_subtype !== null)
    expect(withSubtype.length).toBeGreaterThanOrEqual(2)
    expect(withSubtype.every((job) => job.role_id === 'financial_risk_analyst')).toBe(true)
    expect(new Set(withSubtype.map((job) => job.role_subtype))).toEqual(new Set(['financial_analysis', 'risk_analysis']))
  })
})

describe('filter URL round-trip', () => {
  it('absent params mean 全部 (empty filter)', () => {
    expect(parseFilter(new URLSearchParams(''))).toEqual(EMPTY_FILTER)
    expect(isDefaultParams(new URLSearchParams(''))).toBe(true)
  })

  it('multi-value dimensions parse as OR lists', () => {
    const params = new URLSearchParams('role=data_analyst,bi_analyst&area=toronto_gta,montreal_metro&level=internship,new_grad')
    const filter = parseFilter(params)
    expect(filter.roles).toEqual(['data_analyst', 'bi_analyst'])
    expect(filter.areas).toEqual(['toronto_gta', 'montreal_metro'])
    expect(filter.levels).toEqual(['internship', 'new_grad'])
  })

  it('unknown ids, malformed dates and reversed bounds are dropped, never guessed', () => {
    const filter = parseFilter(new URLSearchParams('role=data_scientist,ninth_role&from=2026/09/01&to=2026-99-01'))
    expect(filter.roles).toEqual(['data_scientist'])
    expect(filter.postedFrom).toBeNull()
    expect(filter.postedTo).toBeNull()
    const reversed = parseFilter(new URLSearchParams('from=2026-10-01&to=2026-09-01'))
    expect(reversed).toEqual(EMPTY_FILTER)
  })

  it('serialize ∘ parse is the identity on valid filters', () => {
    const filter: MarketFilter = {
      roles: ['bi_analyst', 'data_engineer'],
      areas: ['other_canada'],
      levels: ['entry_level'],
      postedFrom: '2026-09-01',
      postedTo: '2026-10-31',
    }
    const round = parseFilter(serializeFilter(filter))
    expect(round).toEqual(filter)
  })

  it('lang params live elsewhere and never touch filter keys', () => {
    const params = new URLSearchParams('lang=zh&role=data_analyst')
    expect(parseFilter(params).roles).toEqual(['data_analyst'])
    const out = serializeFilter({ ...EMPTY_FILTER, roles: ['data_analyst'] })
    expect(out.has('lang')).toBe(false)
  })

  it('toggleInDimension adds and removes within one dimension', () => {
    const state: string[] = []
    const withA = toggleInDimension(state, 'a')
    expect(withA).toEqual(['a'])
    expect(toggleInDimension(withA, 'a')).toEqual([])
    // toggling b after a keeps insertion order; removing a leaves b only
    const withAB = toggleInDimension(withA, 'b')
    expect(withAB).toEqual(['a', 'b'])
    expect(toggleInDimension(withAB, 'a')).toEqual(['b'])
  })

  it('comparison roles survive shared-filter changes and clearing filters', () => {
    const selected: MarketFilter['roles'] = ['business_analyst', 'data_analyst']
    const narrowed = serializeComparisonParams(
      { ...EMPTY_FILTER, areas: ['toronto_gta'], levels: ['internship'] },
      selected,
    )
    expect(narrowed.get('compare')).toBe('data_analyst,business_analyst')
    expect(narrowed.get('area')).toBe('toronto_gta')
    expect(narrowed.get('level')).toBe('internship')
    expect(narrowed.has('role')).toBe(false)

    const cleared = serializeComparisonParams(EMPTY_FILTER, selected)
    expect(cleared.get('compare')).toBe('data_analyst,business_analyst')
    expect(cleared.has('area')).toBe(false)
    expect(cleared.has('level')).toBe(false)
  })
})

describe('date draft validation (reversed intermediate edit)', () => {
  it('keeps a whole replacement range valid before it is applied', () => {
    // The UI validates the final pair, not every keystroke against the old
    // URL filter. A later replacement range must be legal as a whole.
    expect(validateDateRange('2026-11-01', '2026-11-30')).toBeNull()
    expect(validateDateRange('2026-11-01', '')).toBeNull()
    expect(validateDateRange('', '2026-11-30')).toBeNull()
  })

  it('reports a reversed draft instead of erasing either date', () => {
    expect(validateDateRange('2026-11-01', '2026-10-31')).toBe('reversed_range')
    expect(validateDateRange('2026-11-01', '2026-11-01')).toBeNull()
  })

  it('rejects malformed or impossible calendar dates explicitly', () => {
    expect(validateDateRange('2026-02-30', '2026-03-01')).toBe('invalid_date')
    expect(validateDateRange('2026-13-01', '')).toBe('invalid_date')
    expect(validateDateRange('2026/01/01', '2026-01-31')).toBe('invalid_date')
    expect(isValidDateBound('2028-02-29')).toBe(true)
    expect(isValidDateBound('2027-02-29')).toBe(false)
  })

  it('only serializes applied, valid bounds; externally reversed URLs still degrade safely', () => {
    const applied = serializeFilter({ ...EMPTY_FILTER, postedFrom: '2026-11-01', postedTo: '2026-11-30' })
    expect(applied.get('from')).toBe('2026-11-01')
    expect(applied.get('to')).toBe('2026-11-30')
    expect(parseFilter(new URLSearchParams('from=2026-11-01&to=2026-10-31'))).toEqual(EMPTY_FILTER)
  })
})
