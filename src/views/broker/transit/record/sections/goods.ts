// Раздел «Товары» записи транзита: новая строка, «есть ли данные», числа в сводках и проверка кодов ТН ВЭД.
import { inject, provide, reactive, type InjectionKey } from 'vue'
import { tnvedApi } from '@/api/tnved'
import type { ReestrGoodsItemInput } from '@/types/api'

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

/** Есть ли в товаре что-то, кроме валюты по умолчанию (тогда удаление спрашивает подтверждение). */
export function goodsHasData(item: ReestrGoodsItemInput): boolean {
  return Object.entries(item).some(([k, v]) => {
    if (k === 'currency' || v === null || v === undefined) return false
    if (typeof v === 'string') return v.trim() !== ''
    if (typeof v === 'number') return !Number.isNaN(v)
    return v !== false
  })
}

// Числа в сводке карточки и строке итогов — как на доске: «1 800», «96,0», «570,5». Пробелы — неразрывные.
const nf = (min: number, max: number) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: min, maximumFractionDigits: max })
const qtyFormat = nf(0, 4)
const kgFormat = nf(1, 4)
const valueFormat = nf(0, 2)
const nbsp = (s: string) => s.replace(/[   ]/g, ' ')

export const formatQty = (n: number): string => nbsp(qtyFormat.format(n))
export const formatKg = (n: number): string => nbsp(kgFormat.format(n))
export const formatValue = (n: number): string => nbsp(valueFormat.format(n))

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
