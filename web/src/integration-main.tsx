import { mountPublicApp } from './mountPublicApp'
import type { DataVersionConfig } from './data/sources'

async function start() {
  const response = await fetch('/__d7/config.json')
  if (!response.ok) throw new Error('Integration configuration is unavailable')
  const config = await response.json() as DataVersionConfig
  if (config.mode !== 'integration' || config.schemaVersion !== '1.1.0' || !config.datasetVersion ||
      (config.runStatus !== 'complete' && config.runStatus !== 'partial')) {
    throw new Error('Unsupported integration configuration')
  }
  mountPublicApp(config)
}

void start().catch(() => {
  const alert = document.createElement('p')
  alert.setAttribute('role', 'alert')
  alert.textContent = 'D7 integration could not start. / D7 联调入口无法启动。'
  document.getElementById('root')!.replaceChildren(alert)
})
