// Расчёты платежей страницы ДТ (волна 6в, Task 2): одно действие «Рассчитать» и «Записать в гр. 47 и гр. В».
//
// calculate():
//   0) только при праве править (просмотр, разделённая ДТ — ничего); без товаров — «Нет товаров для расчёта»;
//      сохранить сейчас нельзя (409, идёт загрузка — canSave) — стоп ДО шага 1, гр. 45 и «Пересчитать» не тронуты;
//   1) гр. 45/46 по данным экрана (тот же запрос, что «Рассчитать там. стоимость», дата гр. А, пустая — сегодня); пишутся
//      только товары с фактурной стоимостью > 0 и валютой — у прочих введённая вручную гр. 45 остаётся; ручные гр. 45/46
//      (признак «вручную», решение 16.10.2026) не перезаписываются — расчёт идёт в подсказку; ошибка — стоп (текст
//      показал общий перехватчик);
//   2) тихое сохранение ДТ: не сохранилась (409, ошибка, нет права) — расчёт не выполняется, сказано почему;
//   3) calculate-payments по СОХРАНЁННОЙ ДТ → предпросмотр (state 'preview'): суммы по товарам и итоги по видам.
// Предпросмотр живёт, пока товары те же: после правки товаров (состав, порядок, поля расчёта, строки гр. 47), даты гр. А
// или ЕТТ/ВТО —
// 'stale-preview' («Данные изменились — рассчитайте заново»). Сигнал — версия правок формы (useDtForm.editVersion,
// её уже ведёт наблюдатель страницы); на её смене сравнивается снимок товаров (goodsSnapshot) — сам расчёт форму
// не обходит. Правка «Медизделие» через setField модели товаров — тоже правка: предпросмотр сбрасывается.
// apply(): снимок ещё тот же (иначе — 'stale-preview') → гр. 47 (applyPaymentsCalculation: правила applyGoodsPaymentRows
// без изменений + у не пересчитанных товаров убирается строка сбора 1010, если расчёт распределил сбор между
// рассчитанными — иначе сбор посчитан дважды) → гр. В (mergeFactPayments) из Σ гр. 47 по видам ПОСЛЕ записи (как
// печать, до копеек): прочие строки товаров с ошибкой расчёта остаются, и их виды остаются в гр. В → сохранение →
// «Записано».
// «ТПиН по данным экрана» удалён: платежи считаются только по сохранённой ДТ (§5-5).
import { computed, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { import40Api, type Import40CalculatePaymentsResponse } from '@/api/import40'
import { i18n } from '@/i18n'
import { message } from '@/ui/message'
import { formatNumberIn } from '@/ui/number'
import { toIsoDate, type DtFormState } from './dtPayload'
import { markStale } from './goods/goodsStatus'
import { keyOf } from './goods/useDtGoods'
import { applyPaymentsCalculation } from './payments/paymentRows'
import {
  calcSnapshot, goodsTotalsAfterApply, mergeFactPayments, notRecalculatedGoods, totalsByMode, totalsRecord,
  type FactMergeResult, type PaymentModeTotal,
} from './payments/paymentsModel'

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
  /**
   * Сохранить сейчас можно (нет конфликта 409, ДТ не грузится): иначе «Рассчитать» останавливается до шага 1.
   * Страница: `() => !dt.conflict.value && !dt.loading.value`. По умолчанию — да.
   */
  canSave?: () => boolean
}

/** Гр. 45 товара считается по фактурной стоимости: есть стоимость > 0 и валюта (иначе остаётся введённая вручную). */
const customsValueComputable = (g: { customsValue?: number | null; currency?: string | null }) =>
  g.customsValue != null && g.customsValue > 0 && !!g.currency

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
  /**
   * Итог последнего пересчёта гр. 45 — показывается в разделе «Условия», а не только тостом (F4). kept — товары с ручной
   * гр. 45: их значение осталось, расчёт — в подсказке.
   */
  const customsResult = ref<{ updated: number; total: number; kept: number } | null>(null)
  const customsLoading = ref(false)

  const editable = () => (opts.editable === undefined ? true : !!toValue(opts.editable))
  /** Снимок товаров и граф шапки, по которому сохранена ДТ для расчёта (см. calcSnapshot). */
  let snapshot: string | null = null

  const loading = computed(() => state.value === 'calculating')
  const applying = computed(() => state.value === 'applying')
  const busy = computed(() => state.value === 'calculating' || state.value === 'applying')

  /**
   * Итоги по видам, которые «Записать» внесёт в гр. В: Σ гр. 47 всех товаров после записи (товары с ошибкой — со своими
   * строками, кроме сбора 1010). Без ошибок равны итогам расчёта сервера.
   */
  const previewTotals = computed<PaymentModeTotal[]>(() =>
    (result.value ? goodsTotalsAfterApply(form.goodsItems, result.value) : []).filter((x) => x.code))
  /** Какой станет гр. В после «Записать»: добавятся / заменятся / удалятся / несколько строк — не тронем. */
  const factPreview = computed<FactMergeResult | null>(() =>
    result.value ? mergeFactPayments(form.factPayments ?? [], totalsRecord(previewTotals.value), form.declarantBin) : null)
  /** Позиции товаров (с 0), которые расчёт не пересчитал (ошибка или нет в ответе): гр. 47 у них остаётся прежней. */
  const notRecalculated = computed<number[]>(() =>
    (result.value ? notRecalculatedGoods(form.goodsItems.length, result.value) : []))

  const snapshotMatches = () => snapshot !== null && calcSnapshot(form) === snapshot

  // Сброс предпросмотра: правка формы (версия правок) или другие товары (перезагрузка ДТ) — сравнить снимок.
  // Снимок строится только пока предпросмотр живой: в остальное время наблюдатель ничего не обходит.
  watch(
    [() => toValue(opts.editVersion), () => form.goodsItems],
    () => {
      if (state.value === 'preview' && !snapshotMatches()) state.value = 'stale-preview'
    },
  )

  /**
   * Пересчёт гр.45 (с расходами, по курсам НБ РК на дату гр.А) и гр.46. В запросе — все товары (доли расходов
   * распределяются как прежде), записываются только товары с фактурной стоимостью > 0 и валютой: у прочих посчитать
   * гр. 45 не из чего — введённая вручную остаётся. Ошибку пробрасывает.
   * Ответ приходит по позициям запроса, а товары за это время могли удалить или переставить: гр. 45 пишется по ключу
   * товара (keyOf), снятому до запроса; удалённого товара уже нет — его строка ответа пропускается.
   */
  const recalcCustomsValues = async (): Promise<{ updated: number; total: number; kept: number }> => {
    const keys = form.goodsItems.map(keyOf)
    const goods = form.goodsItems.map((g, index) => ({
      index,
      grossWeightKg: g.grossWeightKg ?? null,
      invoiceValue: g.customsValue ?? null,
      currency: g.currency ?? null,
      // Ручная гр. 45 — гр. 46 сервер считает от неё.
      manualCustomsValueKzt: g.customsValueKztManual ? g.customsValueKzt ?? null : null,
    }))
    const expenses = (form.expenses ?? [])
      .filter((e) => e.expenseTypeCode && e.amount != null && e.currencyCode)
      .map((e) => ({ expenseTypeCode: e.expenseTypeCode as string, amount: e.amount as number, currencyCode: e.currencyCode as string }))
    const res = await import40Api.calculateCustomsValue({ goods, expenses, onDate: toIsoDate(form.submissionDate) })
    let updated = 0
    let total = 0
    let kept = 0
    const byKey = new Map(form.goodsItems.map((g) => [keyOf(g), g]))
    res.goods.forEach((r) => {
      const key = keys[r.index]
      const g = key === undefined ? undefined : byKey.get(key)
      if (g && customsValueComputable(g)) {
        if (g.customsValueKztManual) {
          // Ручная гр. 45 остаётся; расчёт — подсказка «расчёт: X».
          g.customsValueKztCalc = r.customsValueKzt
          kept += 1
        } else {
          // гр. 45 — основа гр. 47: изменилась — платежи товара устарели (снимет следующий расчёт платежей).
          if ((g.customsValueKzt ?? null) !== (r.customsValueKzt ?? null)) markStale(g)
          g.customsValueKzt = r.customsValueKzt
          g.customsValueKztCalc = null
          total += r.customsValueKzt ?? 0
          updated += 1
        }
        // гр.46 — вместе с гр.45 (от ручной, если она ручная) и по тому же курсу; ручная гр.46 остаётся.
        if (r.statisticValueUsd != null) {
          if (g.statisticValueUsdManual) g.statisticValueUsdCalc = r.statisticValueUsd
          else {
            g.statisticValueUsd = r.statisticValueUsd
            g.statisticValueUsdCalc = null
          }
        }
      }
    })
    customsResult.value = { updated, total, kept }
    return { updated, total, kept }
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
   * Нажатие, которое не начнёт расчёт (нет товаров, сохранить сейчас нельзя), прежний предпросмотр не трогает;
   * начавшийся расчёт отбрасывает его сразу.
   */
  const calculate = async (): Promise<boolean> => {
    if (!editable() || busy.value) return false
    if (!form.goodsItems.length) {
      message.warning(t('broker.dt.payments.noGoods'))
      problem.value = 'noGoods'
      return false
    }
    // Сохранить не получится (409, идёт загрузка) — не трогаем гр. 45, «Пересчитать» и прежний предпросмотр.
    if (opts.canSave && !opts.canSave()) {
      message.warning(t('broker.dt.payments.notSaved'))
      problem.value = 'notSaved'
      return false
    }
    result.value = null
    snapshot = null
    problem.value = null
    state.value = 'calculating'
    step.value = 'customs'
    try {
      await recalcCustomsValues()
    } catch {
      return stop('customsFailed') // текст ошибки — общий перехватчик
    }
    step.value = 'save'
    // Снимок — до сохранения: правки во время запросов сделают предпросмотр устаревшим сразу по ответу.
    const snap = calcSnapshot(form)
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
    // Прежняя причина остановки (заблокированное «Рассчитать» при живом предпросмотре) к записи не относится.
    problem.value = null
    applyPaymentsCalculation(form, res)
    // гр. В — из Σ гр. 47 после записи, целыми тенге вверх (как КЕДЕН): виды товаров с ошибкой расчёта не удаляются;
    // плательщик новых строк — БИН гр. 14.
    const merged = mergeFactPayments(form.factPayments ?? [], totalsRecord(totalsByMode(form.goodsItems)), form.declarantBin)
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
    notRecalculated,
    loading,
    applying,
    busy,
    customsResult,
    customsLoading,
    calcCustomsValue,
    recalcCustomsValues,
    calculate,
    apply,
  }
}

export type DtPayments = ReturnType<typeof useDtPayments>
