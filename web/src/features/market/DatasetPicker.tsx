import { useLanguage } from '../../i18n/LanguageContext'
import type { TxKey } from '../../i18n/en'

/**
 * Dataset picker for the market pages. The three entries are the upstream
 * contract fixtures (verbatim copies, SYNTHETIC by agreement) plus one
 * website-constructed demo package used while the data side's D4 export is
 * not delivered yet. The demo package is clearly labelled as website-side:
 * it is contract-valid, but it is NOT real market data and NOT upstream.
 */
export interface MarketDatasetOption {
  id: string
  path: string
  labelKey: TxKey
  noteKey: TxKey
  synthetic: boolean
  websiteSide: boolean
}

export const MARKET_DATASETS: MarketDatasetOption[] = [
  {
    id: 'demo',
    path: '/demo/a2-market-demo.json',
    labelKey: 'market.dataset.demo.label',
    noteKey: 'market.dataset.demo.note',
    synthetic: true,
    websiteSide: true,
  },
  {
    id: 'valid',
    path: '/contracts/fixtures/valid_bundle.json',
    labelKey: 'fixture.valid.label',
    noteKey: 'fixture.valid.description',
    synthetic: true,
    websiteSide: false,
  },
  {
    id: 'empty',
    path: '/contracts/fixtures/empty_bundle.json',
    labelKey: 'fixture.empty.label',
    noteKey: 'fixture.empty.description',
    synthetic: true,
    websiteSide: false,
  },
]

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
            <span className="chip chip-synthetic">SYNTHETIC</span>
            {dataset.websiteSide ? <span className="chip chip-warning">{t('market.dataset.websiteSide')}</span> : null}
            <br />
            <span className="muted">{t(dataset.noteKey)}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}
