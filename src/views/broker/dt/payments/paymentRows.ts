// Строки гр. 47 товаров из серверного расчёта платежей (волна 6в, Task 2 — перенос из useDtPayments.ts без изменения
// правил; правила закреплены тестами и повторены сервером при разделении ДТ):
// - строки сливаются по виду платежа; расчётные виды (1010, 2010, 2050, 5060, 4xxx), которых в новом расчёте нет,
//   удаляются; прочие и ручные — остаются;
// - вручную выбранный вид ставки не затирается, пока сервер не прислал свой (rateKind — тогда и единица, валюта,
//   весовой коэффициент);
// - ручная строка (manual, решение 16.10.2026) — не перезаписывается и не удаляется: её основа, ставка, сумма и подписи
//   остаются, расчёт кладётся в подсказку calcAmountKzt (вида нет в расчёте — 0); СП — как у всех строк;
// - товар с ошибкой расчёта не трогается; посчитанный — теряет «Пересчитать» (needsTpinRecalc);
// - товары и массив правятся на месте (ключ товара и открытый товар не теряются, волна 6б).
import type { Import40CalculatePaymentsResponse } from '@/api/import40'
import type { Import40GoodsItemInput } from '@/types/api'
import type { DtFormState } from '../dtPayload'

/** Таможенный сбор за ДТ (6 МРП на декларацию): сервер делит его между рассчитанными товарами. */
export const FEE_TAX_MODE = '1010'
const CALCULATED_TAX_MODES = [FEE_TAX_MODE, '2010', '2050', '5060']
// Акциз в КЕДЕН — код по виду товара (4420 сигареты, 4400 пиво…; 06.10.2026), поэтому любой 4xxx.
export const isCalculatedTaxMode = (code: string) => CALCULATED_TAX_MODES.includes(code) || /^4\d{3}$/.test(code)

/**
 * Строки гр.47 товаров из серверного расчёта (calculate-payments). Посчитанный без ошибки товар теряет признак
 * «Пересчитать» (needsTpinRecalc); товары с ошибкой и не попавшие в расчёт — как были.
 */
export function applyGoodsPaymentRows(form: Pick<DtFormState, 'goodsItems'>, res: Import40CalculatePaymentsResponse) {
  res.goodsRows.forEach((row) => {
    const g = form.goodsItems[row.index]
    if (!g || row.error) return
    const fresh = new Set(row.rows.map((r) => r.taxModeCode))
    const rows = (g.payments ?? []).filter(
      (p) => p.manual || !p.taxModeCode || !isCalculatedTaxMode(p.taxModeCode) || fresh.has(p.taxModeCode),
    )
    // Ручная строка вида, которого в расчёте нет: остаётся, «расчёт: 0».
    for (const p of rows) if (p.manual && p.taxModeCode && isCalculatedTaxMode(p.taxModeCode) && !fresh.has(p.taxModeCode)) p.calcAmountKzt = 0
    row.rows.forEach((pr) => {
      const existing = rows.find((p) => p.taxModeCode === pr.taxModeCode)
      if (existing?.manual) {
        // Ручная строка: значения декларанта, расчёт — в подсказку; СП, выбранная декларантом, остаётся.
        existing.calcAmountKzt = pr.amount
        existing.paymentFeatureCode = existing.paymentFeatureCode?.trim() || pr.featureCode || 'ИУ'
      } else if (existing) {
        existing.taxBase = pr.base ?? null
        existing.rateValue = pr.rate ?? null
        existing.amountKzt = pr.amount
        existing.calcAmountKzt = null
        // Вид ставки не затираем, если декларант выбрал его сам ('*' с весовым коэффициентом и т.п.).
        if (!existing.rateKindCode && pr.rate != null) existing.rateKindCode = '%'
        // Сервер знает, какая часть ставки сработала («%» или «*» за кг/шт/см³) — тогда пишем как в КЕДЕН.
        if (pr.rateKind) {
          existing.rateKindCode = pr.rateKind
          existing.rateUnitCode = pr.rateUnitCode ?? null
          existing.rateCurrencyCode = pr.rateCurrencyCode ?? null
          existing.weightRatio = pr.rateKind === '*' ? existing.weightRatio ?? 1 : null
        }
        // СП, выбранную декларантом (ОП, УН, ЗН…), расчёт не затирает: сервер всегда отдаёт ИУ.
        existing.paymentFeatureCode = existing.paymentFeatureCode?.trim() || pr.featureCode || 'ИУ'
        existing.basisLabel = pr.basisLabel ?? null
        existing.rateLabel = pr.rateLabel ?? null
        existing.bLine = pr.bLine ?? null
      } else {
        rows.push({
          taxModeCode: pr.taxModeCode,
          taxBase: pr.base ?? null,
          rateKindCode: pr.rateKind ?? (pr.rate != null ? '%' : null),
          rateValue: pr.rate ?? null,
          rateUnitCode: pr.rateUnitCode ?? null,
          rateCurrencyCode: pr.rateCurrencyCode ?? null,
          weightRatio: pr.rateKind === '*' ? 1 : null,
          rateDate: null,
          paymentFeatureCode: pr.featureCode ?? 'ИУ',
          amountKzt: pr.amount,
          basisLabel: pr.basisLabel ?? null,
          rateLabel: pr.rateLabel ?? null,
          bLine: pr.bLine ?? null,
        })
      }
    })
    g.payments = rows
    // Платежи товара свежие — снять «Пересчитать».
    g.needsTpinRecalc = false
  })
  // Товары правятся на месте (тот же массив и объекты) — ключи товаров и открытый товар не теряются (волна 6б).
}

/** Расчёт распределил сбор 1010: строка 1010 есть хотя бы у одного рассчитанного товара. */
export const feeAssigned = (res: Pick<Import40CalculatePaymentsResponse, 'goodsRows'>): boolean =>
  res.goodsRows.some((r) => !r.error && r.rows.some((x) => x.taxModeCode === FEE_TAX_MODE))

/**
 * Позиции товаров (с 0), у которых «Записать» уберёт строку сбора 1010: расчёт распределил сбор между рассчитанными
 * товарами, а этот товар не пересчитан (ошибка расчёта или нет в ответе) и строка 1010 у него есть.
 */
export function feeDroppedGoods(goods: readonly Pick<Import40GoodsItemInput, 'payments'>[], res: Pick<Import40CalculatePaymentsResponse, 'goodsRows'>): number[] {
  if (!feeAssigned(res)) return []
  const ok = new Set(res.goodsRows.filter((r) => !r.error).map((r) => r.index))
  // Ручную строку сбора «Записать» не убирает (её ведёт декларант).
  return goods.flatMap((g, i) => (!ok.has(i) && (g.payments ?? []).some((p) => p.taxModeCode === FEE_TAX_MODE && !p.manual) ? [i] : []))
}

/**
 * «Записать» расчёт в гр. 47: правила applyGoodsPaymentRows (без изменений) и одно исключение из правила «товар с ошибкой
 * не трогается» — только для сбора 1010 (решение 12.10, волна 6в, I1-A). Сбор — один на ДТ (6 МРП), сервер делит его
 * только между рассчитанными товарами; строка 1010, оставшаяся у товара с ошибкой расчёта (или не попавшего в ответ) от
 * прошлого расчёта, посчитала бы сбор дважды в гр. В, XML и печати (3 товара по 8 650, у второго ошибка → 12 975 + 8 650 +
 * 12 975 = 34 600 вместо 25 950). Поэтому у таких товаров строка 1010 удаляется; прочие их строки и «Пересчитать» — как
 * были. Сервер при разделении ДТ делает то же (Import40Endpoints.RecalculatePaymentsAsync).
 */
export function applyPaymentsCalculation(form: Pick<DtFormState, 'goodsItems'>, res: Import40CalculatePaymentsResponse) {
  const dropFee = feeDroppedGoods(form.goodsItems, res)
  applyGoodsPaymentRows(form, res)
  for (const i of dropFee) {
    const g = form.goodsItems[i]
    g.payments = (g.payments ?? []).filter((p) => p.taxModeCode !== FEE_TAX_MODE || p.manual)
  }
}
