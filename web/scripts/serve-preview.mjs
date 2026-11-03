import http from 'node:http'
import worker from '../dist/server/index.js'
const port = Number(process.argv[2] ?? 5199)
http.createServer(async (incoming, outgoing) => {
  try {
    const response = await worker.fetch(new Request(`http://127.0.0.1:${port}${incoming.url}`, { method: incoming.method, headers: incoming.headers }))
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  } catch { outgoing.writeHead(500); outgoing.end('Preview request failed') }
}).listen(port, '127.0.0.1', () => console.log(`Reviewed Worker preview: http://127.0.0.1:${port}`))
