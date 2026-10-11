// Расчёты платежей страницы ДТ (волна 6в, Task 2): одно действие «Рассчитать» и «Записать в гр. 47 и гр. В».
//
// calculate():
//   0) только при праве править (просмотр, разделённая ДТ — ничего); без товаров — «Нет товаров для расчёта»;
//   1) гр. 45/46 по данным экрана (тот же запрос, что «Рассчитать там. стоимость», дата гр. А); ошибка — стоп
//      (текст показал общий перехватчик);
//   2) тихое сохранение ДТ: не сохранилась (409, ошибка, нет права) — расчёт не выполняется, сказано почему;
//   3) calculate-payments по СОХРАНЁННОЙ ДТ → предпросмотр (state 'preview'): суммы по товарам и итоги по видам.
// Предпросмотр живёт, пока товары те же: после правки товаров (состав, порядок, поля расчёта, строки гр. 47) —
// 'stale-preview' («Данные изменились — рассчитайте заново»). Сигнал — версия правок формы (useDtForm.editVersion,
// её уже ведёт наблюдатель страницы); на её смене сравнивается снимок товаров (goodsSnapshot) — сам расчёт форму
// не обходит. Правка «Медизделие» через setField модели товаров — тоже правка: предпросмотр сбрасывается.
// apply(): снимок ещё тот же (иначе — 'stale-preview') → гр. 47 (applyGoodsPaymentRows, правила без изменений) и
// гр. В (mergeFactPayments) → сохранение → «Записано».
// «ТПиН по данным экрана» удалён: платежи считаются только по сохранённой ДТ (§5-5).
import { computed, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { import40Api, type Import40CalculatePaymentsResponse } from '@/api/import40'
import { i18n } from '@/i18n'
import { message } from '@/ui/message'
import { formatNumberIn } from '@/ui/number'
import { toIsoDate, type DtFormState } from './dtPayload'
import { markStale } from './goods/goodsStatus'
import { applyGoodsPaymentRows } from './payments/paymentRows'
import { goodsSnapshot, mergeFactPayments, totalsFromResponse, type FactMergeResult, type PaymentModeTotal } from './payments/paymentsModel'

const t = (key: string, p?: Record<string, unknown>) => (p ? i18n.global.t(key, p) : i18n.global.t(key))
const locale = () => String(i18n.global.locale.value)

/**
 * Состояние расчёта: 'idle' — предпросмотра нет; 'calculating' — идёт «Рассчитать» (step — шаг); 'preview' — расчёт
 * готов, можно «Записать»; 'stale-preview' — после расчёта товары изменились, писать нельзя; 'applying' — идёт «Записать».
 */
export type DtPaymentsState = 'idle' | 'calculating' | 'preview' | 'stale-preview' | 'applying'
/** Шаг «Рассчитать»: гр. 45/46 → сохранение → расчёт платежей. */
export type DtPaymentsStep = 'customs' | 'save' | 'calc'
/** Почему последний «Рассчитать» не дошёл до предпросмотра (для строки в разделе); null — дошёл или не запускался. */
export type DtPaymentsProblem = 'noGoods' | 'customsFailed' | 'notSaved' | 'calcFailed'

export interface DtPaymentsOptions {
  /** Сохранить ДТ (тихо): расчёт платежей сервер ведёт по СОХРАНЁННОЙ ДТ. false — не сохранилась. */
  save: () => Promise<boolean>
  /** Право править (useDtForm.editable): без него «Рассчитать» и «Записать» ничего не делают. По умолчанию — да. */
  editable?: MaybeRefOrGetter<boolean>
  /** Версия правок формы (useDtForm.editVersion): на её смене проверяется, не изменились ли товары после расчёта. */
  editVersion?: MaybeRefOrGetter<number>
}

export function useDtPayments(
  form: DtFormState,
  caseId: MaybeRefOrGetter<string>,
  dtId: MaybeRefOrGetter<string>,
  opts: DtPaymentsOptions,
) {
  const state = ref<DtPaymentsState>('idle')
  const step = ref<DtPaymentsStep | null>(null)
  const problem = ref<DtPaymentsProblem | null>(null)
  /** Предпросмотр: ответ calculate-payments (index — позиция товара в момент расчёта). Есть в 'preview' и 'stale-preview'. */
  const result = shallowRef<Import40CalculatePaymentsResponse | null>(null)
  /** Итог последнего пересчёта гр. 45 — показывается в разделе «Условия», а не только тостом (F4). */
  const customsResult = ref<{ updated: number; total: number } | null>(null)
  const customsLoading = ref(false)

  const editable = () => (opts.editable === undefined ? true : !!toValue(opts.editable))
  /** Снимок товаров, по которому сохранена ДТ для расчёта (см. goodsSnapshot). */
  let snapshot: string | null = null

  const loading = computed(() => state.value === 'calculating')
  const applying = computed(() => state.value === 'applying')
  const busy = computed(() => state.value === 'calculating' || state.value === 'applying')

  /** Итоги расчёта по видам (по коду). */
  const previewTotals = computed<PaymentModeTotal[]>(() => totalsFromResponse(result.value?.totalsByTaxMode))
  /** Какой станет гр. В после «Записать» (добавятся / заменятся / несколько строк — не тронем). */
  const factPreview = computed<FactMergeResult | null>(() =>
    result.value ? mergeFactPayments(form.factPayments ?? [], result.value.totalsByTaxMode) : null)

  const snapshotMatches = () => snapshot !== null && goodsSnapshot(form.goodsItems) === snapshot

  // Сброс предпросмотра: правка формы (версия правок) или другие товары (перезагрузка ДТ) — сравнить снимок.
  // Снимок строится только пока предпросмотр живой: в остальное время наблюдатель ничего не обходит.
  watch(
    [() => toValue(opts.editVersion), () => form.goodsItems],
    () => {
      if (state.value === 'preview' && !snapshotMatches()) state.value = 'stale-preview'
    },
  )

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
        // гр. 45 — основа гр. 47: изменилась — платежи товара устарели (снимет следующий расчёт платежей).
        if ((g.customsValueKzt ?? null) !== (r.customsValueKzt ?? null)) markStale(g)
        g.customsValueKzt = r.customsValueKzt
        // гр.46 — вместе с гр.45 и по тому же курсу.
        if (r.statisticValueUsd != null) g.statisticValueUsd = r.statisticValueUsd
        total += r.customsValueKzt ?? 0
        updated += 1
      }
    })
    customsResult.value = { updated, total }
    return { updated, total }
  }

  /** «Рассчитать там. стоимость» (раздел «Условия», шаг 1 отдельно): итог — в сообщении. */
  const calcCustomsValue = async () => {
    if (!form.goodsItems.length) {
      message.warning(t('broker.dt.payments.noGoods'))
      return
    }
    customsLoading.value = true
    try {
      const { updated, total } = await recalcCustomsValues()
      message.success(t('broker.dt.payments.customsValueDone', { n: updated, total: formatNumberIn(locale(), total) }))
    } catch {
      // Текст ошибки уже показал общий перехватчик (api/client.ts).
    } finally {
      customsLoading.value = false
    }
  }

  const stop = (why: DtPaymentsProblem) => {
    problem.value = why
    state.value = 'idle'
    step.value = null
    return false
  }

  /**
   * «Рассчитать»: гр. 45/46 → сохранить → расчёт по сохранённой ДТ → предпросмотр. true — предпросмотр готов.
   * Прежний предпросмотр отбрасывается сразу.
   */
  const calculate = async (): Promise<boolean> => {
    if (!editable() || busy.value) return false
    result.value = null
    snapshot = null
    problem.value = null
    if (!form.goodsItems.length) {
      message.warning(t('broker.dt.payments.noGoods'))
      return stop('noGoods')
    }
    state.value = 'calculating'
    step.value = 'customs'
    try {
      await recalcCustomsValues()
    } catch {
      return stop('customsFailed') // текст ошибки — общий перехватчик
    }
    step.value = 'save'
    // Снимок — до сохранения: правки во время запросов сделают предпросмотр устаревшим сразу по ответу.
    const snap = goodsSnapshot(form.goodsItems)
    if (!(await opts.save())) {
      message.warning(t('broker.dt.payments.notSaved'))
      return stop('notSaved')
    }
    step.value = 'calc'
    let res: Import40CalculatePaymentsResponse
    try {
      res = await import40Api.calculatePayments(toValue(caseId), toValue(dtId))
    } catch {
      return stop('calcFailed') // текст ошибки — общий перехватчик
    }
    result.value = res
    snapshot = snap
    step.value = null
    state.value = snapshotMatches() ? 'preview' : 'stale-preview'
    return true
  }

  /** Убрать предпросмотр (без записи). */
  const discard = () => {
    if (busy.value) return
    result.value = null
    snapshot = null
    state.value = 'idle'
  }

  /**
   * «Записать в гр. 47 и гр. В»: только живой предпросмотр и те же товары (ключи, порядок, поля расчёта) — иначе
   * 'stale-preview' и «Данные изменились — рассчитайте заново». Затем сохранить; «Записано». true — записано и сохранено.
   */
  const apply = async (): Promise<boolean> => {
    const res = result.value
    if (!res || !editable() || (state.value !== 'preview' && state.value !== 'stale-preview')) return false
    if (state.value === 'stale-preview' || !snapshotMatches()) {
      state.value = 'stale-preview'
      message.warning(t('broker.dt.payments.changed'))
      return false
    }
    state.value = 'applying'
    applyGoodsPaymentRows(form, res)
    const merged = mergeFactPayments(form.factPayments ?? [], res.totalsByTaxMode)
    // Новый массив гр. В: таблица фактических платежей видит запись (§5-1), XML-порядок = порядок строк.
    form.factPayments = merged.rows
    if (merged.multiple.length) message.warning(t('broker.dt.payments.multipleRows', { codes: merged.multiple.join(', ') }))
    const saved = await opts.save()
    result.value = null
    snapshot = null
    state.value = 'idle'
    // Не сохранилось — записанное остаётся в форме (досохранит автосейв; при 409 — плашка конфликта).
    if (saved) message.success(t('broker.dt.payments.written'))
    else message.warning(t('broker.dt.payments.writtenNotSaved'))
    return saved
  }

  return {
    state,
    step,
    problem,
    result,
    previewTotals,
    factPreview,
    loading,
    applying,
    busy,
    customsResult,
    customsLoading,
    calcCustomsValue,
    recalcCustomsValues,
    calculate,
    apply,
    discard,
  }
}

export type DtPayments = ReturnType<typeof useDtPayments>
