// Вид раздела «Платежи» (волна 6в, Task 3): какие товары показать карточками и какие строки гр. 47 в карточке.
// Суммы — только с сервера: строки предпросмотра — те же правила записи (applyGoodsPaymentRows) на копии строк товара,
// то есть ровно то, что «Записать» внесёт в гр. 47; форма не меняется.
import type { Import40CalculatePaymentsResponse, Import40PaymentGoodsRowDto } from '@/api/import40'
import type { Import40GoodsItemInput, Import40GoodsPayment } from '@/types/api'
import type { DtFormState } from '../dtPayload'
import { sortPayments } from '../goods/editor/payments'
import { goodsPaymentsStale } from '../goods/goodsStatus'
import { applyGoodsPaymentRows } from './paymentRows'

type Goods = Import40GoodsItemInput

export interface PaymentsGoodsEntry {
  /** Позиция товара (с 0). */
  index: number
  /** Строка расчёта товара — только у живого предпросмотра (позиции те же, что при расчёте). */
  calc: Import40PaymentGoodsRowDto | null
  /** Расчёт товар не пересчитал (ошибка или нет в ответе): его гр. 47 останется прежней. */
  notRecalculated: boolean
  /** Есть замечание — карточка видна всегда; без замечаний — под «показать все». */
  issue: boolean
}

/**
 * Товары раздела. С живым предпросмотром (res) замечание — ошибка расчёта, примечание сервера или товара нет в ответе;
 * без предпросмотра — платежи товара устарели («Пересчитать» или нет ни одной строки гр. 47).
 */
export function paymentsGoodsEntries(goods: readonly Goods[], res: Import40CalculatePaymentsResponse | null): PaymentsGoodsEntry[] {
  if (!res) return goods.map((g, index) => ({ index, calc: null, notRecalculated: false, issue: goodsPaymentsStale(g) }))
  const byIndex = new Map(res.goodsRows.map((r) => [r.index, r]))
  return goods.map((_, index) => {
    const calc = byIndex.get(index) ?? null
    const notRecalculated = !calc || !!calc.error
    return { index, calc, notRecalculated, issue: notRecalculated || !!calc?.notes?.trim() }
  })
}

/** Позиции товаров (с 0), чьи платежи устарели, — для плашки «Платежи устарели». */
export const staleGoodsIndexes = (goods: readonly Goods[]): number[] =>
  goods.flatMap((g, i) => (goodsPaymentsStale(g) ? [i] : []))

export interface PaymentLine {
  code: string | null
  base: number | null
  basisLabel: string | null
  rate: number | null
  rateLabel: string | null
  rateKind: string | null
  amount: number | null
  feature: string | null
  /** Строка из расчёта предпросмотра (ещё не записана). */
  fresh: boolean
}

const lineOf = (p: Import40GoodsPayment, fresh: boolean): PaymentLine => ({
  code: p.taxModeCode ?? null,
  base: p.taxBase ?? null,
  basisLabel: p.basisLabel?.trim() || null,
  rate: p.rateValue ?? null,
  rateLabel: p.rateLabel?.trim() || null,
  rateKind: p.rateKindCode ?? null,
  amount: p.amountKzt ?? null,
  feature: p.paymentFeatureCode ?? null,
  fresh,
})

/** Записанные строки гр. 47 товара в порядке показа (1010 → 2010 → 5060 → прочие). */
export const savedLines = (payments: readonly Import40GoodsPayment[] | null | undefined): PaymentLine[] =>
  sortPayments(payments).map((p) => lineOf(p, false))

/**
 * Строки гр. 47 товара, какими их сделает «Записать»: правила applyGoodsPaymentRows на копии строк; товар с ошибкой
 * расчёта — как был. Строки видов из расчёта помечены fresh.
 */
export function previewLines(item: Pick<Goods, 'payments'>, calc: Import40PaymentGoodsRowDto): PaymentLine[] {
  if (calc.error) return savedLines(item.payments)
  const copy = { goodsItems: [{ payments: (item.payments ?? []).map((p) => ({ ...p })) }] }
  applyGoodsPaymentRows(copy as unknown as Pick<DtFormState, 'goodsItems'>, { goodsRows: [{ ...calc, index: 0 }], totalsByTaxMode: {}, grandTotalB: 0 })
  const fresh = new Set(calc.rows.map((r) => r.taxModeCode))
  return sortPayments(copy.goodsItems[0].payments as Import40GoodsPayment[]).map((p) => lineOf(p, !!p.taxModeCode && fresh.has(p.taxModeCode)))
}

/** «Медизделие — НДС 5%»: льготная ставка НДС товара (как переключатель в редакторе товара). */
export const MEDICAL_VAT = 0.05
export const isMedical = (g: Pick<Goods, 'vatRatePreferential'>): boolean => g.vatRatePreferential === MEDICAL_VAT
