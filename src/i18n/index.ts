import { createI18n } from 'vue-i18n'
import ru from './locales/ru'
import kk from './locales/kk'
import en from './locales/en'

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

export const i18n = createI18n({
  legacy: false,
  locale: getStoredLocale(),
  fallbackLocale: 'ru',
  messages: { ru, kk, en },
})

export function setLocale(locale: AppLocale) {
  ;(i18n.global.locale as unknown as { value: AppLocale }).value = locale
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    /* not fatal */
  }
  document.documentElement.setAttribute('lang', locale)
}
