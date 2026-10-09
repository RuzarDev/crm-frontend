import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive, ref } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import { useClassifiersStore } from '@/stores/classifiers'
import type { ClassifierItem, Import40GoodsItemInput, Import40GoodsPayment } from '@/types/api'
import { emptyDtForm, formToPayload, type DtFormState } from '../../dtPayload'
import { applyGoodsPaymentRows } from '../../useDtPayments'
import { useDtGoods } from '../useDtGoods'
import { clearTariffCache } from '../useTariffOptions'
import { resetOkeiUnits } from '../editor/okei'
import { resetKedenLists } from '../useKedenLists'
import { resetGr33Suggest } from '../useGr33Suggest'
import { emptyPayment, paymentsTotal, setPaymentField, sortPayments, taxModeLabelKey } from '../editor/payments'
import type { GoodsPageContext } from '../editor/types'
import { resetDtTnvedCheckCache } from '../tnvedCodeCheck'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))
vi.mock('@/api/references', () => ({ referencesApi: {
  listClassifiers: vi.fn(async () => []),
  listOkeiUnits: vi.fn(async () => []),
  listCountries: vi.fn(async () => []),
} }))
vi.mock('@/api/tnved', () => ({ tnvedApi: {
  node: vi.fn(async (code: string) => ({ data: { code, name: code, is10: true } })),
  rates: vi.fn(async () => ({ data: {} })),
  tariffOptions: vi.fn(async () => ({ data: { countryRate: null, excise: [], antiDumping: [], dutyRates: [] } })),
  search: vi.fn(async () => ({ data: [] })),
  reference: vi.fn(async () => ({ data: null })),
} }))
vi.mock('@/api/trois', async (orig) => ({ ...(await orig<typeof import('@/api/trois')>()), troisApi: { check: vi.fn(async () => []), search: vi.fn(async () => []) } }))
vi.mock('@/api/kedenProcedureLists', async (orig) => ({ ...(await orig<typeof import('@/api/kedenProcedureLists')>()), kedenProcedureListsApi: { get: vi.fn(async () => ({})) } }))
vi.mock('@/api/prohibitionCodes', () => ({ prohibitionCodesApi: { list: vi.fn(async () => []), suggest: vi.fn(async () => null) } }))

import SectionGoods from '../SectionGoods.vue'

const cls = (classifierCode: string, ...codes: [string, string][]): ClassifierItem[] =>
  codes.map(([code, nameRu], i) => ({ id: `${classifierCode}-${code}`, classifierCode, code, nameRu, sortOrder: i, isActive: true }))
const CLASSIFIERS: Record<string, ClassifierItem[]> = {
  'tax-modes': cls('tax-modes', ['1010', 'Таможенные сборы'], ['2010', 'Ввозная пошлина'], ['5060', 'НДС'], ['6010', 'Особый вид']),
  'rate-kinds': cls('rate-kinds', ['%', 'Адвалорная'], ['*', 'Специфическая']),
}

const pay = (o: Partial<Import40GoodsPayment>): Import40GoodsPayment => ({ ...emptyPayment(), rateKindCode: null, paymentFeatureCode: null, ...o })
const item = (o: Partial<Import40GoodsItemInput> = {}): Import40GoodsItemInput => ({
  description: 'СУМКИ', tnvedCode: '4202121900', countryOfOrigin: '156', quantity: 300, unit: 'шт', unitCode: '796',
  grossWeightKg: 54, netWeightKg: 49.5, packagesCount: 3, cargoPlacesQuantity: 3, customsValue: 900, currency: 'USD',
  customsValueKzt: 453980, statisticValueUsd: 916.92, valuationMethodCode: '1', procedureCode: null,
  payments: [], needsTpinRecalc: false, markings: [], extras: null, ...o,
})
const PAYMENTS = (): Import40GoodsPayment[] => [
  pay({ taxModeCode: '5060', taxBase: 480000, rateKindCode: '%', rateValue: 16, amountKzt: 76800, paymentFeatureCode: 'ИУ', rateLabel: '16%', basisLabel: '480 000,00 ₸' }),
  pay({ taxModeCode: '4420', amountKzt: 300, paymentFeatureCode: 'ИУ' }),
  pay({ taxModeCode: '2050', amountKzt: 2000.5, paymentFeatureCode: 'ИУ' }),
  pay({ taxModeCode: '2010', taxBase: 453980, rateKindCode: '%', rateValue: 6.5, amountKzt: 29508.7, paymentFeatureCode: 'ИУ', rateDate: '2026-10-09' }),
  pay({ taxModeCode: '1010', amountKzt: 6000, paymentFeatureCode: 'ИУ', rateLabel: 'фикс.' }),
]

let w: VueWrapper
let pinia: ReturnType<typeof createPinia>
let form: DtFormState
let model: ReturnType<typeof useDtGoods>
const canEdit = ref(true)
const page: GoodsPageContext = { usdRate: 495, onDate: '2026-10-09', currencyOptions: [], direction: 'ИМ', declProcedure: '40', containerIndicator: false }

const settle = async () => {
  for (let i = 0; i < 4; i++) {
    await flushPromises()
    await nextTick()
  }
}
const mount = async (goods: Import40GoodsItemInput[], o: { readonly?: boolean } = {}) => {
  form = reactive({ ...emptyDtForm(), currency: 'USD', goodsItems: goods }) as DtFormState
  canEdit.value = !o.readonly
  model = useDtGoods(form, { readiness: () => null, canEdit })
  const Page = defineComponent({
    setup: () => () => h(SectionGoods, { model, currency: 'USD', readonly: !!o.readonly, countryOptions: [], editorContext: page, saveState: null }),
  })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/import-40/:caseId/dt/:dtId', name: 'import-40-dt', component: Page }] })
  await router.push('/import-40/c1/dt/d1?s=goods&item=1')
  await router.isReady()
  w = mountWithI18n(defineComponent({ render: () => h(RouterView) }), { attachTo: document.body, global: { plugins: [pinia, router] } })
  await settle()
}
const section = () => document.querySelector('[data-dt-goods-editor][data-state="open"] [data-goods-payments-section]') as HTMLElement
const q = <T extends Element = HTMLElement>(sel: string) => section().querySelector<T>(sel)
const qa = <T extends Element = HTMLElement>(sel: string) => [...section().querySelectorAll<T>(sel)]
const rowEls = () => qa('[data-payment-row]')
// Текст ячейки без подписи для узкой ширины (@xl:hidden).
const cell = (row: HTMLElement, key: string) =>
  [...row.querySelector(`[data-payment-cell="${key}"]`)!.children]
    .filter((c) => !c.classList.contains('@xl:hidden'))
    .map((c) => c.textContent!.replace(/\s+/g, ' ').trim())
    .join(' ')
const rowOf = (code: string) => rowEls().find((r) => r.dataset.paymentRow === code)!
const typeIn = async (root: HTMLElement, f: string, value: string) => {
  const el = root.querySelector<HTMLInputElement>(`input[data-f="${f}"]`)!
  el.focus()
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
}
const pickIn = async (root: HTMLElement, f: string, code: string) => {
  root.querySelector<HTMLInputElement>(`input[data-f="${f}"]`)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  await settle()
  const opt = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.trim().startsWith(`${code} `))
  expect(opt, `option ${code}`).toBeTruthy()
  opt!.click()
  await settle()
}
const click = async (sel: string) => {
  q<HTMLButtonElement>(sel)!.click()
  await settle()
}
const g0 = () => model.items.value[0]

beforeEach(() => {
  resetDtTnvedCheckCache()
  pinia = createPinia()
  setActivePinia(pinia)
  useClassifiersStore().cache = { ...CLASSIFIERS }
  clearTariffCache()
  resetOkeiUnits()
  resetKedenLists()
  resetGr33Suggest()
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('payments.ts', () => {
  it('порядок 1010 → 2010 → 5060 → прочие (устойчиво, те же объекты); подписи по коду, 2050 и любой 4xxx', () => {
    const list = PAYMENTS()
    const sorted = sortPayments(list)
    expect(sorted.map((p) => p.taxModeCode)).toEqual(['1010', '2010', '5060', '4420', '2050'])
    expect(sorted[0]).toBe(list[4])
    expect(sortPayments(null)).toEqual([])
    expect(['1010', '2010', '2050', '5060', '4420', '4010', '6010', '', null].map(taxModeLabelKey))
      .toEqual(['1010', '2010', '2050', '5060', 'excise', 'excise', null, null, null])
    expect(emptyPayment()).toMatchObject({ rateKindCode: '%', paymentFeatureCode: 'ИУ', amountKzt: null })
    expect(paymentsTotal([pay({ amountKzt: 1.5 }), pay({ amountKzt: null }), pay({ amountKzt: 2 })])).toBe(3.5)
    expect(paymentsTotal([pay({})])).toBeNull()
  })

  it('setPaymentField: ручная правка снимает устаревшие подписи расчёта (основа / ставка / вид — всё)', () => {
    const labelled = () => pay({ taxModeCode: '2010', taxBase: 100, rateValue: 10, rateKindCode: '%', basisLabel: '100 ₸', rateLabel: '10%', bLine: '2010-10' })
    let p = labelled()
    expect(setPaymentField(p, 'taxBase', 100)).toBe(false) // то же значение — подписи остаются
    expect(p.basisLabel).toBe('100 ₸')
    setPaymentField(p, 'taxBase', 200)
    expect(p).toMatchObject({ taxBase: 200, basisLabel: null, rateLabel: '10%', bLine: '2010-10' })
    for (const [k, v] of [['rateValue', 5], ['rateKindCode', '*'], ['rateUnitCode', '166'], ['rateCurrencyCode', '978'], ['weightRatio', 2]] as const) {
      p = labelled()
      setPaymentField(p, k, v as never)
      expect(p, k).toMatchObject({ rateLabel: null, basisLabel: '100 ₸', bLine: '2010-10' })
    }
    p = labelled()
    setPaymentField(p, 'taxModeCode', '5060')
    expect(p).toMatchObject({ taxModeCode: '5060', basisLabel: null, rateLabel: null, bLine: null })
    p = labelled()
    setPaymentField(p, 'amountKzt', 1)
    setPaymentField(p, 'rateDate', '2026-10-10')
    expect(p).toMatchObject({ basisLabel: '100 ₸', rateLabel: '10%', bLine: '2010-10' })
  })
})

describe('Редактор товара: «Платежи» (гр. 47 этого товара)', () => {
  it('вкладка «Платежи» последней; по умолчанию только чтение: порядок, подписи, основа/ставка из расчёта, суммы в ₸, СП', async () => {
    await mount([item({ payments: PAYMENTS() })])
    const editor = document.querySelector('[data-dt-goods-editor][data-state="open"]')!
    const tabs = [...editor.querySelectorAll('[data-goods-tab]')].map((b) => b.textContent)
    expect(tabs.at(-1)).toBe('Платежи')
    expect(q('[data-payments-hint]')!.textContent).toContain('Рассчитываются сервером')
    // Поле с ключами перехода «До подачи».
    const host = q('[data-goods-field="payments"]')!
    expect(host.dataset.graph).toBe('47')
    expect(host.dataset.goodsIndex).toBe('0')
    // Ни одного поля ввода в режиме чтения.
    expect(qa('input')).toHaveLength(0)

    expect(rowEls().map((r) => r.dataset.paymentRow)).toEqual(['1010', '2010', '5060', '4420', '2050'])
    expect(cell(rowOf('1010'), 'mode')).toBe('1010 Таможенный сбор')
    expect(cell(rowOf('2050'), 'mode')).toBe('2050 Антидемпинговая пошлина')
    expect(cell(rowOf('4420'), 'mode')).toBe('4420 Акциз')
    expect(cell(rowOf('5060'), 'base')).toContain('480 000,00 ₸') // basisLabel сервера
    expect(cell(rowOf('2010'), 'base')).toContain('453 980,00')
    expect(cell(rowOf('2010'), 'rate')).toBe('6,5%')
    expect(cell(rowOf('5060'), 'rate')).toContain('16%')
    expect(cell(rowOf('2010'), 'date')).toContain('09.10.2026')
    expect(cell(rowOf('2010'), 'amount')).toContain('29 508,70 ₸')
    expect(cell(rowOf('2050'), 'amount')).toContain('2 000,50 ₸')
    expect(cell(rowOf('2010'), 'feature')).toContain('ИУ')
    expect(q('[data-payments-total]')!.textContent!.replace(/\s+/g, ' ')).toContain('114 609,20 ₸')
    // Порядок в данных не меняется — сортируется только показ.
    expect(g0().payments!.map((p) => p.taxModeCode)).toEqual(['5060', '4420', '2050', '2010', '1010'])
  })

  it('прочий код — подпись из классификатора; нет строк — «Платежи не рассчитаны»; устарели — пометка', async () => {
    await mount([item({ payments: [pay({ taxModeCode: '6010', amountKzt: 1 })], needsTpinRecalc: true }), item()])
    expect(cell(rowOf('6010'), 'mode')).toBe('6010 Особый вид')
    expect(q('[data-payments-stale]')!.textContent).toContain('пересчитайте платежи')
    document.querySelector<HTMLButtonElement>('[data-dt-goods-editor][data-state="open"] [data-goods-next]')!.click()
    await settle()
    expect(q('[data-payments-empty]')!.textContent).toContain('Платежи не рассчитаны')
    expect(q('[data-payments-stale]')).toBeNull()
  })

  it('временный ввоз: тег и ставка пошлины/НДС с множителем 3% × мес. (сумма — как пришла)', async () => {
    await mount([item({ tempImportMonths: 2, payments: [pay({ taxModeCode: '2010', rateLabel: '10%', amountKzt: 600 }), pay({ taxModeCode: '1010', rateLabel: 'фикс.', amountKzt: 6000 })] })])
    expect(q('[data-payments-temp]')!.textContent).toContain('3% × 2')
    expect(cell(rowOf('2010'), 'rate')).toContain('10% × 3% × 2 мес.')
    expect(cell(rowOf('1010'), 'rate')).toBe('фикс.')
  })

  it('«Править вручную»: правка суммы/вида ставки, «*» — единица/валюта/коэф., добавить/удалить строку; «Пересчитать» не ставится, PUT — как есть', async () => {
    await mount([item({ payments: PAYMENTS() })])
    await click('[data-payments-manual]')
    expect(q('[data-payments-hint]')!.textContent).toContain('Ручная правка')
    expect(q('[data-payments-table]')).toBeNull()

    await typeIn(rowOf('2010'), 'payment-amount', '30000,5')
    expect(g0().payments!.find((p) => p.taxModeCode === '2010')!.amountKzt).toBe(30000.5)

    expect(rowOf('2010').querySelector('[data-payment-specific]')).toBeNull()
    await pickIn(rowOf('2010'), 'payment-rate-kind', '*')
    const p2010 = g0().payments!.find((p) => p.taxModeCode === '2010')!
    expect(p2010.rateKindCode).toBe('*')
    await typeIn(rowOf('2010'), 'payment-unit', '166')
    await typeIn(rowOf('2010'), 'payment-currency', '978')
    await typeIn(rowOf('2010'), 'payment-ratio', '1,2')
    expect(p2010).toMatchObject({ rateUnitCode: '166', rateCurrencyCode: '978', weightRatio: 1.2 })
    // единица и валюта — не длиннее колонок БД (8): длиннее — PUT всей ДТ падал бы
    for (const f of ['payment-unit', 'payment-currency']) {
      expect(rowOf('2010').querySelector<HTMLInputElement>(`input[data-f="${f}"]`)!.maxLength).toBe(8)
    }

    rowOf('4420').querySelector<HTMLButtonElement>('[data-payment-remove]')!.click()
    await settle()
    expect(g0().payments!.map((p) => p.taxModeCode)).toEqual(['5060', '2050', '2010', '1010'])

    await click('[data-payment-add]')
    const added = g0().payments!.at(-1)!
    expect(added).toMatchObject({ taxModeCode: null, rateKindCode: '%', paymentFeatureCode: 'ИУ', amountKzt: null })
    await pickIn(rowEls().at(-1)!, 'payment-mode', '6010')
    expect(added.taxModeCode).toBe('6010')
    await typeIn(rowOf('6010'), 'payment-amount', '15')

    // Ручная правка сама «Пересчитать» не ставит.
    expect(g0().needsTpinRecalc).toBe(false)
    // В PUT строки уходят как есть (тот же маппинг, что у прежней карточки).
    const put = formToPayload(form, null).goodsItems[0].payments!
    expect(put.map((p) => [p.taxModeCode, p.amountKzt, p.rateKindCode])).toEqual([
      ['5060', 76800, '%'], ['2050', 2000.5, null], ['2010', 30000.5, '*'], ['1010', 6000, null], ['6010', 15, '%'],
    ])
    expect(put[2]).toMatchObject({ rateUnitCode: '166', rateCurrencyCode: '978', weightRatio: 1.2 })

    // Правка ставки и основы строки с подписями расчёта — после «Готово» видны новые числа, не старые подписи.
    await typeIn(rowOf('5060'), 'payment-rate', '12')
    await typeIn(rowOf('5060'), 'payment-base', '500000')
    const p5060 = g0().payments!.find((p) => p.taxModeCode === '5060')!
    expect(p5060).toMatchObject({ rateValue: 12, rateLabel: null, taxBase: 500000, basisLabel: null })

    await click('[data-payments-manual]')
    expect(q('[data-payments-table]')).not.toBeNull()
    expect(cell(rowOf('5060'), 'rate')).toBe('12%')
    expect(cell(rowOf('5060'), 'base')).toBe('500 000,00')
    expect(cell(rowOf('2010'), 'rate')).toBe('6,5 166 · 978 · × 1,2')

    // Следующий расчёт: вид ставки «*», выбранный вручную, не затирается, ручной некрасчётный 6010 остаётся.
    applyGoodsPaymentRows(form, { goodsRows: [{ index: 0, rows: [{ taxModeCode: '2010', base: 1, rate: 2, amount: 3 }] }] } as never)
    expect(g0().payments!.find((p) => p.taxModeCode === '2010')).toMatchObject({ rateKindCode: '*', amountKzt: 3, weightRatio: 1.2 })
    expect(g0().payments!.map((p) => p.taxModeCode)).toEqual(['2010', '6010'])
  })

  it('ставка без подписи расчёта — без округления до 0,00; коэффициент — по языку интерфейса', async () => {
    await mount([item({ payments: [pay({ taxModeCode: '2010', rateKindCode: '*', rateValue: 0.004, rateUnitCode: '166', rateCurrencyCode: '978', weightRatio: 1.25, amountKzt: 10 })] })])
    expect(cell(rowOf('2010'), 'rate')).toBe('0,004 166 · 978 · × 1,25')
  })

  it('просмотр: только чтение, без «Править вручную»', async () => {
    await mount([item({ payments: PAYMENTS() })], { readonly: true })
    expect(q('[data-payments-manual]')).toBeNull()
    expect(q('[data-payment-add]')).toBeNull()
    expect(qa('input')).toHaveLength(0)
    expect(rowEls()).toHaveLength(5)
  })
})
