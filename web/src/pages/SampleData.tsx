import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import {
  BundleFetchError,
  createBundleValidator,
  loadAndValidateBundle,
  loadSchemaSet,
  type ValidationIssue,
} from '../data/validation'
import { FIXTURE_SOURCES, getFixtureSource, UPSTREAM_CONTRACT_COMMIT, type FixtureId } from '../data/sources'
import { stalenessInfo } from '../data/staleness'
import { labelFor, RUN_STATUS_LABELS } from '../data/labels'
import type { UtscBundle } from '../data/types'
import type { TxKey } from '../i18n/en'
import { usePageTitle } from '../usePageTitle'
import {
  CoursesSection,
  DateValue,
  EmptySection,
  JobsSection,
  OpportunitiesSection,
  ResourcesSection,
  SkillsTable,
  useSkillLookup,
} from '../components/bundleViews'

type LoadPhase =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'rejected'; issues: ValidationIssue[] }
  | { phase: 'ok'; bundle: UtscBundle }

// The schema set is small and static; load and compile it once per session.
let validatorPromise: Promise<ReturnType<typeof createBundleValidator>> | null = null
function getValidator() {
  validatorPromise ??= loadSchemaSet().then(createBundleValidator)
  return validatorPromise
}

const FIXTURE_TEXT_KEYS: Record<FixtureId, { label: TxKey; description: TxKey }> = {
  valid: { label: 'fixture.valid.label', description: 'fixture.valid.description' },
  empty: { label: 'fixture.empty.label', description: 'fixture.empty.description' },
  invalid: { label: 'fixture.invalid.label', description: 'fixture.invalid.description' },
}

function ManifestPanel({ bundle, staleDays }: { bundle: UtscBundle; staleDays: { ageDays: number; stale: boolean; thresholdDays: number } }) {
  const { t, lang } = useLanguage()
  const manifest = bundle.manifest
  return (
    <section className="panel" aria-labelledby="manifest-heading">
      <h2 id="manifest-heading">{t('manifest.title')}</h2>
      <dl className="def-list manifest">
        <div className="def-row">
          <dt>{t('manifest.schemaVersion')}</dt>
          <dd>
            <code>{manifest.schema_version}</code>
          </dd>
        </div>
        <div className="def-row">
          <dt>{t('manifest.datasetVersion')}</dt>
          <dd>
            <code>{manifest.dataset_version}</code>
          </dd>
        </div>
        <div className="def-row">
          <dt>{t('manifest.generatedAt')}</dt>
          <dd>
            <DateValue value={manifest.generated_at} precision="datetime" precisionLabel="UTC" />
          </dd>
        </div>
        <div className="def-row">
          <dt>{t('manifest.collectedFrom')}</dt>
          <dd>{manifest.collected_from ? <code>{manifest.collected_from}</code> : <span className="none">—</span>}</dd>
        </div>
        <div className="def-row">
          <dt>{t('manifest.collectedTo')}</dt>
          <dd>{manifest.collected_to ? <code>{manifest.collected_to}</code> : <span className="none">—</span>}</dd>
        </div>
        <div className="def-row">
          <dt>{t('manifest.postingFrom')}</dt>
          <dd>{manifest.posting_from ? <code>{manifest.posting_from}</code> : <span className="none">—</span>}</dd>
        </div>
        <div className="def-row">
          <dt>{t('manifest.postingTo')}</dt>
          <dd>{manifest.posting_to ? <code>{manifest.posting_to}</code> : <span className="none">—</span>}</dd>
        </div>
        <div className="def-row">
          <dt>{t('manifest.queryConfigVersion')}</dt>
          <dd>
            <code>{manifest.query_config_version}</code>
          </dd>
        </div>
        <div className="def-row">
          <dt>{t('manifest.runStatus')}</dt>
          <dd>{labelFor(RUN_STATUS_LABELS, manifest.run_status, lang)}</dd>
        </div>
        <div className="def-row">
          <dt>{t('manifest.sampleCount')}</dt>
          <dd>{manifest.sample_count}</dd>
        </div>
      </dl>
      <p className="note">{t('manifest.timesNote')}</p>
      {staleDays.stale ? (
        <p className="banner banner-warn" role="status">
          {t('stale.banner', { days: staleDays.ageDays, threshold: staleDays.thresholdDays })}
        </p>
      ) : null}
    </section>
  )
}

function BundleSections({ bundle }: { bundle: UtscBundle }) {
  const { t } = useLanguage()
  const lookup = useSkillLookup(bundle.skills)
  const isEmpty =
    bundle.market_jobs.length === 0 &&
    bundle.skills.length === 0 &&
    bundle.courses.length === 0 &&
    bundle.resources.length === 0 &&
    bundle.opportunities.length === 0
  return (
    <>
      {isEmpty ? <p className="empty-state bundle-empty">{t('empty.bundle')}</p> : null}
      <section aria-labelledby="skills-heading">
        <h2 id="skills-heading">{t('section.skills', { count: bundle.skills.length })}</h2>
        {bundle.skills.length === 0 ? <EmptySection message={t('empty.skills')} /> : <SkillsTable skills={bundle.skills} />}
      </section>
      <section aria-labelledby="jobs-heading">
        <h2 id="jobs-heading">{t('section.jobs', { count: bundle.market_jobs.length })}</h2>
        {bundle.market_jobs.length === 0 ? (
          <EmptySection message={t('empty.jobs')} />
        ) : (
          <JobsSection jobs={bundle.market_jobs} lookup={lookup} />
        )}
      </section>
      <section aria-labelledby="courses-heading">
        <h2 id="courses-heading">{t('section.courses', { count: bundle.courses.length })}</h2>
        {bundle.courses.length === 0 ? (
          <EmptySection message={t('empty.courses')} />
        ) : (
          <CoursesSection courses={bundle.courses} lookup={lookup} />
        )}
      </section>
      <section aria-labelledby="resources-heading">
        <h2 id="resources-heading">{t('section.resources', { count: bundle.resources.length })}</h2>
        {bundle.resources.length === 0 ? (
          <EmptySection message={t('empty.resources')} />
        ) : (
          <ResourcesSection resources={bundle.resources} lookup={lookup} />
        )}
      </section>
      <section aria-labelledby="opportunities-heading">
        <h2 id="opportunities-heading">{t('section.opportunities', { count: bundle.opportunities.length })}</h2>
        {bundle.opportunities.length === 0 ? (
          <EmptySection message={t('empty.opportunities')} />
        ) : (
          <OpportunitiesSection opportunities={bundle.opportunities} lookup={lookup} />
        )}
      </section>
    </>
  )
}

export function SampleDataPage() {
  const { t, lang } = useLanguage()
  usePageTitle(t('sample.title'))
  const [selected, setSelected] = useState<FixtureId>('valid')
  const [phase, setPhase] = useState<LoadPhase>({ phase: 'loading' })
  const [retryNonce, setRetryNonce] = useState(0)
  const [staleness, setStaleness] = useState<{ ageDays: number; stale: boolean; thresholdDays: number } | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    const request = ++requestRef.current
    setPhase({ phase: 'loading' })
    let cancelled = false

    async function run() {
      try {
        const validator = await getValidator()
        const source = getFixtureSource(selected)
        const result = await loadAndValidateBundle(source.path, validator)
        if (cancelled || request !== requestRef.current) return
        if (result.status === 'ok') {
          setStaleness(stalenessInfo(result.bundle.manifest.generated_at, new Date()))
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
  }, [selected, retryNonce])

  function renderBody() {
    switch (phase.phase) {
      case 'loading':
        return (
          <p className="state state-loading" role="status" aria-live="polite">
            {t('sample.loading')}
          </p>
        )
      case 'error':
        return (
          <section className="panel panel-error" aria-live="assertive">
            <h2>{t('sample.errorTitle')}</h2>
            <p>{t('sample.errorMessage')}</p>
            <button type="button" onClick={() => setRetryNonce((n) => n + 1)}>
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
            {phase.issues.length > 20 ? <p className="note">+{phase.issues.length - 20} …</p> : null}
            <button type="button" onClick={() => setRetryNonce((n) => n + 1)}>
              {t('sample.retry')}
            </button>
          </section>
        )
      case 'ok':
        return (
          <>
            <p className="state state-ok" role="status" aria-live="polite">
              {t('sample.loadedOk')}
            </p>
            <ManifestPanel bundle={phase.bundle} staleDays={staleness ?? { ageDays: 0, stale: false, thresholdDays: 0 }} />
            <BundleSections bundle={phase.bundle} />
          </>
        )
    }
  }

  const selectedSource = getFixtureSource(selected)

  return (
    <>
      <h1>{t('sample.title')}</h1>
      <p>{t('sample.intro')}</p>
      <fieldset className="fixture-picker">
        <legend>{t('sample.selectorLegend')}</legend>
        {FIXTURE_SOURCES.map((source) => {
          const keys = FIXTURE_TEXT_KEYS[source.id]
          return (
            <label key={source.id} className="fixture-option">
              <input
                type="radio"
                name="fixture"
                value={source.id}
                checked={selected === source.id}
                onChange={() => setSelected(source.id)}
              />
              <span>
                <strong>{t(keys.label)}</strong> <span className="chip chip-synthetic">SYNTHETIC</span>
                <br />
                <span className="muted">{t(keys.description)}</span>
              </span>
            </label>
          )
        })}
      </fieldset>

      <p className="note provenance">
        {t('sample.provenanceHeading')}: {t('sample.provenanceLine', { commit: UPSTREAM_CONTRACT_COMMIT })}{' '}
        <code>
          {selectedSource.upstreamPath} @ {UPSTREAM_CONTRACT_COMMIT.slice(0, 7)}
        </code>{' '}
        <span className="chip chip-synthetic">{lang === 'zh' ? '模拟' : 'synthetic'}</span>
      </p>

      {renderBody()}
      <p className="note">{t('field.originalNote')}</p>
    </>
  )
}
