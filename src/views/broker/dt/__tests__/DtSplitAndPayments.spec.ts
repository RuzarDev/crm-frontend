import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { Import40CalculatePaymentsResponse } from '@/api/import40'

const api = vi.hoisted(() => ({
  splitSuggestion: vi.fn(), splitDeclaration: vi.fn(), calculateTpin: vi.fn(), calculateCustomsValue: vi.fn(), calculatePayments: vi.fn(),
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/import40', async (orig) => ({ ...(await orig<typeof import('@/api/import40')>()), import40Api: api }))
vi.mock('@/ui/message', () => ({ message: toast }))

import DtSplitModal from '../DtSplitModal.vue'
import { applyGoodsPaymentRows, useDtPayments } from '../useDtPayments'
import { emptyDtForm, type DtFormState } from '../dtPayload'

let w: VueWrapper
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})
const settle = async () => {
  await flushPromises()
  await nextTick()
  await flushPromises()
}
const bodyButton = (text: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined

describe('DtSplitModal', () => {
  const rows = [
    { sortOrder: 1, tnvedCode: '8471300000', vtoStatus: 'Изъятие ВТО', isVtoCandidate: true, ettRate: '10%', vtoRate: '0%' },
    { sortOrder: 2, tnvedCode: '8473302008', vtoStatus: null, isVtoCandidate: false },
    { sortOrder: 3, tnvedCode: '4202121900', vtoStatus: 'Изъятие ВТО', isVtoCandidate: true, ettRate: '12%', vtoRate: '5%' },
  ]
  const mountModal = (props: Record<string, unknown> = {}) => mountWithI18n(DtSplitModal, {
    props: { open: true, caseId: 'c1', dtId: 'd1', goodsCount: 3, save: vi.fn(async () => true), ...props },
    attachTo: document.body,
  })

  it('только кандидаты ВТО, по умолчанию отмечены; «Разделить» — сохранить и разделить', async () => {
    api.splitSuggestion.mockResolvedValue(rows)
    const res = { originalDeclarationId: 'd1', ettDeclarationId: 'e1', vtoDeclarationId: 'v1', paymentsRecalculated: true }
    api.splitDeclaration.mockResolvedValue(res)
    const save = vi.fn(async () => true)
    w = mountModal({ save })
    await settle()
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.textContent).toContain('8471300000')
    expect(dialog.textContent).toContain('4202121900')
    expect(dialog.textContent).not.toContain('8473302008')
    const checked = dialog.querySelectorAll('tbody [role="checkbox"][data-state="checked"]')
    expect(checked).toHaveLength(2)
    // Отмечены 2 из 3 товаров — обычное разделение, не «одна ДТ ВТО».
    expect(dialog.querySelector('[data-dt-split-vto-only]')).toBeNull()
    bodyButton('Разделить')!.click()
    await settle()
    expect(save).toHaveBeenCalledTimes(1)
    expect(api.splitDeclaration).toHaveBeenCalledWith('c1', 'd1', { vtoGoodSortOrders: [1, 3] })
    expect(w.emitted('done')).toEqual([[res]])
    expect(w.emitted('update:open')).toEqual([[false]])
  })

  it('отмечены все товары ДТ — «Создать ДТ ВТО» и пояснение', async () => {
    api.splitSuggestion.mockResolvedValue([rows[0]])
    w = mountModal({ goodsCount: 1 })
    await settle()
    expect(document.body.querySelector('[data-dt-split-vto-only]')).not.toBeNull()
    expect(bodyButton('Создать ДТ ВТО')).toBeDefined()
  })

  it('кандидатов нет — сообщение и окно закрывается', async () => {
    api.splitSuggestion.mockResolvedValue([rows[1]])
    w = mountModal()
    await settle()
    expect(toast.info).toHaveBeenCalledWith('Нет товаров, попадающих под изъятия ВТО — разделять нечего')
    expect(w.emitted('update:open')).toEqual([[false]])
  })

  it('сохранение не прошло — не разделяем', async () => {
    api.splitSuggestion.mockResolvedValue(rows)
    w = mountModal({ save: vi.fn(async () => false) })
    await settle()
    bodyButton('Разделить')!.click()
    await settle()
    expect(api.splitDeclaration).not.toHaveBeenCalled()
  })
})

describe('useDtPayments (перенос из прежнего экрана)', () => {
  const goods = (o: Record<string, unknown> = {}) => ({
    tnvedCode: '8471300000', customsValue: 100, currency: 'USD', netWeightKg: 1, payments: [], ...o,
  })
  const calc = (rows: Import40CalculatePaymentsResponse['goodsRows']): Import40CalculatePaymentsResponse =>
    ({ goodsRows: rows, totalsByTaxMode: { 1010: 5, 5060: 7 } } as unknown as Import40CalculatePaymentsResponse)

  it('строки гр.47: обновить по виду, добавить новые, убрать устаревшие расчётные, ручной вид ставки не трогать', () => {
    const form = reactive(emptyDtForm()) as DtFormState
    form.goodsItems = [goods({
      payments: [
        { taxModeCode: '2010', rateKindCode: '*', amountKzt: 1 },
        { taxModeCode: '4420', amountKzt: 9 }, // акциз больше не считается — уходит
        { taxModeCode: '9999', amountKzt: 3 }, // не расчётный — остаётся
      ],
    })] as never
    applyGoodsPaymentRows(form, calc([{ index: 0, rows: [
      { taxModeCode: '2010', base: 100, rate: 10, amount: 10 },
      { taxModeCode: '5060', base: 110, rate: 12, amount: 13.2 },
    ] } as never]))
    const p = form.goodsItems[0].payments!
    expect(p.map((x) => x.taxModeCode)).toEqual(['2010', '9999', '5060'])
    expect(p[0]).toMatchObject({ amountKzt: 10, rateKindCode: '*', paymentFeatureCode: 'ИУ' })
    expect(p[2]).toMatchObject({ amountKzt: 13.2, rateKindCode: '%' })
  })

  it('«Записать» расчёт снимает «Пересчитать» у посчитанных товаров; у товара с ошибкой и не попавшего в расчёт — нет', () => {
    const form = reactive(emptyDtForm()) as DtFormState
    form.goodsItems = [goods({ needsTpinRecalc: true }), goods({ needsTpinRecalc: true }), goods({ needsTpinRecalc: true })] as never
    const [a, b, c] = form.goodsItems
    applyGoodsPaymentRows(form, calc([
      { index: 0, rows: [{ taxModeCode: '1010', amount: 5 }] } as never,
      { index: 1, rows: [], error: 'нет ставки' } as never,
    ]))
    expect([a, b, c].map((g) => g.needsTpinRecalc)).toEqual([false, true, true])
  })

  it('«Рассчитать там. стоимость»: гр. 45 изменилась — платежи товара «Пересчитать»; не изменилась — нет', async () => {
    const form = reactive(emptyDtForm()) as DtFormState
    form.goodsItems = [
      goods({ customsValueKzt: 1000, needsTpinRecalc: false }),
      goods({ customsValueKzt: 2000, needsTpinRecalc: false }),
      goods({ customsValueKzt: 3000, needsTpinRecalc: false }),
    ] as never
    api.calculateCustomsValue.mockResolvedValue({ goods: [{ index: 0, customsValueKzt: 1500 }, { index: 1, customsValueKzt: 2000 }] })
    const scope = effectScope()
    const p = scope.run(() => useDtPayments(form, 'c1', 'd1', { save: async () => true }))!
    await p.calcCustomsValue()
    expect(form.goodsItems.map((g) => g.needsTpinRecalc)).toEqual([true, false, false])
    scope.stop()
  })

  it('ТПиН: замечания по товарам — в окно (tpinProblems), флаг пересчёта снимается', async () => {
    const form = reactive(emptyDtForm()) as DtFormState
    form.goodsItems = [goods({ needsTpinRecalc: true }), goods({ tnvedCode: '1' })] as never
    api.calculateCustomsValue.mockResolvedValue({ goods: [{ index: 0, customsValueKzt: 50000 }, { index: 1, customsValueKzt: 1 }] })
    api.calculateTpin.mockResolvedValue(calc([
      { index: 0, rows: [], notes: 'вид акциза по умолчанию' } as never,
      { index: 1, rows: [], error: 'нет ставки' } as never,
    ]))
    const scope = effectScope()
    const p = scope.run(() => useDtPayments(form, 'c1', 'd1', { save: async () => true }))!
    await p.calcTpin()
    expect(form.goodsItems[0].needsTpinRecalc).toBe(false)
    expect(form.goodsItems[0].customsValueKzt).toBe(50000)
    expect(p.tpinProblems.value).toEqual(['Товар 1: вид акциза по умолчанию', 'Товар 2: нет ставки'])
    expect(toast.success).toHaveBeenCalledWith('ТПиН рассчитан для 1 тов. Платежи — в панели «Данные КЕДЕН» (гр.47) у каждого товара.')
    scope.stop()
  })

  it('«Рассчитать платежи»: сохранить → расчёт → «Записать» в гр.47 и гр.B → сохранить', async () => {
    const form = reactive(emptyDtForm()) as DtFormState
    form.goodsItems = [goods()] as never
    api.calculatePayments.mockResolvedValue(calc([{ index: 0, rows: [{ taxModeCode: '1010', amount: 5 }] } as never]))
    const save = vi.fn(async () => true)
    const scope = effectScope()
    const p = scope.run(() => useDtPayments(form, 'c1', 'd1', { save }))!
    await p.openModal()
    expect(save).toHaveBeenCalledTimes(1)
    expect(p.modalOpen.value).toBe(true)
    await p.apply()
    expect(save).toHaveBeenCalledTimes(2)
    expect(form.goodsItems[0].payments?.[0]).toMatchObject({ taxModeCode: '1010', amountKzt: 5 })
    expect(form.factPayments.map((f) => [f.taxModeCode, f.amount, f.paymentMethodCode])).toEqual([['1010', 5, 'БН'], ['5060', 7, 'БН']])
    expect(p.modalOpen.value).toBe(false)
    scope.stop()
  })

  it('сохранение перед расчётом не прошло — окно закрывается, расчёта нет', async () => {
    const form = reactive(emptyDtForm()) as DtFormState
    const scope = effectScope()
    const p = scope.run(() => useDtPayments(form, 'c1', 'd1', { save: async () => false }))!
    await p.openModal()
    expect(api.calculatePayments).not.toHaveBeenCalled()
    expect(p.modalOpen.value).toBe(false)
    scope.stop()
  })
})

beforeEach(() => { vi.clearAllMocks() })
