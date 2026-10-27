import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase, SUPABASE_CONFIGURED } from '../lib/supabase'

/**
 * Real Supabase Auth session state.
 *
 * - Session survives page reloads via the SDK's persisted session and
 *   getSession() on boot; getToken()/refresh is handled by the SDK.
 * - Registration that requires email confirmation is reported as
 *   "confirmation required" and never as signed in.
 * - When the user identity changes (sign in as someone else, sign out), the
 *   previous account's profile cache is invalidated by consumer hooks keyed
 *   on user id, and late responses for the old id are dropped.
 */

export type AuthPhase =
  | { kind: 'loading' }
  | { kind: 'unconfigured' }
  | { kind: 'signedOut' }
  | { kind: 'signedIn'; user: User }

export interface SignUpResult {
  outcome: 'confirmation-required' | 'signed-in' | 'error'
  message?: string
}

export interface SignInResult {
  outcome: 'signed-in' | 'error'
  message?: string
}

interface AuthContextValue {
  phase: AuthPhase
  /** Convenience: id of the signed-in user or null. */
  userId: string | null
  signUp: (email: string, password: string) => Promise<SignUpResult>
  signIn: (email: string, password: string) => Promise<SignInResult>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<AuthPhase>(() =>
    SUPABASE_CONFIGURED ? { kind: 'loading' } : { kind: 'unconfigured' },
  )
  const [userKey, setUserKey] = useState<string | null>(null)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return

    let cancelled = false
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return
        const session: Session | null = data.session
        if (session?.user) {
          setUserKey(session.user.id)
          setPhase({ kind: 'signedIn', user: session.user })
        } else {
          setPhase({ kind: 'signedOut' })
        }
      })
      .catch(() => {
        if (!cancelled) setPhase({ kind: 'signedOut' })
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return // handled by getSession above
      const user = session?.user ?? null
      if (user) {
        // SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED: switching identity
        // changes the user key, which invalidates profile caches downstream.
        setUserKey(user.id)
        setPhase({ kind: 'signedIn', user })
      } else {
        setUserKey(null)
        setPhase({ kind: 'signedOut' })
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string): Promise<SignUpResult> => {
    const supabase = getSupabase()
    if (!supabase) return { outcome: 'error', message: 'Supabase is not configured' }
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return { outcome: 'error', message: error.message }
    if (data.session && data.user) {
      return { outcome: 'signed-in' }
    }
    // Registration accepted but no session: the project requires email
    // confirmation. This MUST NOT be presented as a signed-in state.
    return { outcome: 'confirmation-required' }
  }, [])

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    const supabase = getSupabase()
    if (!supabase) return { outcome: 'error', message: 'Supabase is not configured' }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { outcome: 'error', message: error.message }
    if (!data.session?.user) {
      return { outcome: 'error', message: 'Sign-in returned no session' }
    }
    return { outcome: 'signed-in' }
  }, [])

  const signOut = useCallback(async () => {
    const supabase = getSupabase()
    if (!supabase) return
    await supabase.auth.signOut()
    // onAuthStateChange clears userKey/phase; profile caches keyed on
    // userId are invalidated by that state change.
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ phase, userId: userKey, signUp, signIn, signOut }),
    [phase, userKey, signUp, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
