import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive, ref } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import { useClassifiersStore } from '@/stores/classifiers'
import { confirmState } from '@/ui/confirm'
import type { Import40GoodsItemInput } from '@/types/api'
import { emptyDtForm, type DtFormState } from '../../dtPayload'
import { useDtGoods } from '../useDtGoods'
import { clearTariffCache } from '../useTariffOptions'
import { resetOkeiUnits } from '../editor/okei'
import type { GoodsPageContext, GoodsSaveState } from '../editor/types'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))
const refsApi = vi.hoisted(() => ({
  listClassifiers: vi.fn(async () => []),
  listOkeiUnits: vi.fn(async () => [{ id: '1', code: '796', name: 'шт', isActive: true }, { id: '2', code: '112', name: 'л', isActive: true }]),
}))
vi.mock('@/api/references', () => ({ referencesApi: refsApi }))
const tnved = vi.hoisted(() => ({
  node: vi.fn(),
  rates: vi.fn(),
  tariffOptions: vi.fn(),
  search: vi.fn(async () => ({ data: [] })),
  reference: vi.fn(async () => ({ data: null })),
}))
vi.mock('@/api/tnved', () => ({ tnvedApi: tnved }))
const trois = vi.hoisted(() => ({ check: vi.fn(async (names: string[]) => names.map((name) => ({ name, checked: true, matches: [] }))), search: vi.fn(async () => []) }))
vi.mock('@/api/trois', async (orig) => ({ ...(await orig<typeof import('@/api/trois')>()), troisApi: trois }))
vi.mock('@/api/kedenProcedureLists', async (orig) => ({ ...(await orig<typeof import('@/api/kedenProcedureLists')>()), kedenProcedureListsApi: { get: vi.fn(async () => ({})) } }))

import SectionGoods from '../SectionGoods.vue'

const item = (o: Partial<Import40GoodsItemInput> = {}): Import40GoodsItemInput => ({
  description: 'СУМКИ ДЛЯ НОУТБУКОВ', tnvedCode: '4202121900', tnvedDescription: 'ЧЕМОДАНЫ', countryOfOrigin: '156', quantity: 300,
  unit: 'шт', unitCode: '796', grossWeightKg: 54, netWeightKg: 49.5, packagesCount: 3, cargoPlacesQuantity: 3, quantityTypeCode: null,
  customsValue: 900, currency: 'USD', customsValueKzt: 453980, statisticValueUsd: 916.92, valuationMethodCode: '1',
  payments: [{ taxModeCode: '2010', amountKzt: 1000 } as never], needsTpinRecalc: false, markings: [], extras: null,
  tradeMarkName: 'SAMSONITE', ...o,
})
const tariff = (o: Record<string, unknown> = {}) => ({ countryRate: null, excise: [], antiDumping: [], dutyRates: ['6.5%'], ...o })

let w: VueWrapper
let router: Router
let pinia: ReturnType<typeof createPinia>
let form: DtFormState
let model: ReturnType<typeof useDtGoods>
const canEdit = ref(true)
const page = ref<GoodsPageContext>({ usdRate: 495.12, onDate: '2026-10-09', currencyOptions: [{ value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' }], direction: 'ИМ', declProcedure: '40', containerIndicator: false })
const save = ref<GoodsSaveState>({ saving: false, dirty: false, failed: false, savedAt: null })

const settle = async () => {
  for (let i = 0; i < 4; i++) {
    await flushPromises()
    await nextTick()
  }
}
const mount = async (goods: Import40GoodsItemInput[], o: { readonly?: boolean; query?: string; currency?: string } = {}) => {
  form = reactive({ ...emptyDtForm(), currency: o.currency ?? 'USD', goodsItems: goods }) as DtFormState
  canEdit.value = !o.readonly
  model = useDtGoods(form, { readiness: () => null, canEdit })
  const Page = defineComponent({
    setup: () => () => h(SectionGoods, {
      model,
      currency: form.currency || null,
      readonly: !!o.readonly,
      countryOptions: [{ value: '156', label: '156 — Китай', alpha2: 'CN' }, { value: '458', label: '458 — Малайзия', alpha2: 'MY' }],
      editorContext: page.value,
      saveState: save.value,
    }),
  })
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/import-40/:caseId/dt/:dtId', name: 'import-40-dt', component: Page }] })
  await router.push(`/import-40/c1/dt/d1?s=goods${o.query ?? ''}`)
  await router.isReady()
  w = mountWithI18n(defineComponent({ render: () => h(RouterView) }), { attachTo: document.body, global: { plugins: [pinia, router] } })
  await settle()
}
const panel = () => document.querySelector('[data-dt-goods-editor][data-state="open"]') as HTMLElement | null
const q = <T extends Element = HTMLElement>(sel: string) => panel()?.querySelector<T>(sel) ?? null
const field = (f: string) => q<HTMLInputElement>(`input[data-f="${f}"]`)!
const type = async (f: string, value: string) => {
  const el = field(f)
  el.focus()
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
}
const click = async (sel: string) => {
  q<HTMLElement>(sel)!.click()
  await settle()
}
const key = async (target: Element, o: KeyboardEventInit) => {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...o }))
  await settle()
}
const itemQuery = () => router.currentRoute.value.query.item

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  useClassifiersStore().cache = {}
  clearTariffCache()
  resetOkeiUnits()
  tnved.node.mockReset().mockImplementation(async (code: string) => ({ data: { code, name: `УЗЕЛ ${code}`, is10: code.length === 10 } }))
  tnved.rates.mockReset().mockResolvedValue({ data: { unitCode: '796', unitName: 'шт' } })
  tnved.tariffOptions.mockReset().mockResolvedValue({ data: tariff() })
  page.value = { ...page.value, usdRate: 495.12, onDate: '2026-10-09' }
  save.value = { saving: false, dirty: false, failed: false, savedAt: null }
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('GoodsEditor: каркас и навигация', () => {
  it('шапка «Товар N из M», код с пробелами и описание, статус, вкладки секций; поля с data-graph внутри data-goods-index', async () => {
    await mount([item(), item({ description: 'МЫШИ', tnvedCode: '8471607000', needsTpinRecalc: true }), item()], { query: '&item=2' })
    expect(q('[data-goods-editor-title]')!.textContent).toBe('Товар 2 из 3')
    expect(q('[data-goods-editor-code]')!.textContent).toBe('8471 60 700 0')
    expect(q('[data-goods-editor-caption]')!.textContent).toBe('МЫШИ')
    expect(q('[data-goods-editor-status]')!.getAttribute('data-goods-editor-status')).toBe('stale')
    expect([...panel()!.querySelectorAll('[data-goods-tab]')].map((b) => b.textContent)).toEqual(['Код и описание', 'Количество и стоимость', 'Упаковка', 'Льготы и процедура'])
    const scope = q('[data-goods-index="1"]')!
    for (const g of ['33', '31', '41', '35', '38', '42', '34', '45', '46']) expect(scope.querySelector(`[data-graph="${g}"]`), g).not.toBeNull()
    // Смонтирован только открытый товар.
    expect(document.querySelectorAll('[data-goods-section="code"]')).toHaveLength(1)
  })

  it('↑/↓ в шапке и Alt+↑/↓ — соседний товар; в поле ввода Alt+↓ не перехватывается; на краях кнопки недоступны', async () => {
    await mount([item({ description: 'A' }), item({ description: 'B' }), item({ description: 'C' })], { query: '&item=1' })
    expect(q<HTMLButtonElement>('[data-goods-prev]')!.disabled).toBe(true)
    await click('[data-goods-next]')
    expect(itemQuery()).toBe('2')
    expect(q('[data-goods-editor-caption]')!.textContent).toBe('B')
    await key(q('[data-goods-next]')!, { key: 'ArrowDown', altKey: true })
    expect(itemQuery()).toBe('3')
    expect(q<HTMLButtonElement>('[data-goods-next]')!.disabled).toBe(true)
    await key(field('quantity'), { key: 'ArrowUp', altKey: true })
    expect(itemQuery()).toBe('3')
    await key(q('[data-goods-prev]')!, { key: 'ArrowUp', altKey: true })
    expect(itemQuery()).toBe('2')
  })

  it('Ctrl+Enter (и из поля) — следующий товар, фокус на его код; на последнем — ничего', async () => {
    await mount([item({ description: 'A' }), item({ description: 'B', tnvedCode: '8471607000' })], { query: '&item=1' })
    await key(field('quantity'), { key: 'Enter', ctrlKey: true })
    expect(itemQuery()).toBe('2')
    expect(document.activeElement).toBe(field('tnvedCode'))
    expect(field('tnvedCode').value).toBe('8471607000')
    await key(field('tnvedCode'), { key: 'Enter', metaKey: true })
    expect(itemQuery()).toBe('2')
  })

  it('Esc и крестик закрывают; фокус возвращается на кнопку кода строки этого товара', async () => {
    await mount([item({ description: 'A' }), item({ description: 'B' })], { query: '&item=2' })
    await key(field('quantity'), { key: 'Escape' })
    expect(itemQuery()).toBeUndefined()
    await new Promise((r) => setTimeout(r, 0))
    await settle()
    expect(panel()).toBeNull()
    expect(document.activeElement?.closest('[data-goods-row]')?.getAttribute('data-goods-row')).toBe('1')
    expect(document.activeElement?.hasAttribute('data-goods-open')).toBe(true)
    await router.replace({ query: { s: 'goods', item: '1' } })
    await settle()
    await click('[data-goods-close]')
    expect(itemQuery()).toBeUndefined()
  })

  it('«Дублировать» — копия сразу после товара и открыта; «Ещё» → «Ниже» переставляет, номер в адресе следует', async () => {
    await mount([item({ description: 'A' }), item({ description: 'B' })], { query: '&item=1' })
    await click('[data-goods-duplicate]')
    expect(form.goodsItems.map((g) => g.description)).toEqual(['A', 'A', 'B'])
    expect(itemQuery()).toBe('2')
    expect(form.goodsItems[1]).not.toBe(form.goodsItems[0])
    model.move(1, 2)
    await settle()
    expect(itemQuery()).toBe('3')
  })

  it('подвал: состояние сохранения ДТ и подсказка клавиш', async () => {
    save.value = { saving: true, dirty: true, failed: false, savedAt: null }
    await mount([item()], { query: '&item=1' })
    expect(q('[data-goods-save-state]')!.textContent).toContain('Сохраняется…')
    expect(q('[data-goods-editor-keys]')!.textContent).toContain('следующий')
  })

  it('просмотр: поля недоступны, без «Дублировать» и «Ещё», «Только просмотр»', async () => {
    await mount([item()], { query: '&item=1', readonly: true })
    expect(field('quantity').disabled).toBe(true)
    expect(field('tnvedCode').disabled).toBe(true)
    expect(q('[data-goods-duplicate]')).toBeNull()
    expect(q('[data-goods-more]')).toBeNull()
    expect(q('[data-goods-find]')).toBeNull()
    expect(q<HTMLButtonElement>('[data-goods-medical]')?.closest('label')?.querySelector('button')?.disabled ?? true).toBe(true)
    expect(q('[data-goods-save-state]')!.textContent).toContain('Только просмотр')
  })
})

describe('GoodsEditor: «Код и описание»', () => {
  it('ввод кода (с пробелами) — без пробелов, товар «Пересчитать»; открытие товара ничего не помечает', async () => {
    await mount([item()], { query: '&item=1' })
    expect(form.goodsItems[0].needsTpinRecalc).toBe(false)
    await type('tnvedCode', '8471 30 000 0')
    expect(form.goodsItems[0].tnvedCode).toBe('8471300000')
    expect(form.goodsItems[0].needsTpinRecalc).toBe(true)
  })

  it('«Найти»: лист — описание ТН ВЭД и ДЕИ (только пустая); не лист — окно выбора', async () => {
    await mount([item({ tnvedCode: '8471300000', tnvedDescription: null, unit: null, unitCode: null })], { query: '&item=1' })
    await click('[data-goods-find]')
    expect(form.goodsItems[0].tnvedDescription).toBe('УЗЕЛ 8471300000')
    expect(form.goodsItems[0].unitCode).toBe('796')
    expect(field('unitCode').value).toBe('796 — шт')
    // ДЕИ уже есть — не трогается
    tnved.rates.mockResolvedValue({ data: { unitCode: '112', unitName: 'л' } })
    await click('[data-goods-find]')
    expect(form.goodsItems[0].unitCode).toBe('796')
    // не лист — справочник с этим кодом
    await type('tnvedCode', '847130')
    await click('[data-goods-find]')
    expect(document.querySelectorAll('[role="dialog"][data-state="open"]').length).toBe(2)
  })

  it('кода нет в справочнике — ошибка у поля (проверка при открытии товара, тихо)', async () => {
    tnved.node.mockRejectedValue(new Error('404'))
    await mount([item({ tnvedCode: '1902303000' })], { query: '&item=1' })
    expect(tnved.node).toHaveBeenCalledWith('1902303000', { silent: true })
    expect(q('[data-graph="33"]')!.textContent).toContain('Кода нет в справочнике ТН ВЭД')
  })

  it('описание и бланк — ЗАГЛАВНЫМИ; подсказка ТРОИС под маркой (пакетная проверка марок после открытия)', async () => {
    trois.check.mockImplementation(async (names: string[]) => names.map((name) => ({ name, checked: true, matches: [] })))
    await mount([item({ tradeMarkName: 'SONY' }), item({ tradeMarkName: 'LG' })])
    await new Promise((r) => setTimeout(r, 800))
    await settle()
    // Редактор ещё не открывали — марки не проверяются.
    expect(trois.check).not.toHaveBeenCalled()
    await router.replace({ query: { s: 'goods', item: '1' } })
    await settle()
    await new Promise((r) => setTimeout(r, 800))
    await settle()
    expect(trois.check).toHaveBeenCalledWith(['LG', 'SONY'])
    expect(q('[data-goods-trois]')!.textContent).toContain('В ТРОИС не найден')
    await type('description', 'сумки')
    expect(form.goodsItems[0].description).toBe('СУМКИ')
    await type('manufacturerName', 'acme')
    expect(form.goodsItems[0].manufacturerName).toBe('ACME')
  })
})

describe('GoodsEditor: «Количество и стоимость»', () => {
  it('числа пишутся сразу при вводе, с запятой; правка помечает «Пересчитать»; нетто > брутто — предупреждение', async () => {
    await mount([item()], { query: '&item=1' })
    await type('grossWeightKg', '40,5')
    expect(form.goodsItems[0].grossWeightKg).toBe(40.5)
    expect(form.goodsItems[0].needsTpinRecalc).toBe(true)
    expect(q('[data-graph="38"]')!.textContent).toContain('Нетто больше брутто')
  })

  it('места — одно поле: packagesCount и cargoPlacesQuantity вместе, без «Пересчитать»', async () => {
    await mount([item()], { query: '&item=1' })
    await type('packagesCount', '7')
    expect(form.goodsItems[0].packagesCount).toBe(7)
    expect(form.goodsItems[0].cargoPlacesQuantity).toBe(7)
    expect(form.goodsItems[0].needsTpinRecalc).toBe(false)
  })

  it('валюта = гр. 22 — заблокирована; без гр. 22 — выбор', async () => {
    await mount([item()], { query: '&item=1' })
    expect(q('[data-goods-currency-locked]')).not.toBeNull()
    expect(field('currency').value).toBe('USD')
    w.unmount()
    document.body.innerHTML = ''
    await mount([item({ currency: 'EUR' })], { query: '&item=1', currency: '' })
    expect(q('[data-goods-currency-locked]')).toBeNull()
    expect(field('currency').getAttribute('role')).toBe('combobox')
  })

  it('гр. 45 → гр. 46 = гр. 45 / курс USD (0,01), «авто»; ручная гр. 46 живёт до следующей правки гр. 45', async () => {
    await mount([item({ customsValueKzt: null, statisticValueUsd: null })], { query: '&item=1' })
    await type('customsValueKzt', '495120')
    expect(form.goodsItems[0].customsValueKzt).toBe(495120)
    expect(form.goodsItems[0].statisticValueUsd).toBe(1000)
    expect(form.goodsItems[0].needsTpinRecalc).toBe(true)
    expect(q('[data-goods-auto="46"]')).not.toBeNull()
    await type('statisticValueUsd', '999')
    expect(form.goodsItems[0].statisticValueUsd).toBe(999)
    expect(q('[data-goods-auto="46"]')).toBeNull()
    await type('customsValueKzt', '990240')
    expect(form.goodsItems[0].statisticValueUsd).toBe(2000)
  })
})

describe('GoodsEditor: подсказка ставок', () => {
  it('на дату гр. А, тихо; только для открытого товара; кэш по (код, страна, дата) при переключении товаров', async () => {
    await mount([item(), item(), item({ tnvedCode: '8471300000' })])
    expect(tnved.tariffOptions).not.toHaveBeenCalled()
    await router.replace({ query: { s: 'goods', item: '1' } })
    await settle()
    expect(tnved.tariffOptions).toHaveBeenCalledTimes(1)
    expect(tnved.tariffOptions).toHaveBeenCalledWith('4202121900', '156', '2026-10-09', { silent: true })
    expect(q('[data-goods-tariff-date]')!.textContent).toBe('на дату гр. А 09.10.2026')
    expect(q('[data-goods-tariff-summary]')!.textContent).toBe('Пошлина ЕТТ 6.5% · НДС 16% · антидемпинга нет')
    await click('[data-goods-next]')
    expect(tnved.tariffOptions).toHaveBeenCalledTimes(1)
    await click('[data-goods-next]')
    expect(tnved.tariffOptions).toHaveBeenCalledTimes(2)
    await click('[data-goods-prev]')
    await click('[data-goods-prev]')
    expect(tnved.tariffOptions).toHaveBeenCalledTimes(2)
  })

  it('сбой — текст в подсказке с «Повторить», без тоста', async () => {
    tnved.tariffOptions.mockRejectedValueOnce(new Error('500'))
    await mount([item()], { query: '&item=1' })
    expect(q('[data-goods-tariff-failed]')).not.toBeNull()
    expect(toast.error).not.toHaveBeenCalled()
    await click('[data-goods-tariff-retry]')
    expect(q('[data-goods-tariff-summary]')).not.toBeNull()
  })

  it('вид акциза (несколько — первый по умолчанию), антидемпинг по умолчанию «не начислять», количество в единице ставки', async () => {
    tnved.tariffOptions.mockResolvedValue({ data: tariff({
      dutyRates: ['10%'],
      excise: [{ key: 'e1', rate: '100 KZT за 1 Л', condition: 'пиво', country: null, endDate: null }, { key: 'e2', rate: '5%', condition: 'прочее', country: null, endDate: null }],
      antiDumping: [{ key: 'ad1', rate: '20%', condition: 'производитель X', country: 'КИТАЙ', endDate: '2027-01-01' }],
    }) })
    await mount([item({ unitCode: '796' })], { query: '&item=1' })
    const excise = q('[data-goods-excise]')!
    expect(excise.textContent).toContain('не выбран — считается первый')
    expect((excise.querySelector('[role="radio"][data-state="checked"]') as HTMLElement).closest('label')!.textContent).toContain('пиво')
    // первый вид акциза — за литр, ДЕИ — штуки: нужно количество в литрах
    expect(q('[data-goods-tax-qty="taxVolumeL"]')).not.toBeNull()
    const ad = q('[data-goods-antidumping]')!
    expect((ad.querySelector('[role="radio"][data-state="checked"]') as HTMLElement).closest('label')!.textContent).toBe('Не начислять')
    ;(ad.querySelectorAll('[role="radio"]')[1] as HTMLElement).click()
    await settle()
    expect(form.goodsItems[0].antiDumpingKind).toBe('ad1')
    expect(form.goodsItems[0].needsTpinRecalc).toBe(true)
    ;(excise.querySelectorAll('[role="radio"]')[1] as HTMLElement).click()
    await settle()
    expect(form.goodsItems[0].exciseKind).toBe('e2')
    expect(q('[data-goods-tax-qty="taxVolumeL"]')).toBeNull()
  })

  it('«Медизделие — НДС 5%» — свойство товара: vatRatePreferential 0,05 и «Пересчитать»', async () => {
    await mount([item()], { query: '&item=1' })
    q<HTMLElement>('[data-goods-medical] button, button[data-goods-medical], [data-goods-medical][role="switch"]')!.click()
    await settle()
    expect(form.goodsItems[0].vatRatePreferential).toBe(0.05)
    expect(form.goodsItems[0].needsTpinRecalc).toBe(true)
    expect(q('[data-goods-tariff-summary]')!.textContent).toContain('НДС 5%')
  })
})

describe('GoodsEditor: 200 товаров', () => {
  it('открытие и переключение товара — в бюджете; смонтирован один редактор', async () => {
    const many = Array.from({ length: 200 }, (_, i) => item({ description: `ТОВАР ${i + 1}`, tnvedCode: `84713${String(i).padStart(5, '0')}` }))
    await mount(many)
    const t0 = performance.now()
    await router.replace({ query: { s: 'goods', item: '100' } })
    await settle()
    const openMs = performance.now() - t0
    expect(q('[data-goods-editor-title]')!.textContent).toBe('Товар 100 из 200')
    const t1 = performance.now()
    await click('[data-goods-next]')
    const switchMs = performance.now() - t1
    expect(q('[data-goods-editor-title]')!.textContent).toBe('Товар 101 из 200')
    expect(document.querySelectorAll('[data-goods-section="qty"]')).toHaveLength(1)
    console.info(`[perf 200 editor] open ${openMs.toFixed(0)} ms, switch ${switchMs.toFixed(0)} ms`)
    expect(openMs).toBeLessThan(1500)
    expect(switchMs).toBeLessThan(1500)
  }, 30_000)
})
