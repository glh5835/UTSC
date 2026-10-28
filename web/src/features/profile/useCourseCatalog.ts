import { useEffect, useRef, useState } from 'react'
import {
  BundleFetchError,
  createBundleValidator,
  loadAndValidateBundle,
  loadSchemaSet,
  type ValidationIssue,
} from '../../data/validation'
import type { UtscBundle } from '../../data/types'
import { COURSE_CATALOG_PATH } from '../../data/sources'

export type CourseCatalogPhase =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'rejected'; issues: ValidationIssue[] }
  | { phase: 'ok'; bundle: UtscBundle }

let validatorPromise: Promise<ReturnType<typeof createBundleValidator>> | null = null
function validator() {
  validatorPromise ??= loadSchemaSet().then(createBundleValidator)
  return validatorPromise
}

/** Public course/skill fixture loader. Personal data is handled separately and
 * never mixed into this public bundle. */
export function useCourseCatalog() {
  const [phase, setPhase] = useState<CourseCatalogPhase>({ phase: 'loading' })
  const [retry, setRetry] = useState(0)
  const requestRef = useRef(0)

  useEffect(() => {
    const request = ++requestRef.current
    let cancelled = false
    setPhase({ phase: 'loading' })
    async function run() {
      try {
        const validate = await validator()
        const result = await loadAndValidateBundle(COURSE_CATALOG_PATH, validate)
        if (cancelled || request !== requestRef.current) return
        setPhase(result.status === 'ok' ? { phase: 'ok', bundle: result.bundle } : { phase: 'rejected', issues: result.issues })
      } catch (error) {
        if (cancelled || request !== requestRef.current) return
        if (!(error instanceof BundleFetchError)) console.error('Unexpected course catalog failure', error)
        setPhase({ phase: 'error' })
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [retry])

  return { phase, reload: () => setRetry((value) => value + 1) }
}
