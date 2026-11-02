import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

// These are isolated command/output tests using a stub SDK and matrices.
// They do not run, replace, or count as the real local-stack RLS acceptance.
const temporary: string[] = []
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'utsc-rls-cli-'))
  temporary.push(root)
  const tests = path.join(root, 'web', 'tests')
  fs.mkdirSync(tests, { recursive: true })
  for (const name of ['rls-acceptance.mjs', 'report-output.mjs']) {
    fs.copyFileSync(fileURLToPath(new URL(name, import.meta.url)), path.join(tests, name))
  }
  fs.writeFileSync(path.join(tests, 'rls-matrix.mjs'), `export async function runMatrix() { return { allPassed: process.env.STUB_FAILURE !== '1', checks: [{ name: 'stub assertion', passed: process.env.STUB_FAILURE !== '1' }] } }`)
  fs.writeFileSync(path.join(tests, 'a3-rls-matrix.mjs'), `export async function runA3Matrix() { return { allPassed: true, checks: [{ name: 'stub A3 assertion', passed: true }] } }`)
  fs.writeFileSync(path.join(tests, 'a4-rls-matrix.mjs'), `export async function runA4Matrix() { return { allPassed: true, checks: [{ name: 'stub A4 assertion', passed: true }] } }`)
  fs.writeFileSync(path.join(root, 'web', 'package.json'), '{}')
  const sdk = path.join(root, 'web', 'node_modules', '@supabase', 'supabase-js')
  fs.mkdirSync(sdk, { recursive: true })
  fs.writeFileSync(path.join(sdk, 'index.js'), `exports.createClient = () => ({ from: () => ({ select: () => ({ limit: async () => ({ error: process.env.STUB_UNREACHABLE === '1' ? { message: 'stub unavailable' } : null }) }) }) })`)
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (key.startsWith('UTSC_SUPABASE_')) delete env[key]
  return {
    root,
    run(args: string[] = [], overrides: NodeJS.ProcessEnv = {}) {
      return spawnSync(process.execPath, [path.join(tests, 'rls-acceptance.mjs'), ...args], { cwd: root, encoding: 'utf8', env: { ...env, ...overrides } })
    },
  }
}
const credentials = { UTSC_SUPABASE_URL: 'http://127.0.0.1:55421', UTSC_SUPABASE_PUBLISHABLE_KEY: 'stub-public', UTSC_SUPABASE_SERVICE_ROLE_KEY: 'stub-secret' }
afterEach(() => {
  for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe('RLS CLI output and strict exits (stub services)', () => {
  it('uses a fresh default directory for each missing-credential failure', () => {
    const local = fixture()
    expect(local.run().status).toBe(2)
    expect(local.run().status).toBe(2)
    const directories = fs.readdirSync(path.join(local.root, 'artifacts'))
    expect(directories).toHaveLength(2)
    for (const directory of directories) {
      const report = JSON.parse(fs.readFileSync(path.join(local.root, 'artifacts', directory, 'rls-acceptance.json'), 'utf8'))
      expect(report).toMatchObject({ exitCode: 2, allPassed: false })
      expect(report.error).toContain('missing credentials')
    }
  })

  it('honors the explicit output path on success and rejects an existing report on failure', () => {
    const local = fixture()
    const file = path.join(local.root, 'chosen.json')
    expect(local.run(['--out', file], credentials).status).toBe(0)
    const original = fs.readFileSync(file, 'utf8')
    expect(JSON.parse(original)).toMatchObject({ total: 3, passed: 3, failed: 0, allPassed: true })
    const repeated = local.run(['--out', file], { ...credentials, STUB_FAILURE: '1' })
    expect(repeated.status).toBe(2)
    expect(repeated.stderr).toContain('Refusing to overwrite')
    expect(fs.readFileSync(file, 'utf8')).toBe(original)
  })

  it('returns 3 and records failure when the stack preflight is unavailable', () => {
    const local = fixture()
    expect(local.run(['--out', 'unavailable.json'], { ...credentials, STUB_UNREACHABLE: '1' }).status).toBe(3)
    expect(JSON.parse(fs.readFileSync(path.join(local.root, 'unavailable.json'), 'utf8'))).toMatchObject({ exitCode: 3, allPassed: false })
  })

  it('returns 1 when a matrix assertion fails', () => {
    const local = fixture()
    expect(local.run(['--out=failed.json'], { ...credentials, STUB_FAILURE: '1' }).status).toBe(1)
    expect(JSON.parse(fs.readFileSync(path.join(local.root, 'failed.json'), 'utf8'))).toMatchObject({ passed: 2, failed: 1, allPassed: false })
  })

  it('rejects missing and duplicate output paths before creating artifacts', () => {
    const local = fixture()
    expect(local.run(['--out']).status).toBe(2)
    expect(local.run(['--out', 'a.json', '--out', 'b.json']).status).toBe(2)
    expect(fs.existsSync(path.join(local.root, 'artifacts'))).toBe(false)
    expect(fs.existsSync(path.join(local.root, 'a.json'))).toBe(false)
  })

  it('keeps the npm entry free of a hidden historical --out option', () => {
    let directory = path.dirname(fileURLToPath(import.meta.url))
    while (!fs.existsSync(path.join(directory, 'AGENTS.md'))) {
      const parent = path.dirname(directory)
      if (parent === directory) throw new Error('Cannot find repository root')
      directory = parent
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'))
    expect(manifest.scripts['test:rls-acceptance']).toBe('node web/tests/rls-acceptance.mjs')
  })
})
