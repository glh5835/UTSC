/** Read-only delivery adapter. No database, identity forwarding, cookies or write API. */
export function servePublic(request, files, securityHeaders) {
  const headers = new Headers(securityHeaders)
  if (!['GET', 'HEAD'].includes(request.method)) {
    headers.set('Allow', 'GET, HEAD')
    headers.set('Content-Type', 'text/plain; charset=utf-8')
    return new Response('Method not allowed', { status: 405, headers })
  }
  const path = new URL(request.url).pathname
  const file = files.get(path === '/' ? '/index.html' : path)
  if (!file) {
    headers.set('Content-Type', 'text/plain; charset=utf-8')
    return new Response(request.method === 'HEAD' ? null : 'Not found', { status: 404, headers })
  }
  headers.set('Content-Type', file.type)
  return new Response(request.method === 'HEAD' ? null : file.body, { status: 200, headers })
}
