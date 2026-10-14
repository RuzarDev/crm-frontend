import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, ref, type EffectScope } from 'vue'
import type { Import40CalculatePaymentsResponse } from '@/api/import40'

const api = vi.hoisted(() => ({ calculateCustomsValue: vi.fn(), calculatePayments: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/import40', async (orig) => ({ ...(await orig<typeof import('@/api/import40')>()), import40Api: api }))
vi.mock('@/ui/message', () => ({ message: toast }))

import { emptyDtForm, type DtFormState } from '../dtPayload'
import { setGoodsField } from '../goods/goodsStatus'
import { useDtPayments, type DtPaymentsOptions } from '../useDtPayments'

const goods = (o: Record<string, unknown> = {}) => ({
  tnvedCode: '8471300000', customsValue: 100, currency: 'USD', netWeightKg: 1, customsValueKzt: 49512, payments: [], needsTpinRecalc: true, ...o,
})
const calc = (rows: unknown[], totals: Record<string, number> = { 1010: 5, 5060: 7 }) =>
  ({ goodsRows: rows, totalsByTaxMode: totals, grandTotalB: 12 }) as unknown as Import40CalculatePaymentsResponse

let scope: EffectScope | null = null
afterEach(() => {
  scope?.stop()
  scope = null
  vi.clearAllMocks()
})

/** Страница в миниатюре: форма, версия правок (как useDtForm.editVersion) и журнал вызовов по порядку. */
function setup(o: { goods?: unknown[]; save?: () => Promise<boolean>; editable?: boolean; canSave?: () => boolean } = {}) {
  const form = reactive(emptyDtForm()) as DtFormState
  form.goodsItems = (o.goods ?? [goods(), goods({ tnvedCode: '7318150000' })]) as never
  const editVersion = ref(0)
  const editable = ref(o.editable ?? true)
  const log: string[] = []
  api.calculateCustomsValue.mockImplementation(async () => {
    log.push('customs')
    return { goods: form.goodsItems.map((_, index) => ({ index, customsValueKzt: 50000 + index, statisticValueUsd: 101 })) }
  })
  api.calculatePayments.mockImplementation(async () => {
    log.push('calc')
    return calc([
      { index: 0, rows: [{ taxModeCode: '1010', amount: 5 }, { taxModeCode: '5060', amount: 4 }] },
      { index: 1, rows: [{ taxModeCode: '5060', amount: 3 }] },
    ])
  })
  const save = vi.fn(async () => { log.push('save'); return o.save ? o.save() : true })
  const opts: DtPaymentsOptions = { save, editable, editVersion, canSave: o.canSave }
  scope = effectScope()
  const p = scope.run(() => useDtPayments(form, 'c1', 'd1', opts))!
  /** Правка формы пользователем: как наблюдатель useDtForm — версия правок + 1. */
  const edit = async (fn: () => void) => {
    fn()
    editVersion.value += 1
    await nextTick()
  }
  return { form, p, save, log, edit, editable }
}

describe('useDtPayments.calculate: шаги', () => {
  it('гр. 45/46 → сохранить → расчёт по сохранённой ДТ → предпросмотр (форма гр. 47 / гр. В не тронута)', async () => {
    const { form, p, log } = setup()
    expect(p.state.value).toBe('idle')
    const run = p.calculate()
    expect(p.state.value).toBe('calculating')
    expect(p.loading.value).toBe(true)
    expect(p.step.value).toBe('customs')
    expect(await run).toBe(true)
    expect(log).toEqual(['customs', 'save', 'calc'])
    expect(api.calculateCustomsValue).toHaveBeenCalledWith(expect.objectContaining({ goods: [expect.objectContaining({ index: 0, invoiceValue: 100 }), expect.anything()] }))
    expect(api.calculatePayments).toHaveBeenCalledWith('c1', 'd1')
    // шаг 1 записан в товары (гр. 45/46), изменённая гр. 45 — «Пересчитать»
    expect(form.goodsItems.map((g) => [g.customsValueKzt, g.statisticValueUsd])).toEqual([[50000, 101], [50001, 101]])
    expect(p.customsResult.value).toEqual({ updated: 2, total: 100001 })
    expect(p.state.value).toBe('preview')
    expect(p.step.value).toBeNull()
    expect(p.problem.value).toBeNull()
    expect(p.previewTotals.value).toEqual([{ code: '1010', amount: 5 }, { code: '5060', amount: 7 }])
    expect(p.factPreview.value?.added).toEqual(['1010', '5060'])
    // предпросмотр — ещё не запись
    expect(form.goodsItems.every((g) => !g.payments?.length)).toBe(true)
    expect(form.factPayments).toEqual([])
  })

  it('просмотр / разделённая ДТ (нет права править) — ничего не делает', async () => {
    const { p, log } = setup({ editable: false })
    expect(await p.calculate()).toBe(false)
    expect(log).toEqual([])
    expect(p.state.value).toBe('idle')
  })

  it('сохранить нельзя (409, загрузка) — стоп до шага 1: гр. 45 и «Пересчитать» не тронуты', async () => {
    const { form, p, log } = setup({ goods: [goods({ customsValueKzt: 1, needsTpinRecalc: false })], canSave: () => false })
    expect(await p.calculate()).toBe(false)
    expect(log).toEqual([])
    expect(form.goodsItems[0]).toMatchObject({ customsValueKzt: 1, needsTpinRecalc: false })
    expect(toast.warning).toHaveBeenCalledWith('ДТ не сохранилась — платежи не рассчитаны')
    expect(p.problem.value).toBe('notSaved')
  })

  it('(баг m11) нажатие, которое не начнёт расчёт (409, нет товаров), не отбрасывает живой предпросмотр', async () => {
    let can = true
    const { form, p } = setup({ canSave: () => can })
    expect(await p.calculate()).toBe(true)
    const res = p.result.value
    can = false
    expect(await p.calculate()).toBe(false)
    expect(p.state.value).toBe('preview')
    expect(p.result.value).toBe(res)
    expect(p.problem.value).toBe('notSaved')
    can = true
    expect(await p.apply()).toBe(true)
    expect(form.factPayments.map((f) => f.taxModeCode)).toEqual(['1010', '5060'])
    expect(p.problem.value).toBeNull()
  })

  it('шаг 1: товар без фактурной стоимости или валюты — в запросе (доли расходов), но введённая гр. 45 остаётся', async () => {
    const { form, p } = setup({ goods: [
      goods({ customsValueKzt: 1, needsTpinRecalc: false }),
      goods({ customsValue: null, customsValueKzt: 777, needsTpinRecalc: false }),
      goods({ customsValue: 0, customsValueKzt: 888, needsTpinRecalc: false }),
      goods({ currency: null, customsValueKzt: 999, needsTpinRecalc: false }),
    ] })
    await p.calculate()
    expect(api.calculateCustomsValue.mock.calls[0][0].goods).toHaveLength(4)
    expect(form.goodsItems.map((g) => [g.customsValueKzt, g.needsTpinRecalc])).toEqual([[50000, true], [777, false], [888, false], [999, false]])
    expect(p.customsResult.value).toEqual({ updated: 1, total: 50000 })
  })

  it('нет товаров — «Нет товаров для расчёта», запросов нет', async () => {
    const { p, log } = setup({ goods: [] })
    expect(await p.calculate()).toBe(false)
    expect(log).toEqual([])
    expect(toast.warning).toHaveBeenCalledWith('Нет товаров для расчёта')
    expect(p.problem.value).toBe('noGoods')
  })

  it('ошибка пересчёта гр. 45 — стоп до сохранения (текст — общий перехватчик)', async () => {
    const { p, log } = setup()
    api.calculateCustomsValue.mockRejectedValueOnce(new Error('400'))
    expect(await p.calculate()).toBe(false)
    expect(log).toEqual([])
    expect(p.state.value).toBe('idle')
    expect(p.problem.value).toBe('customsFailed')
  })

  it('ДТ не сохранилась (409, ошибка) — расчёт не выполняется и сказано почему', async () => {
    const { p, log } = setup({ save: async () => false })
    expect(await p.calculate()).toBe(false)
    expect(log).toEqual(['customs', 'save'])
    expect(api.calculatePayments).not.toHaveBeenCalled()
    expect(toast.warning).toHaveBeenCalledWith('ДТ не сохранилась — платежи не рассчитаны')
    expect(p.state.value).toBe('idle')
    expect(p.problem.value).toBe('notSaved')
    expect(p.result.value).toBeNull()
  })

  it('ошибка расчёта — без предпросмотра (calcFailed)', async () => {
    const { p } = setup()
    api.calculatePayments.mockRejectedValueOnce(new Error('500'))
    expect(await p.calculate()).toBe(false)
    expect(p.state.value).toBe('idle')
    expect(p.problem.value).toBe('calcFailed')
    expect(p.result.value).toBeNull()
  })

  it('повторный «Рассчитать», пока идёт расчёт, — не запускается', async () => {
    const { p, log } = setup()
    const first = p.calculate()
    expect(await p.calculate()).toBe(false)
    await first
    expect(log).toEqual(['customs', 'save', 'calc'])
  })
})

describe('useDtPayments: предпросмотр сбрасывается по правке товаров', () => {
  it('правка поля расчёта (как «Медизделие» через setField) — «Данные изменились»', async () => {
    const { form, p, edit } = setup()
    await p.calculate()
    await edit(() => { setGoodsField(form.goodsItems[0], 'vatRatePreferential', 0.05) })
    expect(p.state.value).toBe('stale-preview')
    expect(p.result.value).not.toBeNull() // суммы видны, писать нельзя
  })

  it('правка не товаров (гр. В, шапка) и не полей расчёта — предпросмотр живой', async () => {
    const { form, p, edit } = setup()
    await p.calculate()
    await edit(() => { form.declarationNumber = '55302/091026/0000001' })
    await edit(() => { form.factPayments.push({ taxModeCode: '6010', amount: 1, exchangeRate: 1, paymentDocDate: null, payerTaxpayerId: null, paymentDate: null, paymentMethodCode: 'БН' }) })
    await edit(() => { form.goodsItems[0].description = 'ВИНТЫ' })
    expect(p.state.value).toBe('preview')
  })

  it('удаление, перестановка товара, правка строки гр. 47 — «Данные изменились»', async () => {
    for (const change of [
      (f: DtFormState) => { f.goodsItems.splice(0, 1) },
      (f: DtFormState) => { f.goodsItems.splice(0, 2, f.goodsItems[1], f.goodsItems[0]) },
      (f: DtFormState) => { f.goodsItems[1].payments = [{ taxModeCode: '2010', amountKzt: 1 } as never] },
    ]) {
      const { form, p, edit } = setup()
      await p.calculate()
      await edit(() => change(form))
      expect(p.state.value).toBe('stale-preview')
      scope?.stop()
    }
  })

  it('правка товара, пока шёл расчёт, — предпросмотр сразу «изменились»', async () => {
    const { form, p, edit } = setup()
    let release!: (v: Import40CalculatePaymentsResponse) => void
    api.calculatePayments.mockImplementationOnce(() => new Promise((r) => { release = r }))
    const run = p.calculate()
    await vi.waitFor(() => expect(api.calculatePayments).toHaveBeenCalled())
    await edit(() => { setGoodsField(form.goodsItems[1], 'netWeightKg', 2) })
    release(calc([]))
    await run
    expect(p.state.value).toBe('stale-preview')
  })

  it('дата гр. А или ЕТТ/ВТО изменились после расчёта — «Данные изменились»', async () => {
    for (const change of [(f: DtFormState) => { f.submissionDate = '2026-10-06' }, (f: DtFormState) => { f.rateType = 'EATT' }]) {
      const { form, p, edit } = setup()
      await p.calculate()
      await edit(() => change(form))
      expect(p.state.value).toBe('stale-preview')
      scope?.stop()
    }
  })

  it('перезагрузка ДТ (другие товары) — предпросмотр устарел', async () => {
    const { form, p } = setup()
    await p.calculate()
    form.goodsItems = [goods(), goods()] as never
    await nextTick()
    expect(p.state.value).toBe('stale-preview')
  })

  it('новый «Рассчитать» после «изменились» — свежий предпросмотр', async () => {
    const { form, p, edit } = setup()
    await p.calculate()
    await edit(() => { setGoodsField(form.goodsItems[0], 'quantity', 3) })
    expect(p.state.value).toBe('stale-preview')
    await p.calculate()
    expect(p.state.value).toBe('preview')
  })
})

describe('useDtPayments.apply: «Записать в гр. 47 и гр. В»', () => {
  it('предпросмотр → гр. 47 товаров и гр. В → сохранить → «Записано»', async () => {
    const { form, p, save, log } = setup()
    await p.calculate()
    const [a, b] = form.goodsItems
    expect(await p.apply()).toBe(true)
    expect(log).toEqual(['customs', 'save', 'calc', 'save'])
    expect(save).toHaveBeenCalledTimes(2)
    expect(form.goodsItems[0]).toBe(a)
    expect(form.goodsItems[1]).toBe(b)
    expect(a.payments?.map((x) => [x.taxModeCode, x.amountKzt])).toEqual([['1010', 5], ['5060', 4]])
    expect(b.payments?.map((x) => [x.taxModeCode, x.amountKzt])).toEqual([['5060', 3]])
    expect([a.needsTpinRecalc, b.needsTpinRecalc]).toEqual([false, false])
    expect(form.factPayments.map((f) => [f.taxModeCode, f.amount, f.exchangeRate, f.paymentMethodCode])).toEqual([['1010', 5, 1, 'БН'], ['5060', 7, 1, 'БН']])
    expect(toast.success).toHaveBeenCalledWith('Платежи записаны в гр. 47 и гр. В')
    expect(p.state.value).toBe('idle')
    expect(p.result.value).toBeNull()
  })

  it('«Данные изменились» — не пишет и не сохраняет', async () => {
    const { form, p, save, edit } = setup()
    await p.calculate()
    await edit(() => { setGoodsField(form.goodsItems[0], 'tnvedCode', '8471410000') })
    expect(await p.apply()).toBe(false)
    expect(save).toHaveBeenCalledTimes(1)
    expect(form.goodsItems.every((g) => !g.payments?.length)).toBe(true)
    expect(form.factPayments).toEqual([])
    expect(toast.warning).toHaveBeenCalledWith('Данные изменились — рассчитайте заново')
  })

  it('сверка снимка при «Записать»: товары переставлены без сигнала правки — не пишет на чужие товары (§5-13)', async () => {
    const { form, p, save } = setup()
    await p.calculate()
    form.goodsItems.splice(0, 2, form.goodsItems[1], form.goodsItems[0])
    expect(await p.apply()).toBe(false)
    expect(p.state.value).toBe('stale-preview')
    expect(save).toHaveBeenCalledTimes(1)
    expect(form.goodsItems.every((g) => !g.payments?.length)).toBe(true)
  })

  it('(баг §5-10) вид акциза сменился 4420 → 4400 — в гр. В остаётся только 4400 (старый вид удалён, в XML не уйдёт)', async () => {
    const { form, p } = setup({ goods: [goods({ payments: [{ taxModeCode: '4420', amountKzt: 9 }] })] })
    const row = (taxModeCode: string, amount: number) => ({ taxModeCode, amount, exchangeRate: 1, paymentDocDate: null, payerTaxpayerId: null, paymentDate: null, paymentMethodCode: 'БН' })
    form.factPayments = [row('1010', 5), row('4420', 9), row('6010', 1)]
    api.calculatePayments.mockResolvedValueOnce(calc([{ index: 0, rows: [{ taxModeCode: '1010', amount: 5 }, { taxModeCode: '4400', amount: 12 }] }], { 1010: 5, 4400: 12 }))
    await p.calculate()
    expect(p.factPreview.value?.removed).toEqual(['4420'])
    await p.apply()
    expect(form.factPayments.map((f) => [f.taxModeCode, f.amount])).toEqual([['1010', 5], ['6010', 1], ['4400', 12]])
    expect(form.goodsItems[0].payments?.map((x) => x.taxModeCode)).toEqual(['1010', '4400'])
  })

  it('товар с ошибкой расчёта: его виды остаются в гр. В (с реквизитами платёжки), суммы гр. В = Σ гр. 47 после записи', async () => {
    const { form, p } = setup({ goods: [goods(), goods({ payments: [{ taxModeCode: '4420', amountKzt: 9 }, { taxModeCode: '5060', amountKzt: 2 }] })] })
    const row = (taxModeCode: string, amount: number, o: Record<string, unknown> = {}) => ({ taxModeCode, amount, exchangeRate: 1, paymentDocDate: null, payerTaxpayerId: null, paymentDate: null, paymentMethodCode: 'БН', ...o })
    form.factPayments = [row('4420', 9, { payerTaxpayerId: '123456789012', paymentDocDate: '2026-10-09' }), row('5060', 1)]
    api.calculatePayments.mockResolvedValueOnce(calc([
      { index: 0, rows: [{ taxModeCode: '1010', amount: 5 }, { taxModeCode: '5060', amount: 4 }] },
      { index: 1, rows: [], error: 'Нет кода ТН ВЭД' },
    ], { 1010: 5, 5060: 4 }))
    await p.calculate()
    expect(p.notRecalculated.value).toEqual([1])
    expect(p.previewTotals.value).toEqual([{ code: '1010', amount: 5 }, { code: '4420', amount: 9 }, { code: '5060', amount: 6 }])
    expect(p.factPreview.value).toMatchObject({ removed: [], added: ['1010'], updated: ['4420', '5060'] })
    await p.apply()
    expect(form.factPayments.map((f) => [f.taxModeCode, f.amount])).toEqual([['4420', 9], ['5060', 6], ['1010', 5]])
    expect(form.factPayments[0]).toMatchObject({ payerTaxpayerId: '123456789012', paymentDocDate: '2026-10-09' })
    expect(form.goodsItems[1].payments?.map((x) => [x.taxModeCode, x.amountKzt])).toEqual([['4420', 9], ['5060', 2]])
  })

  it('(баг I1) сбор 1010 — один на ДТ: 3 товара по 8 650, у второго ошибка → его 1010 уходит, Σ 1010 в гр. 47 и гр. В = 25 950', async () => {
    const fee = (o: Record<string, unknown> = {}) => goods({ payments: [{ taxModeCode: '1010', amountKzt: 8650 }, { taxModeCode: '5060', amountKzt: 100 }], ...o })
    const { form, p } = setup({ goods: [fee(), fee({ tnvedCode: null, needsTpinRecalc: false, customsValueKzt: 50001 }), fee()] })
    form.factPayments = [{ taxModeCode: '1010', amount: 25950, exchangeRate: 1, paymentDocDate: null, payerTaxpayerId: null, paymentDate: null, paymentMethodCode: 'БН' }]
    api.calculatePayments.mockResolvedValueOnce(calc([
      { index: 0, rows: [{ taxModeCode: '1010', amount: 12975 }, { taxModeCode: '5060', amount: 110 }] },
      { index: 1, rows: [], error: 'Нет кода ТН ВЭД' },
      { index: 2, rows: [{ taxModeCode: '1010', amount: 12975 }, { taxModeCode: '5060', amount: 330 }] },
    ], { 1010: 25950, 5060: 440 }))
    await p.calculate()
    // предпросмотр уже без доли товара 2 (было бы 34 600)
    expect(p.previewTotals.value).toEqual([{ code: '1010', amount: 25950 }, { code: '5060', amount: 540 }])
    await p.apply()
    const fees = form.goodsItems.map((g) => g.payments!.filter((x) => x.taxModeCode === '1010').reduce((s, x) => s + (x.amountKzt ?? 0), 0))
    expect(fees).toEqual([12975, 0, 12975])
    // прочие строки товара с ошибкой и его «Пересчитать» — как были
    expect(form.goodsItems[1].payments!.map((x) => [x.taxModeCode, x.amountKzt])).toEqual([['5060', 100]])
    expect(form.goodsItems[1].needsTpinRecalc).toBe(false)
    expect(form.factPayments.map((f) => [f.taxModeCode, f.amount])).toEqual([['1010', 25950], ['5060', 540]])
  })

  it('(I11) новые строки гр. В — плательщик БИН гр. 14 декларанта', async () => {
    const { form, p } = setup()
    form.declarantBin = '250740008962'
    await p.calculate()
    await p.apply()
    expect(form.factPayments.map((f) => [f.taxModeCode, f.payerTaxpayerId])).toEqual([['1010', '250740008962'], ['5060', '250740008962']])
  })

  it('(баг QA Q3, I5) гр. В — Σ гр. 47 до копеек, затем вверх до тенге (как КЕДЕН): шум сложения не уходит в форму и PUT', async () => {
    const { form, p } = setup({ goods: [goods(), goods(), goods()] })
    api.calculatePayments.mockResolvedValueOnce(calc([
      { index: 0, rows: [{ taxModeCode: '5060', amount: 100000.38 }] },
      { index: 1, rows: [{ taxModeCode: '5060', amount: 1009505.76 }] },
      { index: 2, rows: [{ taxModeCode: '5060', amount: 200000.33 }] },
    ], { 5060: 1309506.47 }))
    await p.calculate()
    expect(p.previewTotals.value).toEqual([{ code: '5060', amount: 1309506.47 }])
    await p.apply()
    expect(form.factPayments.map((f) => f.amount)).toEqual([1309507])
  })

  it('несколько строк вида в гр. В — суммы не тронуты, предупреждение', async () => {
    const { form, p } = setup()
    const row = (amount: number) => ({ taxModeCode: '5060', amount, exchangeRate: 1, paymentDocDate: null, payerTaxpayerId: null, paymentDate: null, paymentMethodCode: 'ПП' })
    form.factPayments = [row(4), row(2)]
    await p.calculate()
    expect(p.factPreview.value?.multiple).toEqual(['5060'])
    await p.apply()
    expect(form.factPayments.map((f) => [f.taxModeCode, f.amount])).toEqual([['5060', 4], ['5060', 2], ['1010', 5]])
    expect(toast.warning).toHaveBeenCalledWith('В гр. В несколько платежей по виду 5060 — суммы не изменены, проверьте их')
  })

  it('без предпросмотра или без права — ничего', async () => {
    const { p, save, editable } = setup()
    expect(await p.apply()).toBe(false)
    await p.calculate()
    editable.value = false
    expect(await p.apply()).toBe(false)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('сохранение после записи не прошло — записанное остаётся в форме, сказано', async () => {
    let n = 0
    const { form, p } = setup({ save: async () => ++n === 1 })
    await p.calculate()
    expect(await p.apply()).toBe(false)
    expect(form.factPayments).toHaveLength(2)
    expect(toast.warning).toHaveBeenCalledWith('Платежи записаны в гр. 47 и гр. В, но ДТ не сохранилась')
    expect(p.state.value).toBe('idle')
  })
})

describe('useDtPayments.calcCustomsValue («Рассчитать там. стоимость», шаг 1 отдельно)', () => {
  it('гр. 45 изменилась — платежи товара «Пересчитать»; не изменилась — нет; без сохранения и расчёта платежей', async () => {
    const { form, p, log } = setup({
      goods: [goods({ customsValueKzt: 1000, needsTpinRecalc: false }), goods({ customsValueKzt: 2000, needsTpinRecalc: false }), goods({ customsValueKzt: 3000, needsTpinRecalc: false })],
    })
    api.calculateCustomsValue.mockResolvedValueOnce({ goods: [{ index: 0, customsValueKzt: 1500 }, { index: 1, customsValueKzt: 2000 }] })
    await p.calcCustomsValue()
    expect(form.goodsItems.map((g) => g.needsTpinRecalc)).toEqual([true, false, false])
    expect(log).toEqual([])
    expect(p.customsResult.value).toEqual({ updated: 2, total: 3500 })
  })

  it('(баг m6) товар удалили, пока шёл запрос, — гр. 45 пишется по ключу товара, а не по позиции', async () => {
    const { form, p } = setup({
      goods: [goods({ customsValueKzt: 1000, description: 'A' }), goods({ customsValueKzt: 2000, description: 'B' }), goods({ customsValueKzt: 3000, description: 'C' })],
    })
    let release: (v: unknown) => void = () => {}
    api.calculateCustomsValue.mockImplementationOnce(() => new Promise((r) => { release = r }))
    const run = p.calcCustomsValue()
    form.goodsItems.splice(0, 1) // удалили «A»: «B» и «C» сдвинулись на позиции 0 и 1
    release({ goods: [{ index: 0, customsValueKzt: 1111 }, { index: 1, customsValueKzt: 2222 }, { index: 2, customsValueKzt: 3333 }] })
    await run
    expect(form.goodsItems.map((g) => [g.description, g.customsValueKzt])).toEqual([['B', 2222], ['C', 3333]])
    expect(p.customsResult.value).toEqual({ updated: 2, total: 5555 })
  })
})
