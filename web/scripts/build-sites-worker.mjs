import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs'
import { resolve, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkDist } from './check-dist.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const input = resolve(root, 'static-dist')
checkDist(input)
const manifest = JSON.parse(readFileSync(resolve(root, '.openai/hosting.json'), 'utf8'))
if (manifest.static) throw new Error('Sites security adapter requires a Worker hosting manifest')
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' }
const files = []
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) walk(path)
    else {
      const name = '/' + relative(input, path).replaceAll('\\', '/')
      if (name === '/_headers') continue // configuration, never a public route
      files.push([name, { type: types[extname(path)] ?? 'application/octet-stream', body: readFileSync(path, 'utf8') }])
    }
  }
}
walk(input)
const headers = Object.fromEntries(readFileSync(resolve(input, '_headers'), 'utf8').split('\n')
  .filter(line => /^  [A-Za-z-]+: /.test(line)).map(line => {
    const colon = line.indexOf(':')
    return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()]
  }))
const adapter = readFileSync(resolve(root, 'worker/serve-public.mjs'), 'utf8').replace('export function', 'function')
const source = `${adapter}\nconst files = new Map(${JSON.stringify(files)});\nconst headers = ${JSON.stringify(headers)};\nexport default { fetch(request) { return servePublic(request, files, headers); } };\n`
// Match the supported dependency-free Sites Worker ESM artifact shape.
const output = resolve(root, 'dist')
rmSync(output, { recursive: true, force: true })
mkdirSync(resolve(output, 'server'), { recursive: true })
mkdirSync(resolve(output, '.openai'), { recursive: true })
writeFileSync(resolve(output, 'server/index.js'), source)
writeFileSync(resolve(output, '.openai/hosting.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`Sites Worker built: ${files.length} approved read-only routes; HTTP security headers enforced.`)
