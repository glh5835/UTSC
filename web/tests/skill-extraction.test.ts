import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import type { AnySchema } from 'ajv'
import { describe, expect, it } from 'vitest'
import type { Skill } from '../src/data/types'
import {
  detectExperienceLanguage,
  EXTRACTION_CONTRACT_SCHEMA,
  EXTRACTION_RULE_SET_VERSION,
  experienceTextError,
  extractExperienceSkills,
  MAX_EXPERIENCE_LENGTH,
} from '../src/lib/skillExtraction'

function readJson<T = unknown>(relativeUrl: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), 'utf8')) as T
}

const skills: Skill[] = [
  { skill_id: 'python', label: 'Python', category: 'technical', aliases: ['Python 3'] },
  { skill_id: 'sql', label: 'SQL', category: 'technical', aliases: ['structured query language'] },
  { skill_id: 'excel', label: 'Excel', category: 'technical', aliases: ['Microsoft Excel'] },
  { skill_id: 'power_bi', label: 'Power BI', category: 'technical', aliases: ['PowerBI'] },
  { skill_id: 'teamwork', label: 'Teamwork', category: 'soft', aliases: ['collaboration'] },
]

const contractFixture = readJson<ReturnType<typeof extractExperienceSkills>>(
  './fixtures/valid_experience_skill_candidates.json',
)

describe('contract experience extraction fixture', () => {
  it('reproduces the four interpretations and exact evidence text', () => {
    const actual = extractExperienceSkills(contractFixture.input_text, skills)
    expect(actual).toEqual(contractFixture)
    expect(actual.candidates.map((candidate) => candidate.interpretation)).toEqual([
      'affirmed',
      'negated',
      'planned',
      'ambiguous',
    ])
    expect(actual.candidates.map((candidate) => candidate.skill_id)).toEqual([
      'excel',
      'python',
      'sql',
      'power_bi',
    ])
  })

  it('validates the result against the synced extraction schema', () => {
    const schema = readJson<{ $id: string }>('./fixtures/experience-skill-extraction.schema.json')
    const common = readJson<{ $id: string }>('../public/contracts/schemas/common.schema.json')
    const ajv = new Ajv2020({ strict: false })
    addFormats(ajv)
    ajv.addSchema(common as AnySchema, common.$id)
    const validate = ajv.compile(schema as AnySchema)
    expect(validate(extractExperienceSkills(contractFixture.input_text, skills))).toBe(true)
  })

  it('uses the frozen rule version and contract id', () => {
    const rule = readJson<{
      rule_set_version: string
      contract_schema: string
      language_scope: string[]
      language_notice_for: string[]
    }>('../public/contracts/rules/experience-skill-extraction.json')
    expect(rule.rule_set_version).toBe(EXTRACTION_RULE_SET_VERSION)
    expect(rule.contract_schema).toBe(EXTRACTION_CONTRACT_SCHEMA)
    expect(rule.language_scope).toEqual(['en'])
    expect(rule.language_notice_for).toEqual(['other', 'unknown'])
  })
})

describe('aliases, boundaries and conflicts', () => {
  it('matches labels and aliases case-insensitively at word boundaries', () => {
    const result = extractExperienceSkills(
      'I used Microsoft Excel. I worked with PowerBI. I used structured query language.',
      skills,
    )
    expect(result.candidates.map((candidate) => candidate.skill_id)).toEqual(['excel', 'power_bi', 'sql'])
    expect(result.candidates.every((candidate) => candidate.interpretation === 'affirmed')).toBe(true)
  })

  it('does not treat NoSQL as SQL and deduplicates overlapping aliases', () => {
    const noSql = extractExperienceSkills('I used NoSQL databases.', skills)
    expect(noSql.candidates).toEqual([])
    const duplicate = extractExperienceSkills('I used SQL and structured query language.', skills)
    expect(duplicate.candidates.filter((candidate) => candidate.skill_id === 'sql')).toHaveLength(1)
  })

  it('keeps conflicting evidence visible rather than silently choosing one', () => {
    const result = extractExperienceSkills('I used Python. I have not used Python.', skills)
    expect(result.candidates.filter((candidate) => candidate.skill_id === 'python')).toEqual([
      {
        skill_id: 'python',
        interpretation: 'affirmed',
        evidence_text: 'I used Python.',
        rule_id: 'experience.first_person_use',
      },
      {
        skill_id: 'python',
        interpretation: 'negated',
        evidence_text: 'I have not used Python.',
        rule_id: 'experience.negation',
      },
    ])
  })

  it('does not turn another person or a bare mention into self-affirmation', () => {
    const teammate = extractExperienceSkills('My teammate used Power BI.', skills)
    expect(teammate.candidates[0].interpretation).toBe('ambiguous')
    expect(teammate.candidates[0].rule_id).toBe('experience.third_person')
    const bare = extractExperienceSkills('Python is a useful language.', skills)
    expect(bare.candidates[0].interpretation).toBe('ambiguous')
  })

  it('never infers proficiency from a neutral first-person mention', () => {
    const result = extractExperienceSkills('I like Python.', skills)
    expect(result.candidates[0].interpretation).toBe('ambiguous')
  })
})

describe('local attribution inside mixed clauses', () => {
  function interpretations(input: string) {
    return Object.fromEntries(
      extractExperienceSkills(input, skills).candidates.map((candidate) => [
        candidate.skill_id,
        [candidate.interpretation, candidate.rule_id, candidate.evidence_text],
      ]),
    )
  }

  it('assigns a third-person subject only to its own skill', () => {
    const result = interpretations('My teammate used Python and I used Excel.')
    expect(result.python.slice(0, 2)).toEqual(['ambiguous', 'experience.third_person'])
    expect(result.excel.slice(0, 2)).toEqual(['affirmed', 'experience.first_person_use'])
    expect(result.python[2]).toBe('My teammate used Python and I used Excel.')
  })

  it('does not let a later I-clause reclassify an earlier third-person skill', () => {
    const result = interpretations('My teammate used Python while I managed the project.')
    expect(result.python.slice(0, 2)).toEqual(['ambiguous', 'experience.third_person'])
  })

  it('keeps an affirmed skill before an elliptical negation', () => {
    const result = interpretations('I used Python but not SQL.')
    expect(result.python.slice(0, 2)).toEqual(['affirmed', 'experience.first_person_use'])
    expect(result.sql.slice(0, 2)).toEqual(['negated', 'experience.negation'])
  })

  it('keeps affirmation and future intent in separate coordinated clauses', () => {
    const result = interpretations('I used Python, and I plan to learn SQL.')
    expect(result.python.slice(0, 2)).toEqual(['affirmed', 'experience.first_person_use'])
    expect(result.sql.slice(0, 2)).toEqual(['planned', 'experience.future_intent'])
  })

  it('handles reordered, repunctuated and subjectless local clauses', () => {
    const cases = [
      ['I used Excel; my teammate used Python.', { excel: 'affirmed', python: 'ambiguous' }],
      ['My teammate used Power BI, but I used SQL.', { power_bi: 'ambiguous', sql: 'affirmed' }],
      ['I did not use Python, but I used SQL.', { python: 'negated', sql: 'affirmed' }],
      ['I used Python and plan to learn SQL.', { python: 'affirmed', sql: 'planned' }],
      ['I used Python, not SQL.', { python: 'affirmed', sql: 'negated' }],
      ['My teammate used Python and my manager used SQL.', { python: 'ambiguous', sql: 'ambiguous' }],
    ] as const
    for (const [input, expected] of cases) {
      const result = interpretations(input)
      for (const [skill, interpretation] of Object.entries(expected)) {
        expect(result[skill]?.[0], input).toBe(interpretation)
      }
    }
  })

  it('lets only a safe omitted-subject list inherit an affirmed first-person clause', () => {
    const list = interpretations('I used Python, SQL and Excel.')
    expect(list.python[0]).toBe('affirmed')
    expect(list.sql[0]).toBe('affirmed')
    expect(list.excel[0]).toBe('affirmed')
    const newSubject = interpretations('I used Python, but SQL is useful.')
    expect(newSubject.python[0]).toBe('affirmed')
    expect(newSubject.sql[0]).toBe('ambiguous')
  })

  it('keeps conflict evidence for the same skill when clauses disagree', () => {
    const candidates = extractExperienceSkills('I used Python but not Python.', skills).candidates
    expect(candidates.filter((candidate) => candidate.skill_id === 'python').map((candidate) => candidate.interpretation))
      .toEqual(['affirmed', 'negated'])
  })
})

describe('language and input limits', () => {
  it('detects and clearly flags unsupported languages without extraction', () => {
    const result = extractExperienceSkills('我用 Python 分析过数据。', skills)
    expect(result.input_language).toBe('other')
    expect(result.language_notice).toBe(true)
    expect(result.candidates).toEqual([])
    expect(detectExperienceLanguage('123 !!!')).toBe('unknown')
    expect(extractExperienceSkills('123 !!!', skills).language_notice).toBe(true)
  })

  it('returns no candidates for an empty record and rejects empty/overlong saves', () => {
    const empty = extractExperienceSkills('', skills)
    expect(empty.candidates).toEqual([])
    expect(experienceTextError('   ')).toBe('empty')
    expect(experienceTextError('x'.repeat(MAX_EXPERIENCE_LENGTH + 1))).toBe('too_long')
    expect(experienceTextError('x'.repeat(MAX_EXPERIENCE_LENGTH))).toBeNull()
  })

  it('keeps the fixture files installed and non-empty', () => {
    expect(statSync(fileURLToPath(new URL('./fixtures/valid_experience_skill_candidates.json', import.meta.url))).size).toBeGreaterThan(100)
    expect(statSync(fileURLToPath(new URL('../public/contracts/rules/experience-skill-extraction.json', import.meta.url))).size).toBeGreaterThan(100)
  })
})
