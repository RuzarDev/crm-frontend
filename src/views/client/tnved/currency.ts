import { tnvedApi } from '@/api/tnved'
import type { TnvedCurrencyDto } from '@/types/api'

// Валюты клиента — общие для калькулятора платежей и «Курсов валют» (редизайн, волна 2b):
// один порядок частых валют, одно правило названия и один запрос на несколько минут.

/** Частые валюты — сверху, в этом порядке; остальные по коду. */
export const POPULAR_CURRENCIES = ['USD', 'EUR', 'RUB', 'CNY']

export const currencyRank = (code: string): number => {
  const i = POPULAR_CURRENCIES.indexOf(code)
  return i < 0 ? POPULAR_CURRENCIES.length : i
}

export const byCurrencyRank = (a: string, b: string): number => currencyRank(a) - currencyRank(b) || a.localeCompare(b)

const LOCALE_TAG: Record<string, string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' }
const namesCache = new Map<string, Intl.DisplayNames | null>()
const displayNames = (locale: string): Intl.DisplayNames | null => {
  const tag = LOCALE_TAG[locale] || 'ru-RU'
  if (!namesCache.has(tag)) {
    try {
      namesCache.set(tag, new Intl.DisplayNames([tag], { type: 'currency' }))
    } catch {
      namesCache.set(tag, null)
    }
  }
  return namesCache.get(tag) ?? null
}

/** Название валюты: по-русски — как у Нацбанка (с сервера), на других языках — Intl, без него — серверное. */
export function currencyName(code: string, serverName: string, locale: string): string {
  let intl = ''
  try {
    const n = displayNames(locale)?.of(code) ?? ''
    intl = n && n !== code ? n : ''
  } catch {
    intl = ''
  }
  return locale === 'ru' ? serverName || intl : intl || serverName
}

// ---- Курсы НБ РК: один запрос на CACHE_MS для всех экранов; ошибка не кэшируется («Повторить» спросит снова) ----
const CACHE_MS = 10 * 60_000
let cache: { at: number; promise: Promise<TnvedCurrencyDto[]> } | null = null

export function loadCurrencies(now = Date.now()): Promise<TnvedCurrencyDto[]> {
  if (cache && now - cache.at < CACHE_MS) return cache.promise
  const promise = tnvedApi.currencies({ silent: true }).then((r) => (Array.isArray(r.data) ? r.data : []))
  const entry = { at: now, promise }
  cache = entry
  promise.catch(() => {
    if (cache === entry) cache = null
  })
  return promise
}

/** Для тестов и выхода из системы: забыть закэшированные курсы. */
export function resetCurrenciesCache(): void {
  cache = null
}
