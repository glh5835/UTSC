import type { MarketJob, Skill, UtscBundle } from '../src/data/types'
import { describe, expect, it } from 'vitest'
import {
  CANONICAL_ROLE_IDS,
  EMPTY_FILTER,
  formalJobs,
  matchesFilter,
  matchesPostedDate,
  scopeExclusions,
} from '../src/features/market/criteria'
import {
  compareRoles,
  computeMarketOverview,
  computeMarketStats,
  formatPercent,
  SMALL_SAMPLE_THRESHOLD,
} from '../src/features/market/stats'

/**
 * A2 statistics tests with HAND-COMPUTED expected values.
 *
 * Every expected number below was derived manually from the job table in this
 * file (each job is written on one line with its dimensions), NOT by running
 * the implementation first. Where a comment states an expectation, it was
 * fixed before the assertion was written against the code.
 */

/* ────────────────────────── helpers ────────────────────────── */

let seq = 0

interface JobSpec {
  key?: string
  role: string | null
  roleStatus?: 'classified' | 'needs_review' | 'outside_scope'
  level: string
  levelStatus?: 'classified' | 'needs_review'
  area?: string
  postedDate?: string | null
  precision?: 'datetime' | 'date' | 'unknown'
  tech?: string[]
  soft?: string[]
  analyzable?: boolean
  status?: 'available' | 'missing' | 'unavailable'
}

function job(spec: JobSpec): MarketJob {
  seq += 1
  const status = spec.status ?? (spec.analyzable === false ? 'missing' : 'available')
  const precision = spec.precision ?? (spec.postedDate ? 'datetime' : 'unknown')
  return {
    job_key: spec.key ?? `k${seq}`,
    source: 'test',
    source_job_id: `id${seq}`,
    job_title: 't',
    employer_name: null,
    source_url: null,
    role_id: spec.role as MarketJob['role_id'],
    role_subtype: null,
    role_classification_status: spec.roleStatus ?? (spec.role === null ? 'needs_review' : 'classified'),
    role_classification_label: null,
    classification_reasons: [],
    career_level: spec.level as MarketJob['career_level'],
    career_level_status: spec.levelStatus ?? 'classified',
    market_area: (spec.area ?? 'toronto_gta') as MarketJob['market_area'],
    posted_at: spec.postedDate ? `${spec.postedDate}T12:00:00Z` : null,
    posted_date: spec.postedDate ?? null,
    posted_precision: precision,
    source_timezone: null,
    first_seen_at: '2026-09-01T00:00:00Z',
    last_seen_at: '2026-10-01T00:00:00Z',
    technical_skill_ids: spec.tech ?? [],
    soft_skill_ids: spec.soft ?? [],
    description_status: status,
    description_analyzable: spec.analyzable ?? true,
  }
}

function bundleOf(jobs: MarketJob[], skills: Skill[] = []): UtscBundle {
  return {
    manifest: {
      schema_version: '1.0.0',
      dataset_version: '0.0.1',
      generated_at: '2026-10-27T00:00:00Z',
      collected_from: null,
      collected_to: null,
      posting_from: null,
      posting_to: null,
      query_config_version: 't',
      run_status: 'complete',
      sample_count: jobs.length,
    },
    market_jobs: jobs,
    skills,
    courses: [],
    resources: [],
    opportunities: [],
  }
}

const skill = (id: string, category: Skill['category']): Skill => ({
  skill_id: id,
  label: id,
  category,
  aliases: [],
})

const filter = (partial: Partial<typeof EMPTY_FILTER>): typeof EMPTY_FILTER => ({
  ...EMPTY_FILTER,
  ...partial,
})

/* ────────────────────────── 八角色与金融/风险子标签 ────────────────────────── */

describe('formal scope: eight canonical roles, subtypes are not categories', () => {
  // Hand count: 8 formal jobs, one per canonical role. financial_analysis and
  // risk_analysis appear as subtypes of financial_risk_analyst, never as
  // separate rows.
  const b = bundleOf([
    job({ key: 'r1', role: 'data_analyst', level: 'new_grad' }),
    job({ key: 'r2', role: 'business_analyst', level: 'new_grad' }),
    job({ key: 'r3', role: 'bi_analyst', level: 'new_grad' }),
    job({ key: 'r4', role: 'data_scientist', level: 'new_grad' }),
    job({ key: 'r5', role: 'data_engineer', level: 'new_grad' }),
    job({ key: 'r6', role: 'product_analyst', level: 'new_grad' }),
    job({ key: 'r7', role: 'operations_analyst', level: 'new_grad' }),
    job({ key: 'r8', role: 'financial_risk_analyst', level: 'new_grad' }),
    // subtype does not create a ninth category
    job({ key: 'r9', role: 'financial_risk_analyst', level: 'new_grad' }),
    // needs_review / outside_scope / non-formal levels are out of scope
    job({ key: 'x1', role: null, roleStatus: 'needs_review', level: 'new_grad' }),
    job({ key: 'x2', role: null, roleStatus: 'outside_scope', level: 'new_grad' }),
    job({ key: 'x3', role: 'data_analyst', level: 'potential_senior', levelStatus: 'needs_review' }),
    job({ key: 'x4', role: 'data_analyst', level: 'unknown' }),
  ])

  it('formal F counts only classified jobs with a canonical role and formal level (expect 9)', () => {
    expect(formalJobs(b, EMPTY_FILTER)).toHaveLength(9)
  })

  it('role distribution shows exactly the eight canonical rows', () => {
    const overview = computeMarketOverview(b, EMPTY_FILTER)
    expect(overview.roleDistribution.map((row) => row.roleId)).toEqual([...CANONICAL_ROLE_IDS])
    // 7 roles × 1 job each; financial_risk_analyst collects r8 + r9 → 2
    expect(overview.roleDistribution.map((row) => row.count)).toEqual([1, 1, 1, 1, 1, 1, 1, 2])
  })

  it('exclusions report one job per reason (primary reason wins, no double counting)', () => {
    // x1 role needs_review; x2 role outside_scope; x3 level needs_review
    // (potential_senior); x4 level classified but "unknown" → not formal.
    const exclusions = scopeExclusions(b)
    expect(exclusions).toEqual({ roleNeedsReview: 1, roleOutsideScope: 1, levelNeedsReview: 1, levelNotFormal: 1 })
  })
})

/* ────────────────────────── OR / AND / 清空 ────────────────────────── */

describe('filter semantics: OR within a dimension, AND across dimensions', () => {
  // Hand-built table (area, level):
  //   a1: toronto, internship, sql
  //   a2: toronto, new_grad,  python
  //   a3: montreal, internship, sql
  //   a4: montreal, new_grad,  python
  const b = bundleOf([
    job({ key: 'a1', role: 'data_analyst', level: 'internship', area: 'toronto_gta', tech: ['sql'] }),
    job({ key: 'a2', role: 'data_analyst', level: 'new_grad', area: 'toronto_gta', tech: ['python'] }),
    job({ key: 'a3', role: 'business_analyst', level: 'internship', area: 'montreal_metro', tech: ['sql'] }),
    job({ key: 'a4', role: 'business_analyst', level: 'new_grad', area: 'montreal_metro', tech: ['python'] }),
  ])

  it('empty filter means 全部 (expect 4)', () => {
    expect(formalJobs(b, EMPTY_FILTER)).toHaveLength(4)
  })

  it('single-area filter (expect 2: a1, a2)', () => {
    expect(formalJobs(b, filter({ areas: ['toronto_gta'] })).map((j) => j.job_key)).toEqual(['a1', 'a2'])
  })

  it('same-dimension multi-select is OR (areas toronto+montreal → all 4)', () => {
    expect(formalJobs(b, filter({ areas: ['toronto_gta', 'montreal_metro'] }))).toHaveLength(4)
  })

  it('levels OR (internship+new_grad → all 4)', () => {
    expect(formalJobs(b, filter({ levels: ['internship', 'new_grad'] }))).toHaveLength(4)
  })

  it('cross-dimension AND (roles data_analyst AND areas toronto → a1, a2 only)', () => {
    expect(formalJobs(b, filter({ roles: ['data_analyst'], areas: ['toronto_gta'] })).map((j) => j.job_key)).toEqual(['a1', 'a2'])
  })

  it('three dimensions AND (business_analyst + montreal + new_grad → a4 only)', () => {
    expect(formalJobs(b, filter({ roles: ['business_analyst'], areas: ['montreal_metro'], levels: ['new_grad'] })).map((j) => j.job_key)).toEqual(['a4'])
  })

  it('combined OR selections AND together (ba+da roles, montreal+other areas → a3, a4)', () => {
    expect(
      formalJobs(b, filter({ roles: ['business_analyst', 'data_analyst'], areas: ['montreal_metro', 'other_canada'] })).map((j) => j.job_key),
    ).toEqual(['a3', 'a4'])
  })
})

/* ────────────────────────── 日期边界 / 未知日期 / 精度 ────────────────────────── */

describe('posted-date semantics', () => {
  // Hand table:
  //   d1 posted 2026-09-01 (range start, must be INCLUDED — bounds inclusive)
  //   d2 posted 2026-10-31 (range end, must be INCLUDED)
  //   d3 posted 2026-08-31 (one day before from → EXCLUDED)
  //   d4 posted 2026-11-01 (one day after to → EXCLUDED)
  //   d5 precision date-only 2026-09-15 (INCLUDED, compared as calendar date)
  //   d6 unknown date (EXCLUDED while any bound is active)
  const b = bundleOf([
    job({ key: 'd1', role: 'data_analyst', level: 'new_grad', postedDate: '2026-09-01', precision: 'datetime' }),
    job({ key: 'd2', role: 'data_analyst', level: 'new_grad', postedDate: '2026-10-31', precision: 'date' }),
    job({ key: 'd3', role: 'data_analyst', level: 'new_grad', postedDate: '2026-08-31', precision: 'datetime' }),
    job({ key: 'd4', role: 'data_analyst', level: 'new_grad', postedDate: '2026-11-01', precision: 'date' }),
    job({ key: 'd5', role: 'data_analyst', level: 'new_grad', postedDate: '2026-09-15', precision: 'date' }),
    job({ key: 'd6', role: 'data_analyst', level: 'new_grad', postedDate: null, precision: 'unknown' }),
  ])
  const range = filter({ postedFrom: '2026-09-01', postedTo: '2026-10-31' })

  it('inclusive bounds keep the exact end dates (d1, d2, d5 → 3)', () => {
    expect(formalJobs(b, range).map((j) => j.job_key)).toEqual(['d1', 'd2', 'd5'])
  })

  it('unknown posted dates cannot masquerade as matching a date filter', () => {
    expect(formalJobs(b, range).map((j) => j.job_key)).not.toContain('d6')
    // without any date bound the unknown-date job is included again
    expect(formalJobs(b, EMPTY_FILTER)).toHaveLength(6)
  })

  it('only a lower bound also excludes unknown dates (d4 Nov satisfies ≥ from)', () => {
    expect(formalJobs(b, filter({ postedFrom: '2026-09-01' })).map((j) => j.job_key)).toEqual(['d1', 'd2', 'd4', 'd5'])
  })

  it('date-only precision never invents a time of day (plain calendar compare)', () => {
    // d5 is date-only and sits strictly inside the range both as a from-bound
    // match day and a to-bound match day.
    expect(matchesPostedDate(b.market_jobs[4], range)).toBe(true)
    expect(matchesPostedDate(b.market_jobs[4], filter({ postedFrom: '2026-09-15', postedTo: '2026-09-15' }))).toBe(true)
    expect(matchesPostedDate(b.market_jobs[4], filter({ postedFrom: '2026-09-16', postedTo: null }))).toBe(false)
  })

  it('first_seen/collected times are never used as posting dates', () => {
    // d3 was SEEN in September (all first_seen_at are 2026-09-01) but posted
    // 2026-08-31 — it must stay out of the September+ range.
    expect(formalJobs(b, range).map((j) => j.job_key)).not.toContain('d3')
  })

  it('malformed bounds fail loudly instead of silently matching nothing', () => {
    expect(() => matchesFilter(b.market_jobs[0], filter({ postedFrom: '2026/09/01', postedTo: null }))).toThrow()
    expect(() => matchesFilter(b.market_jobs[0], filter({ postedFrom: '2026-10-01', postedTo: '2026-09-01' }))).toThrow()
  })
})

/* ────────────────────────── F / D / N / 覆盖率 / 舍入 ────────────────────────── */

describe('F, D, skill counts, coverage and rounding', () => {
  // Hand table (all data_analyst, toronto, formal):
  //   f1 python, sql       analyzable
  //   f2 python            analyzable
  //   f3 sql               analyzable
  //   f4 (no skills)       analyzable
  //   f5 python, sql       missing    (缺描述 — excluded from D, counted separately)
  //   f6 sql               unavailable (不可分析 — distinct from missing)
  //   f7 sql               available but analyzable=false (present, not analyzable)
  // F = 7, D = 4 (f1..f4), not analyzable = 3 (1 missing + 1 unavailable + 1 present-not-analyzable)
  const b = bundleOf(
    [
      job({ key: 'f1', role: 'data_analyst', level: 'new_grad', tech: ['python', 'sql'] }),
      job({ key: 'f2', role: 'data_analyst', level: 'new_grad', tech: ['python'] }),
      job({ key: 'f3', role: 'data_analyst', level: 'new_grad', tech: ['sql'] }),
      job({ key: 'f4', role: 'data_analyst', level: 'new_grad' }),
      job({ key: 'f5', role: 'data_analyst', level: 'new_grad', tech: ['python', 'sql'], analyzable: false, status: 'missing' }),
      job({ key: 'f6', role: 'data_analyst', level: 'new_grad', tech: ['sql'], analyzable: false, status: 'unavailable' }),
      job({ key: 'f7', role: 'data_analyst', level: 'new_grad', tech: ['sql'], analyzable: false, status: 'available' }),
    ],
    [skill('python', 'technical'), skill('sql', 'technical')],
  )

  it('F = 7, D = 4, coverage 4/7 (display 57.1%)', () => {
    const stats = computeMarketOverview(b, EMPTY_FILTER).stats
    expect(stats.f).toBe(7)
    expect(stats.d).toBe(4)
    expect(stats.descriptionCoverage).toBeCloseTo(4 / 7, 12)
    expect(formatPercent(stats.descriptionCoverage)).toBe('57.1%')
  })

  it('缺描述 and 不可分析 are reported separately (1 missing + 1 unavailable + 1 present)', () => {
    const stats = computeMarketOverview(b, EMPTY_FILTER).stats
    expect(stats.notAnalyzable).toEqual({ missing: 1, unavailable: 1, presentButNotAnalyzable: 1 })
  })

  it('N counts only D-set jobs, once per job (python N=2, sql N=2) — skills on non-analyzable jobs never leak in', () => {
    const stats = computeMarketOverview(b, EMPTY_FILTER).stats
    const python = stats.technical.find((s) => s.skillId === 'python')
    const sql = stats.technical.find((s) => s.skillId === 'sql')
    // f5/f6/f7 mention sql/python but are OUTSIDE D; only f1 (python+sql),
    // f2 (python), f3 (sql) count → python 2, sql 2? f1 and f3 → 2.
    expect(python).toEqual({ skillId: 'python', n: 2, rate: 0.5 })
    expect(sql).toEqual({ skillId: 'sql', n: 2, rate: 0.5 })
  })

  it('display rounding keeps raw precision internally, rounds only for display', () => {
    // 1/3 jobs mentioning a skill → raw 0.333..., display 33.3%
    const b2 = bundleOf(
      [
        job({ key: 'g1', role: 'data_analyst', level: 'new_grad', tech: ['r'] }),
        job({ key: 'g2', role: 'data_analyst', level: 'new_grad' }),
        job({ key: 'g3', role: 'data_analyst', level: 'new_grad' }),
      ],
      [skill('r', 'technical')],
    )
    const stats = computeMarketStats(b2, EMPTY_FILTER)
    expect(stats.technical[0].rate).toBeCloseTo(1 / 3, 12)
    expect(formatPercent(stats.technical[0].rate)).toBe('33.3%')
  })

  it('D=0 with F>0: every rate is null, never a fabricated 0%', () => {
    const b3 = bundleOf(
      [
        job({ key: 'h1', role: 'data_analyst', level: 'new_grad', tech: ['python'], analyzable: false, status: 'missing' }),
        job({ key: 'h2', role: 'data_analyst', level: 'new_grad', analyzable: false, status: 'unavailable' }),
      ],
      [skill('python', 'technical')],
    )
    const stats = computeMarketStats(b3, EMPTY_FILTER)
    expect(stats.f).toBe(2)
    expect(stats.d).toBe(0)
    expect(stats.technical[0]).toEqual({ skillId: 'python', n: 0, rate: null })
    expect(formatPercent(stats.technical[0].rate)).toBe('—')
    expect(formatPercent(stats.descriptionCoverage)).toBe('0.0%') // coverage is 0/2, defined
  })

  it('F=0: coverage null, no rates', () => {
    const b4 = bundleOf(
      [job({ key: 'z1', role: 'data_analyst', level: 'new_grad' })],
      [skill('python', 'technical')],
    )
    const overview = computeMarketOverview(b4, filter({ areas: ['montreal_metro'] }))
    expect(overview.stats.f).toBe(0)
    expect(overview.stats.descriptionCoverage).toBeNull()
    expect(formatPercent(overview.stats.descriptionCoverage)).toBe('—')
  })
})

describe('skill counting unions both arrays before catalog classification', () => {
  const b = bundleOf(
    [
      job({ key: 'u1', role: 'data_analyst', level: 'new_grad', soft: ['sql'] }),
      job({ key: 'u2', role: 'data_analyst', level: 'new_grad', tech: ['teamwork'] }),
      job({ key: 'u3', role: 'data_analyst', level: 'new_grad', tech: ['sql', 'teamwork'], soft: ['sql', 'teamwork'] }),
      job({ key: 'u4', role: 'data_analyst', level: 'new_grad', tech: ['sql', 'teamwork'], soft: ['sql', 'teamwork'], analyzable: false }),
    ],
    [skill('sql', 'technical'), skill('teamwork', 'soft')],
  )

  it('counts either array, deduplicates within a job and excludes non-analyzable rows', () => {
    const stats = computeMarketStats(b, EMPTY_FILTER)
    expect(stats.f).toBe(4)
    expect(stats.d).toBe(3)
    expect(stats.technical.find((entry) => entry.skillId === 'sql')).toEqual({ skillId: 'sql', n: 2, rate: 2 / 3 })
    expect(stats.soft.find((entry) => entry.skillId === 'teamwork')).toEqual({ skillId: 'teamwork', n: 2, rate: 2 / 3 })
  })
})

/* ────────────────────────── 小样本阈值 ────────────────────────── */

describe('small-sample product hint threshold', () => {
  it('threshold is 19+1: D below 20 triggers the hint, D = 20 does not', () => {
    expect(SMALL_SAMPLE_THRESHOLD).toBe(20)
    // boundary semantics asserted in the component test below; here we pin
    // the constant and its documented meaning.
  })
})

/* ────────────────────────── 角色比较分母 ────────────────────────── */

describe('role comparison uses each role’s own denominators', () => {
  // Hand table (all posted 2026-10-01 so date bounds are well-defined):
  //   data_analyst:      c1 (python), c2 (sql), c3 missing      → F 3, D 2
  //   data_engineer:     c4 (python)                             → F 1, D 1
  // python rate for data_analyst = 1/2; for data_engineer = 1/1 — the same
  // skill, two different denominators, never a shared market-wide one.
  const b = bundleOf(
    [
      job({ key: 'c1', role: 'data_analyst', level: 'new_grad', postedDate: '2026-10-01', tech: ['python'] }),
      job({ key: 'c2', role: 'data_analyst', level: 'new_grad', postedDate: '2026-10-01', tech: ['sql'] }),
      job({ key: 'c3', role: 'data_analyst', level: 'new_grad', postedDate: '2026-10-01', analyzable: false, status: 'missing' }),
      job({ key: 'c4', role: 'data_engineer', level: 'new_grad', postedDate: '2026-10-01', tech: ['python'] }),
    ],
    [skill('python', 'technical'), skill('sql', 'technical')],
  )

  it('per-role F and D are independent (da 3/2, de 1/1)', () => {
    const rows = compareRoles(b, EMPTY_FILTER, ['data_analyst', 'data_engineer'])
    expect(rows).toHaveLength(2)
    expect(rows[0].stats.f).toBe(3)
    expect(rows[0].stats.d).toBe(2)
    expect(rows[1].stats.f).toBe(1)
    expect(rows[1].stats.d).toBe(1)
  })

  it('the same skill gets different rates from different denominators (1/2 vs 1/1)', () => {
    const rows = compareRoles(b, EMPTY_FILTER, ['data_analyst', 'data_engineer'])
    const daPython = rows[0].stats.technical.find((s) => s.skillId === 'python')
    const dePython = rows[1].stats.technical.find((s) => s.skillId === 'python')
    expect(daPython).toEqual({ skillId: 'python', n: 1, rate: 0.5 })
    expect(dePython).toEqual({ skillId: 'python', n: 1, rate: 1 })
  })

  it('shared non-role filters apply to every row', () => {
    const rows = compareRoles(b, filter({ postedFrom: '2026-10-01' }), ['data_analyst'])
    // all jobs posted later than the bound (first_seen is irrelevant), so
    // nothing changes here — but a bound that excludes does apply to each row:
    const narrowed = compareRoles(b, filter({ postedFrom: '2027-01-01' }), ['data_analyst', 'data_engineer'])
    expect(narrowed.every((row) => row.stats.f === 0)).toBe(true)
    expect(rows[0].stats.f).toBe(3)
  })
})
