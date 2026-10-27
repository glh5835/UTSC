import { useEffect } from 'react'
import { useLanguage } from './i18n/LanguageContext'

/**
 * Set the document title for the current page. Called inside each page
 * component: when a page renders, its title is guaranteed to be applied, in
 * the active language. Routes carry the page identity; the site name is a
 * constant suffix.
 */
export function usePageTitle(pageTitle: string): void {
  const { t } = useLanguage()
  useEffect(() => {
    document.title = `${pageTitle} · ${t('app.title')}`
  }, [pageTitle, t])
}
