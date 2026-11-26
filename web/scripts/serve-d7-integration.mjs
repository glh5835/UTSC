import { createServer } from 'node:http'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { build } from 'vite'
import { verifyD7Package } from '../../scripts/verify_d7_package.mjs'

const HOST = '127.0.0.1'
const webRoot = fileURLToPath(new URL('../', import.meta.url))
const bundlePath = '/__d7/bundle.json'
const schemaBasePath = '/__d7/schemas'
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { synthetic: { type: 'boolean' }, port: { type: 'string', default: '0' } },
  })
  const [packageDir, expectedSha] = positionals
  if (positionals.length !== 2 || !/^[a-f0-9]{64}$/i.test(expectedSha ?? '')) {
    throw new Error('Usage: node web/scripts/serve-d7-integration.mjs <package-dir> <trusted SHA256SUMS.txt SHA-256> [--synthetic] [--port 5198]')
  }
  const port = Number(values.port)
  if (!/^\d+$/.test(values.port) || !Number.isInteger(port) || port > 65535) throw new Error('Invalid port')
  const verified = await verifyD7Package(packageDir, expectedSha.toLowerCase())
  const config = {
    mode: 'integration',
    synthetic: verified.synthetic || values.synthetic === true,
    schemaVersion: '1.1.0',
    schemaBasePath,
    contractCommit: verified.contractCommit,
    datasetVersion: verified.bundle.manifest.dataset_version,
    runStatus: verified.bundle.manifest.run_status,
    marketBundlePath: bundlePath,
    courseBundlePath: bundlePath,
    pathwaysBundlePath: bundlePath,
    opportunitiesBundlePath: bundlePath,
    opportunityReviews: verified.opportunityReviews,
  }
  const files = new Map([
    [bundlePath, verified.bundleBytes],
    ['/__d7/config.json', JSON.stringify(config)],
  ])
  for (const [name, bytes] of verified.schemaBytes) files.set(`${schemaBasePath}/${name}`, bytes)

  // A separate in-memory build prevents candidate bytes and its entry point from
  // becoming public assets. It uses only the shared, account-free page shell.
  const result = await build({
    root: webRoot,
    configFile: false,
    envPrefix: [],
    envDir: false,
    publicDir: false,
    mode: 'integration',
    build: { write: false },
    plugins: [{
      name: 'utsc-d7-integration-entry',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          if (!html.includes('/src/main.tsx')) throw new Error('Expected website entry was not found')
          return html.replace('/src/main.tsx', '/src/integration-main.tsx')
        },
      },
    }],
  })
  for (const output of result.output) {
    files.set(`/${output.fileName}`, output.type === 'chunk' ? output.code : output.source)
  }
  if (!files.has('/index.html')) throw new Error('Integration build has no index')

  const server = createServer((req, res) => {
    if (req.headers.host !== `${HOST}:${server.address().port}`) {
      res.writeHead(403).end()
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end()
      return
    }
    const pathname = req.url.split('?', 1)[0]
    const file = pathname === '/' ? '/index.html' : pathname
    const content = files.get(file)
    if (content === undefined) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, {
      'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Content-Security-Policy': "default-src 'none'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    }).end(req.method === 'HEAD' ? undefined : content)
  })
  server.on('error', (error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  server.listen(port, HOST, () => {
    console.log(`D7 integration ${config.datasetVersion}: http://${HOST}:${server.address().port}/`)
    console.log(`Verified bundle SHA-256: ${verified.bundleSha256}`)
  })
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
