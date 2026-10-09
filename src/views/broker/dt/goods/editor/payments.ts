// Платежи гр. 47 товара (волна 6б, перенос из прежней карточки товара без изменения правил):
// порядок показа 1010 → 2010 → 5060 → прочие (как отдаёт расчёт); суммы — только из ответа сервера, клиент их не
// пересчитывает; пустая ручная строка — вид ставки «%», СП «ИУ», как раньше.
import type { Import40GoodsPayment } from '@/types/api'

const TAX_MODE_PRIORITY: Record<string, number> = { '1010': 0, '2010': 1, '5060': 2 }
const priority = (code: string | null | undefined) =>
  (code != null && code in TAX_MODE_PRIORITY ? TAX_MODE_PRIORITY[code] : 99)

/** Строки в порядке показа (копия массива, сами строки — те же объекты; сортировка устойчивая). */
export const sortPayments = (payments: readonly Import40GoodsPayment[] | null | undefined): Import40GoodsPayment[] =>
  [...(payments ?? [])].sort((a, b) => priority(a.taxModeCode) - priority(b.taxModeCode))

/**
 * Ключ подписи вида платежа (broker.dt.goods.editor.payments.modes.<ключ>) или null — подписи нет (тогда — название
 * из классификатора tax-modes). Акциз в КЕДЕН — код по виду товара (4420, 4400…), поэтому любой 4xxx; 2050 — антидемпинг (P3).
 */
export const taxModeLabelKey = (code: string | null | undefined): string | null => {
  const c = code?.trim()
  if (!c) return null
  if (c === '1010' || c === '2010' || c === '2050' || c === '5060') return c
  return /^4\d{3}$/.test(c) ? 'excise' : null
}

export const emptyPayment = (): Import40GoodsPayment => ({
  taxModeCode: null, taxBase: null, rateKindCode: '%', rateValue: null,
  rateUnitCode: null, rateCurrencyCode: null, weightRatio: null,
  rateDate: null, paymentFeatureCode: 'ИУ', amountKzt: null,
})

/** Ставка номинальная (rateLabel сервера) — при временном ввозе у пошлины и НДС показываем множитель 3% × мес. */
export const TEMP_IMPORT_CODES: ReadonlySet<string> = new Set(['2010', '5060'])

/** Сумма гр. 47 товара (₸) — только из пришедших сумм; нет ни одной — null. */
export const paymentsTotal = (payments: readonly Import40GoodsPayment[] | null | undefined): number | null => {
  let total: number | null = null
  for (const p of payments ?? []) if (p.amountKzt != null) total = (total ?? 0) + p.amountKzt
  return total
}

// Подписи последнего расчёта (basisLabel / rateLabel / bLine) — только для показа и сохраняются сервером как есть; после
// ручной правки числа они бы показывали старое значение. Поэтому ручная правка поля снимает зависящие от него подписи.
const BASE_FIELDS: ReadonlySet<keyof Import40GoodsPayment> = new Set(['taxBase'])
const RATE_FIELDS: ReadonlySet<keyof Import40GoodsPayment> = new Set(['rateValue', 'rateKindCode', 'rateUnitCode', 'rateCurrencyCode', 'weightRatio'])

/** Ручная правка поля строки гр. 47: присвоить; изменилось — снять устаревшие подписи расчёта. «Пересчитать» не ставит. */
export function setPaymentField<K extends keyof Import40GoodsPayment>(p: Import40GoodsPayment, key: K, value: Import40GoodsPayment[K]): boolean {
  if ((p[key] ?? null) === (value ?? null)) return false
  p[key] = value
  if (key === 'taxModeCode') {
    p.basisLabel = null
    p.rateLabel = null
    p.bLine = null
  } else if (BASE_FIELDS.has(key)) {
    p.basisLabel = null
  } else if (RATE_FIELDS.has(key)) {
    p.rateLabel = null
  }
  return true
}
