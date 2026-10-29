import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../dist/server/index.js', import.meta.url), 'utf8')
const worker = (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).default
const request = (path, method = 'GET') => worker.fetch(new Request(`https://utsc-preview.example${path}`, { method }))
const security = response => {
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/)
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY')
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer')
  assert.match(response.headers.get('X-Robots-Tag'), /noindex/)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal(response.headers.get('Set-Cookie'), null)
}
test('generated Worker serves the exact reviewed HTML with security headers', async () => {
  const response = await request('/')
  assert.equal(response.status, 200)
  assert.equal(await response.text(), readFileSync(new URL('../static-dist/index.html', import.meta.url), 'utf8'))
  security(response)
})
test('HEAD returns headers without a response body', async () => {
  const response = await request('/', 'HEAD')
  assert.equal(response.status, 200)
  assert.equal(await response.text(), '')
  security(response)
})
test('unknown paths have no SPA fallback or filesystem access', async () => {
  for (const path of ['/.env', '/.git/config', '/src/main.tsx', '/user-records.json', '/_headers', '/%2e%2e/.env']) {
    const response = await request(path)
    assert.equal(response.status, 404, path)
    security(response)
  }
})
test('delivery has no write endpoint', async () => {
  const response = await request('/', 'POST')
  assert.equal(response.status, 405)
  assert.equal(response.headers.get('Allow'), 'GET, HEAD')
  security(response)
})
