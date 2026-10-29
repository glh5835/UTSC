#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { runMatrix } from './rls-matrix.mjs'
import { runA3Matrix } from './a3-rls-matrix.mjs'
import { runA4Matrix } from './a4-rls-matrix.mjs'
import { reserveReportOutput } from './report-output.mjs'

/**
 * Independent A1 + A3 RLS acceptance command (2026-10-28 review requirements).
 *
 * Unlike the vitest suite (which SKIPS quietly when credentials are absent),
 * this command FAILS LOUDLY and exits non-zero when:
 *   - credentials are missing (exit 2),
 *   - the stack is unreachable or migrations are missing (exit 3),
 *   - ANY matrix check fails (exit 1).
 * A green exit therefore means the full matrix actually ran and passed.
 *
 * Usage (repo root):
 *   npm run test:rls-acceptance
 *   npm run test:rls-acceptance -- --out artifacts/new-review/rls-acceptance.json
 * Default: a unique artifacts/rls-acceptance-<UTC timestamp>-<random>/ directory.
 * An existing report is refused before any service request, including on failure.
 *
 * Credentials (in priority order): process env UTSC_SUPABASE_URL /
 * UTSC_SUPABASE_PUBLISHABLE_KEY / UTSC_SUPABASE_SERVICE_ROLE_KEY, else
 * web/.env.local. Values are never printed.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function loadEnv() {
  const values = {}
  for (const key of ['UTSC_SUPABASE_URL', 'UTSC_SUPABASE_PUBLISHABLE_KEY', 'UTSC_SUPABASE_SERVICE_ROLE_KEY']) {
    if (process.env[key]) values[key] = process.env[key]
  }
  const envLocal = path.join(root, 'web', '.env.local')
  if (fs.existsSync(envLocal)) {
    for (const line of fs.readFileSync(envLocal, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z_]+)=(.*)$/)
      if (match && values[match[1]] === undefined) {
        values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
      }
    }
  }
  return values
}

async function main() {
  let output
  try {
    output = reserveReportOutput(process.argv.slice(2), { root })
  } catch (error) {
    console.error(`RLS ACCEPTANCE FAILED: ${error.message}`)
    process.exitCode = 2
    return
  }
  const outFile = output.file
  const started = new Date().toISOString()
  function fail(message, exitCode) {
    output.write({ started, finished: new Date().toISOString(), status: 'failed', exitCode, allPassed: false, error: message })
    console.error(`RLS ACCEPTANCE FAILED: ${message}`)
    console.error(`Report: ${outFile}`)
    process.exitCode = exitCode
  }
  try {
  const env = loadEnv()
  const url = env.UTSC_SUPABASE_URL
  const publicKey = env.UTSC_SUPABASE_PUBLISHABLE_KEY
  const secret = env.UTSC_SUPABASE_SERVICE_ROLE_KEY

  const missing = [
    !url && 'UTSC_SUPABASE_URL',
    !publicKey && 'UTSC_SUPABASE_PUBLISHABLE_KEY',
    !secret && 'UTSC_SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean)
  if (missing.length > 0) {
    fail(`missing credentials: ${missing.join(', ')}`, 2)
    console.error('Provide them via environment variables or web/.env.local (npx supabase status -o env).')
    return
  }
  if (url !== 'http://127.0.0.1:55421') {
    fail('refusing an unexpected URL; only the isolated local stack http://127.0.0.1:55421 may be tested.', 2)
    return
  }

  const require = createRequire(path.join(root, 'web', 'package.json'))
  const { createClient } = require('@supabase/supabase-js')

  const preflight = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    const result = await preflight.from('profiles').select('id').limit(1)
    if (result.error) {
      fail('local stack unreachable, credentials refused, or migrations missing', 3)
      return
    }
  } catch {
    fail('local stack unreachable, credentials refused, or migrations missing', 3)
    return
  }
  console.log(`RLS acceptance: running full matrix against ${url} (started ${started})`)
  const a1 = await runMatrix(
    { url, publicKey, secret, createClient },
    (line) => console.log('  [A1] ' + line),
  )
  const a3 = await runA3Matrix(
    { url, publicKey, secret, createClient },
    (line) => console.log('  [A3] ' + line),
  )
  const a4 = await runA4Matrix(
    { url, publicKey, secret, createClient },
    (line) => console.log('  [A4] ' + line),
  )
  const finished = new Date().toISOString()
  const checks = [...a1.checks, ...a3.checks, ...a4.checks]
  const passed = checks.filter((c) => c.passed).length
  const failed = checks.filter((c) => !c.passed)
  const summary = {
    started,
    finished,
    url,
    total: checks.length,
    passed,
    failed: failed.length,
    allPassed: a1.allPassed && a3.allPassed && a4.allPassed && failed.length === 0,
    groups: {
      a1: { total: a1.checks.length, passed: a1.checks.filter((c) => c.passed).length },
      a3: { total: a3.checks.length, passed: a3.checks.filter((c) => c.passed).length },
      a4: { total: a4.checks.length, passed: a4.checks.filter((c) => c.passed).length },
    },
    failedChecks: failed,
    checks,
  }
  output.write(summary)
  if (!summary.allPassed) {
    console.error(`RLS ACCEPTANCE FAILED: ${passed}/${checks.length} checks passed; failures:`)
    for (const f of failed) console.error(`  - ${f.name}: ${f.message}`)
    console.error(`Report: ${outFile}`)
    process.exitCode = 1
    return
  }
  console.log(`RLS ACCEPTANCE PASSED: ${passed}/${checks.length} checks across A1, A3 and A4 (real signup + password login, two-account isolation, anonymous, metadata escalation, A3 course/experience/skill source integrity, A4 learning-path ownership/idempotency, cascade deletion).`)
  console.log(`Report: ${outFile}`)
  } catch {
    fail('unexpected acceptance runner error; no passing result is claimed', 1)
  }
}

main().catch((error) => {
  console.error(`RLS ACCEPTANCE FAILED: ${error?.stack ?? error}`)
  process.exit(1)
})
