import { Link } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { usePageTitle } from '../usePageTitle'

export function NotFoundPage() {
  const { t } = useLanguage()
  usePageTitle(t('notfound.title'))
  return (
    <>
      <h1>{t('notfound.title')}</h1>
      <p>{t('notfound.message')}</p>
      <p>
        <Link className="button" to="/">
          {t('notfound.back')}
        </Link>
      </p>
    </>
  )
}
