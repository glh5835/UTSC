export type MailIntent = 'email' | 'recovery'

export type MailCallback =
  | { kind: 'verify'; intent: MailIntent; tokenHash: string }
  | { kind: 'recovery-redirect' }
  | { kind: 'confirmation-redirect' }
  | { kind: 'invalid' }

export function readMailCallback(hash: string): MailCallback | null {
  if (!hash || hash.startsWith('#/')) return null
  const params = new URLSearchParams(hash.slice(1))
  if (params.has('auth') || params.has('token_hash')) {
    const intent = params.get('auth')
    const tokenHash = params.get('token_hash')
    if ((intent === 'email' || intent === 'recovery') && tokenHash &&
        /^[A-Za-z0-9_-]{24,256}$/.test(tokenHash) &&
        params.getAll('auth').length === 1 && params.getAll('token_hash').length === 1) {
      return { kind: 'verify', intent, tokenHash }
    }
    return { kind: 'invalid' }
  }
  if (params.has('error') || params.has('error_code')) return { kind: 'invalid' }
  if (params.has('access_token') && params.has('refresh_token')) {
    return params.get('type') === 'recovery' ? { kind: 'recovery-redirect' } : { kind: 'confirmation-redirect' }
  }
  return null
}

export function accountRoute(location: Pick<Location, 'pathname' | 'search'>): string {
  return `${location.pathname}${location.search}#/account`
}
