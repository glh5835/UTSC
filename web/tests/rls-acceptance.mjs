#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { runMatrix } from './rls-matrix.mjs'
import { runA3Matrix } from './a3-rls-matrix.mjs'

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
 *   node web/tests/rls-acceptance.mjs [--out artifacts/a1-remediation-20261028/rls-acceptance.json]
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
  const outIdx = process.argv.indexOf('--out')
  const outFile = outIdx >= 0 ? path.resolve(process.argv[outIdx + 1]) : null
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
    console.error(`RLS ACCEPTANCE FAILED: missing credentials: ${missing.join(', ')}`)
    console.error('Provide them via environment variables or web/.env.local (npx supabase status -o env).')
    process.exit(2)
  }
  if (!/^http:\/\/127\.0\.0\.1:55421/.test(url)) {
    console.error(`RLS ACCEPTANCE FAILED: refusing to run against unexpected URL ${url}; only the isolated local stack http://127.0.0.1:55421 may be tested.`)
    process.exit(2)
  }

  const require = createRequire(path.join(root, 'web', 'package.json'))
  const { createClient } = require('@supabase/supabase-js')

  const started = new Date().toISOString()
  console.log(`RLS acceptance: running full matrix against ${url} (started ${started})`)
  const a1 = await runMatrix(
    { url, publicKey, secret, createClient },
    (line) => console.log('  [A1] ' + line),
  )
  const a3 = await runA3Matrix(
    { url, publicKey, secret, createClient },
    (line) => console.log('  [A3] ' + line),
  )
  const finished = new Date().toISOString()
  const checks = [...a1.checks, ...a3.checks]
  const passed = checks.filter((c) => c.passed).length
  const failed = checks.filter((c) => !c.passed)
  const summary = {
    started,
    finished,
    url,
    total: checks.length,
    passed,
    failed: failed.length,
    allPassed: a1.allPassed && a3.allPassed && failed.length === 0,
    groups: { a1: { total: a1.checks.length, passed: a1.checks.filter((c) => c.passed).length }, a3: { total: a3.checks.length, passed: a3.checks.filter((c) => c.passed).length } },
    failedChecks: failed,
    checks,
  }
  if (outFile) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true })
    fs.writeFileSync(outFile, JSON.stringify(summary, null, 2), 'utf8')
  }
  if (!summary.allPassed) {
    console.error(`RLS ACCEPTANCE FAILED: ${passed}/${checks.length} checks passed; failures:`)
    for (const f of failed) console.error(`  - ${f.name}: ${f.message}`)
    if (outFile) console.error(`Report: ${outFile}`)
    process.exit(1)
  }
  console.log(`RLS ACCEPTANCE PASSED: ${passed}/${checks.length} checks across A1 and A3 (real signup + password login, two-account isolation, anonymous, metadata escalation, A3 course/experience/skill source integrity, cascade deletion).`)
  if (outFile) console.log(`Report: ${outFile}`)
}

main().catch((error) => {
  console.error(`RLS ACCEPTANCE FAILED: ${error?.stack ?? error}`)
  process.exit(1)
})
