import { useLanguage } from '../../i18n/LanguageContext'
import type { TxKey } from '../../i18n/en'
import { DATA_CONFIG, type DataMode } from '../../data/sources'

export interface MarketDatasetOption {
  id: string
  path: string
  labelKey: TxKey
  noteKey: TxKey
  synthetic: boolean
  websiteSide: boolean
  mode: DataMode
}

const DEMO_DATASETS: MarketDatasetOption[] = [
  {
    id: 'demo',
    path: '/demo/a2-market-demo.json',
    labelKey: 'market.dataset.demo.label',
    noteKey: 'market.dataset.demo.note',
    synthetic: true,
    websiteSide: true,
    mode: 'demo',
  },
  {
    id: 'valid',
    path: '/contracts/fixtures/valid_bundle.json',
    labelKey: 'fixture.valid.label',
    noteKey: 'fixture.valid.description',
    synthetic: true,
    websiteSide: false,
    mode: 'demo',
  },
  {
    id: 'empty',
    path: '/contracts/fixtures/empty_bundle.json',
    labelKey: 'fixture.empty.label',
    noteKey: 'fixture.empty.description',
    synthetic: true,
    websiteSide: false,
    mode: 'demo',
  },
]

export const MARKET_DATASETS: MarketDatasetOption[] = DATA_CONFIG.mode === 'demo'
  ? DEMO_DATASETS
  : [{
      id: DATA_CONFIG.mode,
      path: DATA_CONFIG.marketBundlePath,
      labelKey: DATA_CONFIG.mode === 'integration'
        ? 'market.dataset.integration.label'
        : 'market.dataset.published.label',
      noteKey: DATA_CONFIG.mode === 'integration'
        ? 'market.dataset.integration.note'
        : 'market.dataset.published.note',
      synthetic: false,
      websiteSide: false,
      mode: DATA_CONFIG.mode,
    }]

export function DatasetPicker({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const { t } = useLanguage()
  return (
    <fieldset className="fixture-picker">
      <legend>{t('market.datasetLegend')}</legend>
      {MARKET_DATASETS.map((dataset) => (
        <label key={dataset.id} className="fixture-option">
          <input type="radio" name="market-dataset" value={dataset.id} checked={selected === dataset.id} onChange={() => onSelect(dataset.id)} />
          <span>
            <strong>{t(dataset.labelKey)}</strong>{' '}
            {dataset.synthetic ? <span className="chip chip-synthetic">SYNTHETIC</span> : null}
            {dataset.mode === 'integration' ? <span className="chip chip-warning">{t('market.dataset.integrationBadge')}</span> : null}
            {dataset.websiteSide ? <span className="chip chip-warning">{t('market.dataset.websiteSide')}</span> : null}
            <br />
            <span className="muted">{t(dataset.noteKey)}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}
