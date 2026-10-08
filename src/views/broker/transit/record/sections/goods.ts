// Раздел «Товары» записи транзита: новая строка, «есть ли данные», числа в сводках и проверка кодов ТН ВЭД.
import { inject, provide, reactive, type InjectionKey } from 'vue'
import { tnvedApi } from '@/api/tnved'
import type { ReestrGoodsItemInput } from '@/types/api'
import { calendarLocale } from '@/ui/date'

/** Новый товар — как в прежней форме: всё пусто, валюта USD. */
export const newGoodsItem = (): ReestrGoodsItemInput => ({
  description: null,
  tnvedCode: null,
  tnvedDescription: null,
  countryOfOrigin: null,
  quantity: null,
  unit: null,
  unitCode: null,
  grossWeightKg: null,
  netWeightKg: null,
  packagesCount: null,
  quantityTypeCode: null,
  customsValue: null,
  currency: 'USD',
})

/** Поля товара, которые заполняет пользователь (валюта по умолчанию и служебные id/sortOrder с сервера — не в счёт). */
const CONTENT_KEYS: (keyof ReestrGoodsItemInput)[] = [
  'description', 'tnvedCode', 'tnvedDescription', 'countryOfOrigin', 'quantity', 'unit', 'unitCode',
  'grossWeightKg', 'netWeightKg', 'packagesCount', 'quantityTypeCode', 'customsValue',
]

/** Есть ли в товаре данные пользователя (тогда удаление спрашивает подтверждение). */
export function goodsHasData(item: ReestrGoodsItemInput): boolean {
  return CONTENT_KEYS.some((k) => {
    const v = item[k]
    if (v === null || v === undefined) return false
    if (typeof v === 'string') return v.trim() !== ''
    return !Number.isNaN(v)
  })
}

// Числа в сводке карточки и строке итогов — как на доске: «1 800», «96,0», «570,5» (ru); формат — по языку
// интерфейса (ru-RU / kk-KZ / en-GB, как у дат). Пробелы-разделители — неразрывные.
const formats = new Map<string, Intl.NumberFormat>()
const nf = (locale: string, min: number, max: number) => {
  const tag = calendarLocale(locale)
  const key = `${tag}|${min}|${max}`
  let f = formats.get(key)
  if (!f) {
    f = new Intl.NumberFormat(tag, { minimumFractionDigits: min, maximumFractionDigits: max })
    formats.set(key, f)
  }
  return f
}
const nbsp = (s: string) => s.replace(/[\u202F\u00A0 ]/g, '\u00A0')

/** locale — язык интерфейса (useI18n().locale): 'ru' | 'kk' | 'en'. */
export const formatQty = (n: number, locale = 'ru'): string => nbsp(nf(locale, 0, 4).format(n))
export const formatKg = (n: number, locale = 'ru'): string => nbsp(nf(locale, 1, 4).format(n))
export const formatValue = (n: number, locale = 'ru'): string => nbsp(nf(locale, 0, 2).format(n))

/**
 * Проверка кодов ТН ВЭД на странице: результат — по коду, а не флагом в товаре (флаг уходил в тело, разбор B.13).
 * Один запрос tnvedApi.node на код; лист (is10) — верный, не лист или 404 — «кода нет в справочнике».
 */
export interface TnvedCheck {
  /** Код проверен, и его нет в справочнике (или это не 10-значный лист). */
  isInvalid: (code: string | null | undefined) => boolean
  validate: (code: string | null | undefined) => Promise<void>
  /** Код выбран в справочнике или найден «Найти» — верный. */
  markValid: (code: string) => void
}

export function createTnvedCheck(): TnvedCheck {
  const known = reactive<Record<string, boolean>>({})
  const pending = new Map<string, Promise<void>>()
  const norm = (code: string | null | undefined) => (code ?? '').trim()
  return {
    isInvalid: (code) => {
      const c = norm(code)
      return c !== '' && known[c] === false
    },
    validate: (code) => {
      const c = norm(code)
      if (!c || c in known) return Promise.resolve()
      const running = pending.get(c)
      if (running) return running
      const run = tnvedApi.node(c)
        .then((res) => { known[c] = res.data.is10 }, () => { known[c] = false })
        .finally(() => pending.delete(c))
      pending.set(c, run)
      return run
    },
    markValid: (code) => {
      const c = norm(code)
      if (c) known[c] = true
    },
  }
}

const TNVED_CHECK_KEY: InjectionKey<TnvedCheck> = Symbol('tnved-check')

/** Раздел «Товары» зовёт один раз: карточки делят кэш проверок. */
export function provideTnvedCheck(): TnvedCheck {
  const check = createTnvedCheck()
  provide(TNVED_CHECK_KEY, check)
  return check
}

/** Кэш раздела; карточка сама по себе (тест) — собственный. */
export function useTnvedCheck(): TnvedCheck {
  return inject(TNVED_CHECK_KEY, null) ?? createTnvedCheck()
}
