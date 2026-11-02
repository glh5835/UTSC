import { readdirSync, readFileSync, lstatSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const publicFiles = JSON.parse(readFileSync(new URL('../deployment/public-files.json', import.meta.url), 'utf8'))
export function checkDist(directory = resolve(root, 'static-dist')) {
  const files = []
  function walk(path) {
    for (const name of readdirSync(path)) {
      const full = resolve(path, name)
      const stat = lstatSync(full)
      if (stat.isDirectory()) walk(full)
      else if (stat.isFile()) files.push(full)
      else throw new Error('Special files are forbidden in deployment output')
    }
  }
  walk(directory)
  const paths = files.map(file => relative(directory, file).replaceAll('\\', '/'))
  const allowed = new Set(['index.html', '_headers', 'robots.txt', ...publicFiles])
  for (const [index, file] of files.entries()) {
    const name = paths[index]
    if (!allowed.has(name) && !/^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]+\.(js|css)$/.test(name)) {
      throw new Error(`Unapproved deployment file: ${name}`)
    }
    const content = readFileSync(file, 'utf8')
    if (/sb_secret_[A-Za-z0-9_-]{8,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) {
      throw new Error(`Server credential found in deployment file: ${name}`)
    }
    for (const match of content.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
      try {
        if (JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url').toString()).role === 'service_role') {
          throw new Error('forbidden-role')
        }
      } catch (error) {
        if (error.message === 'forbidden-role') throw new Error(`Server JWT found in deployment file: ${name}`)
      }
    }
  }
  for (const required of allowed) {
    if (!paths.includes(required)) throw new Error(`Missing deployment file: ${required}`)
  }
  const html = readFileSync(resolve(directory, 'index.html'), 'utf8')
  if (!html.includes('Content-Security-Policy') || !html.includes('noindex, nofollow, noarchive')) {
    throw new Error('Missing browser security or demo indexing policy')
  }
  return paths.length
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(`Deployment output checked: ${checkDist()} approved files; no detected server credentials or source maps.`) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
