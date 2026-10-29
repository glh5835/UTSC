import type { UtscBundle } from './types'

/**
 * Front-end source configuration for the A0–A2 sample data.
 *
 * The three bundles are the jointly agreed contract fixtures from the data
 * side. They are SYNTHETIC by agreement (contracts/README.md: "Fixtures are
 * synthetic and must never be shown as real market or club data"), so the
 * synthetic flag lives here in the source configuration. Nothing is added to
 * the frozen contract files themselves; the JSON under public/contracts/ is a
 * verbatim copy (see public/contracts/PROVENANCE.md).
 *
 * Published versioned packages can supplement these entries after the data
 * side and website owner agree; the synthetic flag must stay false only for
 * reviewed real packages that the data side has verified.
 */

export const UPSTREAM_CONTRACT_COMMIT = 'b828553f91cf6cd6ae5b0766e7fbf4c6b1822535'

export const UPSTREAM_DATA_REPO_URL =
  'https://github.com/wangzhuxirou-svg/Canadian-Early-Career-Data-Analytics-Job-Market'

export type DataMode = 'demo' | 'integration' | 'published'

export interface DataVersionConfig {
  mode: DataMode
  schemaVersion: '1.0.0' | '1.1.0'
  schemaBasePath: string
  marketBundlePath: string
  courseBundlePath: string
  /** Bundle consumed by the A4 pathways page (skills, per-role market
   * statistics and resources). Each version context points it at its own
   * single bundle so recommendations stay inside the approved data version. */
  pathwaysBundlePath: string
  contractCommit: string
}

export const DATA_CONFIG: DataVersionConfig = {
  mode: 'demo',
  schemaVersion: '1.0.0',
  schemaBasePath: '/contracts/schemas',
  marketBundlePath: '/demo/a2-market-demo.json',
  courseBundlePath: '/contracts/fixtures/valid_bundle.json',
  pathwaysBundlePath: '/demo/a4-pathways-demo.json',
  contractCommit: UPSTREAM_CONTRACT_COMMIT,
}

export const COURSE_CATALOG_PATH = DATA_CONFIG.courseBundlePath

export interface FixtureSource {
  id: FixtureId
  /** URL path served from web/public. */
  path: string
  /** Path inside the upstream repository this file was copied from. */
  upstreamPath: string
  synthetic: boolean
}

export type FixtureId = 'valid' | 'empty' | 'invalid'

export const FIXTURE_SOURCES: FixtureSource[] = [
  {
    id: 'valid',
    path: '/contracts/fixtures/valid_bundle.json',
    upstreamPath: 'contracts/fixtures/valid_bundle.json',
    synthetic: true,
  },
  {
    id: 'empty',
    path: '/contracts/fixtures/empty_bundle.json',
    upstreamPath: 'contracts/fixtures/empty_bundle.json',
    synthetic: true,
  },
  {
    id: 'invalid',
    path: '/contracts/fixtures/invalid_bundle.json',
    upstreamPath: 'contracts/fixtures/invalid_bundle.json',
    synthetic: true,
  },
]

export function getFixtureSource(id: FixtureId): FixtureSource {
  const source = FIXTURE_SOURCES.find((s) => s.id === id)
  if (!source) {
    throw new Error(`Unknown fixture id: ${id as string}`)
  }
  return source
}

export type { UtscBundle }
