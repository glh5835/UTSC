import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { useAuth } from '../auth/AuthContext'
import { useProfile } from '../auth/useProfile'
import { SUPABASE_ENV_KEYS } from '../lib/supabase'
import { usePageTitle } from '../usePageTitle'
import { useLanguage } from '../i18n/LanguageContext'

export function AccountPage() {
  const { t } = useLanguage()
  usePageTitle(t('nav.account'))
  const { phase, signUp, signIn, requestReset, mailState, verifyEmailLink, recovery, setNewPassword, accountDeleted } = useAuth()
  const [mode, setMode] = useState<'signIn' | 'signUp' | 'reset'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)

  function switchMode(next: typeof mode) {
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
      if (mode === 'reset') {
        const sent = await requestReset(email.trim())
        setNotice(sent
          ? { kind: 'info', text: t('account.resetSent') }
          : { kind: 'error', text: t('account.errorGeneric') })
      } else if (mode === 'signUp') {
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
    } catch {
      setNotice({ kind: 'error', text: t('account.errorGeneric') })
    } finally {
      setBusy(false)
    }
  }

  const authForm = (
    <form className="account-form" onSubmit={handleSubmit}>
      <h2>{t(mode === 'signIn' ? 'account.signInTitle' : mode === 'signUp' ? 'account.signUpTitle' : 'account.resetTitle')}</h2>
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
      {mode !== 'reset' ? <label className="field">
        <span>{t('account.passwordLabel')}</span>
        <input
          type="password"
          required
          minLength={mode === 'signUp' ? 8 : undefined}
          autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label> : null}
      {notice ? (
        <p className={notice.kind === 'error' ? 'banner banner-error' : 'banner banner-warn'} role="alert">
          {notice.text}
        </p>
      ) : null}
      <div className="account-actions">
        <button type="submit" disabled={busy}>
          {t(busy ? 'account.working' : mode === 'signIn' ? 'account.signIn' : mode === 'signUp' ? 'account.signUp' : 'account.sendReset')}
        </button>
        <button type="button" className="link-button" disabled={busy} onClick={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
          {mode === 'signIn' ? t('account.switchToSignUp') : t('account.switchToSignIn')}
        </button>
        {mode === 'signIn' ? <button type="button" className="link-button" disabled={busy} onClick={() => switchMode('reset')}>{t('account.forgotPassword')}</button> : null}
      </div>
    </form>
  )

  async function consumeEmailLink() {
    setBusy(true)
    try {
      await verifyEmailLink()
    } catch {
      setNotice({ kind: 'error', text: t('account.errorGeneric') })
    } finally {
      setBusy(false)
    }
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const saved = await setNewPassword(password)
      setNotice(saved
        ? { kind: 'info', text: t('account.passwordUpdated') }
        : { kind: 'error', text: t('account.errorGeneric') })
      if (saved) setPassword('')
    } catch {
      setNotice({ kind: 'error', text: t('account.errorGeneric') })
    } finally {
      setBusy(false)
    }
  }

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
      ) : mailState === 'verify' || mailState === 'verify-recovery' ? (
        <section className="panel">
          <h2>{t(mailState === 'verify' ? 'account.verifyEmail' : 'account.resetTitle')}</h2>
          {notice ? <p className="banner banner-error" role="alert">{notice.text}</p> : null}
          <button type="button" disabled={busy} onClick={() => void consumeEmailLink()}>{t('account.continueEmailLink')}</button>
        </section>
      ) : recovery ? (
        <form className="account-form" onSubmit={updatePassword}>
          <h2>{t('account.newPassword')}</h2>
          <label className="field">
            <span>{t('account.passwordLabel')}</span>
            <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} />
          </label>
          {notice ? <p className="banner banner-error" role="alert">{notice.text}</p> : null}
          <button type="submit" disabled={busy}>{t('account.savePassword')}</button>
        </form>
      ) : phase.kind === 'signedOut' ? (
        authForm
      ) : (
        // key on the user id: switching accounts remounts the signed-in view,
        // so the previous account's form inputs, save state and errors are
        // dropped immediately; a language switch keeps the key (and the
        // user's unsaved input).
        <SignedInView key={phase.user.id} user={phase.user} />
      )}
      {mailState === 'invalid' ? <p className="banner banner-error" role="alert">{t('account.invalidLink')}</p> : null}
      {mailState === 'confirmed' ? <p className="state state-ok" role="status">{t('account.emailConfirmed')}</p> : null}
      {accountDeleted && phase.kind === 'signedOut' ? <p className="state state-ok" role="status">{t('account.deleted')}</p> : null}
      {phase.kind === 'signedIn' && !recovery && notice?.kind === 'info' ? <p className="state state-ok" role="status">{notice.text}</p> : null}
      <p className="note">{t('account.scopeNote')}</p>
    </>
  )
}

function SignedInView({ user }: { user: User }) {
  const { t } = useLanguage()
  const { signOut, deleteAccount } = useAuth()
  const { phase, save } = useProfile(user)
  const [displayName, setDisplayName] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const [accountError, setAccountError] = useState('')
  const [accountBusy, setAccountBusy] = useState(false)
  const [confirmDeletion, setConfirmDeletion] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')

  // Hydrate the name when the profile arrives — but only once per account, so
  // a language switch never overwrites unsaved text. Course completion is
  // managed by A3's course page and passed through unchanged here.
  if (phase.kind === 'ready' && !hydrated) {
    setDisplayName(phase.data.display_name ?? '')
    setHydrated(true)
  }
  if ((phase.kind === 'idle' || phase.kind === 'loading' || phase.kind === 'error') && hydrated) {
    setHydrated(false)
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (saveState === 'saving' || phase.kind !== 'ready') return
    setSaveState('saving')
    setSaveError('')
    const result = await save({
      display_name: displayName.trim() || null,
      completed_course_ids: phase.data.completed_course_ids,
    })
    if ('staleOwner' in result && result.staleOwner) return
    if (!result.ok) {
      setSaveState('error')
      setSaveError(result.message)
    } else {
      setSaveState('saved')
    }
  }

  async function runAccountAction(action: () => Promise<boolean>, error: string) {
    setAccountBusy(true)
    setAccountError('')
    try {
      if (!await action()) setAccountError(error)
    } catch {
      setAccountError(error)
    } finally {
      setAccountBusy(false)
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
          <p className="note">{t('account.courseSummary', { count: phase.data.completed_course_ids.length })}</p>
          <p>
            <Link to="/courses">{t('account.manageCourses')}</Link>
            {' · '}
            <Link to="/profile">{t('account.manageSkills')}</Link>
          </p>
          {saveState === 'saved' ? (
            <p className="state state-ok" role="status">{t('account.saved')}</p>
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
          </div>
        </form>
      ) : null}
      <div className="account-actions">
        <button type="button" disabled={accountBusy} onClick={() => void runAccountAction(signOut, t('account.signOutFailed'))}>{t('account.signOut')}</button>
        {user.email && !confirmDeletion ? <button type="button" className="link-button" disabled={accountBusy} onClick={() => setConfirmDeletion(true)}>{t('account.deleteAccount')}</button> : null}
      </div>
      {confirmDeletion ? (
        <form className="account-form" onSubmit={event => {
          event.preventDefault()
          const password = deletePassword
          setDeletePassword('')
          void runAccountAction(() => deleteAccount(user, password), t('account.deleteFailed'))
        }}>
          <h3>{t('account.deleteAccount')}</h3>
          <p>{t('account.deleteWarning')}</p>
          <label className="field">
            <span>{t('account.currentPassword')}</span>
            <input type="password" autoComplete="current-password" required value={deletePassword} disabled={accountBusy} onChange={event => setDeletePassword(event.target.value)} />
          </label>
          <div className="account-actions">
            <button type="submit" disabled={accountBusy}>{t('account.confirmDelete')}</button>
            <button type="button" className="link-button" disabled={accountBusy} onClick={() => { setConfirmDeletion(false); setDeletePassword(''); setAccountError('') }}>{t('a3.common.cancel')}</button>
          </div>
        </form>
      ) : null}
      {accountError ? <p className="banner banner-error" role="alert">{accountError}</p> : null}
    </section>
  )
}
