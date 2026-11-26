import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, loadEnv } from 'vite'
import { verifyProductionPackage } from '../../scripts/verify_production_package.mjs'
import { publicBuildConfig } from '../src/lib/publicConfig.ts'
import { websiteConfig } from '../vite.config.ts'
import { checkDist } from './check-dist.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const pinPath = 'deployment/production-release.json'
const bundleSchemaNames = ['bundle', 'common', 'manifest', 'market-job', 'skill', 'course', 'resource', 'opportunity', 'organizer']

function requireOrigin(value) {
  try {
    const parsed = new URL(value)
    if (parsed.origin === value && parsed.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) return value
  } catch { /* the error must not disclose any provided URL */ }
  throw new Error('Release target requires a pinned HTTPS Supabase origin')
}

async function main() {
  process.chdir(root)
  if (!existsSync(pinPath)) throw new Error('No approved production release is pinned in deployment/production-release.json')
  const pinBytes = readFileSync(pinPath)
  const codeCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (process.env.UTSC_BUILD_COMMIT && codeCommit !== process.env.UTSC_BUILD_COMMIT) {
    throw new Error('Cloud build commit does not match the source checkout')
  }
  const checkedIn = execFileSync('git', ['show', `${codeCommit}:web/${pinPath}`], { stdio: ['ignore', 'pipe', 'ignore'] })
  if (!checkedIn.equals(pinBytes)) throw new Error('The approved release pin differs from the checked-in version')

  const pin = JSON.parse(pinBytes.toString('utf8'))
  const target = process.env.UTSC_DEPLOY_TARGET
  if (target !== 'production' && target !== 'staging') throw new Error('Set UTSC_DEPLOY_TARGET to production or staging')
  const origins = { production: requireOrigin(pin.supabaseOrigins?.production), staging: requireOrigin(pin.supabaseOrigins?.staging) }
  if (origins.production === origins.staging) throw new Error('Production and staging require separate Supabase origins')
  const connection = publicBuildConfig(loadEnv('production', process.cwd(), 'VITE_'), false, false)
  if (!connection.key.startsWith('sb_publishable_') || !connection.url || new URL(connection.url).origin !== origins[target]) {
    throw new Error('The selected target requires its pinned Supabase URL and publishable key')
  }

  const packageDirectory = process.env.UTSC_RELEASE_PACKAGE_DIR
  if (!packageDirectory) throw new Error('UTSC_RELEASE_PACKAGE_DIR must point to the approved data package directory')
  const release = await verifyProductionPackage(resolve(root, '..', packageDirectory), pin)
  const bundlePath = `/releases/${pin.datasetVersion}-${pin.bundleSha256}/bundle.json`
  const schemaBasePath = '/contracts/2.0.0/schemas'
  const deploymentPath = '/deployment.json'
  const config = {
    mode: 'published', schemaVersion: '2.0.0', schemaBasePath, contractCommit: pin.contractCommit,
    datasetVersion: pin.datasetVersion, runStatus: 'complete',
    marketBundlePath: bundlePath, courseBundlePath: bundlePath, pathwaysBundlePath: bundlePath,
    opportunitiesBundlePath: bundlePath, opportunityReviews: release.opportunityReviews, deploymentPath,
  }

  const lock = join(root, '.production-build-lock')
  mkdirSync(lock)
  try {
    const output = mkdtempSync(join(root, '.production-build-'))
    try {
      await build({ ...websiteConfig('production', 'build', { config, target, output }), configFile: false, mode: 'production' })
      mkdirSync(dirname(join(output, bundlePath.slice(1))), { recursive: true })
      mkdirSync(join(output, schemaBasePath.slice(1)), { recursive: true })
      writeFileSync(join(output, bundlePath.slice(1)), release.bundleBytes, { flag: 'wx' })
      const publicFiles = [bundlePath.slice(1), deploymentPath.slice(1)]
      for (const name of bundleSchemaNames) {
        const file = `${name}.schema.json`
        const destination = `${schemaBasePath.slice(1)}/${file}`
        const bytes = release.schemaBytes.get(file)
        if (!bytes) throw new Error(`Missing production schema ${file}`)
        writeFileSync(join(output, destination), bytes, { flag: 'wx' })
        publicFiles.push(destination)
      }
      writeFileSync(join(output, 'robots.txt'), `User-agent: *\nDisallow: ${target === 'staging' ? '/' : ''}\n`, { flag: 'wx' })
      const receipt = {
        target, supabaseOrigin: origins[target], codeCommit, contractCommit: pin.contractCommit,
        datasetVersion: pin.datasetVersion, bundleSha256: pin.bundleSha256, inventorySha256: pin.inventorySha256,
      }
      writeFileSync(join(output, deploymentPath.slice(1)), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' })
      checkDist(output, { publicFiles, target, key: connection.key })
      const destination = join(root, 'production-dist')
      const backup = join(lock, 'previous-dist')
      if (existsSync(destination)) {
        if (!lstatSync(destination).isDirectory()) throw new Error('Expected a regular production-dist directory')
        renameSync(destination, backup)
      }
      try {
        renameSync(output, destination)
      } catch (error) {
        if (existsSync(backup)) renameSync(backup, destination)
        throw error
      }
      if (existsSync(backup)) rmSync(backup, { recursive: true })
      console.log(JSON.stringify(receipt))
    } finally {
      if (existsSync(output)) rmSync(output, { recursive: true })
    }
  } finally {
    // A previous output remains recoverable here if the filesystem refuses
    // both the promotion and its rollback. Preserve it for the operator.
    if (!existsSync(join(lock, 'previous-dist'))) rmSync(lock)
  }
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
