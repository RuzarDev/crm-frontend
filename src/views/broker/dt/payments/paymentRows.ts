// Строки гр. 47 товаров из серверного расчёта платежей (волна 6в, Task 2 — перенос из useDtPayments.ts без изменения
// правил; правила закреплены тестами и повторены сервером при разделении ДТ):
// - строки сливаются по виду платежа; расчётные виды (1010, 2010, 2050, 5060, 4xxx), которых в новом расчёте нет,
//   удаляются; прочие и ручные — остаются;
// - вручную выбранный вид ставки не затирается, пока сервер не прислал свой (rateKind — тогда и единица, валюта,
//   весовой коэффициент);
// - товар с ошибкой расчёта не трогается; посчитанный — теряет «Пересчитать» (needsTpinRecalc);
// - товары и массив правятся на месте (ключ товара и открытый товар не теряются, волна 6б).
import type { Import40CalculatePaymentsResponse, Import40TpinGoodsInput } from '@/api/import40'
import type { Import40GoodsItemInput } from '@/types/api'
import type { DtFormState } from '../dtPayload'

const CALCULATED_TAX_MODES = ['1010', '2010', '2050', '5060']
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
      (p) => !p.taxModeCode || !isCalculatedTaxMode(p.taxModeCode) || fresh.has(p.taxModeCode),
    )
    row.rows.forEach((pr) => {
      const existing = rows.find((p) => p.taxModeCode === pr.taxModeCode)
      if (existing) {
        existing.taxBase = pr.base ?? null
        existing.rateValue = pr.rate ?? null
        existing.amountKzt = pr.amount
        // Вид ставки не затираем, если декларант выбрал его сам ('*' с весовым коэффициентом и т.п.).
        if (!existing.rateKindCode && pr.rate != null) existing.rateKindCode = '%'
        // Сервер знает, какая часть ставки сработала («%» или «*» за кг/шт/см³) — тогда пишем как в КЕДЕН.
        if (pr.rateKind) {
          existing.rateKindCode = pr.rateKind
          existing.rateUnitCode = pr.rateUnitCode ?? null
          existing.rateCurrencyCode = pr.rateCurrencyCode ?? null
          existing.weightRatio = pr.rateKind === '*' ? existing.weightRatio ?? 1 : null
        }
        existing.paymentFeatureCode = pr.featureCode ?? existing.paymentFeatureCode ?? 'ИУ'
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

/** Товар ДТ → вход серверного расчёта платежей (то же, что бэк берёт из сохранённой ДТ). */
export const toPaymentsInput = (g: Import40GoodsItemInput, index: number): Import40TpinGoodsInput => ({
  index,
  description: g.description ?? null,
  tnvedCode: g.tnvedCode ?? null,
  invoiceValue: g.customsValue ?? null,
  currency: g.currency ?? null,
  grossWeightKg: g.grossWeightKg ?? null,
  quantity: g.quantity ?? null,
  vatRatePreferential: g.vatRatePreferential ?? null,
  tempImportMonths: g.tempImportMonths ?? null,
  netWeightKg: g.netWeightKg ?? null,
  customsValueKzt: g.customsValueKzt ?? null,
  originCountry: g.countryOfOrigin ?? null,
  exciseKind: g.exciseKind ?? null,
  antiDumpingKind: g.antiDumpingKind ?? null,
  unitCode: g.unitCode ?? null,
  volumeL: g.taxVolumeL ?? null,
  alcoholL: g.taxAlcoholL ?? null,
  pieces: g.taxPieces ?? null,
  engineVolumeCm3: g.engineVolumeCm3 ?? null,
})
