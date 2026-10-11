import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, ref, watch, type EffectScope } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import type { Import40CalculatePaymentsResponse } from '@/api/import40'
import type { Import40FactPayment, Import40GoodsItemInput } from '@/types/api'
import { mountWithI18n } from '@/test/mountWithI18n'

const api = vi.hoisted(() => ({ calculateCustomsValue: vi.fn(), calculatePayments: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/import40', async (orig) => ({ ...(await orig<typeof import('@/api/import40')>()), import40Api: api }))
vi.mock('@/ui/message', () => ({ message: toast }))
vi.mock('@/stores/classifiers', () => ({
  useClassifiersStore: () => ({
    cache: { 'tax-modes': [{ code: '9999', nameRu: 'ПРОЧИЙ ПЛАТЁЖ' }] },
    options: (code: string) => (code === 'tax-modes'
      ? [{ value: '1010', label: '1010 — сбор' }, { value: '5060', label: '5060 — НДС' }]
      : [{ value: 'БН', label: 'БН — безналичный' }]),
  }),
}))

import { emptyDtForm, type DtFormState } from '../../dtPayload'
import { useDtGoods } from '../../goods/useDtGoods'
import { useDtPayments } from '../../useDtPayments'
import SectionPayments from '../SectionPayments.vue'

const pay = (code: string, amount: number, o: Record<string, unknown> = {}) =>
  ({ taxModeCode: code, taxBase: null, rateKindCode: '%', rateValue: null, rateUnitCode: null, rateCurrencyCode: null, weightRatio: null, rateDate: null, paymentFeatureCode: 'ИУ', amountKzt: amount, ...o })
const goodsItem = (o: Record<string, unknown> = {}) => ({
  tnvedCode: '8471300000', description: 'НОУТБУКИ', customsValue: 100, currency: 'USD', customsValueKzt: 49512,
  payments: [pay('1010', 2500), pay('5060', 7922)], needsTpinRecalc: false, vatRatePreferential: null, ...o,
}) as unknown as Import40GoodsItemInput
const fact = (code: string, amount: number, o: Partial<Import40FactPayment> = {}): Import40FactPayment => ({
  taxModeCode: code, amount, exchangeRate: 1, paymentDocDate: '2026-10-09', payerTaxpayerId: '201140012345', paymentDate: '2026-10-09', paymentMethodCode: 'БН', ...o,
})

let scope: EffectScope | null = null
let w: VueWrapper | null = null
afterEach(() => {
  w?.unmount()
  w = null
  scope?.stop()
  scope = null
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await flushPromises()
    await nextTick()
  }
}

/** Раздел как на странице: форма, версия правок (глубокий наблюдатель, как useDtForm), расчёт и модель товаров. */
function setup(o: { goods?: Import40GoodsItemInput[]; fact?: Import40FactPayment[]; readonly?: boolean; calc?: Import40CalculatePaymentsResponse } = {}) {
  const form = reactive(emptyDtForm()) as DtFormState
  form.goodsItems = o.goods ?? [goodsItem()]
  form.factPayments = o.fact ?? []
  const editVersion = ref(0)
  const save = vi.fn(async () => true)
  api.calculateCustomsValue.mockImplementation(async () => ({ goods: [] }))
  api.calculatePayments.mockImplementation(async () => structuredClone(o.calc ?? {
    goodsRows: form.goodsItems.map((_, index) => ({ index, rows: [{ taxModeCode: '1010', amount: 8650 }, { taxModeCode: '5060', amount: 84000, base: 700000, rate: 12 }] })),
    totalsByTaxMode: {}, grandTotalB: 0,
  }))
  scope = effectScope()
  const { payments, goods } = scope.run(() => {
    watch(() => form, () => { editVersion.value += 1 }, { deep: true })
    return {
      payments: useDtPayments(form, 'c1', 'd1', { save, editable: !o.readonly, editVersion }),
      goods: useDtGoods(form, { readiness: null, canEdit: !o.readonly }),
    }
  })!
  w = mountWithI18n(SectionPayments, {
    props: { form, payments, goods, readonly: !!o.readonly, totalsInline: true },
    attachTo: document.body,
  })
  return { form, payments, goods, save, w: w as VueWrapper }
}
const cards = (wr: VueWrapper) => wr.findAll('[data-payments-goods]').map((c) => c.attributes('data-goods-index'))

describe('SectionPayments: карточки и плашки', () => {
  it('карточка: №, код в формате, описание, строки гр. 47 по порядку с подписями; итоги без копеек', async () => {
    const { w } = setup({
      goods: [
        goodsItem({ payments: [pay('5060', 2018064.4, { taxBase: 12612900, rateValue: 16 }), pay('1010', 2500, { basisLabel: '6 МРП' }), pay('9999', 1)] }),
        goodsItem({ tnvedCode: null, description: 'МЫШИ', payments: [], needsTpinRecalc: false }),
      ],
    })
    await settle()
    const card = w.get('[data-payments-goods][data-goods-index="0"]')
    expect(card.text()).toContain('8471 30 000 0')
    expect(card.text()).toContain('НОУТБУКИ')
    expect(card.findAll('[data-payments-line]').map((l) => l.attributes('data-payments-line'))).toEqual(['1010', '5060', '9999'])
    expect(card.get('[data-payments-line="1010"]').text()).toMatch(/Таможенный сбор.*6 МРП.*2\s500,00.*ИУ/s)
    expect(card.get('[data-payments-line="5060"]').text()).toMatch(/12\s612\s900,00.*16%.*2\s018\s064,40/s)
    expect(card.get('[data-payments-line="9999"]').text()).toContain('ПРОЧИЙ ПЛАТЁЖ')
    // до первого расчёта: товар без гр. 47 — коротко, без кода — «—»
    const second = w.get('[data-payments-goods][data-goods-index="1"]')
    expect(second.get('[data-payments-goods-code]').text()).toBe('—')
    expect(second.find('[data-payments-goods-empty]').text()).toBe('Платежи не рассчитаны')
    // «Платежи устарели» — товар без гр. 47
    expect(w.get('[data-payments-stale]').text()).toContain('товары 2')
    // «Итого по видам» — Σ записанной гр. 47 без копеек
    expect(w.get('[data-payments-total="5060"]').text()).toMatch(/2\s018\s064\s₸/)
    expect(w.get('[data-payments-grand]').text()).toMatch(/2\s020\s565\s₸/)
    expect(w.find('[data-payments-apply]').exists()).toBe(false)
  })

  it('свёртка: от 6 товаров — без замечаний свёрнуты, «показать все» / «свернуть»; payments-reveal раскрывает одну карточку', async () => {
    const goods = Array.from({ length: 8 }, (_, i) => goodsItem({ description: `Т${i + 1}`, needsTpinRecalc: i === 3 }))
    const { w, goods: model } = setup({ goods })
    await settle()
    expect(cards(w)).toEqual(['3'])
    expect(w.get('[data-payments-goods][data-goods-index="3"] [data-payments-goods-stale]').text()).toBe('Пересчитать')
    expect(w.get('[data-payments-more]').text()).toContain('Ещё 7 тов. рассчитаны без замечаний')
    w.get('[data-dt-payments]').element.dispatchEvent(new CustomEvent('payments-reveal', { detail: { index: 6 } }))
    await nextTick()
    expect(cards(w)).toEqual(['3', '6'])
    // раскрытая карточка помнится по товару, а не по позиции: удалили первый — «Т7» теперь на позиции 5
    model.remove([0])
    await nextTick()
    expect(cards(w)).toEqual(['2', '5'])
    expect(w.get('[data-payments-goods][data-goods-index="5"]').text()).toContain('Т7')
    await w.get('[data-payments-show-all]').trigger('click')
    expect(cards(w)).toHaveLength(7)
    await w.get('[data-payments-collapse]').trigger('click')
    expect(cards(w)).toEqual(['2'])
  })

  it('до первого расчёта от 6 товаров (замечание у всех) — первые 5 карточек и «Ещё N тов. · показать все»', async () => {
    const { w } = setup({ goods: Array.from({ length: 8 }, () => goodsItem({ payments: [] })) })
    await settle()
    expect(cards(w)).toEqual(['0', '1', '2', '3', '4'])
    expect(w.get('[data-payments-more]').text()).toMatch(/^Ещё 3 тов\.\s*·\s*показать все$/)
    expect(w.get('[data-payments-stale]').text()).toContain('товары 1–8')
    await w.get('[data-payments-show-all]').trigger('click')
    expect(cards(w)).toHaveLength(8)
  })

  it('до 5 товаров видны все; «Рассчитать» — шаги и предпросмотр', async () => {
    const { w, payments } = setup({ goods: [goodsItem(), goodsItem()] })
    await settle()
    expect(cards(w)).toEqual(['0', '1'])
    expect(w.get('[data-payments-hint]').text()).toBe('Сохраним ДТ, пересчитаем гр. 45/46 и платежи')
    let release: (v: unknown) => void = () => {}
    api.calculateCustomsValue.mockImplementationOnce(() => new Promise((r) => { release = r }))
    await w.get('[data-payments-calc]').trigger('click')
    expect(w.get('[data-payments-hint]').text()).toBe('Пересчитываем гр. 45/46…')
    expect(w.find('[data-payments-stale]').exists()).toBe(false)
    release({ goods: [] })
    await settle()
    expect(payments.state.value).toBe('preview')
    expect(w.get('[data-payments-hint]').text()).toBe('Сохраним ДТ, пересчитаем гр. 45/46 и платежи')
    expect(cards(w)).toEqual(['0', '1'])
  })

  it('предпросмотр: суммы расчёта в карточках, ошибка и примечание, «не пересчитаны», «Записать», что удалим из гр. В и несколько строк вида', async () => {
    const { w, form } = setup({
      goods: [goodsItem(), goodsItem({ tnvedCode: null }), goodsItem({ payments: [pay('2050', 10)] })],
      fact: [fact('2050', 10), fact('5060', 1), fact('5060', 2)],
      calc: {
        goodsRows: [
          { index: 0, rows: [{ taxModeCode: '1010', amount: 8650 }, { taxModeCode: '5060', amount: 84000 }], excisePossible: false, notes: 'Акциз взят по умолчанию' },
          { index: 1, rows: [], excisePossible: false, error: 'Укажите код ТНВЭД и стоимость' },
          { index: 2, rows: [{ taxModeCode: '1010', amount: 0 }, { taxModeCode: '5060', amount: 16 }], excisePossible: false },
        ],
        totalsByTaxMode: { 1010: 8650, 5060: 84016 }, grandTotalB: 92666,
      },
    })
    await settle()
    await w.get('[data-payments-calc]').trigger('click')
    await settle()
    expect(w.get('[data-dt-payments]').attributes('data-state')).toBe('preview')
    expect(w.find('[data-payments-stale]').exists()).toBe(false)
    expect(w.get('[data-payments-goods][data-goods-index="0"] [data-payments-line="5060"]').text()).toMatch(/84\s000,00.*расчёт, не записан/s)
    expect(w.get('[data-payments-goods][data-goods-index="0"] [data-payments-goods-issue]').text()).toContain('Акциз взят по умолчанию')
    expect(w.findAll('[data-payments-goods][data-goods-index="0"] [data-payments-note]').map((n) => n.text())).toEqual(['Акциз взят по умолчанию'])
    expect(w.get('[data-payments-goods][data-goods-index="1"]').attributes('data-state')).toBe('error')
    expect(w.get('[data-payments-goods][data-goods-index="1"] [data-payments-goods-issue]').text()).toContain('Укажите код ТНВЭД и стоимость — платежи не рассчитаны')
    expect(w.get('[data-payments-not-recalculated]').text()).toContain('товары 2')
    // сбор распределён между пересчитанными — строку 1010 у товара 2 с ошибкой «Записать» уберёт (I1-A); 5060 остаётся
    expect(w.get('[data-payments-fee-dropped-list]').text()).toBe('Сбор 1010 уберём у товаров 2: сбор за ДТ распределён между пересчитанными товарами')
    expect(w.find('[data-payments-goods][data-goods-index="1"] [data-payments-line="1010"]').exists()).toBe(false)
    expect(w.get('[data-payments-goods][data-goods-index="1"] [data-payments-line="5060"]').text()).toMatch(/7\s922,00/)
    expect(w.get('[data-payments-goods][data-goods-index="1"] [data-payments-fee-dropped]').text()).toContain('Строку 1010 уберём')
    expect(w.find('[data-payments-goods][data-goods-index="0"] [data-payments-fee-dropped]').exists()).toBe(false)
    // итоги — Σ гр. 47 после записи: товар 2 с ошибкой — без 1010, со своим 5060 = 7922
    expect(w.get('[data-payments-total="1010"]').text()).toMatch(/8\s650\s₸/)
    expect(w.get('[data-payments-total="5060"]').text()).toMatch(/91\s938\s₸/)
    expect(w.get('[data-payments-removed]').text()).toBe('Удалим из гр. В: 2050')
    expect(w.get('[data-payments-multiple="5060"]').text()).toContain('По виду 5060 в гр. В несколько платежей')
    expect(w.get('[data-payments-apply]').attributes('disabled')).toBeUndefined()
    // форма не тронута до «Записать»
    expect(form.factPayments.map((p) => p.taxModeCode)).toEqual(['2050', '5060', '5060'])
  })

  it('медизделие в карточке → «Пересчитать» у товара и сброс предпросмотра; «Рассчитать заново» считает снова', async () => {
    const { w, form, payments } = setup({ goods: [goodsItem()] })
    await settle()
    await w.get('[data-payments-calc]').trigger('click')
    await settle()
    expect(payments.state.value).toBe('preview')
    ;(w.get('[data-payments-medical]').element as HTMLElement).click()
    await settle()
    expect(form.goodsItems[0]).toMatchObject({ vatRatePreferential: 0.05, needsTpinRecalc: true })
    expect(w.get('[data-dt-payments]').attributes('data-state')).toBe('stale-preview')
    expect(w.get('[data-payments-changed]').text()).toContain('Данные изменились — рассчитайте заново')
    // итоги — не прежний расчёт: записанная гр. 47 с пометкой «расчёт устарел», без «Записать» и «удалим»
    expect(w.find('[data-payments-apply]').exists()).toBe(false)
    expect(w.find('[data-payments-totals-preview]').exists()).toBe(false)
    expect(w.find('[data-payments-removed]').exists()).toBe(false)
    expect(w.get('[data-payments-totals-outdated]').text()).toContain('Расчёт устарел — рассчитайте заново')
    expect(w.get('[data-payments-total="5060"]').text()).toMatch(/7\s922\s₸/)
    // карточки — по текущим данным, без сумм предпросмотра
    expect(w.find('[data-payments-line][data-fresh]').exists()).toBe(false)
    await w.get('[data-payments-changed] [data-payments-recalc]').trigger('click')
    await settle()
    expect(api.calculatePayments).toHaveBeenCalledTimes(2)
    expect(payments.state.value).toBe('preview')
  })

  it('«Записать»: гр. 47 и гр. В записаны, «Итого» — записанное, плашки предпросмотра нет', async () => {
    const { w, form, save } = setup({ goods: [goodsItem({ needsTpinRecalc: true })], fact: [fact('5060', 100)] })
    await settle()
    await w.get('[data-payments-calc]').trigger('click')
    await settle()
    await w.get('[data-payments-apply]').trigger('click')
    await settle()
    expect(save).toHaveBeenCalledTimes(2)
    expect(w.get('[data-dt-payments]').attributes('data-state')).toBe('idle')
    expect(form.goodsItems[0].payments!.map((p) => [p.taxModeCode, p.amountKzt])).toEqual([['1010', 8650], ['5060', 84000]])
    expect(form.factPayments.map((p) => [p.taxModeCode, p.amount])).toEqual([['5060', 84000], ['1010', 8650]])
    expect(w.find('[data-payments-preview]').exists()).toBe(false)
    expect(w.find('[data-payments-stale]').exists()).toBe(false)
    expect(w.find('[data-payments-diff]').exists()).toBe(false)
    expect(w.get('[data-payments-total="5060"]').text()).toMatch(/84\s000\s₸/)
  })

  it('расчёт остановился — почему, в разделе', async () => {
    const { w } = setup()
    api.calculatePayments.mockRejectedValueOnce(new Error('500'))
    await settle()
    await w.get('[data-payments-calc]').trigger('click')
    await settle()
    expect(w.get('[data-payments-problem]').text()).toContain('Сервер не рассчитал платежи')
  })

  it('сверка гр. 47 ↔ гр. В: расходятся — предупреждение по виду', async () => {
    const { w } = setup({ fact: [fact('1010', 2500), fact('5060', 7000)] })
    await settle()
    expect(w.find('[data-payments-diff-code="1010"]').exists()).toBe(false)
    // до копейки: расхождение в копейках без них выглядело бы как равные суммы
    expect(w.get('[data-payments-diff-code="5060"]').text()).toMatch(/5060: гр\. 47 — 7\s922,00 ₸, гр\. В — 7\s000,00 ₸/)
  })

  it('просмотр: без «Рассчитать», «Записать» и правок; суммы, карточки и таблица видны', async () => {
    const { w } = setup({ readonly: true, goods: [goodsItem({ needsTpinRecalc: true })], fact: [fact('1010', 2500)] })
    await settle()
    expect(w.find('[data-payments-calc]').exists()).toBe(false)
    expect(w.find('[data-payments-recalc]').exists()).toBe(false)
    expect(w.find('[data-payments-apply]').exists()).toBe(false)
    expect(w.get('[data-payments-medical]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-payments-total="1010"]').text()).toMatch(/2\s500\s₸/)
    expect(w.findAll('[data-fact-row]')).toHaveLength(1)
    expect(w.find('[data-fact-add]').exists()).toBe(false)
    expect(w.get('[data-fact="amount"]').attributes('disabled')).toBeDefined()
  })
})

describe('SectionPayments: 200 товаров', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => goodsItem({ description: `ТОВАР ${i + 1}`, needsTpinRecalc: i % 50 === 0 }))

  it('открываются свёрнутыми (видны только с замечаниями), правка при живом предпросмотре не обходит форму заметно', async () => {
    const t0 = performance.now()
    const { w, form, payments } = setup({ goods: many(200) })
    await nextTick()
    const mountMs = performance.now() - t0
    expect(cards(w)).toEqual(['0', '50', '100', '150'])
    expect(w.get('[data-payments-more]').text()).toContain('Ещё 196 тов.')
    await w.get('[data-payments-calc]').trigger('click')
    await settle()
    expect(payments.state.value).toBe('preview')
    expect(cards(w)).toEqual([])
    // правка поля, не влияющего на расчёт, при живом предпросмотре: снимок 200 товаров — один на правку
    const t1 = performance.now()
    for (let i = 0; i < 20; i++) {
      form.goodsItems[i].description = `ПРАВКА ${i}`
      await nextTick()
    }
    const editMs = (performance.now() - t1) / 20
    expect(payments.state.value).toBe('preview')
    const t2 = performance.now()
    await w.get('[data-payments-show-all]').trigger('click')
    const showAllMs = performance.now() - t2
    expect(cards(w)).toHaveLength(200)
    // jsdom медленнее Chrome в разы; цифры — в отчёт задачи
    console.info(`[perf 200 goods, jsdom] mount ${mountMs.toFixed(0)} ms, edit with live preview ${editMs.toFixed(1)} ms, show all ${showAllMs.toFixed(0)} ms`)
    expect(mountMs).toBeLessThan(1500)
    expect(editMs).toBeLessThan(100)
  })

  it('рассчитать и записать при 200 товарах: гр. 47 у всех, гр. В — по видам, замеры', async () => {
    const { w, form, payments, save } = setup({ goods: many(200) })
    await nextTick()
    const t0 = performance.now()
    await w.get('[data-payments-calc]').trigger('click')
    await settle()
    const calcMs = performance.now() - t0
    expect(payments.state.value).toBe('preview')
    const t1 = performance.now()
    await w.get('[data-payments-apply]').trigger('click')
    await settle()
    const applyMs = performance.now() - t1
    expect(save).toHaveBeenCalledTimes(2)
    expect(form.goodsItems.every((g) => g.payments!.length === 2 && !g.needsTpinRecalc)).toBe(true)
    expect(form.factPayments.map((p) => [p.taxModeCode, p.amount])).toEqual([['1010', 8650 * 200], ['5060', 84000 * 200]])
    console.info(`[perf 200 goods, jsdom] calc+preview ${calcMs.toFixed(0)} ms, apply ${applyMs.toFixed(0)} ms`)
    expect(calcMs).toBeLessThan(3000)
    expect(applyMs).toBeLessThan(3000)
  })
})

describe('SectionPayments: гр. В после «Записать» (§5-1)', () => {
  it('таблица сразу показывает новые суммы и новую строку, правка строки их не откатывает', async () => {
    const { w, form } = setup({ goods: [goodsItem({ needsTpinRecalc: true })], fact: [fact('5060', 100, { payerTaxpayerId: '111' })] })
    await settle()
    const amountOf = (code: string) => (w.get(`[data-fact-row="${code}"] input[data-fact="amount"]`).element as HTMLInputElement).value
    expect(amountOf('5060')).toBe('100')
    await w.get('[data-payments-calc]').trigger('click')
    await settle()
    await w.get('[data-payments-apply]').trigger('click')
    await settle()
    expect(w.findAll('[data-fact-row]').map((r) => r.attributes('data-fact-row'))).toEqual(['5060', '1010'])
    expect(amountOf('5060')).toMatch(/^84\s000$/)
    expect(amountOf('1010')).toMatch(/^8\s650$/)
    const payer = w.get('[data-fact-row="5060"] input[data-fact="payer"]').element as HTMLInputElement
    payer.value = '201140012345'
    payer.dispatchEvent(new Event('input'))
    await settle()
    expect(form.factPayments.map((p) => [p.taxModeCode, p.amount, p.payerTaxpayerId])).toEqual([['5060', 84000, '201140012345'], ['1010', 8650, null]])
    expect(amountOf('5060')).toMatch(/^84\s000$/)
  })
})
