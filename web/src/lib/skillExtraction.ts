import type { Skill } from '../data/types'

/**
 * Deterministic English experience-skill extraction. The rule contract is
 * copied verbatim under public/contracts/rules/experience-skill-extraction.json
 * (rule_set_version 1.0.0). This module never infers proficiency and never
 * writes confirmed skills; callers must show every candidate for explicit
 * confirmation.
 *
 * Attribution is per skill mention: affirmation requires a supported direct
 * first-person verb frame, not merely the nearest recognised pronoun. Unknown
 * words between the self-subject and use verb, nested subjects, quotations and
 * passive frames stay ambiguous. This deliberately incomplete grammar avoids
 * treating unknown third-party nouns as evidence of the writer's own use.
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
  /\b(?:he|she|they|him|her|someone|somebody|someone\s+else|others|other\s+people|a\s+(?:colleague|teammate|friend|classmate)|my\s+(?:teammate|colleague|manager|friend|classmate|professor|supervisor|team)|our\s+team|the\s+(?:team|club|company))\b/i
const NEGATION =
  /\b(?:not|never|no|none|without|haven['’]?t|hasn['’]?t|hadn['’]?t|didn['’]?t|don['’]?t|doesn['’]?t|can['’]?t|cannot)\b/i
const FUTURE =
  /\b(?:plan|plans|planned|planning|hope|hopes|hoped|want|wants|wanted|intend|intends|intended|will|would\s+like|going\s+to|aim|aims|aimed)\b/i
const AFFIRMED_USE =
  /\b(?:use|uses|used|using|work|works|worked|working|build|builds|built|create|creates|created|develop|develops|developed|analy[sz]e|analy[sz]ed|write|wrote|written|practice|practised|practiced|apply|applied|leverag(?:e|ed)|utiliz(?:e|ed)|utilis(?:e|ed)|automate|automated|design|designed|manage|managed|complete|completed|study|studied|learn|learned|learnt|experience\s+with)\b/i
const CLAUSE_BOUNDARY =
  /\s*(?:[,;]|\b(?:and|but|while|whereas|although|though|yet)\b)\s*/i
const LEADING_CONNECTOR = /^(?:and|but|while|whereas|although|though|yet|then)\b\s*/i
/** Only auxiliary words and explicit modifiers are accepted between a direct
 * self-subject and its use verb. An unknown token closes the affirmation path;
 * no list of possible third-party occupations or names can make it exhaustive.
 * Modals such as can/might are intentionally unsupported as proof of use. */
const DIRECT_SELF_BRIDGE =
  /^(?:(?:have|has|had|am|are|was|were|been|be|being|do|does|did|not|never|personally|directly|regularly|frequently|often|sometimes|previously|already|recently|currently|also|successfully|extensively)\s+)*$/i
/** Only simple personal time/work or collaboration contexts are supported
 * before I/we. Arbitrary prepositional text could contain a reporting clause
 * ("After analysts said I ..."), so unknown leading syntax stays ambiguous. */
const SELF_CONTEXT_PREFIX =
  /^(?:(?:(?:during|throughout|in|at|on|after|before)\s+(?:my|our)\s+(?:(?:first|last|previous|recent|current)\s+)?(?:internship|placement|job|role|project|course|training|studies|work)|(?:with|alongside)\s+(?:my|our)\s+(?:teammate|colleague|team|manager|classmates))\s+)?$/i
/** The skill itself must be the supported use object: unknown nouns before it
 * ("used advice about Python") or after it ("used Python developers") are
 * insufficient. Known skill-list terms are removed before these shape checks. */
const DIRECT_SKILL_BRIDGE = /^\s*(?:(?:with|in|using|via|for)\s+)?(?:(?:[/&+]|\b(?:and|or)\b)\s*)*$/i
const DIRECT_SKILL_TAIL =
  /^\s*(?:(?:[/&+]|\b(?:and|or)\b)\s*)*(?:(?:personally|directly|regularly|frequently|often|sometimes|previously|already|recently|currently|also|successfully|extensively)\b\s*)*(?:[.!]*|(?:for|with|alongside|without|in|on|at|to|by|during|through|via|after|before)\b[\s\S]*)$/i

/** Capitalised words that are not skill terms and not verb forms are potential
 * third-party executors ("I saw Alex use Python"). */
const NAME_CANDIDATE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g
/** A capitalised token directly after a preposition ("in January") is a time
 * or place phrase, not the executor of a use verb. */
const PREPOSITION_BEFORE_NAME =
  /\b(?:in|on|at|by|with|from|about|during|after|before|since|until|near|within|for|to|of|via|per|than|between|through|toward|towards|upon|across|around|along|behind|beyond|above|below|over|under|among|against)\s+$/i
/** Keep in sync with AFFIRMED_USE: a clause-initial capitalised verb form
 * ("Built dashboards ...") is an elliptical clause, not a personal name. */
const VERB_FORMS: ReadonlySet<string> = new Set([
  'use', 'uses', 'used', 'using',
  'work', 'works', 'worked', 'working',
  'build', 'builds', 'built',
  'create', 'creates', 'created',
  'develop', 'develops', 'developed',
  'analyse', 'analysed', 'analyze', 'analyzed',
  'write', 'writes', 'wrote', 'written',
  'practice', 'practised', 'practiced',
  'apply', 'applied',
  'leverage', 'leveraged',
  'utilize', 'utilized', 'utilise', 'utilised',
  'automate', 'automated',
  'design', 'designed',
  'manage', 'managed',
  'complete', 'completed',
  'study', 'studied',
  'learn', 'learned', 'learnt',
  'experience',
])

type SubjectScope = 'first' | 'third' | 'none'

interface SkillOccurrence {
  skill: Skill
  index: number
  endIndex: number
}

interface ClauseSkillResult {
  skill: Skill
  interpretation: Interpretation
  ruleId: string
}

interface ClauseClassification {
  results: ClauseSkillResult[]
  subject: SubjectScope
  /** Interpretation a following bare skill list may inherit, or null when the
   * clause mixed executors or has no attributable reading. */
  inheritedInterpretation: { interpretation: Interpretation; ruleId: string } | null
}

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

function matchedSkillOccurrences(clause: string, skills: readonly Skill[]): SkillOccurrence[] {
  const occurrences: SkillOccurrence[] = []
  for (const skill of skills) {
    let index = -1
    let endIndex = -1
    for (const term of [skill.label, ...skill.aliases]) {
      const match = aliasPattern(term).exec(clause)
      if (match && (index < 0 || match.index < index || (match.index === index && match.index + match[0].length > endIndex))) {
        index = match.index
        endIndex = match.index + match[0].length
      }
    }
    if (index >= 0) occurrences.push({ skill, index, endIndex })
  }
  return occurrences
}

function isBareSkillList(clause: string, occurrences: readonly SkillOccurrence[]): boolean {
  let remainder = clause
  for (const { skill } of occurrences) {
    for (const term of [skill.label, ...skill.aliases]) {
      remainder = remainder.replace(new RegExp(aliasPattern(term).source, 'gi'), ' ')
    }
  }
  return remainder.replace(/[\s,;.!?'’"-]/g, '').length === 0
}

function isVerbForm(name: string): boolean {
  return VERB_FORMS.has(name.toLowerCase())
}

function matchesCatalogTerm(name: string, catalogTerms: readonly string[]): boolean {
  const pattern = aliasPattern(name)
  return catalogTerms.some((term) => pattern.test(term))
}

function followsPreposition(text: string, index: number): boolean {
  return PREPOSITION_BEFORE_NAME.test(text.slice(0, index))
}

/** Nearest explicit executor strictly before `limitIndex`. First-person wins
 * only when no third-party pattern or capitalised name sits closer to the use
 * verb; anything uncertain returns null and stays ambiguous. */
function nearestSubjectBefore(
  text: string,
  limitIndex: number,
  catalogTerms: readonly string[],
): 'first' | 'third' | null {
  const prefix = text.slice(0, limitIndex)
  let bestKind: 'first' | 'third' | null = null
  let bestIndex = -1
  const consider = (kind: 'first' | 'third', at: number) => {
    if (at > bestIndex) {
      bestIndex = at
      bestKind = kind
    }
  }
  for (const match of prefix.matchAll(new RegExp(FIRST_PERSON.source, 'gi'))) {
    consider('first', match.index ?? 0)
  }
  for (const match of prefix.matchAll(new RegExp(THIRD_PERSON_SUBJECT.source, 'gi'))) {
    consider('third', match.index ?? 0)
  }
  for (const match of prefix.matchAll(new RegExp(NAME_CANDIDATE.source, 'g'))) {
    const candidate = match[0]
    if (
      /^(?:i|we)$/i.test(candidate) ||
      isVerbForm(candidate) ||
      matchesCatalogTerm(candidate, catalogTerms) ||
      followsPreposition(text, match.index ?? 0)
    ) {
      continue
    }
    consider('third', match.index ?? 0)
  }
  return bestKind
}

/** Positive evidence for a direct self-executed verb. Unlike a nearest-subject
 * heuristic, this accepts only an explicit, supported connection from I/we to
 * the verb. Reporting/request/perception verbs and arbitrary noun phrases
 * cannot be skipped on the way to a later use verb. */
function hasDirectSelfFrame(clause: string, verbIndex: number, verb: string): boolean {
  const prefix = clause.slice(0, verbIndex)
  const selfSubjects = [...prefix.matchAll(new RegExp(FIRST_PERSON.source, 'gi'))]
  if (selfSubjects.length !== 1) return false
  const self = selfSubjects[0]
  const subjectIndex = self.index ?? 0
  if (!SELF_CONTEXT_PREFIX.test(prefix.slice(0, subjectIndex))) return false
  const bridge = prefix.slice(subjectIndex + self[0].length).trimStart()
  if (!DIRECT_SELF_BRIDGE.test(bridge)) return false
  // Be + a past/base form is potentially passive ("I was used by ..."). Only
  // a supported progressive verb can follow be in an affirmed direct frame.
  if (/\b(?:am|are|was|were|been|be|being)\b/i.test(bridge) && !/ing$/i.test(verb)) return false
  return true
}

function withoutCatalogTerms(text: string, catalogTerms: readonly string[]): string {
  let remainder = text
  // Prefer the full alias: removing "Python" before "Python 3" would leave a
  // spurious number and reject an otherwise supported canonical alias.
  for (const term of [...catalogTerms].sort((left, right) => right.length - left.length)) {
    remainder = remainder.replace(new RegExp(aliasPattern(term).source, 'gi'), ' ')
  }
  return remainder
}

function hasDirectSkillObjectFrame(
  clause: string,
  verbEndIndex: number,
  skillIndex: number,
  skillEndIndex: number,
  catalogTerms: readonly string[],
): boolean {
  const bridge = withoutCatalogTerms(clause.slice(verbEndIndex, skillIndex), catalogTerms)
  const tail = withoutCatalogTerms(clause.slice(skillEndIndex), catalogTerms)
  return DIRECT_SKILL_BRIDGE.test(bridge) && DIRECT_SKILL_TAIL.test(tail)
}

/** A noun head at the end of a coordinated object may govern all preceding
 * skills ("Python and SQL experts"). Do not affirm the earlier list members
 * after clause splitting hides that head. A clear new predicate, such as
 * "SQL is useful", remains an independent clause. */
function hasUncertainCoordinatedObjectHead(
  clause: string,
  occurrences: readonly SkillOccurrence[],
  catalogTerms: readonly string[],
): boolean {
  const first = occurrences.find((occurrence) => occurrence.index === 0)
  if (!first || isBareSkillList(clause, occurrences)) return false
  const tail = withoutCatalogTerms(clause.slice(first.endIndex), catalogTerms)
  if (/^\s*(?:is|are|was|were|has|have|had|does|do|did|can|could|will|would|should|must|may|might)\b/i.test(tail)) return false
  return !DIRECT_SKILL_TAIL.test(tail)
}

/** Who executes the use verb governing the skill mention at `skillIndex`?
 * Recognised third-party subjects retain their explanation. A first-person
 * result must additionally pass the positive direct-frame check. */
function governingSubject(
  clause: string,
  skillIndex: number,
  skillEndIndex: number,
  catalogTerms: readonly string[],
): 'first' | 'third' | null {
  const useVerbs = new RegExp(AFFIRMED_USE.source, 'gi')
  let verbIndex = -1
  let verb = ''
  for (let match = useVerbs.exec(clause); match !== null; match = useVerbs.exec(clause)) {
    if (match.index >= skillIndex) break
    verbIndex = match.index
    verb = match[0]
  }
  if (verbIndex < 0) return null
  const nearest = nearestSubjectBefore(clause, verbIndex, catalogTerms)
  if (nearest === 'first' && (
    !hasDirectSelfFrame(clause, verbIndex, verb) ||
    !hasDirectSkillObjectFrame(clause, verbIndex + verb.length, skillIndex, skillEndIndex, catalogTerms)
  )) return null
  return nearest
}

/** A comma can introduce a reported utterance as well as a new clause. Only
 * supported personal context, a skill list, or an already attributable skill
 * use can release the following direct-I clause from that uncertainty. */
function hasSupportedCommaContext(
  clause: string,
  occurrences: readonly SkillOccurrence[],
  catalogTerms: readonly string[],
): boolean {
  if (SELF_CONTEXT_PREFIX.test(`${clause} `)) return true
  if (occurrences.length === 0) return false
  if (isBareSkillList(clause, occurrences)) return true
  return occurrences.every((occurrence) => {
    const subject = governingSubject(clause, occurrence.index, occurrence.endIndex, catalogTerms)
    return subject === 'first' || subject === 'third'
  })
}

function uniformInterpretation(
  results: readonly ClauseSkillResult[],
): { interpretation: Interpretation; ruleId: string } | null {
  const first = results[0]
  if (!first) return null
  return results.every((result) => result.interpretation === first.interpretation && result.ruleId === first.ruleId)
    ? { interpretation: first.interpretation, ruleId: first.ruleId }
    : null
}

function classifyClause(
  clause: string,
  occurrences: readonly SkillOccurrence[],
  catalogTerms: readonly string[],
  inheritedSubject: SubjectScope,
  inherited: { interpretation: Interpretation; ruleId: string } | null,
): ClauseClassification {
  const hasFirstPerson = FIRST_PERSON.test(clause)
  const hasThirdPerson = THIRD_PERSON_SUBJECT.test(clause)
  const negated = NEGATION.test(clause)
  const planned = FUTURE.test(clause)
  const governors = occurrences.map((occurrence) => governingSubject(clause, occurrence.index, occurrence.endIndex, catalogTerms))

  if (!hasFirstPerson && !hasThirdPerson) {
    // A named third-party executor inside a pronoun-free clause still decides:
    // "Alex used Python" is never self-evidence.
    if (governors.includes('third')) {
      return {
        results: occurrences.map(({ skill }) => ({ skill, interpretation: 'ambiguous', ruleId: 'experience.third_person' })),
        subject: 'third',
        inheritedInterpretation: { interpretation: 'ambiguous', ruleId: 'experience.third_person' },
      }
    }
    // A subjectless list fragment and an elliptical verb phrase may inherit the
    // nearest explicit self-subject, but only when that scope is first-person
    // and only for negation, future intent, or a bare skill list.
    const subject = inheritedSubject
    if (subject === 'first' && negated) {
      return {
        results: occurrences.map(({ skill }) => ({ skill, interpretation: 'negated', ruleId: 'experience.negation' })),
        subject,
        inheritedInterpretation: { interpretation: 'negated', ruleId: 'experience.negation' },
      }
    }
    if (subject === 'first' && planned) {
      return {
        results: occurrences.map(({ skill }) => ({ skill, interpretation: 'planned', ruleId: 'experience.future_intent' })),
        subject,
        inheritedInterpretation: { interpretation: 'planned', ruleId: 'experience.future_intent' },
      }
    }
    if (subject === 'first' && occurrences.length > 0 && isBareSkillList(clause, occurrences) && inherited) {
      return {
        results: occurrences.map(({ skill }) => ({ skill, interpretation: inherited.interpretation, ruleId: inherited.ruleId })),
        subject,
        inheritedInterpretation: { ...inherited },
      }
    }
    // Ambiguous fall-through must not leave a stale self-scope behind.
    return {
      results: occurrences.map(({ skill }) => ({ skill, interpretation: 'ambiguous', ruleId: 'experience.ambiguous' })),
      subject: 'none',
      inheritedInterpretation: { interpretation: 'ambiguous', ruleId: 'experience.ambiguous' },
    }
  }

  const results: ClauseSkillResult[] = occurrences.map((occurrence, position) => {
    const governor = governors[position]
    if (governor === 'third') {
      return { skill: occurrence.skill, interpretation: 'ambiguous', ruleId: 'experience.third_person' }
    }
    if (governor === 'first') {
      if (negated) return { skill: occurrence.skill, interpretation: 'negated', ruleId: 'experience.negation' }
      if (planned) return { skill: occurrence.skill, interpretation: 'planned', ruleId: 'experience.future_intent' }
      return { skill: occurrence.skill, interpretation: 'affirmed', ruleId: 'experience.first_person_use' }
    }
    // No attributable use verb before the mention. Without a third-party
    // subject the clause-level reading still covers negation and plans, but it
    // can never reach affirmed on word co-occurrence alone.
    if (!hasFirstPerson) {
      return { skill: occurrence.skill, interpretation: 'ambiguous', ruleId: 'experience.third_person' }
    }
    if (negated) return { skill: occurrence.skill, interpretation: 'negated', ruleId: 'experience.negation' }
    if (planned) return { skill: occurrence.skill, interpretation: 'planned', ruleId: 'experience.future_intent' }
    return { skill: occurrence.skill, interpretation: 'ambiguous', ruleId: 'experience.ambiguous' }
  })

  let subject: SubjectScope
  if (governors.includes('first') && governors.includes('third')) subject = 'none'
  else if (governors.includes('first')) subject = 'first'
  else if (governors.includes('third')) subject = 'third'
  else subject = hasFirstPerson ? 'first' : 'third'

  return { results, subject, inheritedInterpretation: uniformInterpretation(results) }
}

function candidatesForSentence(
  sentence: string,
  skills: readonly Skill[],
  catalogTerms: readonly string[],
): ExperienceSkillCandidate[] {
  let inheritedSubject: SubjectScope = 'none'
  let inherited: { interpretation: Interpretation; ruleId: string } | null = null
  let previousClauseEnd = 0
  let previousCommaContextSupported = true
  let coordinatedAffirmations: ClauseSkillResult[] = []
  const classified: ClauseSkillResult[] = []
  const seen = new Set<string>()
  const matches: ExperienceSkillCandidate[] = []

  for (const clause of clauseParts(sentence)) {
    const clauseIndex = sentence.indexOf(clause, previousClauseEnd)
    const connector = sentence.slice(previousClauseEnd, clauseIndex)
    previousClauseEnd = clauseIndex + clause.length
    const unsupportedCommaContext: boolean = /^\s*,\s*$/.test(connector) && !previousCommaContextSupported
    // Only comma/and object-list continuations can share a trailing noun head.
    // Semicolons, but, while and other boundaries start a separate group.
    if (!/^\s*(?:,\s*)?(?:and\s*)?$/i.test(connector)) coordinatedAffirmations = []
    const occurrences = matchedSkillOccurrences(clause, skills)
    const scope = classifyClause(clause, occurrences, catalogTerms, inheritedSubject, inherited)
    if (unsupportedCommaContext) {
      for (const result of scope.results) {
        if (result.interpretation === 'affirmed') {
          result.interpretation = 'ambiguous'
          result.ruleId = 'experience.ambiguous'
        }
      }
      scope.inheritedInterpretation = uniformInterpretation(scope.results)
    }
    // Keep an unsupported reported context across successive commas; a new
    // sentence or explicit coordination boundary establishes its own scope.
    previousCommaContextSupported = !unsupportedCommaContext && hasSupportedCommaContext(clause, occurrences, catalogTerms)
    inheritedSubject = scope.subject
    if (occurrences.length === 0) {
      coordinatedAffirmations = []
      continue
    }
    if (hasUncertainCoordinatedObjectHead(clause, occurrences, catalogTerms)) {
      for (const result of coordinatedAffirmations) {
        result.interpretation = 'ambiguous'
        result.ruleId = 'experience.ambiguous'
      }
    }
    const affirmed = scope.results.filter((result) => result.interpretation === 'affirmed')
    coordinatedAffirmations = isBareSkillList(clause, occurrences)
      ? [...coordinatedAffirmations, ...affirmed]
      : affirmed
    if (scope.inheritedInterpretation) inherited = scope.inheritedInterpretation
    classified.push(...scope.results)
  }
  // Deduplicate after coordinated-object fallback so a changed interpretation
  // never leaves duplicate candidates under a stale affirmation key.
  for (const result of classified) {
    const key = `${result.skill.skill_id}:${result.interpretation}`
    if (seen.has(key)) continue
    seen.add(key)
    matches.push({
      skill_id: result.skill.skill_id,
      interpretation: result.interpretation,
      evidence_text: sentence,
      rule_id: result.ruleId,
    })
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

  const catalogTerms = skills
    .flatMap((skill) => [skill.label, ...skill.aliases])
    .map((term) => term.toLowerCase())
  const candidates = sentenceParts(text).flatMap((sentence) =>
    candidatesForSentence(sentence, skills, catalogTerms),
  )
  return {
    input_text: text,
    input_language: 'en',
    language_notice: false,
    candidates,
  }
}
