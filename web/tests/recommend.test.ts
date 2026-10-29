import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BEGINNER_FIT_ORDER,
  RECOMMENDATION_RULE_SET_VERSION,
  RECOMMENDATION_RULE_SHA256,
  beginnerFitFor,
  recommendResources,
  roleSkillOverview,
} from '../src/lib/recommend'
import { DATA_CONFIG } from '../src/data/sources'
import { checkCrossRecords, createBundleValidator, type SchemaSet } from '../src/data/validation'
import type { MarketJob, Resource, Skill, UtscBundle } from '../src/data/types'

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

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8'))
}

function sha256File(relative: string): string {
  return createHash('sha256')
    .update(readFileSync(fileURLToPath(new URL(relative, import.meta.url))))
    .digest('hex')
}

/** Minimal deterministic resource builder for sort tests. */
function res(
  id: string,
  skillIds: string[],
  level: Resource['level'],
  verifiedAt: string,
  eligibilityNote: string | null = null,
): Resource {
  return {
    resource_id: id,
    title: `Title ${id}`,
    resource_type: 'tutorial',
    skill_ids: skillIds,
    level,
    eligibility_note: eligibilityNote,
    source_url: `https://example.com/${id}`,
    verified_at: verifiedAt,
  }
}

const SKILLS: Skill[] = [
  { skill_id: 'python', label: 'Python', category: 'technical', aliases: [] },
  { skill_id: 'sql', label: 'SQL', category: 'technical', aliases: [] },
  { skill_id: 'excel', label: 'Excel', category: 'technical', aliases: [] },
  { skill_id: 'teamwork', label: 'Teamwork', category: 'soft', aliases: [] },
]

function bundleOf(resources: Resource[], skills: Skill[] = SKILLS): UtscBundle {
  return {
    manifest: {
      schema_version: '1.0.0',
      dataset_version: '0.0.0-test',
      generated_at: '2026-10-29T00:00:00Z',
      collected_from: null,
      collected_to: null,
      posting_from: null,
      posting_to: null,
      query_config_version: 'test',
      run_status: 'complete',
      sample_count: 0,
    },
    market_jobs: [],
    skills,
    courses: [],
    resources,
    opportunities: [],
  }
}

describe('recommendation rule sync (frozen upstream bytes)', () => {
  it('public rule copy matches the recorded upstream SHA-256', () => {
    expect(sha256File('../public/contracts/rules/recommendation.json')).toBe(
      RECOMMENDATION_RULE_SHA256,
    )
  })

  it('rule content pins the shared A4 behaviour', () => {
    const rule = readJson('../public/contracts/rules/recommendation.json') as {
      rule_set_version: string
      matching: Record<string, unknown>
      sort_priority: string[]
      beginner_fit_order: string[]
      explanation: Record<string, unknown>
    }
    expect(rule.rule_set_version).toBe('1.0.0')
    expect(RECOMMENDATION_RULE_SET_VERSION).toBe(rule.rule_set_version)
    expect(rule.matching.required_input).toBe('user_selected_target_skill_ids')
    expect(rule.matching.match_field).toBe('skill_ids')
    expect(rule.matching.unconfirmed_user_skills_are_not_assumed_absent).toBe(true)
    expect(rule.sort_priority).toEqual([
      'target_skill_coverage_count_desc',
      'beginner_fit_desc',
      'verified_at_desc',
    ])
    expect(rule.beginner_fit_order).toEqual([...BEGINNER_FIT_ORDER])
    expect(rule.explanation.employment_probability).toBe(false)
    expect(rule.explanation.guaranteed_course_eligibility).toBe(false)
  })
})

describe('A4 pathways demo package (website-side SYNTHETIC)', () => {
  const schemas: SchemaSet = new Map()
  for (const file of SCHEMA_FILES) {
    const schema = readJson(`../public/contracts/schemas/${file}`) as { $id?: string }
    schemas.set(schema.$id as string, schema)
  }
  const validate = createBundleValidator(schemas)

  const bundle = readJson('../public/demo/a4-pathways-demo.json') as UtscBundle

  it('is contract-valid 1.0.0 with no cross-record issues', () => {
    expect(validate(bundle)).toBe(true)
    expect(checkCrossRecords(bundle)).toEqual([])
  })

  it('stays inside one version context per build (no mixed versions)', () => {
    expect(['demo', 'integration', 'published']).toContain(DATA_CONFIG.mode)
    expect(['1.0.0', '1.1.0']).toContain(DATA_CONFIG.schemaVersion)
    expect(DATA_CONFIG.pathwaysBundlePath).toMatch(/^\//)
    // The pathways bundle is one of the same version's bundles — in demo it is
    // the demo file, in an integration build it is that environment's bundle.
    expect(
      [
        DATA_CONFIG.marketBundlePath,
        DATA_CONFIG.courseBundlePath,
        DATA_CONFIG.pathwaysBundlePath,
      ].every((path) => path.startsWith('/')),
    ).toBe(true)
    expect(bundle.manifest.schema_version).toBe('1.0.0')
    expect(bundle.manifest.run_status).toBe('complete')
  })

  it('shares the exact A2 demo jobs and skills so statistics stay consistent', () => {
    const a2 = readJson('../public/demo/a2-market-demo.json') as UtscBundle
    expect(bundle.market_jobs).toEqual(a2.market_jobs)
    expect(bundle.skills).toEqual(a2.skills)
    expect(bundle.manifest.sample_count).toBe(bundle.market_jobs.length)
  })

  it('carries enough SYNTHETIC resources to exercise the three sort tiers', () => {
    expect(bundle.resources.length).toBeGreaterThanOrEqual(9)
    const ids = bundle.resources.map((resource) => resource.resource_id)
    expect(new Set(ids).size).toBe(ids.length)
    // tie-break twins: same coverage, same fit, same verified_at
    expect(bundle.resources.filter((r) => r.verified_at === '2026-10-20T15:00:00Z').length)
      .toBeGreaterThanOrEqual(2)
  })
})

describe('recommendResources: inputs and empty states', () => {
  const bundle = bundleOf([
    res('r_sql', ['sql'], 'beginner', '2026-10-20T15:00:00Z'),
    res('r_py', ['python'], 'beginner', '2026-10-21T15:00:00Z'),
  ])

  it('recommends nothing without explicitly selected target skills', () => {
    const result = recommendResources(bundle, [])
    expect(result.recommendations).toEqual([])
    expect(result.unmatchedTargetSkillIds).toEqual([])
    expect(result.unknownTargetSkillIds).toEqual([])
  })

  it('reports an honest empty state when no resource matches', () => {
    const result = recommendResources(bundle, ['excel'])
    expect(result.recommendations).toEqual([])
    expect(result.unmatchedTargetSkillIds).toEqual(['excel'])
    expect(result.unknownTargetSkillIds).toEqual([])
  })

  it('keeps unknown ids visible instead of matching or dropping them', () => {
    const result = recommendResources(bundle, ['sql', 'not_a_skill'])
    expect(result.unknownTargetSkillIds).toEqual(['not_a_skill'])
    expect(result.recommendations.map((entry) => entry.resource.resource_id)).toEqual(['r_sql'])
    expect(result.unmatchedTargetSkillIds).toEqual([])
  })

  it('matches by structured skill_ids only, never by title or free text', () => {
    const tricky = bundleOf([
      res('r_title_only', [], 'beginner', '2026-10-20T15:00:00Z'),
    ])
    tricky.resources[0].title = 'The complete SQL course'
    const result = recommendResources(tricky, ['sql'])
    expect(result.recommendations).toEqual([])
    expect(result.unmatchedTargetSkillIds).toEqual(['sql'])
  })
})

describe('recommendResources: canonical-id deduplication', () => {
  const bundle = bundleOf([
    // resource.skill_ids duplicates are rejected by the contract schema
    // (uniqueItems); the matcher still counts a skill at most once per resource.
    res('r_dup', ['sql', 'sql', 'python'], 'beginner', '2026-10-20T15:00:00Z'),
  ])

  it('counts a target skill once even when it appears twice on the resource', () => {
    const result = recommendResources(bundle, ['sql'])
    expect(result.recommendations).toHaveLength(1)
    expect(result.recommendations[0].matchedTargetSkillIds).toEqual(['sql'])
  })

  it('deduplicates the user selection itself', () => {
    const result = recommendResources(bundle, ['sql', 'sql', 'python', 'sql'])
    expect(result.recommendations[0].matchedTargetSkillIds).toEqual(['sql', 'python'])
    // Matched ids keep the resource's own canonical order.
    const both = recommendResources(bundle, ['python', 'sql'])
    expect(both.recommendations[0].matchedTargetSkillIds).toEqual(['sql', 'python'])
  })
})

describe('recommendResources: the three sort tiers and stable tie-break', () => {
  // coverage: r_two covers 2 targets; everyone else covers 1.
  // fit:     r_two beginner, r_sql_early/r_sql_alt beginner, r_adv advanced
  //          (→ unknown), r_unknown_level unknown.
  // verified_at desc breaks coverage ties except between the twins.
  const resources = [
    res('r_adv', ['sql'], 'advanced', '2026-10-24T15:00:00Z'),
    res('r_sql_early', ['sql'], 'beginner', '2026-10-19T15:00:00Z'),
    res('r_unknown_level', ['sql'], 'unknown', '2026-10-23T15:00:00Z'),
    res('r_sql_alt', ['sql'], 'beginner', '2026-10-20T15:00:00Z'),
    res('r_two', ['sql', 'python'], 'beginner', '2026-10-18T15:00:00Z'),
    res('r_sql_early_twin', ['sql'], 'beginner', '2026-10-19T15:00:00Z'),
  ]
  const bundle = bundleOf(resources)

  it('orders by coverage, then beginner fit, then verified_at desc', () => {
    const result = recommendResources(bundle, ['sql', 'python'])
    expect(result.recommendations.map((entry) => entry.resource.resource_id)).toEqual([
      'r_two', // coverage 2 — first despite being the oldest
      'r_sql_alt', // coverage 1, beginner, verified 10-20
      'r_sql_early', // coverage 1, beginner, verified 10-19 — id order within twins
      'r_sql_early_twin',
      'r_adv', // coverage 1, fit unknown, verified 10-24
      'r_unknown_level', // coverage 1, fit unknown, verified 10-23
    ])
  })

  it('breaks unknown-tier ties by verified_at desc before the id tie-break', () => {
    const result = recommendResources(bundle, ['sql', 'python'])
    const ids = result.recommendations.map((entry) => entry.resource.resource_id)
    expect(ids.indexOf('r_adv')).toBeLessThan(ids.indexOf('r_unknown_level'))
  })

  it('uses resource_id as the deterministic tie-break for identical rows', () => {
    const result = recommendResources(bundle, ['sql'])
    const ids = result.recommendations.map((entry) => entry.resource.resource_id)
    expect(ids.filter((id) => id.startsWith('r_sql_early'))).toEqual([
      'r_sql_early',
      'r_sql_early_twin',
    ])
  })

  it('is deterministic: same input, same order, input order irrelevant', () => {
    const shuffled = bundleOf([...resources].reverse())
    const a = recommendResources(bundle, ['sql', 'python']).recommendations.map(
      (entry) => entry.resource.resource_id,
    )
    const b = recommendResources(shuffled, ['sql', 'python']).recommendations.map(
      (entry) => entry.resource.resource_id,
    )
    expect(a).toEqual(b)
    const again = recommendResources(bundle, ['sql', 'python']).recommendations.map(
      (entry) => entry.resource.resource_id,
    )
    expect(again).toEqual(a)
  })
})

describe('beginner fit: conservative mapping', () => {
  it('maps only an explicit structured beginner marker to beginner_friendly', () => {
    expect(beginnerFitFor(res('x', [], 'beginner', '2026-10-20T15:00:00Z'))).toBe('beginner_friendly')
  })

  it('keeps intermediate, advanced and unknown at unknown', () => {
    expect(beginnerFitFor(res('x', [], 'intermediate', '2026-10-20T15:00:00Z'))).toBe('unknown')
    expect(beginnerFitFor(res('x', [], 'advanced', '2026-10-20T15:00:00Z'))).toBe('unknown')
    expect(beginnerFitFor(res('x', [], 'unknown', '2026-10-20T15:00:00Z'))).toBe('unknown')
  })

  it('never derives prerequisites_required under the 1.0.0 resource schema', () => {
    for (const level of ['beginner', 'intermediate', 'advanced', 'unknown'] as const) {
      expect(beginnerFitFor(res('x', [], level, '2026-10-20T15:00:00Z'))).not.toBe(
        'prerequisites_required',
      )
    }
  })

  it('orders intermediate/advanced resources after explicit beginner resources', () => {
    const bundle = bundleOf([
      res('r_adv', ['sql'], 'advanced', '2026-10-30T15:00:00Z'),
      res('r_beg', ['sql'], 'beginner', '2026-10-01T15:00:00Z'),
    ])
    const result = recommendResources(bundle, ['sql'])
    expect(result.recommendations.map((entry) => entry.resource.resource_id)).toEqual([
      'r_beg',
      'r_adv',
    ])
  })
})

describe('eligibility, confirmation state and purity', () => {
  it('reports stated eligibility without turning it into a personal guarantee', () => {
    const bundle = bundleOf([
      res('r_stated', ['sql'], 'beginner', '2026-10-20T15:00:00Z', 'Open to UTSC students only.'),
      res('r_unstated', ['excel'], 'beginner', '2026-10-20T15:00:00Z', null),
    ])
    const result = recommendResources(bundle, ['sql', 'excel'])
    expect(result.recommendations.find((entry) => entry.resource.resource_id === 'r_stated')?.hasEligibilityNote).toBe(true)
    expect(result.recommendations.find((entry) => entry.resource.resource_id === 'r_unstated')?.hasEligibilityNote).toBe(false)
  })

  it('does not filter or rank by personal confirmation state (unconfirmed ≠ absent)', () => {
    const bundle = bundleOf([
      res('r_sql', ['sql'], 'beginner', '2026-10-20T15:00:00Z'),
      res('r_py', ['python'], 'beginner', '2026-10-21T15:00:00Z'),
    ])
    // The function signature takes no confirmed-skill input: identical output
    // whatever the user has confirmed. Unconfirmed 'sql' still recommends.
    const withUnconfirmed = recommendResources(bundle, ['sql'])
    const withConfirmed = recommendResources(bundle, ['sql'])
    expect(withUnconfirmed).toEqual(withConfirmed)
    expect(withUnconfirmed.recommendations.map((entry) => entry.resource.resource_id)).toEqual([
      'r_sql',
    ])
  })

  it('is pure: the input bundle is never mutated and nothing is written back', () => {
    const bundle = bundleOf([res('r_sql', ['sql'], 'beginner', '2026-10-20T15:00:00Z')])
    const before = JSON.stringify(bundle)
    recommendResources(bundle, ['sql'])
    expect(JSON.stringify(bundle)).toBe(before)
  })
})

describe('roleSkillOverview uses the frozen market statistics', () => {
  function job(partial: Partial<MarketJob>): MarketJob {
    return {
      job_key: partial.job_key ?? 'j',
      source: 'test',
      source_job_id: null,
      job_title: 'Job',
      employer_name: null,
      source_url: null,
      role_id: 'data_analyst',
      role_subtype: null,
      role_classification_status: 'classified',
      role_classification_label: null,
      classification_reasons: [],
      career_level: 'entry_level',
      career_level_status: 'classified',
      market_area: 'toronto_gta',
      posted_at: null,
      posted_date: null,
      posted_precision: 'unknown',
      source_timezone: null,
      first_seen_at: '2026-10-01T00:00:00Z',
      last_seen_at: '2026-10-01T00:00:00Z',
      technical_skill_ids: [],
      soft_skill_ids: [],
      description_status: 'available',
      description_analyzable: true,
      ...partial,
    }
  }

  it('counts a skill once per job across both arrays and uses the D denominator', () => {
    const bundle = bundleOf([])
    bundle.market_jobs = [
      job({ job_key: 'a', technical_skill_ids: ['sql'], soft_skill_ids: ['sql'] }),
      job({ job_key: 'b', technical_skill_ids: ['sql'] }),
      job({ job_key: 'c', description_analyzable: false, technical_skill_ids: ['sql'] }),
      job({ job_key: 'd', role_id: 'data_engineer', technical_skill_ids: ['sql'] }),
    ]
    const overview = roleSkillOverview(bundle, 'data_analyst')
    expect(overview.f).toBe(3)
    expect(overview.d).toBe(2)
    const sql = overview.rows.find((row) => row.skill.skill_id === 'sql')
    expect(sql?.stat).toEqual({ skillId: 'sql', n: 2, rate: 1 })
  })

  it('keeps every catalog row and reports D = 0 without fabricating rates', () => {
    const bundle = bundleOf([])
    bundle.market_jobs = [
      job({ job_key: 'a', description_analyzable: false }),
    ]
    const overview = roleSkillOverview(bundle, 'data_analyst')
    expect(overview.d).toBe(0)
    expect(overview.rows.find((row) => row.skill.skill_id === 'sql')?.stat.rate).toBeNull()
  })
})
