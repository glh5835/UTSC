#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(root, 'web/package.json'))
const ts = require('typescript')
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
export const MAX_BUNDLE_BYTES = 5 * 1024 * 1024
let validatorModule
async function validation() {
  if (validatorModule) return validatorModule
  const source = fs.readFileSync(path.join(root, 'web/src/data/validation.ts'), 'utf8')
  let code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
  code = code.replaceAll("'ajv/dist/2020'", JSON.stringify(pathToFileURL(require.resolve('ajv/dist/2020.js')).href))
    .replaceAll("'ajv-formats'", JSON.stringify(pathToFileURL(require.resolve('ajv-formats')).href))
  validatorModule = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
  return validatorModule
}
function contentCheck(value) {
  if (Array.isArray(value)) { value.forEach(contentCheck); return }
  if (!value || typeof value !== 'object') return
  for (const [key, text] of Object.entries(value)) {
    if (typeof text === 'string') {
      if (/sb_secret_|-----BEGIN .*PRIVATE KEY|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(text)) throw new Error('Credential-shaped content rejected')
      if (/<\/?(?:script|iframe|object|embed)\b/i.test(text)) throw new Error('Executable markup rejected')
      if (/(?:url|link)$/i.test(key)) {
        let url
        try { url = new URL(text) } catch { throw new Error('Invalid source URL') }
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Unsafe source URL')
      }
    } else contentCheck(text)
  }
}
export async function validateDelivery({ bundleFile, expectedSha, mode, attestationFile }) {
  if (!/^[a-f0-9]{64}$/.test(expectedSha ?? '')) throw new Error('A trusted --expected-sha256 is required')
  if (!['demo', 'published'].includes(mode)) throw new Error('Explicit --mode demo or published is required')
  const file = path.resolve(bundleFile)
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Symlink packages are not accepted')
  if (fs.statSync(file).size > MAX_BUNDLE_BYTES) throw new Error('Package exceeds the fixed 5 MiB budget')
  const bytes = fs.readFileSync(file)
  if (hash(bytes) !== expectedSha) throw new Error('Package checksum mismatch')
  const bundle = JSON.parse(bytes.toString('utf8'))
  if (bundle.manifest?.schema_version !== '1.0.0') throw new Error('Only the approved 1.0.0 contract may be published')
  if (bundle.manifest.run_status !== 'complete') throw new Error('Incomplete data cannot be activated')
  const { createBundleValidator, checkCrossRecords } = await validation()
  const schemas = new Map()
  for (const name of fs.readdirSync(path.join(root, 'web/public/contracts/schemas')).filter(x => x.endsWith('.json'))) {
    const schema = JSON.parse(fs.readFileSync(path.join(root, 'web/public/contracts/schemas', name), 'utf8'))
    schemas.set(schema.$id, schema)
  }
  const validate = createBundleValidator(schemas)
  if (!validate(bundle)) throw new Error('Package schema rejected')
  if (checkCrossRecords(bundle).length) throw new Error('Cross-record validation rejected the whole package')
  contentCheck(bundle)
  if (mode === 'demo') {
    if (!bundle.market_jobs.every(job => /synthetic/i.test(job.source)) || !bundle.manifest.dataset_version.startsWith('0.')) throw new Error('Demo packages require explicit synthetic provenance')
    if (!bundle.opportunities.every(item => /synthetic/i.test(item.title) && /synthetic/i.test(item.description ?? ''))) throw new Error('Demo opportunities must be explicitly labelled synthetic')
  } else {
    if (!attestationFile) throw new Error('A real, hash-bound release attestation is required')
    const proof = JSON.parse(fs.readFileSync(attestationFile, 'utf8'))
    if (proof.bundle_sha256 !== expectedSha || proof.dataset_version !== bundle.manifest.dataset_version ||
      !proof.reviewer?.trim() || !Number.isFinite(Date.parse(proof.confirmed_at ?? '')) ||
      ['role_classifications', 'course_evidence', 'opportunity_dates', 'source_usage_permission', 'content_privacy_review'].some(key => proof.confirmations?.[key] !== true)) throw new Error('Release attestation is incomplete or does not bind these bytes')
    if (bundle.opportunities.some(item => item.review_status !== 'approved' || item.change_pending || (item.source_updated_at && item.source_updated_at > item.verified_at))) throw new Error('Opportunity review is not current')
  }
  return { bundle, bytes, metadata: { mode, dataset_version: bundle.manifest.dataset_version, bundle_sha256: expectedSha, schema_version: '1.0.0', contract_commit: 'b828553f91cf6cd6ae5b0766e7fbf4c6b1822535' } }
}
export async function stageDelivery(options) {
  const result = await validateDelivery(options)
  const version = result.bundle.manifest.dataset_version
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(version)) throw new Error('Unsafe dataset version')
  const store = path.resolve(options.store), release = `${version}-${options.expectedSha.slice(0, 16)}`
  const directory = path.join(store, 'releases', release)
  fs.mkdirSync(path.dirname(directory), { recursive: true })
  fs.mkdirSync(directory) // immutable: a release directory is never overwritten
  fs.writeFileSync(path.join(directory, 'bundle.json'), result.bytes, { flag: 'wx' })
  fs.writeFileSync(path.join(directory, 'release.json'), JSON.stringify(result.metadata, null, 2) + '\n', { flag: 'wx' })
  return { release, ...result.metadata }
}
export function activateDelivery({ store, release }) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,110}$/.test(release ?? '')) throw new Error('Unsafe release ID')
  const base = path.resolve(store), directory = path.join(base, 'releases', release)
  if (!fs.realpathSync(directory).startsWith(fs.realpathSync(base) + path.sep)) throw new Error('Release escapes its store')
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'release.json'), 'utf8'))
  const bytes = fs.readFileSync(path.join(directory, 'bundle.json'))
  if (hash(bytes) !== metadata.bundle_sha256) throw new Error('Staged bytes changed; active version remains unchanged')
  if (!['demo', 'published'].includes(metadata.mode) || metadata.schema_version !== '1.0.0') throw new Error('Unapproved release mode')
  const pointer = { release, ...metadata }
  const temporary = path.join(base, `active-${crypto.randomUUID()}.tmp`)
  fs.writeFileSync(temporary, JSON.stringify(pointer, null, 2) + '\n', { flag: 'wx' })
  fs.renameSync(temporary, path.join(base, 'active.json')) // same-filesystem atomic pointer switch
  return pointer
}
/** Prepare one immutable bundle and all four consumers for the next whole-site
 * deployment. Activation in this local store never deploys the website. */
export function materializeDelivery({ store, publicDirectory, selectionFile, allowlistFile }) {
  const pointer = JSON.parse(fs.readFileSync(path.join(path.resolve(store), 'active.json'), 'utf8'))
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,110}$/.test(pointer.release ?? '')) throw new Error('Unsafe release ID')
  const bytes = fs.readFileSync(path.join(path.resolve(store), 'releases', pointer.release, 'bundle.json'))
  if (hash(bytes) !== pointer.bundle_sha256) throw new Error('Active package bytes do not match the approved version')
  const relative = `releases/${pointer.release}/bundle.json`, target = path.join(path.resolve(publicDirectory), relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (fs.existsSync(target)) {
    if (hash(fs.readFileSync(target)) !== pointer.bundle_sha256) throw new Error('Refusing to overwrite an immutable public bundle')
  } else fs.writeFileSync(target, bytes, { flag: 'wx' })
  const selection = { mode: pointer.mode, bundlePath: '/' + relative, contractCommit: pointer.contract_commit }
  const temporary = path.resolve(selectionFile) + '.' + crypto.randomUUID() + '.tmp'
  fs.writeFileSync(temporary, `// Generated by the validated release adapter.\nexport const SELECTED_RELEASE = ${JSON.stringify(selection, null, 2)} as const\n`, { flag: 'wx' })
  const allowed = JSON.parse(fs.readFileSync(allowlistFile, 'utf8'))
  if (!allowed.includes(relative)) fs.writeFileSync(allowlistFile, JSON.stringify([...allowed, relative], null, 2) + '\n')
  fs.renameSync(temporary, path.resolve(selectionFile))
  return { ...selection, bundle_sha256: pointer.bundle_sha256 }
}
async function main() {
  const [command, ...args] = process.argv.slice(2), options = {}
  const allowed = new Set(['bundle', 'store', 'mode', 'attestation', 'expected-sha256', 'release', 'public-dir', 'selection-file', 'allowlist'])
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]?.replace(/^--/, '')
    if (!args[index]?.startsWith('--') || !allowed.has(key) || !args[index + 1] || options[key]) throw new Error('Invalid or repeated argument')
    options[key] = args[index + 1]
  }
  const input = { bundleFile: options.bundle, expectedSha: options['expected-sha256'], mode: options.mode, attestationFile: options.attestation, store: options.store, release: options.release }
  if (command === 'check') { const { metadata } = await validateDelivery(input); console.log(JSON.stringify(metadata)); return }
  if (!options.store) throw new Error('--store is required')
  if (command === 'stage') console.log(JSON.stringify(await stageDelivery(input)))
  else if (command === 'activate' || command === 'rollback') console.log(JSON.stringify(activateDelivery(input)))
  else if (command === 'materialize') {
    if (!options['public-dir'] || !options['selection-file'] || !options.allowlist) throw new Error('Explicit --public-dir, --selection-file and --allowlist are required')
    console.log(JSON.stringify(materializeDelivery({ store: options.store, publicDirectory: options['public-dir'], selectionFile: options['selection-file'], allowlistFile: options.allowlist })))
  } else throw new Error('Use check, stage, activate, rollback or materialize')
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
