import { describe, expect, it } from 'vitest'
import { publicBuildConfig, validatePublicConnection } from '../src/lib/publicConfig'

const endpoint = 'https://preview-project.supabase.co'
const publicKey = 'sb_publishable_test_value'
const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role }))}.testsignature`

describe('public deployment boundary', () => {
  it('builds an unconnected demo without credentials', () => {
    expect(publicBuildConfig({}, true, false)).toEqual({ url: '', key: '' })
  })
  it('rejects inherited credentials in the demo mode', () => {
    expect(() => publicBuildConfig({ VITE_SUPABASE_URL: endpoint, VITE_SUPABASE_PUBLISHABLE_KEY: publicKey }, true, false)).toThrow('Demo builds')
  })
  it('rejects a partial connection instead of silently publishing it', () => {
    expect(() => publicBuildConfig({ VITE_SUPABASE_URL: endpoint }, false, false)).toThrow('Set both')
  })
  it('rejects accidental frontend-prefixed server secrets', () => {
    expect(() => publicBuildConfig({ VITE_SERVICE_ROLE_KEY: 'private' }, false, false)).toThrow('Unexpected VITE_')
  })
  it.each(['sb_secret_unit_test_value', jwt('service_role'), jwt('authenticated'), 'invalid'])('rejects a non-public key', key => {
    expect(() => validatePublicConnection(endpoint, key, false)).toThrow('Only a Supabase publishable')
  })
  it.each([publicKey, jwt('anon')])('accepts only supported public key types', key => {
    expect(() => validatePublicConnection(endpoint, key, false)).not.toThrow()
  })
  it.each(['http://example.com', 'http://127.0.0.1:55421', 'https://localhost', 'https://user:password@example.com', 'https://example.com/?token=private', 'https://example.com/path', 'invalid'])('rejects unsafe deployment endpoints', url => {
    expect(() => validatePublicConnection(url, publicKey, false)).toThrow()
  })
  it('allows the existing local stack only in development', () => {
    expect(() => validatePublicConnection('http://127.0.0.1:55421', publicKey, true)).not.toThrow()
  })
  it('never repeats a rejected credential in its error', () => {
    try { validatePublicConnection(endpoint, 'sb_secret_private_value', false) }
    catch (error) { expect(String(error)).not.toContain('sb_secret_private_value') }
  })
})
