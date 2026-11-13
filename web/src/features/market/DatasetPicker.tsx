import { useLanguage } from '../../i18n/LanguageContext'
import type { TxKey } from '../../i18n/en'
import type { DataMode, DataVersionConfig } from '../../data/sources'

export interface MarketDatasetOption {
  id: string
  path: string
  labelKey: TxKey
  noteKey: TxKey
  synthetic: boolean
  websiteSide: boolean
  mode: DataMode
}

const CONTRACT_DATASETS: MarketDatasetOption[] = [
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

export function marketDatasets(config: DataVersionConfig): MarketDatasetOption[] {
  if (config.mode === 'demo') return [
    {
      id: 'demo',
      path: config.marketBundlePath,
      labelKey: 'market.dataset.demo.label',
      noteKey: 'market.dataset.demo.note',
      synthetic: true,
      websiteSide: true,
      mode: 'demo',
    },
    ...CONTRACT_DATASETS,
  ]
  return [{
    id: config.mode,
    path: config.marketBundlePath,
    labelKey: config.mode === 'integration' ? 'market.dataset.integration.label' : 'market.dataset.published.label',
    noteKey: config.mode === 'integration' ? 'market.dataset.integration.note' : 'market.dataset.published.note',
    synthetic: config.synthetic === true,
    websiteSide: false,
    mode: config.mode,
  }]
}

export function DatasetPicker({ datasets, selected, onSelect }: {
  datasets: MarketDatasetOption[]
  selected: string
  onSelect: (id: string) => void
}) {
  const { t } = useLanguage()
  return (
    <fieldset className="fixture-picker">
      <legend>{t('market.datasetLegend')}</legend>
      {datasets.map((dataset) => (
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
