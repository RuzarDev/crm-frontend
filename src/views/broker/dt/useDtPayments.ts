// Расчёты ДТ на странице (волна 6а, Task 3) — перенос из Import40DtView.vue без изменения правил:
// гр.45/46 («Рассчитать там. стоимость»), ТПиН по товарам с экрана, «Рассчитать платежи» (save → calc → окно →
// «Записать» → save), «Медизделие (НДС 5%)». Строки гр.47 сливаются по виду платежа; расчётные виды (1010, 2010,
// 2050, 5060, 4xxx), которых в новом расчёте нет, удаляются; вручную выбранный вид ставки не затирается.
// Замечания ТПиН по товарам — в окне (tpinProblems), а не в Modal.warning.
import { ref, toValue, type MaybeRefOrGetter } from 'vue'
import { import40Api, type Import40CalculatePaymentsResponse, type Import40TpinGoodsInput } from '@/api/import40'
import type { Import40GoodsItemInput } from '@/types/api'
import { i18n } from '@/i18n'
import { message } from '@/ui/message'
import { formatNumberIn } from '@/ui/number'
import { toIsoDate, type DtFormState } from './dtPayload'

const t = (key: string, p?: Record<string, unknown>) => (p ? i18n.global.t(key, p) : i18n.global.t(key))
const locale = () => String(i18n.global.locale.value)

const CALCULATED_TAX_MODES = ['1010', '2010', '2050', '5060']
// Акциз в КЕДЕН — код по виду товара (4420 сигареты, 4400 пиво…; 06.10.2026), поэтому любой 4xxx.
export const isCalculatedTaxMode = (code: string) => CALCULATED_TAX_MODES.includes(code) || /^4\d{3}$/.test(code)

/** Строки гр.47 товаров из серверного расчёта (calculate-payments / calculate-tpin — один движок). */
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
  })
  // Карточки товаров держат свои копии строк и обновляются по смене самого списка.
  form.goodsItems = [...form.goodsItems]
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

export interface DtPaymentsOptions {
  /** Сохранить ДТ (тихо): расчёт платежей сервер ведёт по СОХРАНЁННОЙ ДТ. */
  save: () => Promise<boolean>
}

export function useDtPayments(
  form: DtFormState,
  caseId: MaybeRefOrGetter<string>,
  dtId: MaybeRefOrGetter<string>,
  opts: DtPaymentsOptions,
) {
  const modalOpen = ref(false)
  const loading = ref(false)
  const applying = ref(false)
  const result = ref<Import40CalculatePaymentsResponse | null>(null)
  /** Замечания ТПиН по товарам (окно «ТПиН: проверьте товары»); пусто — окна нет. */
  const tpinProblems = ref<string[]>([])
  /** Итог последнего «Рассчитать там. стоимость» — показывается в разделе «Условия», а не только тостом (F4). */
  const customsResult = ref<{ updated: number; total: number } | null>(null)
  const customsLoading = ref(false)

  /** Пересчёт гр.45 (с расходами, по курсам НБ РК на дату гр.А) и гр.46 по всем товарам. Ошибку пробрасывает. */
  const recalcCustomsValues = async (): Promise<{ updated: number; total: number }> => {
    const goods = form.goodsItems.map((g, index) => ({
      index,
      grossWeightKg: g.grossWeightKg ?? null,
      invoiceValue: g.customsValue ?? null,
      currency: g.currency ?? null,
    }))
    const expenses = (form.expenses ?? [])
      .filter((e) => e.expenseTypeCode && e.amount != null && e.currencyCode)
      .map((e) => ({ expenseTypeCode: e.expenseTypeCode as string, amount: e.amount as number, currencyCode: e.currencyCode as string }))
    const res = await import40Api.calculateCustomsValue({ goods, expenses, onDate: toIsoDate(form.submissionDate) })
    let updated = 0
    let total = 0
    res.goods.forEach((r) => {
      const g = form.goodsItems[r.index]
      if (g) {
        g.customsValueKzt = r.customsValueKzt
        // гр.46 — вместе с гр.45 и по тому же курсу.
        if (r.statisticValueUsd != null) g.statisticValueUsd = r.statisticValueUsd
        total += r.customsValueKzt ?? 0
        updated += 1
      }
    })
    return { updated, total }
  }

  /** «Рассчитать там. стоимость» (раздел «Условия»): итог — в сообщении. */
  const calcCustomsValue = async () => {
    if (!form.goodsItems.length) {
      message.warning(t('broker.dt.payments.noGoods'))
      return
    }
    customsLoading.value = true
    try {
      const { updated, total } = await recalcCustomsValues()
      customsResult.value = { updated, total }
      message.success(t('broker.dt.payments.customsValueDone', { n: updated, total: formatNumberIn(locale(), total) }))
    } catch {
      // Текст ошибки уже показал общий перехватчик (api/client.ts).
    } finally {
      customsLoading.value = false
    }
  }

  /** «Рассчитать ТПиН (авто)»: серверный расчёт по товарам с экрана (без сохранения); сначала гр.45. */
  const calcTpin = async () => {
    const targets = form.goodsItems
      .map((g, index) => ({ g, index }))
      .filter(({ g }) => g.tnvedCode && g.customsValue != null && g.currency && (g.netWeightKg != null || g.quantity != null))
    if (!targets.length) {
      message.info(t('broker.dt.payments.noGoodsData'))
      return
    }
    try {
      await recalcCustomsValues()
    } catch {
      return
    }
    try {
      const res = await import40Api.calculateTpin(
        targets.map(({ g, index }) => toPaymentsInput(g, index)),
        toIsoDate(form.submissionDate),
        (form.rateType ?? '').toUpperCase() === 'EATT',
      )
      applyGoodsPaymentRows(form, res)
      let recalculated = 0
      const problems: string[] = []
      res.goodsRows.forEach((row) => {
        const g = form.goodsItems[row.index]
        const n = row.index + 1
        if (!g) return
        if (row.error) {
          problems.push(`${t('broker.dt.payments.item', { n })}: ${row.error}`)
          return
        }
        g.needsTpinRecalc = false
        recalculated += 1
        if (row.notes) problems.push(`${t('broker.dt.payments.item', { n })}: ${row.notes}`)
      })
      if (recalculated) message.success(t('broker.dt.payments.tpinDone', { n: recalculated }))
      if (problems.length) tpinProblems.value = problems
      else if (!recalculated) message.warning(t('broker.dt.payments.tpinCheckData'))
    } catch {
      message.error(t('broker.dt.payments.tpinError'))
    }
  }

  const runCalc = async (): Promise<boolean> => {
    const saved = await opts.save()
    if (!saved) return false
    loading.value = true
    try {
      result.value = await import40Api.calculatePayments(toValue(caseId), toValue(dtId))
      return true
    } catch {
      return false
    } finally {
      loading.value = false
    }
  }

  /** «Рассчитать платежи»: сохранить, посчитать на сервере, показать окно. */
  const openModal = async () => {
    result.value = null
    modalOpen.value = true
    const ok = await runCalc()
    if (!ok) modalOpen.value = false
  }

  /** «Медизделие (НДС 5%)»: льготный НДС живёт на товаре — сохранить и пересчитать заново. */
  const toggleMedical = async (index: number, checked: boolean) => {
    const g = form.goodsItems[index]
    if (!g) return
    g.vatRatePreferential = checked ? 0.05 : null
    await runCalc()
  }

  /** Последний расчёт → гр.47 товаров и гр.B (способ «БН», курс 1). */
  const applyResult = () => {
    const res = result.value
    if (!res) return
    applyGoodsPaymentRows(form, res)
    const factRows = form.factPayments ?? []
    Object.entries(res.totalsByTaxMode).forEach(([code, amount]) => {
      const existing = factRows.find((p) => p.taxModeCode === code)
      if (existing) existing.amount = amount
      else {
        factRows.push({
          taxModeCode: code, amount, exchangeRate: 1, paymentDocDate: null, payerTaxpayerId: null, paymentDate: null, paymentMethodCode: 'БН',
        })
      }
    })
    form.factPayments = factRows
  }

  /** «Записать»: в форму и сохранить. */
  const apply = async () => {
    if (!result.value) return
    applying.value = true
    try {
      applyResult()
      if (await opts.save()) {
        message.success(t('broker.dt.payments.written'))
        modalOpen.value = false
      }
    } finally {
      applying.value = false
    }
  }

  return { modalOpen, loading, applying, result, tpinProblems, customsResult, customsLoading, calcCustomsValue, calcTpin, openModal, toggleMedical, apply }
}
