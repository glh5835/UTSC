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
import { createDeletionClient, getSupabase, SUPABASE_CONFIGURED } from '../lib/supabase'
import type { MailCallback } from './emailCallback'

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
  signOut: () => Promise<boolean>
  requestReset: (email: string) => Promise<boolean>
  mailState: 'invalid' | 'confirmed' | 'verify' | 'verify-recovery' | null
  verifyEmailLink: () => Promise<void>
  recovery: boolean
  setNewPassword: (password: string) => Promise<boolean>
  deleteAccount: (user: User, password: string) => Promise<boolean>
  accountDeleted: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

function redirectToSite() {
  return new URL('/', window.location.origin).href
}

export function AuthProvider({ children, callback = null }: { children: ReactNode; callback?: MailCallback | null }) {
  const [phase, setPhase] = useState<AuthPhase>(() =>
    SUPABASE_CONFIGURED ? { kind: 'loading' } : { kind: 'unconfigured' },
  )
  const [userKey, setUserKey] = useState<string | null>(null)
  const [mail, setMail] = useState(callback)
  const [recoveryUserId, setRecoveryUserId] = useState<string | null>(null)
  const [accountDeleted, setAccountDeleted] = useState(false)

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
          if (callback?.kind === 'recovery-redirect') setRecoveryUserId(session.user.id)
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
        setRecoveryUserId(current => event === 'PASSWORD_RECOVERY' ? user.id : current === user.id ? current : null)
      } else {
        setUserKey(null)
        setPhase({ kind: 'signedOut' })
        setRecoveryUserId(null)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [callback])

  const signUp = useCallback(async (email: string, password: string): Promise<SignUpResult> => {
    setAccountDeleted(false)
    const supabase = getSupabase()
    if (!supabase) return { outcome: 'error', message: 'Supabase is not configured' }
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectToSite() } })
    if (error) return { outcome: 'error', message: error.message }
    if (data.session && data.user) {
      return { outcome: 'signed-in' }
    }
    // Registration accepted but no session: the project requires email
    // confirmation. This MUST NOT be presented as a signed-in state.
    return { outcome: 'confirmation-required' }
  }, [])

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    setAccountDeleted(false)
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
    if (!supabase) return false
    const { error } = await supabase.auth.signOut()
    return !error
  }, [])

  const requestReset = useCallback(async (email: string) => {
    const supabase = getSupabase()
    if (!supabase) return false
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectToSite() })
    return !error
  }, [])

  const verifyEmailLink = useCallback(async () => {
    const supabase = getSupabase()
    if (!supabase || mail?.kind !== 'verify') return
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: mail.tokenHash, type: mail.intent })
    if (error || !data.session?.user) {
      setMail({ kind: 'invalid' })
      return
    }
    if (mail.intent === 'recovery') setRecoveryUserId(data.session.user.id)
    setMail(mail.intent === 'recovery' ? null : { kind: 'confirmation-redirect' })
  }, [mail])

  const setNewPassword = useCallback(async (password: string) => {
    const supabase = getSupabase()
    if (!supabase || !recoveryUserId) return false
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user.id !== recoveryUserId) return false
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return false
    setRecoveryUserId(null)
    return true
  }, [recoveryUserId])

  const deleteAccount = useCallback(async (user: User, password: string) => {
    const isolated = createDeletionClient()
    const supabase = getSupabase()
    if (!isolated || !supabase || !user.email) return false
    const { data, error } = await isolated.auth.signInWithPassword({ email: user.email, password })
    if (error || data.session?.user.id !== user.id) return false
    const { error: deletionError } = await isolated.rpc('delete_own_account')
    if (deletionError) {
      await isolated.auth.signOut({ scope: 'local' })
      return false
    }
    setAccountDeleted(true)
    const { data: current } = await supabase.auth.getSession()
    if (current.session?.user.id === user.id) {
      await supabase.auth.signOut({ scope: 'local' })
      setUserKey(null)
      setPhase({ kind: 'signedOut' })
      setRecoveryUserId(null)
    }
    return true
  }, [])

  const mailState = mail?.kind === 'verify'
    ? (mail.intent === 'recovery' ? 'verify-recovery' : 'verify')
    : mail?.kind === 'invalid' ? 'invalid'
      : mail?.kind === 'confirmation-redirect' ? 'confirmed' : null
  const recovery = Boolean(recoveryUserId && recoveryUserId === userKey)
  const value = useMemo<AuthContextValue>(
    () => ({ phase, userId: userKey, signUp, signIn, signOut, requestReset, mailState, verifyEmailLink, recovery, setNewPassword, deleteAccount, accountDeleted }),
    [phase, userKey, signUp, signIn, signOut, requestReset, mailState, verifyEmailLink, recovery, setNewPassword, deleteAccount, accountDeleted],
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
