import { Link } from 'react-router-dom'
import { useLanguage } from '../../i18n/LanguageContext'
import { usePageTitle } from '../../usePageTitle'
import { useDataVersion } from '../../data/DataVersionContext'
import { DatasetStatePanels, useMarketBundle } from '../market/useMarketBundle'
import { safeExternalUrl } from '../../lib/calendar'
import { FavoriteButton, useFavorites } from './FavoritesContext'

export function FavoritesPage() {
  const state = useFavorites(), { lang } = useLanguage(), { config } = useDataVersion()
  const text = (en: string, zh: string) => lang === 'zh' ? zh : en
  usePageTitle(text('Saved items', '我的收藏'))
  const resources = useMarketBundle(config.pathwaysBundlePath), opportunities = useMarketBundle(config.opportunitiesBundlePath ?? config.pathwaysBundlePath)
  return <><h1>{text('Saved items', '我的收藏')}</h1>
    {!state?.configured ? <p>{text('Cloud saving is not connected in this preview.', '此预览版尚未接通云端保存。')}</p> : !state.userId ? <Link to="/account">{text('Sign in to view your saved items.', '登录后查看本人的收藏。')}</Link> : <>
      {state.phase.kind === 'loading' && <p role="status">{text('Loading…', '加载中……')}</p>}
      {state.phase.kind === 'error' && <p role="alert">{state.phase.message} <button onClick={state.reload}>{text('Retry', '重试')}</button></p>}
      {state.error && <p role="alert">{state.error}</p>}
      <DatasetStatePanels phase={resources.phase} onRetry={resources.reload} /><DatasetStatePanels phase={opportunities.phase} onRetry={opportunities.reload} />
      {state.phase.kind === 'ready' && state.phase.items.length === 0 && <p>{text('No saved items yet.', '暂无收藏。')}</p>}
      {state.phase.kind === 'ready' && state.phase.items.map(item => {
        const resource = resources.phase.phase === 'ok' ? resources.phase.bundle.resources.find(r => r.resource_id === item.target_id) : null
        const opportunity = opportunities.phase.phase === 'ok' ? opportunities.phase.bundle.opportunities.find(o => o.opportunity_id === item.target_id && o.review_status === 'approved') : null
        const target = item.target_type === 'resource' ? resource : opportunity
        const loaded = item.target_type === 'resource' ? resources.phase.phase === 'ok' : opportunities.phase.phase === 'ok'
        const url = target ? safeExternalUrl(target.source_url) : null
        return <article className="panel" key={`${item.target_type}:${item.target_id}`}><h2>{target?.title ?? (loaded ? text('Source unavailable', '来源已不可用') : text('Loading source…', '正在加载来源……'))}</h2>
          <p><code>{item.target_id}</code></p><p>{text('Saved', '收藏于')}: {item.created_at}</p>
          {loaded && !target && <p>{text('The source was removed or is not approved. Your saved record is retained until you remove it.', '来源已移除或未获批准；收藏记录会保留，直到你主动移除。')}</p>}
          {url && <p><a href={url} target="_blank" rel="noreferrer">{text('Original source', '原始来源')}</a></p>}
          <FavoriteButton type={item.target_type} id={item.target_id} />
        </article>
      })}
    </>}
  </>
}
