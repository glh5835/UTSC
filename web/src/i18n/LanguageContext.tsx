import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import en, { type TxKey } from './en'
import zh from './zh'
import { htmlLangFor, initialLang, isLang, LANG_STORAGE_KEY, type Lang } from './lang'

const DICTIONARIES: Record<Lang, Record<TxKey, string>> = { en, zh }

interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  /** Translate a key, substituting {placeholder} values. */
  t: (key: TxKey, values?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function currentUrlLang(): Lang | null {
  try {
    const param = new URLSearchParams(window.location.search).get('lang')
    return isLang(param) ? param : null
  } catch {
    return null
  }
}

function syncUrlLang(lang: Lang): void {
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('lang', lang)
    window.history.replaceState(null, '', url)
  } catch {
    // URL sync is a convenience; language still persists in storage/state.
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() =>
    initialLang(window.location.search, typeof window !== 'undefined' ? window.localStorage : null),
  )

  useEffect(() => {
    document.documentElement.lang = htmlLangFor(lang)
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next)
    } catch {
      // Ignore storage failures; URL and state still carry the choice.
    }
    syncUrlLang(next)
  }, [])

  const t = useCallback(
    (key: TxKey, values?: Record<string, string | number>): string => {
      let text = DICTIONARIES[lang][key] ?? DICTIONARIES.en[key]
      if (values) {
        for (const [name, value] of Object.entries(values)) {
          text = text.replaceAll(`{${name}}`, String(value))
        }
      }
      return text
    },
    [lang],
  )

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used inside LanguageProvider')
  }
  return context
}

export { currentUrlLang }
