import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLanguage } from '../../i18n/LanguageContext'
import { usePageTitle } from '../../usePageTitle'
import { useDataVersion } from '../../data/DataVersionContext'
import { ACTIVITY_TYPE_LABELS, TOPIC_LABELS, OPPORTUNITY_KIND_LABELS, BEGINNER_LEVEL_LABELS, FORMAT_LABELS, labelFor, type BilingualLabel } from '../../data/labels'
import { DatasetStatePanels, useMarketBundle } from '../market/useMarketBundle'
import { FavoriteButton } from '../favorites/FavoritesContext'
import { calendarIssue, downloadCalendar, safeExternalUrl } from '../../lib/calendar'
import { EMPTY_OPPORTUNITY_FILTER, filterOpportunities, opportunityState, readOpportunityFilter, writeOpportunityFilter, type OpportunityFilter } from './criteria'

export function OpportunitiesPage() {
  const { lang } = useLanguage(), text = (en: string, zh: string) => lang === 'zh' ? zh : en
  usePageTitle(text('Opportunities', '活动与实践机会'))
  const { config } = useDataVersion(), catalog = useMarketBundle(config.opportunitiesBundlePath ?? config.pathwaysBundlePath)
  const [params, setParams] = useSearchParams(), search = params.toString()
  const [filter, setFilter] = useState(() => readOpportunityFilter(params))
  const latestFilter = useRef(filter), observedSearch = useRef(search)
  useEffect(() => {
    if (observedSearch.current === search) return
    observedSearch.current = search
    const next = readOpportunityFilter(new URLSearchParams(search))
    latestFilter.current = next
    setFilter(next)
  }, [search])
  const [from, setFrom] = useState(filter.from), [to, setTo] = useState(filter.to), [error, setError] = useState('')
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id) }, [])
  useEffect(() => { setFrom(filter.from); setTo(filter.to) }, [filter.from, filter.to])
  const bundle = catalog.phase.phase === 'ok' ? catalog.phase.bundle : null
  const items = bundle ? filterOpportunities(bundle.opportunities, filter, now) : []
  const update = (next: Partial<OpportunityFilter>) => {
    const value = { ...latestFilter.current, ...next }
    latestFilter.current = value
    setFilter(value) // controlled inputs update immediately, before router transitions
    const query = writeOpportunityFilter(value)
    observedSearch.current = query.toString()
    setParams(query)
  }
  function choices(key: 'kind' | 'types' | 'topics' | 'skills' | 'levels' | 'formats', title: string, labels: Record<string, BilingualLabel>) {
    return <details className="op-filter"><summary>{title} ({filter[key].length})</summary><fieldset><legend>{title}</legend>
      {Object.entries(labels).map(([value, label]) => <label className="market-option" key={value}>
        <input type="checkbox" value={value} checked={filter[key].includes(value)} onChange={() => update({ [key]: filter[key].includes(value) ? filter[key].filter(x => x !== value) : [...filter[key], value] })} />
        {lang === 'zh' ? label.zh : label.en}
      </label>)}
    </fieldset></details>
  }
  const statusLabels = {
    open: text('Open / check eligibility', '开放中／请核对资格'), registration_closed: text('Registration closed', '报名已截止'),
    ended: text('Ended', '活动已结束'), needs_review: text('Needs reconfirmation', '待重新核实'), date_unknown: text('Time to be confirmed', '时间待确认'),
  }
  return <>
    <h1>{text('Opportunities', '活动与实践机会')}</h1>
    <p>{text('Browse events and ongoing opportunities. Choices within a filter use OR. Different filters use AND.', '浏览活动与持续机会。同一筛选内多选为“或”，不同筛选之间为“且”。')}</p>
    <p className="note">{text('Calendar downloads are snapshots. Organizer changes will not update an imported calendar automatically. Date-only and unconfirmed times cannot be exported.', '日历下载是时间快照，主办方后续修改不会自动同步。仅日期或未确认的时间不能导出。')}</p>
    <DatasetStatePanels phase={catalog.phase} onRetry={catalog.reload} />
    {bundle?.manifest.run_status === 'failed' ? <p role="alert">{text('This dataset failed validation for use.', '该数据批次不可使用。')}</p> : bundle && <>
      <p className="note">{text('Snapshot', '数据版本')}: {bundle.manifest.dataset_version} · {bundle.manifest.generated_at}</p>
      <section className="panel" aria-label={text('Opportunity filters', '机会筛选')}>
        <label>{text('Search title, description or organizer', '搜索标题、说明或组织')}<input type="search" value={filter.q} onChange={e => update({ q: e.target.value })} /></label>
        <label>{text('Show', '显示范围')} <select aria-label={text('Show', '显示范围')} value={filter.view} onChange={e => update({ view: e.target.value as OpportunityFilter['view'] })}>
          <option value="current">{text('Current', '当前机会')}</option><option value="history">{text('History', '历史活动')}</option>
          <option value="all">{config.mode === 'integration' ? text('All packaged records', '包内全部记录') : text('All approved', '全部已批准记录')}</option>
        </select></label>
        <div className="op-filter-grid">
          {choices('kind', text('Kind', '类别'), OPPORTUNITY_KIND_LABELS)}
          {choices('types', text('Activity type', '活动类型'), ACTIVITY_TYPE_LABELS)}
          {choices('topics', text('Topic', '主题'), TOPIC_LABELS)}
          {choices('skills', text('Skills', '能力'), Object.fromEntries(bundle.skills.map(s => [s.skill_id, { en: s.label, zh: s.label }])))}
          {choices('levels', text('Entry requirements', '入门门槛'), BEGINNER_LEVEL_LABELS)}
          {choices('formats', text('Format', '参与方式'), FORMAT_LABELS)}
        </div>
        <div className="op-dates"><label>{text('Starts on or after', '开始日期自')}<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label>{text('Starts on or before', '开始日期至')}<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
          <button type="button" onClick={() => { if (from && to && from > to) { setError(text('Start date must not follow end date.', '起始日期不能晚于结束日期。')); return } setError(''); update({ from, to }) }}>{text('Apply dates', '应用日期')}</button>
        </div>
        <button type="button" onClick={() => { setError(''); setFrom(''); setTo(''); update(EMPTY_OPPORTUNITY_FILTER) }}>{text('Clear filters', '清空筛选')}</button>
      </section>
      {error && <p role="alert" className="banner banner-warn">{error}</p>}
      <p role="status">{items.length} {text('matching opportunities', '条匹配机会')}</p>
      {items.length === 0 && <p className="empty-state">{text('No matching opportunities. Try clearing the filters.', '暂无匹配机会，可以清空筛选重试。')}</p>}
      <div className="op-list">{items.map(item => {
        const state = opportunityState(item, now), issue = calendarIssue(item, now)
        const review = config.opportunityReviews?.[item.opportunity_id]
        const reviewLabel = review === 'auto_candidate' ? text('Automatic candidate', '自动候选')
          : review === 'human_approved' ? text('Human approved', '人工批准')
            : text('Unknown', '未知')
        const source = safeExternalUrl(item.source_url), registration = safeExternalUrl(item.registration_url)
        const date = (field: 'start' | 'end' | 'deadline') => item[`${field}_precision`] === 'datetime' ? item[`${field}_at`] : item[`${field}_precision`] === 'date' ? item[`${field}_date`] : text('Not stated', '未说明')
        return <article className="panel opportunity-card" key={item.opportunity_id}>
          <h2>{item.title}</h2><p><span className="chip">{labelFor(OPPORTUNITY_KIND_LABELS, item.kind, lang)}</span> <span className="chip">{statusLabels[state]}</span></p>
          <p>{item.description}</p><p>{text('Organizer', '组织')}: {item.organizer_id}</p>
          <p>{text('Start / end', '开始／结束')}: {date('start')} / {date('end')}</p>
          <p>{text('Registration deadline', '报名截止')}: {date('deadline')}</p>
          <p>{text('Source time zone', '来源时区')}: {item.timezone ?? text('Not stated', '未说明')}</p>
          <p>{text('Location', '地点')}: {item.location ?? text('Not stated', '未说明')} · {labelFor(FORMAT_LABELS, item.format, lang)}</p>
          <p>{labelFor(BEGINNER_LEVEL_LABELS, item.beginner_level, lang)} · {item.eligibility_note ?? text('Eligibility not stated; confirm with the organizer.', '资格未说明，请向主办方确认。')}</p>
          <p>{item.activity_type_ids.map(id => labelFor(ACTIVITY_TYPE_LABELS, id, lang)).join(' · ')} / {item.topic_ids.map(id => labelFor(TOPIC_LABELS, id, lang)).join(' · ')}</p>
          <p>{text('Skill evidence', '技能依据')}: {item.classification_reasons.join(' · ') || text('Not stated', '未说明')}</p>
          <p className="note">{text('Last verified', '最后核实')}: {item.verified_at}</p>
          {config.mode === 'integration' ? <p className="note">{text('Review source', '审核来源')}: {reviewLabel}</p> : null}
          <div className="op-actions">{source && <a href={source} target="_blank" rel="noreferrer">{text('Original source', '原帖来源')}</a>}
            {registration && state !== 'ended' && state !== 'registration_closed' && <a href={registration} target="_blank" rel="noreferrer">{text('Registration details', '报名详情')}</a>}
            <FavoriteButton type="opportunity" id={item.opportunity_id} />
            <button type="button" disabled={issue !== null} onClick={() => { try { downloadCalendar(item) } catch { setError(text('This event is no longer eligible for calendar export.', '该活动当前不满足日历导出条件。')) } }}>{text('Download calendar (.ics)', '下载日历（.ics）')}</button>
          </div>
          {issue && <p className="note">{text('Calendar unavailable: exact, reviewed start and end times are required; ended events cannot be exported.', '无法导出日历：需要已核实的精确开始与结束时间，且活动尚未结束。')}</p>}
        </article>
      })}</div>
    </>}
  </>
}
