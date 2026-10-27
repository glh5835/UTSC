import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useLanguage } from '../i18n/LanguageContext'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

function Fallback({ onReload }: { onReload: () => void }) {
  const { t } = useLanguage()
  return (
    <section className="panel panel-error" aria-live="assertive">
      <h2>{t('errorBoundary.title')}</h2>
      <p>{t('errorBoundary.message')}</p>
      <button type="button" onClick={onReload}>
        {t('errorBoundary.reload')}
      </button>
    </section>
  )
}

/**
 * Render-time safety net. It never recovers data: pages above it already keep
 * their own validated-data state; this only stops a crash from blanking the
 * whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render error', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return <Fallback onReload={() => window.location.reload()} />
    }
    return this.props.children
  }
}
