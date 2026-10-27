export type Lang = 'en' | 'zh'

export const LANG_STORAGE_KEY = 'utsc-web.lang'

export function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'zh'
}

/** Boot order: URL ?lang= wins (shareable links), then saved choice, then
 * English default. */
export function initialLang(search: string, storage: Storage | null): Lang {
  const param = new URLSearchParams(search).get('lang')
  if (isLang(param)) return param
  try {
    const stored = storage?.getItem(LANG_STORAGE_KEY)
    if (isLang(stored)) return stored
  } catch {
    // Storage unavailable (privacy mode etc.) — fall through to default.
  }
  return 'en'
}

export function htmlLangFor(lang: Lang): string {
  return lang === 'zh' ? 'zh-CN' : 'en'
}
