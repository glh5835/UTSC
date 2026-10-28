import type { Skill } from '../data/types'

/**
 * Deterministic English experience-skill extraction. The rule contract is
 * copied verbatim under public/contracts/rules/experience-skill-extraction.json
 * (rule_set_version 1.0.0). This module never infers proficiency and never
 * writes confirmed skills; callers must show every candidate for explicit
 * confirmation.
 */

export const EXTRACTION_RULE_SET_VERSION = '1.0.0'
export const EXTRACTION_CONTRACT_SCHEMA =
  'https://utsc.example/contracts/v1/experience-skill-extraction.schema.json'
export const MAX_EXPERIENCE_LENGTH = 5000

export type InputLanguage = 'en' | 'other' | 'unknown'
export type Interpretation = 'affirmed' | 'negated' | 'planned' | 'ambiguous'

export interface ExperienceSkillCandidate {
  skill_id: string
  interpretation: Interpretation
  evidence_text: string
  rule_id: string
}

export interface ExperienceSkillExtraction {
  input_text: string
  input_language: InputLanguage
  language_notice: boolean
  candidates: ExperienceSkillCandidate[]
}

export type ExperienceTextIssue = 'empty' | 'too_long' | null

export function experienceTextError(text: string): ExperienceTextIssue {
  if (text.trim().length === 0) return 'empty'
  if (text.length > MAX_EXPERIENCE_LENGTH) return 'too_long'
  return null
}

/** Script-based detection. Latin text without non-ASCII letters is treated
 * as English; accented Latin, CJK, Hangul, Arabic, Cyrillic, etc. are "other".
 * A manual confirmation path remains visible for unsupported languages. */
export function detectExperienceLanguage(text: string): InputLanguage {
  const visible = text.replace(/[\s\d\p{P}\p{S}]/gu, '')
  if (!visible) return 'unknown'
  return /^[A-Za-z]+$/.test(visible) ? 'en' : 'other'
}

const FIRST_PERSON = /\b(?:i|we)\b/i
const THIRD_PERSON_SUBJECT =
  /\b(?:he|she|they|someone|somebody|my\s+(?:teammate|colleague|manager|friend|classmate|professor|supervisor|team)|our\s+team|the\s+(?:team|club|company))\b/i
const NEGATION =
  /\b(?:not|never|no|none|without|haven['’]?t|hasn['’]?t|hadn['’]?t|didn['’]?t|don['’]?t|doesn['’]?t|can['’]?t|cannot)\b/i
const FUTURE =
  /\b(?:plan|plans|planned|planning|hope|hopes|hoped|want|wants|wanted|intend|intends|intended|will|would\s+like|going\s+to|aim|aims|aimed)\b/i
const AFFIRMED_USE =
  /\b(?:use|uses|used|using|work|works|worked|working|build|builds|built|create|creates|created|develop|develops|developed|analy[sz]e|analy[sz]ed|write|wrote|written|practice|practised|practiced|apply|applied|leverag(?:e|ed)|utiliz(?:e|ed)|utilis(?:e|ed)|automate|automated|design|designed|manage|managed|complete|completed|study|studied|learn|learned|learnt|experience\s+with)\b/i
const CLAUSE_BOUNDARY =
  /\s*(?:[,;]|\b(?:and|but|while|whereas|although|though|yet)\b)\s*/i
const LEADING_CONNECTOR = /^(?:and|but|while|whereas|although|though|yet|then)\b\s*/i

type SubjectScope = 'first' | 'third' | 'none'

function sentenceParts(text: string): string[] {
  return text
    .split(/(?<=[.!?])(?:\s+|\n+)|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function clauseParts(sentence: string): string[] {
  return sentence
    .split(CLAUSE_BOUNDARY)
    .map((part) => part.trim().replace(LEADING_CONNECTOR, '').trim())
    .filter((part) => /[A-Za-z0-9]/.test(part))
}

function aliasPattern(alias: string): RegExp {
  const escaped = alias.trim().split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
  return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, 'i')
}

function matchedSkills(clause: string, skills: readonly Skill[]): Skill[] {
  return skills.filter((skill) => [skill.label, ...skill.aliases].some((term) => aliasPattern(term).test(clause)))
}

function isBareSkillList(clause: string, matched: readonly Skill[]): boolean {
  let remainder = clause
  for (const skill of matched) {
    for (const term of [skill.label, ...skill.aliases]) {
      remainder = remainder.replace(new RegExp(aliasPattern(term).source, 'gi'), ' ')
    }
  }
  return remainder.replace(/[\s,;.!?'’"-]/g, '').length === 0
}

function classifyClause(
  clause: string,
  matched: readonly Skill[],
  inheritedSubject: SubjectScope,
  inherited: { interpretation: Interpretation; ruleId: string } | null,
): { interpretation: Interpretation; ruleId: string; subject: SubjectScope } {
  const hasFirstPerson = FIRST_PERSON.test(clause)
  const hasThirdPerson = THIRD_PERSON_SUBJECT.test(clause)
  const subject: SubjectScope = hasFirstPerson ? 'first' : hasThirdPerson ? 'third' : inheritedSubject
  const negated = NEGATION.test(clause)
  const planned = FUTURE.test(clause)

  // A subjectless list fragment and an elliptical verb phrase may inherit the
  // nearest explicit self-subject, but only when that scope is first-person.
  if (!hasFirstPerson && !hasThirdPerson) {
    if (subject === 'first' && negated) return { interpretation: 'negated', ruleId: 'experience.negation', subject }
    if (subject === 'first' && planned) return { interpretation: 'planned', ruleId: 'experience.future_intent', subject }
    if (subject === 'first' && isBareSkillList(clause, matched) && inherited) {
      return { ...inherited, subject }
    }
    if (subject !== 'first') return { interpretation: 'ambiguous', ruleId: hasThirdPerson ? 'experience.third_person' : 'experience.ambiguous', subject }
    return { interpretation: 'ambiguous', ruleId: 'experience.ambiguous', subject }
  }

  if (subject !== 'first') {
    return { interpretation: 'ambiguous', ruleId: 'experience.third_person', subject }
  }
  if (negated) return { interpretation: 'negated', ruleId: 'experience.negation', subject }
  if (planned) return { interpretation: 'planned', ruleId: 'experience.future_intent', subject }
  if (AFFIRMED_USE.test(clause)) return { interpretation: 'affirmed', ruleId: 'experience.first_person_use', subject }
  return { interpretation: 'ambiguous', ruleId: 'experience.ambiguous', subject }
}

function candidatesForSentence(sentence: string, skills: readonly Skill[]): ExperienceSkillCandidate[] {
  let inheritedSubject: SubjectScope = 'none'
  let inherited: { interpretation: Interpretation; ruleId: string } | null = null
  const seen = new Set<string>()
  const matches: ExperienceSkillCandidate[] = []

  for (const clause of clauseParts(sentence)) {
    const localSkills = matchedSkills(clause, skills)
    const scope = classifyClause(clause, localSkills, inheritedSubject, inherited)
    inheritedSubject = scope.subject
    const hasFirstPerson = FIRST_PERSON.test(clause)
    const hasThirdPerson = THIRD_PERSON_SUBJECT.test(clause)
    if (localSkills.length === 0) continue

    inherited = { interpretation: scope.interpretation, ruleId: scope.ruleId }
    if (!hasFirstPerson && !hasThirdPerson && scope.interpretation === 'ambiguous') {
      inheritedSubject = 'none'
    }
    for (const skill of localSkills) {
      const key = `${skill.skill_id}:${scope.interpretation}`
      if (seen.has(key)) continue
      seen.add(key)
      matches.push({
        skill_id: skill.skill_id,
        interpretation: scope.interpretation,
        evidence_text: sentence,
        rule_id: scope.ruleId,
      })
    }
  }
  return matches
}

export function extractExperienceSkills(
  text: string,
  skills: readonly Skill[],
): ExperienceSkillExtraction {
  const inputLanguage = detectExperienceLanguage(text)
  if (inputLanguage !== 'en') {
    return {
      input_text: text,
      input_language: inputLanguage,
      language_notice: true,
      candidates: [],
    }
  }

  const candidates = sentenceParts(text).flatMap((sentence) =>
    candidatesForSentence(sentence, skills),
  )
  return {
    input_text: text,
    input_language: 'en',
    language_notice: false,
    candidates,
  }
}
