/** Shared by Vite and the browser. Never include offending values in errors. */
export function validatePublicConnection(url: string, key: string, allowLocal: boolean): void {
  let endpoint: URL
  try { endpoint = new URL(url) } catch { throw new Error('Invalid public Supabase URL') }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
      !['', '/'].includes(endpoint.pathname) ||
      (endpoint.protocol !== 'https:' && !(allowLocal && loopback && endpoint.protocol === 'http:')) ||
      (!allowLocal && loopback)) {
    throw new Error('Supabase requires a clean HTTPS origin (HTTP loopback is development-only)')
  }
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return
  // Legacy anon JWTs remain supported. Decoding is a role guard, not signature verification.
  try {
    const parts = key.split('.')
    if (parts.length !== 3) throw new Error()
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')))
    if (claims.role === 'anon') return
  } catch { /* fail closed */ }
  throw new Error('Only a Supabase publishable key or legacy anon JWT may enter the browser')
}

export function publicBuildConfig(env: Record<string, string>, demo: boolean, allowLocal: boolean) {
  const allowed = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'])
  if (Object.keys(env).some((name) => name.startsWith('VITE_') && !allowed.has(name))) {
    throw new Error('Unexpected VITE_ variable: only the two documented public Supabase variables are allowed')
  }
  const url = env.VITE_SUPABASE_URL?.trim() ?? ''
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''
  if (demo && (url || key)) throw new Error('Demo builds must have both Supabase variables empty')
  if (Boolean(url) !== Boolean(key)) throw new Error('Set both public Supabase variables, or leave both empty')
  if (url && key) validatePublicConnection(url, key, allowLocal)
  return { url, key }
}
