import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readMailCallback } from '../auth/emailCallback'

/**
 * Browser Supabase client. Configured purely from environment variables; when
 * they are absent (no local stack, no project configured yet) the client is
 * null and every account feature must degrade to an explicit
 * "Supabase is not configured" state. The app never fabricates users, tokens
 * or a simulated signed-in state.
 *
 * Only the public publishable key is used here — never service_role, secrets
 * or database passwords (see docs and
 * https://supabase.com/docs/guides/getting-started/api-keys).
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const SUPABASE_CONFIGURED = Boolean(
  supabaseUrl && publishableKey && supabaseUrl.length > 0 && publishableKey.length > 0,
)

let client: SupabaseClient | null = null

// Read default Auth links before the SDK consumes their fragment. Custom
// links carry a token hash consumed only after the student clicks Continue.
export const initialMailCallback = typeof window === 'undefined' ? null : readMailCallback(window.location.hash)

if (SUPABASE_CONFIGURED) {
  client = createClient(supabaseUrl as string, publishableKey as string, {
    auth: { detectSessionInUrl: import.meta.env.MODE !== 'production' },
  })
}

/** Returns the shared browser client, or null when Supabase is unconfigured. */
export function getSupabase(): SupabaseClient | null {
  return client
}

/** Keep deletion reauthentication isolated from other tabs and signed-in views. */
export function createDeletionClient(): SupabaseClient | null {
  if (!supabaseUrl || !publishableKey) return null
  return createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'utsc-delete-account' },
  })
}

export const SUPABASE_ENV_KEYS = {
  url: 'VITE_SUPABASE_URL',
  publishableKey: 'VITE_SUPABASE_PUBLISHABLE_KEY',
} as const
