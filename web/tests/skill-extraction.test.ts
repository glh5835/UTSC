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

  it('keeps nested third-person actions ambiguous even when I is the outer subject', () => {
    for (const input of [
      'I watched my teammate use Python.',
      'I asked my teammate to use Python.',
      'I observed my teammate using Python while I used Excel.',
    ]) {
      const result = interpretations(input)
      expect(result.python.slice(0, 2), input).toEqual(['ambiguous', 'experience.third_person'])
    }
    const mixed = interpretations('I observed my teammate using Python while I used Excel.')
    expect(mixed.excel.slice(0, 2)).toEqual(['affirmed', 'experience.first_person_use'])
    expect(interpretations('I used Python with my teammate.').python[0]).toBe('affirmed')
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

describe('third-party executor attribution (F1 follow-up)', () => {
  function bySkill(input: string) {
    return Object.fromEntries(
      extractExperienceSkills(input, skills).candidates.map((candidate) => [
        candidate.skill_id,
        [candidate.interpretation, candidate.rule_id] as const,
      ]),
    )
  }

  it('passes the four required reviewer cases', () => {
    expect(bySkill('I watched my teammate use Python.').python).toEqual(['ambiguous', 'experience.third_person'])
    expect(bySkill('I asked my teammate to use Python.').python).toEqual(['ambiguous', 'experience.third_person'])
    const mixed = bySkill('I observed my teammate using Python while I used Excel.')
    expect(mixed.python).toEqual(['ambiguous', 'experience.third_person'])
    expect(mixed.excel).toEqual(['affirmed', 'experience.first_person_use'])
    expect(bySkill('I saw Alex use Python.').python).toEqual(['ambiguous', 'experience.third_person'])
  })

  it('keeps the full original sentence as evidence text', () => {
    for (const input of [
      'I watched my teammate use Python.',
      'I saw Alex use Python.',
      'I observed my teammate using Python while I used Excel.',
    ]) {
      for (const candidate of extractExperienceSkills(input, skills).candidates) {
        expect(candidate.evidence_text, input).toBe(input)
      }
    }
  })

  it('still affirms direct first-person use when others only appear nearby', () => {
    expect(bySkill('I used Python with my teammate.').python).toEqual(['affirmed', 'experience.first_person_use'])
    expect(bySkill('With my teammate I used Python.').python).toEqual(['affirmed', 'experience.first_person_use'])
    expect(bySkill('During my internship I used Python extensively.').python).toEqual([
      'affirmed',
      'experience.first_person_use',
    ])
    const we = bySkill('We used Excel and SQL.')
    expect(we.excel[0]).toBe('affirmed')
    expect(we.sql[0]).toBe('affirmed')
  })

  it('covers perception, request and report variants conservatively', () => {
    const ambiguousCases = [
      ['I heard my colleague use SQL.', 'sql'],
      ['I noticed my teammate using Excel.', 'excel'],
      ['I saw Maria use Power BI.', 'power_bi'],
      ['He watched me use Python.', 'python'],
      ['My manager asked me to use Python.', 'python'],
      ['I watched my teammate use Python, SQL and Excel.', 'sql'],
      ['I watched my teammate use Python, SQL and Excel.', 'excel'],
    ] as const
    for (const [input, skill] of ambiguousCases) {
      expect(bySkill(input)[skill]?.[0], input).toBe('ambiguous')
    }
    const paired = bySkill('I used Python and watched my teammate use SQL.')
    expect(paired.python).toEqual(['affirmed', 'experience.first_person_use'])
    expect(paired.sql).toEqual(['ambiguous', 'experience.third_person'])
  })

  it('keeps named third-party executors ambiguous without first-person co-occurrence', () => {
    expect(bySkill('Alex used Python at work.').python).toEqual(['ambiguous', 'experience.third_person'])
    const whileMixed = bySkill('I used Python while Maria used Excel.')
    expect(whileMixed.python).toEqual(['affirmed', 'experience.first_person_use'])
    expect(whileMixed.excel).toEqual(['ambiguous', 'experience.third_person'])
  })
})

describe('direct self-use evidence gate (D7 independent review)', () => {
  const uncertainExecutors = [
    'I watched students use Python.',
    'I asked the intern to use Python.',
    'I saw people use Python.',
    'I watched developers use Python.',
    // Different nouns and verb frames exercise the structure, not a noun list.
    'I noticed researchers using Python.',
    'We asked two volunteers to work with Python.',
    'I reported that apprentices used Python.',
    'I helped visitors use Python.',
    'I learned that analysts use Python.',
    'I have been asked to use Python.',
    'I was told to use Python.',
    'After analysts said I used Python.',
    'With the manager saying I used Python.',
    'I used Python to ask interns to use SQL.',
    'I watched researchers using Python, SQL and Excel.',
  ]

  it.each(uncertainExecutors)('keeps an unsupported executor ambiguous: %s', (input) => {
    const result = extractExperienceSkills(input, skills)
    const subjectSkills = input === 'I used Python to ask interns to use SQL.'
      ? ['sql']
      : result.candidates.map((candidate) => candidate.skill_id)
    expect(subjectSkills.length).toBeGreaterThan(0)
    for (const skillId of subjectSkills) {
      const candidate = result.candidates.find((item) => item.skill_id === skillId)
      expect(candidate?.interpretation).toBe('ambiguous')
      expect(candidate?.evidence_text).toBe(input)
    }
  })

  it.each([
    'I used Python with my teammate.',
    'During my internship I used Python extensively.',
    'I used Python with the interns.',
    'I personally used Python alongside students.',
    'I have frequently used Python.',
    'I was using Python with developers.',
    'I have been using Python.',
  ])('retains explicit direct self-use: %s', (input) => {
    expect(extractExperienceSkills(input, skills).candidates).toEqual([
      {
        skill_id: 'python',
        interpretation: 'affirmed',
        evidence_text: input,
        rule_id: 'experience.first_person_use',
      },
    ])
  })

  it('does not affirm an unsupported passive or quoted use frame', () => {
    for (const input of [
      'I was used by developers to test Python.',
      'I said "I used Python" during the interview.',
      'I imagined I used Python.',
    ]) {
      expect(extractExperienceSkills(input, skills).candidates[0]?.interpretation, input).toBe('ambiguous')
    }
  })
})

describe('direct skill object evidence gate (D7 independent review)', () => {
  it.each([
    ['I used Python developers to complete the task.', 'python'],
    ['I used Python experts for the project.', 'python'],
    ['I have experience with Python developers.', 'python'],
    ['I worked with SQL consultants for the audit.', 'sql'],
    ['I used Microsoft Excel instructors for the workshop.', 'excel'],
    ['I worked with PowerBI trainers.', 'power_bi'],
    ['I used students who like Python.', 'python'],
    ['I used a tutor who teaches Python.', 'python'],
    ['I used advice about Python.', 'python'],
    ['I worked with consultants experienced in SQL.', 'sql'],
    ['I applied advice from Microsoft Excel experts.', 'excel'],
    ['I used documentation about Power BI.', 'power_bi'],
  ])('keeps an unsupported skill object relation ambiguous: %s', (input, skillId) => {
    const candidates = extractExperienceSkills(input, skills).candidates
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      skill_id: skillId,
      interpretation: 'ambiguous',
      evidence_text: input,
    })
  })

  it.each([
    ['I worked with Python.', 'python'],
    ['I developed in Python.', 'python'],
    ['I used Python 3.', 'python'],
    ['I used Python extensively for analysis.', 'python'],
    ['I worked with PowerBI.', 'power_bi'],
    ['I used structured query language.', 'sql'],
  ])('retains a supported direct skill object relation: %s', (input, skillId) => {
    expect(extractExperienceSkills(input, skills).candidates).toEqual([
      {
        skill_id: skillId,
        interpretation: 'affirmed',
        evidence_text: input,
        rule_id: 'experience.first_person_use',
      },
    ])
  })
})

describe('coordinated skill object head (D7 independent review)', () => {
  it.each([
    'I used Python and SQL experts to do all coding for me.',
    'I used Python and SQL developers.',
    'I used Python, SQL and Excel consultants for the project.',
    'I worked with Microsoft Excel and PowerBI trainers.',
  ])('keeps the whole uncertain coordinated noun object ambiguous: %s', (input) => {
    const candidates = extractExperienceSkills(input, skills).candidates
    expect(candidates.length).toBeGreaterThan(1)
    expect(candidates.every((candidate) => candidate.interpretation === 'ambiguous')).toBe(true)
    expect(candidates.every((candidate) => candidate.evidence_text === input)).toBe(true)
  })

  it('retains direct skill lists and an independent skill predicate', () => {
    expect(extractExperienceSkills('I used Python, SQL and Excel.', skills).candidates
      .map(({ skill_id, interpretation }) => [skill_id, interpretation]))
      .toEqual([['python', 'affirmed'], ['sql', 'affirmed'], ['excel', 'affirmed']])
    for (const input of ['I used Python, but SQL is useful.', 'I used Python and SQL is useful.']) {
      expect(extractExperienceSkills(input, skills).candidates
        .map(({ skill_id, interpretation }) => [skill_id, interpretation]))
        .toEqual([['python', 'affirmed'], ['sql', 'ambiguous']])
    }
    expect(extractExperienceSkills('I used Python and I used SQL.', skills).candidates
      .map(({ skill_id, interpretation }) => [skill_id, interpretation]))
      .toEqual([['python', 'affirmed'], ['sql', 'affirmed']])
  })
})

describe('comma context attribution (D7 independent review)', () => {
  it.each([
    ['My mentor said, I used Python.', 'python'],
    ['Students wrote, I used Python.', 'python'],
    ['My supervisor explained, I worked with SQL.', 'sql'],
    ['A witness recalled, I used Microsoft Excel.', 'excel'],
    ['I heard a story, I used PowerBI.', 'power_bi'],
    ['During the briefing, a witness said, I used Python.', 'python'],
  ])('does not discard unsupported preceding comma context: %s', (input, skillId) => {
    expect(extractExperienceSkills(input, skills).candidates).toEqual([
      {
        skill_id: skillId,
        interpretation: 'ambiguous',
        evidence_text: input,
        rule_id: 'experience.ambiguous',
      },
    ])
  })

  it.each([
    ['During my internship, I used Python extensively.', [['python', 'affirmed']]],
    ['I used Python, I used SQL.', [['python', 'affirmed'], ['sql', 'affirmed']]],
    ['My teammate used Python, I used Excel.', [['python', 'ambiguous'], ['excel', 'affirmed']]],
    ['My teammate used Python and I used Excel.', [['python', 'ambiguous'], ['excel', 'affirmed']]],
    ['I have not used Python, I used Excel.', [['python', 'negated'], ['excel', 'affirmed']]],
    ['I plan to learn Python, but I used SQL.', [['python', 'planned'], ['sql', 'affirmed']]],
  ] as const)('retains supported contexts and explicit predicates: %s', (input, expected) => {
    expect(extractExperienceSkills(input, skills).candidates
      .map(({ skill_id, interpretation }) => [skill_id, interpretation])).toEqual(expected)
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
