import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext'
import {
  BundleFetchError,
  createBundleValidator,
  loadAndValidateBundle,
  loadSchemaSet,
  type ValidationIssue,
} from '../../data/validation'
import { stalenessInfo } from '../../data/staleness'
import type { UtscBundle } from '../../data/types'

export type LoadPhase =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'rejected'; issues: ValidationIssue[] }
  | { phase: 'ok'; bundle: UtscBundle }

const validatorPromise: Promise<ReturnType<typeof createBundleValidator>> = loadSchemaSet().then(createBundleValidator)

export interface DatasetResult {
  phase: LoadPhase
  stale: { ageDays: number; stale: boolean; thresholdDays: number } | null
  reload: () => void
}

/** Loads and validates one bundle URL; shared by the market pages with the
 * same whole-bundle rejection semantics as the sample viewer. */
export function useMarketBundle(url: string): DatasetResult {
  const [phase, setPhase] = useState<LoadPhase>({ phase: 'loading' })
  const [stale, setStale] = useState<DatasetResult['stale']>(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const requestRef = useRef(0)

  useEffect(() => {
    const request = ++requestRef.current
    setPhase({ phase: 'loading' })
    setStale(null)
    let cancelled = false
    async function run() {
      try {
        const validator = await validatorPromise
        const result = await loadAndValidateBundle(url, validator)
        if (cancelled || request !== requestRef.current) return
        if (result.status === 'ok') {
          setStale(stalenessInfo(result.bundle.manifest.generated_at, new Date()))
          setPhase({ phase: 'ok', bundle: result.bundle })
        } else {
          setPhase({ phase: 'rejected', issues: result.issues })
        }
      } catch (error) {
        if (cancelled || request !== requestRef.current) return
        if (!(error instanceof BundleFetchError)) {
          console.error('Unexpected bundle load failure', error)
        }
        setPhase({ phase: 'error' })
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [url, retryNonce])

  return { phase, stale, reload: () => setRetryNonce((n) => n + 1) }
}

/** Loading / fetch-error / rejected panel shared by both market pages. */
export function DatasetStatePanels({ phase, onRetry }: { phase: LoadPhase; onRetry: () => void }) {
  const { t } = useLanguage()
  switch (phase.phase) {
    case 'loading':
      return (
        <p className="state state-loading" role="status" aria-live="polite">
          {t('market.loading')}
        </p>
      )
    case 'error':
      return (
        <section className="panel panel-error" aria-live="assertive">
          <h2>{t('sample.errorTitle')}</h2>
          <p>{t('market.errorMessage')}</p>
          <button type="button" onClick={onRetry}>
            {t('sample.retry')}
          </button>
        </section>
      )
    case 'rejected':
      return (
        <section className="panel panel-error" aria-live="assertive">
          <h2>{t('sample.rejectedTitle')}</h2>
          <p>{t('sample.rejectedMessage')}</p>
          <p>{t('sample.issueHeading')}</p>
          <ul className="issue-list">
            {phase.issues.slice(0, 20).map((issue, index) => (
              <li key={`${issue.code}-${index}`}>
                <code className="issue-code">{issue.code}</code>
                {issue.path ? <code className="issue-path">{issue.path}</code> : null} {issue.message}
              </li>
            ))}
          </ul>
          <button type="button" onClick={onRetry}>
            {t('sample.retry')}
          </button>
        </section>
      )
    default:
      return null
  }
}
