import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { MarketJob, Skill, UtscBundle } from '../src/data/types'
import type { MarketFilter } from '../src/features/market/criteria'
import { computeMarketStats, formatPercent } from '../src/features/market/stats'

interface ReferenceCase {
  case_id: string
  filters: {
    role_ids?: string[]
    career_levels?: string[]
    market_areas?: string[]
    posted_from?: string
    posted_to?: string
  }
  skill_ids: string[]
  expected: {
    job_count: number
    analyzable_description_count: number
    skills: { skill_id: string; mention_count: number; mention_rate: number | null }[]
  }
}

const fixture = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/market_statistics_cases.json', import.meta.url)), 'utf8')) as {
  fixture_status: string
  market_jobs: MarketJob[]
  cases: ReferenceCase[]
}
const skills: Skill[] = [
  { skill_id: 'excel', label: 'Excel', category: 'technical', aliases: [] },
  { skill_id: 'python', label: 'Python', category: 'technical', aliases: [] },
  { skill_id: 'risk', label: 'Risk', category: 'technical', aliases: [] },
  { skill_id: 'sql', label: 'SQL', category: 'technical', aliases: [] },
  { skill_id: 'teamwork', label: 'Teamwork', category: 'soft', aliases: [] },
]
const bundle: UtscBundle = {
  manifest: {
    schema_version: '1.0.0', dataset_version: 'reference', generated_at: '2026-10-01T00:00:00Z',
    collected_from: null, collected_to: null, posting_from: null, posting_to: null,
    query_config_version: 'reference', run_status: 'complete', sample_count: fixture.market_jobs.length,
  },
  market_jobs: fixture.market_jobs,
  skills,
  courses: [],
  resources: [],
  opportunities: [],
}

describe('fixed upstream Python reference cases', () => {
  it('uses the synthetic reference fixture', () => {
    expect(fixture.fixture_status).toBe('synthetic_reference_only')
    expect(fixture.cases).toHaveLength(3)
  })

  for (const reference of fixture.cases) {
    it(`${reference.case_id}: exact F/D/N and raw rates`, () => {
      const filter: MarketFilter = {
        roles: (reference.filters.role_ids ?? []) as MarketFilter['roles'],
        levels: (reference.filters.career_levels ?? []) as MarketFilter['levels'],
        areas: (reference.filters.market_areas ?? []) as MarketFilter['areas'],
        postedFrom: reference.filters.posted_from ?? null,
        postedTo: reference.filters.posted_to ?? null,
      }
      const stats = computeMarketStats(bundle, filter)
      const actual = [...stats.technical, ...stats.soft]
        .filter((entry) => reference.skill_ids.includes(entry.skillId))
        .map((entry) => ({ skill_id: entry.skillId, mention_count: entry.n, mention_rate: entry.rate }))
        .sort((a, b) => a.skill_id.localeCompare(b.skill_id))
      expect(stats.f).toBe(reference.expected.job_count)
      expect(stats.d).toBe(reference.expected.analyzable_description_count)
      expect(actual).toEqual(reference.expected.skills)
      expect(actual.map((entry) => formatPercent(entry.mention_rate))).toEqual(
        reference.expected.skills.map((entry) => formatPercent(entry.mention_rate)),
      )
    })
  }
})
