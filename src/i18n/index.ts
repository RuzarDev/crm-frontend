import { createI18n } from 'vue-i18n'
import ru from './locales/ru'

export type AppLocale = 'ru' | 'kk' | 'en'
export const SUPPORTED_LOCALES: AppLocale[] = ['ru', 'kk', 'en']
const STORAGE_KEY = 'appLocale'

export function getStoredLocale(): AppLocale {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v && (SUPPORTED_LOCALES as string[]).includes(v)) return v as AppLocale
  } catch {
    /* private mode / disabled storage — тихо откатываемся на ru */
  }
  return 'ru'
}

// Русский — в основной сборке (он же запасной язык для недостающих ключей). Казахский и английский
// (~280 КБ исходника) подгружаются отдельными файлами только при выборе языка: раньше все три словаря
// грузились на каждой странице у каждого пользователя.
export const i18n = createI18n({
  legacy: false,
  locale: 'ru',
  fallbackLocale: 'ru',
  messages: { ru },
})

const loaders: Record<Exclude<AppLocale, 'ru'>, () => Promise<{ default: typeof ru }>> = {
  kk: () => import('./locales/kk'),
  en: () => import('./locales/en'),
}

/** Подгружает словарь языка, если его ещё нет. */
export async function loadLocale(locale: AppLocale): Promise<void> {
  if (locale === 'ru' || (i18n.global.availableLocales as string[]).includes(locale)) return
  const mod = await loaders[locale]()
  // Тип словаря выведен из ru — добавляем другие языки через нетипизированный вызов.
  ;(i18n.global as unknown as { setLocaleMessage: (l: string, m: unknown) => void }).setLocaleMessage(locale, mod.default)
}

// lang на <html> с первого кадра: от него зависят шрифт казахских заголовков (main.css) и переносы.
try { document.documentElement.setAttribute('lang', getStoredLocale()) } catch { /* SSR/тесты */ }

export async function setLocale(locale: AppLocale) {
  try {
    await loadLocale(locale)
  } catch {
    locale = 'ru' // словарь не загрузился (сеть) — остаёмся на русском, а не на пустых ключах
  }
  ;(i18n.global.locale as unknown as { value: AppLocale }).value = locale
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    /* not fatal */
  }
  document.documentElement.setAttribute('lang', locale)
}
