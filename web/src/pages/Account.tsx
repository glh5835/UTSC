import { useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { useAuth } from '../auth/AuthContext'
import { useProfile } from '../auth/useProfile'
import { SUPABASE_ENV_KEYS } from '../lib/supabase'
import { usePageTitle } from '../usePageTitle'
import { useLanguage } from '../i18n/LanguageContext'

/**
 * Minimal account entry: real Supabase Auth (email + password), profile
 * read/save on the owner-scoped profiles table, and sign-out. Deliberately
 * NOT implemented here (later stages): favorites management, learning paths,
 * skill extraction, recommendations.
 */
export function AccountPage() {
  const { t } = useLanguage()
  usePageTitle(t('nav.account'))
  const { phase, signUp, signIn, signOut } = useAuth()
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)

  function switchMode(next: 'signIn' | 'signUp') {
    setMode(next)
    setNotice(null)
    setPassword('')
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      if (mode === 'signUp') {
        const result = await signUp(email.trim(), password)
        if (result.outcome === 'confirmation-required') {
          // Registration was accepted by the server, but no session exists:
          // the user must confirm the email first. This is NOT signed-in.
          setNotice({ kind: 'info', text: t('account.confirmationRequired') })
          setPassword('')
        } else if (result.outcome === 'error') {
          setNotice({ kind: 'error', text: result.message ?? t('account.errorGeneric') })
        }
        // signed-in outcome: AuthProvider switches to the signed-in view.
      } else {
        const result = await signIn(email.trim(), password)
        if (result.outcome === 'error') {
          setNotice({ kind: 'error', text: result.message ?? t('account.errorGeneric') })
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const authForm = (
    <form className="account-form" onSubmit={handleSubmit}>
      <h2>{mode === 'signIn' ? t('account.signInTitle') : t('account.signUpTitle')}</h2>
      <label className="field">
        <span>{t('account.emailLabel')}</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="field">
        <span>{t('account.passwordLabel')}</span>
        <input
          type="password"
          required
          minLength={8}
          autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {notice ? (
        <p className={notice.kind === 'error' ? 'banner banner-error' : 'banner banner-warn'} role="alert">
          {notice.text}
        </p>
      ) : null}
      <div className="account-actions">
        <button type="submit" disabled={busy}>
          {busy ? t('account.working') : mode === 'signIn' ? t('account.signIn') : t('account.signUp')}
        </button>
        <button type="button" className="link-button" onClick={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
          {mode === 'signIn' ? t('account.switchToSignUp') : t('account.switchToSignIn')}
        </button>
      </div>
    </form>
  )

  return (
    <>
      <h1>{t('nav.account')}</h1>
      <p className="lead">{t('account.intro')}</p>
      {phase.kind === 'unconfigured' ? (
        <section className="panel panel-placeholder" aria-live="polite">
          <h2>{t('account.notConfiguredTitle')}</h2>
          <p>{t('account.notConfiguredBody')}</p>
          <p>
            <code>{SUPABASE_ENV_KEYS.url}</code> · <code>{SUPABASE_ENV_KEYS.publishableKey}</code>
          </p>
          <p className="note">{t('account.notConfiguredNote')}</p>
        </section>
      ) : phase.kind === 'loading' ? (
        <p className="state state-loading" role="status" aria-live="polite">
          {t('account.loadingSession')}
        </p>
      ) : phase.kind === 'signedOut' ? (
        authForm
      ) : (
        <SignedInView user={phase.user} onSignOut={signOut} />
      )}
      <p className="note">{t('account.scopeNote')}</p>
    </>
  )
}

function SignedInView({ user, onSignOut }: { user: User; onSignOut: () => Promise<void> }) {
  const { t } = useLanguage()
  const { phase, save } = useProfile(user)
  const [displayName, setDisplayName] = useState('')
  const [courseIds, setCourseIds] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'stale'>('idle')
  const [saveError, setSaveError] = useState('')

  // Hydrate form inputs when the profile arrives — but only once per account,
  // so that switching language or re-rendering never overwrites user edits.
  if (phase.kind === 'ready' && !hydrated) {
    setDisplayName(phase.data.display_name ?? '')
    setCourseIds(phase.data.completed_course_ids.join(', '))
    setHydrated(true)
  }
  if ((phase.kind === 'idle' || phase.kind === 'loading' || phase.kind === 'error') && hydrated) {
    setHydrated(false)
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (saveState === 'saving') return
    setSaveState('saving')
    setSaveError('')
    const ids = courseIds
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
    const result = await save({ display_name: displayName.trim() || null, completed_course_ids: ids })
    if (!result.ok) {
      setSaveState('error')
      setSaveError(result.message)
    } else if ('staleOwner' in result && result.staleOwner) {
      setSaveState('stale')
    } else {
      setSaveState('saved')
    }
  }

  return (
    <section className="panel" aria-live="polite">
      <h2>{t('account.signedInAs')}</h2>
      <p>
        <code>{user.email ?? user.id}</code>
      </p>

      {phase.kind === 'loading' ? (
        <p className="state state-loading" role="status">{t('account.loadingProfile')}</p>
      ) : phase.kind === 'error' ? (
        <p className="banner banner-error" role="alert">
          {t('account.profileLoadFailed')} <code>{phase.message}</code>
        </p>
      ) : phase.kind === 'ready' ? (
        <form onSubmit={handleSave}>
          <label className="field">
            <span>{t('account.displayName')}</span>
            <input
              type="text"
              maxLength={80}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t('account.courseIds')}</span>
            <textarea
              rows={2}
              value={courseIds}
              onChange={(e) => setCourseIds(e.target.value)}
              placeholder={t('account.courseIdsPlaceholder')}
            />
          </label>
          <p className="note">{t('account.courseIdsHint')}</p>
          {saveState === 'saved' ? (
            <p className="state state-ok" role="status">{t('account.saved')}</p>
          ) : null}
          {saveState === 'stale' ? (
            <p className="banner banner-warn" role="status">{t('account.saveStale')}</p>
          ) : null}
          {saveState === 'error' ? (
            <p className="banner banner-error" role="alert">
              {t('account.saveFailed')} <code>{saveError}</code>
            </p>
          ) : null}
          <div className="account-actions">
            <button type="submit" disabled={saveState === 'saving'}>
              {saveState === 'saving' ? t('account.saving') : t('account.save')}
            </button>
            <button type="button" onClick={() => void onSignOut()}>
              {t('account.signOut')}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  )
}
