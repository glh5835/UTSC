import { useEffect, useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext'
import { labelFor, CAREER_LEVEL_LABELS, MARKET_AREA_LABELS, ROLE_LABELS } from '../../data/labels'
import {
  CANONICAL_ROLE_IDS,
  EMPTY_FILTER,
  FORMAL_CAREER_LEVELS,
  MARKET_AREAS,
  type MarketFilter,
} from './criteria'
import { toggleInDimension, validateDateRange, type DateRangeIssue } from './filterParams'
import type { TxKey } from '../../i18n/en'

/**
 * Filter panel. Semantics shown to the user match the computation exactly:
 * an empty (unticked) dimension is 全部 (no restriction); ticks within one
 * dimension are OR; dimensions combine with AND. The active state lives in
 * the URL (see filterParams.ts), so every control is a controlled component
 * driven by the parsed filter.
 */
export function FilterPanel({
  filter,
  onChange,
  compareMode,
}: {
  filter: MarketFilter
  onChange: (next: MarketFilter) => void
  /** Compare page: role ticks are owned by the role picker, so the role
   * dimension renders read-only information only. */
  compareMode?: boolean
}) {
  const { t, lang } = useLanguage()
  const [dateFromDraft, setDateFromDraft] = useState(filter.postedFrom ?? '')
  const [dateToDraft, setDateToDraft] = useState(filter.postedTo ?? '')
  const [dateIssue, setDateIssue] = useState<DateRangeIssue>(null)

  // URL changes (back/forward, clear, first load) are authoritative. Draft
  // edits do not touch the URL, so an intermediate reversed range cannot be
  // parsed away while the user is still editing it.
  useEffect(() => {
    setDateFromDraft(filter.postedFrom ?? '')
    setDateToDraft(filter.postedTo ?? '')
    setDateIssue(null)
  }, [filter.postedFrom, filter.postedTo])

  function applyDates() {
    const issue = validateDateRange(dateFromDraft, dateToDraft)
    setDateIssue(issue)
    if (issue !== null) return
    onChange({
      ...filter,
      postedFrom: dateFromDraft.trim() || null,
      postedTo: dateToDraft.trim() || null,
    })
  }

  function dimension<T extends string>(props: {
    legendKey: TxKey
    allKey: TxKey
    options: readonly T[]
    labels: Record<string, { en: string; zh: string }>
    selected: T[]
    disabled?: boolean
    onToggle?: (id: T) => void
  }) {
    const activeAll = props.selected.length === 0
    return (
      <fieldset className="market-dimension" disabled={props.disabled}>
        <legend>
          {t(props.legendKey)}{' '}
          <span className={`chip ${activeAll ? 'chip-active-all' : 'chip-muted'}`}>
            {activeAll ? t(props.allKey) : t('market.orSemantics')}
          </span>
        </legend>
        <div className="market-option-row">
          {props.options.map((id) => (
            <label key={id} className="market-option">
              <input
                type="checkbox"
                checked={props.selected.includes(id)}
                onChange={() => props.onToggle?.(id)}
              />
              <span>
                {labelFor(props.labels, id, lang)} <code className="chip-id">{id}</code>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    )
  }

  return (
    <section className="panel market-filter" aria-labelledby="market-filter-heading">
      <h2 id="market-filter-heading">{t('market.filterHeading')}</h2>
      <p className="note">{t('market.filterSemanticsNote')}</p>
      {/* On the compare page the role dimension belongs to the role picker,
          so the shared filter panel does not render it at all. */}
      {compareMode
        ? null
        : dimension({
            legendKey: 'market.dimension.role',
            allKey: 'market.allRoles',
            options: CANONICAL_ROLE_IDS,
            labels: ROLE_LABELS,
            selected: filter.roles,
            onToggle: (id) => onChange({ ...filter, roles: toggleInDimension(filter.roles, id) }),
          })}
      {dimension({
        legendKey: 'market.dimension.area',
        allKey: 'market.allAreas',
        options: MARKET_AREAS,
        labels: MARKET_AREA_LABELS,
        selected: filter.areas,
        onToggle: (id) => onChange({ ...filter, areas: toggleInDimension(filter.areas, id) }),
      })}
      {dimension({
        legendKey: 'market.dimension.level',
        allKey: 'market.allLevels',
        options: FORMAL_CAREER_LEVELS,
        labels: CAREER_LEVEL_LABELS,
        selected: filter.levels,
        onToggle: (id) => onChange({ ...filter, levels: toggleInDimension(filter.levels, id) }),
      })}
      <fieldset className="market-dimension">
        <legend>
          {t('market.dimension.date')}{' '}
          <span className={`chip ${filter.postedFrom === null && filter.postedTo === null ? 'chip-active-all' : 'chip-muted'}`}>
            {filter.postedFrom === null && filter.postedTo === null ? t('market.allDates') : t('market.inclusiveBounds')}
          </span>
        </legend>
        <div className="market-date-row">
          <label className="field">
            <span>{t('market.dateFrom')}</span>
            <input
              type="date"
              value={dateFromDraft}
              aria-invalid={dateIssue !== null}
              aria-describedby={dateIssue ? 'market-date-error' : undefined}
              onChange={(event) => {
                setDateFromDraft(event.target.value)
                setDateIssue(null)
              }}
            />
          </label>
          <label className="field">
            <span>{t('market.dateTo')}</span>
            <input
              type="date"
              value={dateToDraft}
              aria-invalid={dateIssue !== null}
              aria-describedby={dateIssue ? 'market-date-error' : undefined}
              onChange={(event) => {
                setDateToDraft(event.target.value)
                setDateIssue(null)
              }}
            />
          </label>
        </div>
        <button type="button" onClick={applyDates}>
          {t('market.dateApply')}
        </button>
        {dateIssue ? (
          <p className="banner banner-error" id="market-date-error" role="alert">
            {dateIssue === 'reversed_range' ? t('market.dateRangeReversed') : t('market.dateRangeInvalid')}
          </p>
        ) : null}
        <p className="note">{t('market.dateDraftNote')}</p>
        <p className="note">{t('market.dateNote')}</p>
      </fieldset>
      <button type="button" className="link-button" onClick={() => onChange({ ...EMPTY_FILTER })}>
        {t('market.clearFilters')}
      </button>
    </section>
  )
}
