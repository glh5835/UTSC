import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_TYPE_LABELS,
  BEGINNER_LEVEL_LABELS,
  CAREER_LEVEL_LABELS,
  DATE_PRECISION_LABELS,
  DESCRIPTION_STATUS_LABELS,
  FORMAT_LABELS,
  LEVEL_LABELS,
  MARKET_AREA_LABELS,
  OPPORTUNITY_KIND_LABELS,
  RESOURCE_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
  ROLE_LABELS,
  ROLE_SUBTYPE_LABELS,
  SKILL_CATEGORY_LABELS,
  TOPIC_LABELS,
} from '../src/data/labels'
import type { BilingualLabel } from '../src/data/labels'

/**
 * The UI label maps must cover every enum value of the shipped contract
 * schemas. A new enum value upstream therefore fails here instead of
 * rendering as an untranslated raw id in the interface. Canonical enum ids
 * are never renamed by this layer; maps only add display labels.
 */

function readSchema(relativeUrl: string): {
  $defs?: Record<string, { enum?: string[] }>
  properties?: Record<string, { enum?: string[] }>
} {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), 'utf8'))
}

const common = readSchema('../public/contracts/schemas/common.schema.json')
const resource = readSchema('../public/contracts/schemas/resource.schema.json')
const marketJob = readSchema('../public/contracts/schemas/market-job.schema.json')

function expectCovers(map: Record<string, BilingualLabel>, defName: string): void {
  const values = common.$defs?.[defName]?.enum
  if (!values) throw new Error(`common.schema.json $defs.${defName}.enum not found`)
  // Nullable enums (e.g. role_subtype allows null) render as an unset dash in
  // the UI, so only string members need display labels.
  const stringValues = values.filter((value): value is string => typeof value === 'string')
  expect(Object.keys(map).sort()).toEqual(stringValues.sort())
  for (const value of stringValues) {
    expect(map[value].en.length).toBeGreaterThan(0)
    expect(map[value].zh.length).toBeGreaterThan(0)
  }
}

describe('label coverage against shipped contract schemas', () => {
  it('role labels cover exactly the eight shared role ids', () => {
    expectCovers(ROLE_LABELS, 'roleId')
    expect(Object.keys(ROLE_LABELS)).toHaveLength(8)
  })

  it('role subtype labels cover the financial/risk subtypes', () => {
    expectCovers(ROLE_SUBTYPE_LABELS, 'roleSubtype')
  })

  it('career level labels cover the shared career levels', () => {
    expectCovers(CAREER_LEVEL_LABELS, 'careerLevel')
  })

  it('market area labels cover the shared market areas', () => {
    expectCovers(MARKET_AREA_LABELS, 'marketArea')
  })

  it('date precision labels cover the shared precisions', () => {
    expectCovers(DATE_PRECISION_LABELS, 'datePrecision')
  })

  it('opportunity kind labels cover the shared kinds', () => {
    expectCovers(OPPORTUNITY_KIND_LABELS, 'opportunityKind')
  })

  it('activity type labels cover the nine shared activity types', () => {
    expectCovers(ACTIVITY_TYPE_LABELS, 'activityTypeId')
  })

  it('topic labels cover the seven shared topics', () => {
    expectCovers(TOPIC_LABELS, 'topicId')
  })

  it('beginner level labels cover the shared levels', () => {
    expectCovers(BEGINNER_LEVEL_LABELS, 'beginnerLevel')
  })

  it('format labels cover the shared participation formats', () => {
    expectCovers(FORMAT_LABELS, 'format')
  })

  it('review status labels cover the shared review states', () => {
    expectCovers(REVIEW_STATUS_LABELS, 'reviewStatus')
  })

  it('description status labels cover the market-job description states', () => {
    const values = marketJob.properties?.description_status?.enum
    if (!values) throw new Error('market-job description_status enum not found')
    expect(Object.keys(DESCRIPTION_STATUS_LABELS).sort()).toEqual([...values].sort())
  })

  it('resource type and level labels cover the resource schema enums', () => {
    const types = resource.properties?.resource_type?.enum
    const levels = resource.properties?.level?.enum
    if (!types || !levels) throw new Error('resource.schema.json enums not found')
    expect(Object.keys(RESOURCE_TYPE_LABELS).sort()).toEqual([...types].sort())
    expect(Object.keys(LEVEL_LABELS).sort()).toEqual([...levels].sort())
  })

  it('skill category labels cover technical and soft', () => {
    const values = readSchema('../public/contracts/schemas/skill.schema.json').properties?.category?.enum
    if (!values) throw new Error('skill category enum not found')
    expect(Object.keys(SKILL_CATEGORY_LABELS).sort()).toEqual([...values].sort())
  })
})
