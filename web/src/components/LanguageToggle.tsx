import { useLanguage } from '../i18n/LanguageContext'

/** Two explicit buttons (not a select) so the switch is a single global tap
 * and fully keyboard operable. aria-pressed exposes the active language. */
export function LanguageToggle() {
  const { lang, setLang, t } = useLanguage()
  return (
    <div className="lang-toggle" role="group" aria-label={t('app.languageSwitch')}>
      <button
        type="button"
        lang="en"
        aria-pressed={lang === 'en'}
        onClick={() => setLang('en')}
      >
        English
      </button>
      <button
        type="button"
        lang="zh-CN"
        aria-pressed={lang === 'zh'}
        onClick={() => setLang('zh')}
      >
        中文
      </button>
    </div>
  )
}
