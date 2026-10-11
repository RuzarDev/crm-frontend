// Чистые правила раздела «Платежи» (волна 6в, Task 2): итоги гр. 47 по видам, слияние расчёта с гр. В, сверка
// гр. 47 ↔ гр. В и снимок товаров для предпросмотра расчёта. Суммы — только с сервера (расчёт или записанные гр. 47),
// фронт их не пересчитывает, только складывает по виду (как печать ДТ).
import type { Import40CalculatePaymentsResponse } from '@/api/import40'
import type { Import40FactPayment, Import40GoodsItemInput } from '@/types/api'
import type { DtFormState } from '../dtPayload'
import { keyOf } from '../goods/useDtGoods'
import { PAYMENT_FIELDS } from '../goods/goodsStatus'
import { applyGoodsPaymentRows, isCalculatedTaxMode } from './paymentRows'

export interface PaymentModeTotal {
  /** Вид платежа (классификатор 2010); строки без вида — ''. */
  code: string
  amount: number
}

/** Порядок видов — по коду (как DtBlankPdf.PaymentTotalsByTaxMode: OrderBy(code)). */
const byCode = (a: PaymentModeTotal, b: PaymentModeTotal) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)

/**
 * Σ гр. 47 товаров по виду платежа, по коду — то же, что печать ДТ («В подробности подсчёта») и инф. лист ДТС:
 * без округления, пустая сумма — 0, строки без вида — в группе ''.
 */
export function totalsByMode(goods: readonly Pick<Import40GoodsItemInput, 'payments'>[]): PaymentModeTotal[] {
  const sums = new Map<string, number>()
  for (const g of goods) {
    for (const p of g.payments ?? []) {
      const code = p.taxModeCode ?? ''
      sums.set(code, (sums.get(code) ?? 0) + (p.amountKzt ?? 0))
    }
  }
  return [...sums].map(([code, amount]) => ({ code, amount })).sort(byCode)
}

/**
 * Σ гр. 47 по виду, какой она станет после «Записать»: строки товаров пишутся теми же правилами (applyGoodsPaymentRows)
 * в копию; товары с ошибкой расчёта и не попавшие в расчёт — со своими строками (их виды остаются в гр. В). Без ошибок
 * совпадает с totalsByTaxMode сервера (Σ округлённых строк). Форма не меняется.
 */
export function goodsTotalsAfterApply(
  goods: readonly Pick<Import40GoodsItemInput, 'payments'>[],
  res: Import40CalculatePaymentsResponse,
): PaymentModeTotal[] {
  const copy = { goodsItems: goods.map((g) => ({ payments: (g.payments ?? []).map((p) => ({ ...p })) })) }
  applyGoodsPaymentRows(copy as unknown as Pick<DtFormState, 'goodsItems'>, res)
  return totalsByMode(copy.goodsItems)
}

/** Итоги списком → { вид: сумма } для гр. В (строки гр. 47 без вида в гр. В не идут). */
export const totalsRecord = (list: readonly PaymentModeTotal[]): Record<string, number> =>
  Object.fromEntries(list.filter((x) => x.code).map((x) => [x.code, x.amount]))

/**
 * Позиции товаров (с 0), которые расчёт не пересчитал: ошибка расчёта или товара нет в ответе — их гр. 47 остаётся
 * прежней.
 */
export function notRecalculatedGoods(goodsCount: number, res: Import40CalculatePaymentsResponse): number[] {
  const ok = new Set(res.goodsRows.filter((r) => !r.error).map((r) => r.index))
  return Array.from({ length: goodsCount }, (_, i) => i).filter((i) => !ok.has(i))
}

/** Итоги расчёта (totalsByTaxMode сервера) списком по коду. */
export const totalsFromResponse = (totals: Readonly<Record<string, number>> | null | undefined): PaymentModeTotal[] =>
  Object.entries(totals ?? {}).map(([code, amount]) => ({ code, amount })).sort(byCode)

export interface FactMergeResult {
  /** Новые строки гр. В (порядок = порядок в XML): существующие на месте, новые — в конец. */
  rows: Import40FactPayment[]
  /** Виды, для которых добавлена строка. */
  added: string[]
  /** Виды, у которых заменена сумма единственной строки. */
  updated: string[]
  /** Виды с несколькими строками — не тронуты, «проверьте сумму». */
  multiple: string[]
  /** Рассчитываемые виды, которых больше нет в расчёте, — их строки удалены (§5-10). */
  removed: string[]
}

/** Новая строка гр. В из расчёта: курс 1, способ «БН», прочее пусто (XML гр. В — как прежде). */
const newFactRow = (code: string, amount: number): Import40FactPayment => ({
  taxModeCode: code, amount, exchangeRate: 1, paymentDocDate: null, payerTaxpayerId: null, paymentDate: null, paymentMethodCode: 'БН',
})

/**
 * Расчёт → гр. В (фактические платежи). Для каждого вида из расчёта: строки нет — добавить в конец; одна строка —
 * заменить её сумму; несколько строк (несколько платёжек) — не трогать и предупредить. Строки рассчитываемых видов
 * (1010, 2010, 2050, 5060, 4xxx), которых в totals больше нет, удаляются (сменился вид акциза — старый не уходит в
 * XML, §5-10); прочие виды и строки без вида — как были. totals — Σ гр. 47 после записи (goodsTotalsAfterApply):
 * вид товара с ошибкой расчёта в нём остаётся, и его строка гр. В не удаляется. fact не меняется: изменённые строки — копии, неизменённые —
 * те же объекты.
 */
export function mergeFactPayments(
  fact: readonly Import40FactPayment[],
  totals: Readonly<Record<string, number>>,
): FactMergeResult {
  const removed: string[] = []
  const rows = fact.filter((p) => {
    const code = p.taxModeCode
    if (!code || !isCalculatedTaxMode(code) || Object.prototype.hasOwnProperty.call(totals, code)) return true
    if (!removed.includes(code)) removed.push(code)
    return false
  })
  const added: string[] = []
  const updated: string[] = []
  const multiple: string[] = []
  for (const [code, amount] of Object.entries(totals)) {
    const at = rows.flatMap((p, i) => (p.taxModeCode === code ? [i] : []))
    if (at.length === 0) {
      rows.push(newFactRow(code, amount))
      added.push(code)
    } else if (at.length === 1) {
      rows[at[0]] = { ...rows[at[0]], amount }
      updated.push(code)
    } else {
      multiple.push(code)
    }
  }
  return { rows, added, updated, multiple, removed }
}

export interface FactDiff {
  code: string
  /** Σ гр. 47 товаров по виду. */
  goods: number
  /** Σ гр. В по виду. */
  fact: number
}

/** Суммы в тенге с копейками: расхождение меньше копейки — не расхождение. */
const differs = (a: number, b: number) => Math.abs(a - b) >= 0.005

/**
 * Сверка гр. 47 ↔ гр. В по видам: печать считает гр. В из гр. 47, XML — из фактических платежей (§5-11). Виды, где
 * Σ гр. 47 ≠ Σ гр. В (в том числе вид есть только с одной стороны), по коду. Строки гр. В без вида не сверяются.
 */
export function factVsGoodsDiff(form: Pick<DtFormState, 'goodsItems' | 'factPayments'>): FactDiff[] {
  const goods = new Map(totalsByMode(form.goodsItems).filter((x) => x.code).map((x) => [x.code, x.amount]))
  const fact = new Map<string, number>()
  for (const p of form.factPayments ?? []) {
    if (!p.taxModeCode) continue
    fact.set(p.taxModeCode, (fact.get(p.taxModeCode) ?? 0) + (p.amount ?? 0))
  }
  const codes = [...new Set([...goods.keys(), ...fact.keys()])].sort()
  return codes
    .map((code) => ({ code, goods: goods.get(code) ?? 0, fact: fact.get(code) ?? 0 }))
    .filter((d) => differs(d.goods, d.fact))
}

/**
 * Снимок товаров для предпросмотра расчёта: ключи и порядок товаров, поля, уходящие в расчёт (PAYMENT_FIELDS), и
 * строки гр. 47. Расчёт сервер ведёт по позиции товара — изменился снимок, предпросмотр писать нельзя (§5-13).
 */
export function goodsSnapshot(goods: readonly Import40GoodsItemInput[]): string {
  return JSON.stringify(goods.map((g) => [keyOf(g), PAYMENT_FIELDS.map((f) => g[f] ?? null), g.payments ?? []]))
}

/** Снимок для предпросмотра: товары (goodsSnapshot) и графы шапки, от которых зависит расчёт — дата гр. А (курсы), ЕТТ/ВТО. */
export function calcSnapshot(form: Pick<DtFormState, 'goodsItems' | 'submissionDate' | 'rateType'>): string {
  return JSON.stringify([form.submissionDate ?? null, (form.rateType ?? '').toUpperCase(), goodsSnapshot(form.goodsItems)])
}
