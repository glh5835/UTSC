import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const target = process.argv[2]
if (process.argv.length !== 3 || !['production', 'staging'].includes(target)) {
  throw new Error('Specify exactly one deployment target: production or staging')
}

const { WORKERS_CI, WORKERS_CI_BRANCH, WORKERS_CI_COMMIT_SHA } = process.env
if (WORKERS_CI !== '1' || WORKERS_CI_BRANCH !== `release/${target}` || !/^[a-f0-9]{40}$/.test(WORKERS_CI_COMMIT_SHA ?? '')) {
  throw new Error('Deployment requires Workers Builds on the matching protected release branch')
}

const readJson = (name) => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'))
const release = readJson('../web/production-dist/deployment.json')
const pin = readJson('../web/deployment/production-release.json')
const expectedOrigin = process.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
if (!expectedOrigin || release.target !== target || release.codeCommit !== WORKERS_CI_COMMIT_SHA ||
    release.supabaseOrigin !== expectedOrigin ||
    !['datasetVersion', 'contractCommit', 'bundleSha256', 'inventorySha256'].every(key => release[key] && release[key] === pin[key])) {
  throw new Error('Deployment receipt does not match the current target, commit and approved pin')
}

const environment = { ...process.env, WRANGLER_SEND_METRICS: 'false' }
delete environment.UTSC_RELEASE_ARTIFACT_TOKEN
delete environment.UTSC_RELEASE_ARTIFACT_ORIGIN
const result = spawnSync('npx', ['--yes', 'wrangler@4.168.0', 'deploy', '--config', `web/wrangler.${target}.jsonc`], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), env: environment, stdio: 'inherit',
})
if (result.error) throw new Error('Could not start the pinned Wrangler deploy command')
process.exitCode = result.status ?? 1
