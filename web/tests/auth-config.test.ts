import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the unconfigured-supabase degradation path. When the env
 * vars are absent the client must be null so the UI can show an explicit
 * "not configured" state instead of fake accounts. These tests mock nothing
 * about the app logic: they import the real module under different envs.
 *
 * Real-database behaviour is covered separately in rls-isolation.local.test.ts
 * (skipped unless the local stack env vars are present).
 */

const MODULE = '../src/lib/supabase'

async function importSupabaseModule(): Promise<typeof import('../src/lib/supabase')> {
  vi.resetModules()
  return await import(MODULE)
}

beforeEach(() => {
  vi.unstubAllEnvs()
})

describe('supabase client configuration', () => {
  it('is unconfigured and returns a null client when env vars are absent', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
    const mod = await importSupabaseModule()
    expect(mod.SUPABASE_CONFIGURED).toBe(false)
    expect(mod.getSupabase()).toBeNull()
  })

  it('stays unconfigured when only the URL is set', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
    const mod = await importSupabaseModule()
    expect(mod.SUPABASE_CONFIGURED).toBe(false)
    expect(mod.getSupabase()).toBeNull()
  })

  it('creates a client (without any network call) when both vars are set', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'public-publishable-key-placeholder')
    const mod = await importSupabaseModule()
    expect(mod.SUPABASE_CONFIGURED).toBe(true)
    const client = mod.getSupabase()
    expect(client).not.toBeNull()
    expect(client!.auth).toBeDefined()
  })
})
