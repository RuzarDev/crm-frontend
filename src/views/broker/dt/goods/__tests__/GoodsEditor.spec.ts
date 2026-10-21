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
import { writeCharsMode } from '../editor/charsMode'
import { resetTnvedDeiCache } from '../editor/tnvedDei'
import type { GoodsPageContext, GoodsSaveState } from '../editor/types'
import { resetDtTnvedCheckCache } from '../tnvedCodeCheck'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
// Подсказка СУР — своя спека (SurStatsHint.spec): здесь без сети.
vi.mock('@/api/sur', () => ({ surApi: { stats: () => Promise.resolve({ data: null }) } }))
vi.mock('@/ui/message', () => ({ message: toast }))
const refsApi = vi.hoisted(() => ({
  listClassifiers: vi.fn(async () => []),
  listOkeiUnits: vi.fn(async () => [{ id: '1', code: '796', name: 'Штука', shortName: 'ШТ', isActive: true }, { id: '2', code: '112', name: 'Литр', shortName: 'Л', isActive: true }]),
  listCountries: vi.fn(async () => []),
}))
vi.mock('@/api/prohibitionCodes', () => ({ prohibitionCodesApi: { list: vi.fn(async () => []), suggest: vi.fn(async () => ({ tnved: '', codes: [], fetchedAtUtc: null, stale: false, warning: null })) } }))
vi.mock('@/api/references', () => ({ referencesApi: refsApi }))
const tnved = vi.hoisted(() => ({
  node: vi.fn(),
  rates: vi.fn(),
  tariffOptions: vi.fn(),
  semantic: vi.fn(),
  classify: vi.fn(),
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
  characteristics: [{ tradeMarkName: 'SAMSONITE' }], ...o,
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
const mount = async (goods: Import40GoodsItemInput[], o: { readonly?: boolean; query?: string; currency?: string; mixins?: object[] } = {}) => {
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
  w = mountWithI18n(defineComponent({ render: () => h(RouterView) }), { attachTo: document.body, global: { plugins: [pinia, router], mixins: o.mixins ?? [] } })
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
  resetDtTnvedCheckCache()
  pinia = createPinia()
  setActivePinia(pinia)
  useClassifiersStore().cache = {}
  clearTariffCache()
  resetOkeiUnits()
  resetTnvedDeiCache()
  tnved.node.mockReset().mockImplementation(async (code: string) => ({ data: { code, name: `УЗЕЛ ${code}`, is10: code.length === 10 } }))
  tnved.rates.mockReset().mockResolvedValue({ data: { unitCode: '796', unitName: 'шт' } })
  tnved.tariffOptions.mockReset().mockResolvedValue({ data: tariff() })
  page.value = { ...page.value, usdRate: 495.12, onDate: '2026-10-09' }
  save.value = { saving: false, dirty: false, failed: false, savedAt: null }
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  localStorage.clear()
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
    expect([...panel()!.querySelectorAll('[data-goods-tab]')].map((b) => b.textContent)).toEqual(['Код и описание', 'Количество и стоимость', 'Упаковка', 'Льготы и процедура', 'Гр. 33', 'Маркировка', 'Доп. сведения', 'Платежи'])
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

  it('панель — под шапкой ДТ и следует за её высотой, пока открыта', async () => {
    let bottom = 96
    let onResize: (() => void) | null = null
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('min-width: 640px'), addEventListener() {}, removeEventListener() {} }))
    // Наблюдатели есть и у полей (ZTextarea auto-grow) — ловим только того, кто следит за шапкой ДТ.
    vi.stubGlobal('ResizeObserver', class {
      private watchesHeader = false
      constructor(private cb: () => void) {}
      observe(el: Element) { if (el.hasAttribute('data-dt-header')) { this.watchesHeader = true; onResize = this.cb } }
      disconnect() { if (this.watchesHeader) onResize = null }
    })
    const header = document.createElement('div')
    header.setAttribute('data-dt-header', '')
    header.getBoundingClientRect = () => ({ bottom } as DOMRect)
    document.body.appendChild(header)
    try {
      await mount([item()], { query: '&item=1' })
      expect(panel()!.style.top).toBe('96px')
      bottom = 140
      onResize!()
      await settle()
      expect(panel()!.style.top).toBe('140px')
      await click('[data-goods-close]')
      expect(onResize).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
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
    const medical = q<HTMLButtonElement>('[data-goods-medical]')
    expect(medical).not.toBeNull()
    expect(medical!.getAttribute('role')).toBe('switch')
    expect(medical!.disabled).toBe(true)
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

  it('«Найти»: лист — описание ТН ВЭД и ДЕИ кода («796 — ШТ»); не лист — окно выбора', async () => {
    await mount([item({ tnvedCode: '8471300000', tnvedDescription: null, unit: null, unitCode: null })], { query: '&item=1' })
    expect(form.goodsItems[0].needsTpinRecalc).toBe(false)
    await click('[data-goods-find]')
    expect(form.goodsItems[0].tnvedDescription).toBe('УЗЕЛ 8471300000')
    expect(form.goodsItems[0].unitCode).toBe('796')
    expect(field('unitCode').value).toBe('796 — ШТ')
    // ДЕИ влияет на платежи: подставлена по «Найти» — «Пересчитать»
    expect(form.goodsItems[0].needsTpinRecalc).toBe(true)
    // не лист — справочник с этим кодом
    await type('tnvedCode', '847130')
    await click('[data-goods-find]')
    expect(document.querySelectorAll('[role="dialog"][data-state="open"]').length).toBe(2)
  })

  it('гр. 41: ДЕИ по коду ТН ВЭД — код и кр. наименование ОКЕИ, «по ТН ВЭД»; нет ДЕИ — «нет доп. единицы»', async () => {
    tnved.rates.mockImplementation(async (code: string) => ({
      data: code === '2201900000' ? { unitCode: '112', unitName: 'ЛИТР', unitShortName: 'Л' } : { unitCode: null, unitName: null },
    }))
    await mount([item({ tnvedCode: '2201900000', unit: null, unitCode: null }), item({ tnvedCode: '9403105100', unit: 'шт', unitCode: '796' })], { query: '&item=1' })
    expect(field('unitCode').value).toBe('112 — Л')
    expect(q('[data-goods-field="unitCode"]')!.textContent).toContain('по ТН ВЭД')
    expect(field('unitCode').readOnly).toBe(true)
    // Открытие товара ничего не меняет — единицу ставит сервер при сохранении (или действие пользователя).
    expect(form.goodsItems[0].unitCode).toBeNull()
    expect(form.goodsItems[0].needsTpinRecalc).toBe(false)

    await click('[data-goods-next]')
    expect(field('unitCode').value).toBe('нет доп. единицы')
    expect(field('unitCode').getAttribute('data-dei')).toBe('none')
  })

  it('гр. 41: ввод другого кода — ДЕИ кода подставляется, у кода без ДЕИ — снимается («Пересчитать»)', async () => {
    tnved.rates.mockImplementation(async (code: string) => ({
      data: code === '2201900000' ? { unitCode: '112', unitName: 'ЛИТР', unitShortName: 'Л' } : { unitCode: null, unitName: null },
    }))
    await mount([item({ tnvedCode: '4202121900', unit: 'шт', unitCode: '796' })], { query: '&item=1' })
    await type('tnvedCode', '2201900000')
    field('tnvedCode').dispatchEvent(new FocusEvent('blur'))
    await new Promise((r) => setTimeout(r, 0))
    await settle()
    expect(form.goodsItems[0].unitCode).toBe('112')
    expect(form.goodsItems[0].unit).toBe('ЛИТР')
    expect(field('unitCode').value).toBe('112 — Л')
    expect(form.goodsItems[0].needsTpinRecalc).toBe(true)

    await type('tnvedCode', '9403105100')
    field('tnvedCode').dispatchEvent(new FocusEvent('blur'))
    await new Promise((r) => setTimeout(r, 0))
    await settle()
    expect(form.goodsItems[0].unitCode).toBeNull()
    expect(form.goodsItems[0].unit).toBeNull()
    expect(field('unitCode').value).toBe('нет доп. единицы')
  })

  it('(баг) гр. 41: уход из поля и «Найти» без смены кода не трогают единицу и не ставят «Пересчитать»', async () => {
    tnved.rates.mockResolvedValue({ data: { unitCode: null, unitName: null } })
    await mount([item({ tnvedCode: '9403105100', unit: 'шт', unitCode: '796' })], { query: '&item=1' })
    field('tnvedCode').focus()
    field('tnvedCode').dispatchEvent(new FocusEvent('blur'))
    await new Promise((r) => setTimeout(r, 0))
    await settle()
    await click('[data-goods-find]')
    expect(form.goodsItems[0].unitCode).toBe('796')
    expect(form.goodsItems[0].unit).toBe('шт')
    expect(form.goodsItems[0].needsTpinRecalc).toBe(false)
    // набрали тот же код заново — тоже не смена кода
    await type('tnvedCode', '9403 105 100')
    field('tnvedCode').dispatchEvent(new FocusEvent('blur'))
    await new Promise((r) => setTimeout(r, 0))
    await settle()
    expect(form.goodsItems[0].unitCode).toBe('796')
    expect(form.goodsItems[0].needsTpinRecalc).toBe(false)
  })

  it('(баг) гр. 41: просмотр (выпущенная ДТ) — сохранённая единица, а не нынешний ответ справочника', async () => {
    tnved.rates.mockResolvedValue({ data: { unitCode: null, unitName: null } })
    await mount([item({ tnvedCode: '9403105100', unit: 'шт', unitCode: '796' })], { query: '&item=1', readonly: true })
    expect(field('unitCode').value).toBe('796 — ШТ')
    expect(q('[data-goods-field="unitCode"]')!.textContent).not.toContain('по ТН ВЭД')
    expect(tnved.rates).not.toHaveBeenCalled()
  })

  it('(баг) гр. 41: код ОКЕИ без ведущих нулей («55») — трёхзначный «055 — М2»', async () => {
    refsApi.listOkeiUnits.mockResolvedValueOnce([{ id: '3', code: '055', name: 'Квадратный метр', shortName: 'М2', isActive: true }] as never)
    tnved.rates.mockImplementation(async (code: string) => ({
      data: code === '6907210000' ? { unitCode: '55', unitName: 'КВАДРАТНЫЙ МЕТР', unitShortName: 'М2' } : { unitCode: null, unitName: null },
    }))
    await mount([item({ tnvedCode: '4202121900', unit: 'КВАДРАТНЫЙ МЕТР', unitCode: '55' })], { query: '&item=1', readonly: true })
    expect(field('unitCode').value).toBe('055 — М2')
    w.unmount()
    document.body.innerHTML = ''
    await mount([item({ tnvedCode: '4202121900', unit: null, unitCode: null })], { query: '&item=1' })
    await type('tnvedCode', '6907210000')
    field('tnvedCode').dispatchEvent(new FocusEvent('blur'))
    await new Promise((r) => setTimeout(r, 0))
    await settle()
    expect(form.goodsItems[0].unitCode).toBe('055')
    expect(field('unitCode').value).toBe('055 — М2')
  })

  it('кода нет в справочнике — ошибка у поля (проверка при открытии товара, тихо)', async () => {
    tnved.node.mockRejectedValue(Object.assign(new Error('404'), { response: { status: 404 } }))
    await mount([item({ tnvedCode: '1902303000' })], { query: '&item=1' })
    expect(tnved.node).toHaveBeenCalledWith('1902303000', { silent: true })
    expect(q('[data-graph="33"]')!.textContent).toContain('Кода нет в справочнике ТН ВЭД')
  })

  it('описание и бланк — ЗАГЛАВНЫМИ; подсказка ТРОИС под маркой (пакетная проверка марок после открытия)', async () => {
    writeCharsMode('cards') // подсказка под полем марки — в карточке строки (таблица показывает только совпадения)
    trois.check.mockImplementation(async (names: string[]) => names.map((name) => ({ name, checked: true, matches: [] })))
    await mount([item({ characteristics: [{ tradeMarkName: 'SONY' }] }), item({ characteristics: [{ tradeMarkName: 'LG' }, { tradeMarkName: 'LG PRO' }] })])
    await new Promise((r) => setTimeout(r, 800))
    await settle()
    // Редактор ещё не открывали — марки не проверяются.
    expect(trois.check).not.toHaveBeenCalled()
    await router.replace({ query: { s: 'goods', item: '1' } })
    await settle()
    await new Promise((r) => setTimeout(r, 800))
    await settle()
    expect(trois.check).toHaveBeenCalledWith(['LG', 'LG PRO', 'SONY'])
    expect(q('[data-goods-trois]')!.textContent).toContain('В ТРОИС не найден')
    await type('description', 'сумки')
    expect(form.goodsItems[0].description).toBe('СУМКИ')
    await type('char-0-manufacturer', 'acme')
    expect(form.goodsItems[0].characteristics![0].manufacturerName).toBe('ACME')
  })
})

describe('GoodsEditor: пределы полей по структуре ДТ (сверка КЕДЕН 14.10, C3, I9)', () => {
  it('описание до 1000 со счётчиком и числом частей по 250; знак/марка/модель — 250, артикул — 50', async () => {
    await mount([item({ description: 'СУМКИ' })], { query: '&item=1' })
    const desc = q('[data-goods-field="description"]')!
    expect((desc.querySelector('input') as HTMLInputElement).maxLength).toBe(1000)
    expect(desc.textContent).toContain('5 из 1000 знаков')
    await type('description', 'а'.repeat(260))
    expect(q('[data-goods-field="description"]')!.textContent).toContain('260 из 1000 знаков — в КЕДЕН уйдёт 2 частями по 250')
    // Части считаются как на сервере — по пробелам и запятым, а не n / 250 (I-2): 494 знака словами — 3 части.
    await type('description', Array.from({ length: 55 }, (_, i) => `ДЕТАЛЬ${String(i).padStart(2, '0')}`).join(' '))
    expect(q('[data-goods-field="description"]')!.textContent).toContain('494 из 1000 знаков — в КЕДЕН уйдёт 3 частями по 250')
    await type('description', Array.from({ length: 5 }, (_, i) => String.fromCharCode(0x410 + i).repeat(180)).join(', '))
    expect(q('[data-goods-field="description"]')!.textContent).toContain('908 из 1000 знаков — делится на 5 частей по 250 (по запятым и пробелам), а КЕДЕН принимает до 4')
    // Строка характеристик гр. 31: знак/марка/модель/сорт — Name250, артикул — Id50, стандарт — 40.
    const max = (f: string) => field(`char-0-${f}`).maxLength
    expect(['tradeMark', 'mark', 'model', 'sort', 'article', 'standard'].map(max)).toEqual([250, 250, 250, 250, 50, 40])
  })
})

// №1 / №4 (пакет импорта 21.10.2026): гр. 41 — только при ДЕИ; «Тип количества» скрыт без ДЕИ.
describe('GoodsEditor: гр. 41 без ДЕИ', () => {
  beforeEach(() => {
    tnved.rates.mockImplementation(async (code: string) => ({
      data: code === '7323990000' ? { unitCode: null, unitName: null } : { unitCode: '796', unitName: 'Штука', unitShortName: 'ШТ' },
    }))
  })

  it('код без ДЕИ и количество в гр. 41 — предупреждение и «Перенести в гр. 31»; «Тип количества» скрыт', async () => {
    await mount([item({ tnvedCode: '7323990000', quantity: 470, unitCode: '796', characteristics: [{ productArticle: 'URS07' }] })], { query: '&item=1' })
    await click('[data-goods-tab="qty"]')
    expect(q('[data-goods-qty-no-dei]')!.textContent).toContain('У кода нет доп. единицы')
    expect(q('[data-goods-field="quantityTypeCode"]')).toBeNull()
    await click('[data-goods-qty-move-to-row]')
    const g = form.goodsItems[0]
    expect(g).toMatchObject({ quantity: null, unitCode: null, unit: null, needsTpinRecalc: true })
    expect(g.characteristics![0]).toMatchObject({ productArticle: 'URS07', quantity: 470, unitCode: '796' })
    expect(q('[data-goods-qty-no-dei]')).toBeNull()
  })

  it('строк гр. 31 несколько — без кнопки, «перенесите вручную»; с ДЕИ, гр. 41 пуста, строка в ДЕИ — «Взять из гр. 31»', async () => {
    await mount([
      item({ tnvedCode: '7323990000', quantity: 10, characteristics: [{ productArticle: 'A' }, { productArticle: 'B' }] }),
      item({ tnvedCode: '4202121900', quantity: null, characteristics: [{ quantity: 300, unitCode: '796', tradeMarkName: 'X' }] }),
    ], { query: '&item=1' })
    await click('[data-goods-tab="qty"]')
    expect(q('[data-goods-qty-no-dei]')!.textContent).toContain('перенесите количество в нужную строку вручную')
    expect(q('[data-goods-qty-move-to-row]')).toBeNull()
    await click('[data-goods-next]')
    await click('[data-goods-tab="qty"]')
    await click('[data-goods-qty-take-from-row]')
    expect(form.goodsItems[1]).toMatchObject({ quantity: 300, unitCode: '796' })
    expect(form.goodsItems[1].characteristics![0]).toMatchObject({ quantity: null, unitCode: null, tradeMarkName: 'X' })
    expect(q('[data-goods-field="quantityTypeCode"]')).not.toBeNull()
  })
})

// №9 / №2 (пакет импорта 21.10.2026): товар без кода — «Похожие коды»; у товарного знака — подсказка «ОТСУТСТВУЕТ».
describe('GoodsEditor: «Похожие коды», «ОТСУТСТВУЕТ» у знака', () => {
  it('без кода и с описанием — до 3 кодов смыслового поиска (без модели — по словам), «Выбрать» ставит код и описание ТН ВЭД', async () => {
    tnved.semantic.mockResolvedValue({ data: { available: false, model: null, tookMs: 0, matches: [] } })
    tnved.classify.mockResolvedValue({ data: { matches: [
      { code: '7308400000', description: 'ОБОРУДОВАНИЕ ДЛЯ ЛЕСОВ', probability: 0.8, rateStr: null, unitName: null },
    ], exactCodeInfo: null, suggestedGroup: null } })
    await mount([item({ tnvedCode: null, tnvedDescription: null, description: 'СТРОИТЕЛЬНЫЕ ЛЕСА' })], { query: '&item=1' })
    expect(tnved.classify).toHaveBeenCalledWith('СТРОИТЕЛЬНЫЕ ЛЕСА', 3, { silent: true })
    expect(q('[data-goods-similar-item]')!.textContent).toContain('7308400000')
    await click('[data-goods-similar-pick]')
    expect(form.goodsItems[0]).toMatchObject({ tnvedCode: '7308400000', tnvedDescription: 'ОБОРУДОВАНИЕ ДЛЯ ЛЕСОВ' })
    expect(q('[data-goods-similar]')).toBeNull()
  })

  it('товарный знак пуст — серая подсказка «ОТСУТСТВУЕТ», как у марки и модели', async () => {
    writeCharsMode('cards')
    await mount([item({ characteristics: [{ manufacturerName: 'YIWU' }] })], { query: '&item=1' })
    expect(field('char-0-tradeMark').placeholder).toBe('ОТСУТСТВУЕТ')
  })
})

describe('GoodsEditor: «Количество и стоимость»', () => {
  it('числа пишутся сразу при вводе, с запятой; правка помечает «Пересчитать»; нетто > брутто — предупреждение', async () => {
    await mount([item()], { query: '&item=1' })
    await type('grossWeightKg', '40,5')
    expect(form.goodsItems[0].grossWeightKg).toBe(40.5)
    expect(form.goodsItems[0].needsTpinRecalc).toBe(true)
    expect(q('[data-graph="38"]')!.textContent).toContain('Нетто больше брутто')
    // шапка (№14а): причина вместо «Не хватает 1»; исправили вес — статус сразу другой
    expect(q('[data-goods-editor-status]')!.getAttribute('data-goods-editor-status')).toBe('missing')
    expect(q('[data-goods-editor-status]')!.textContent).toContain('Нетто > брутто')
    await type('grossWeightKg', '60')
    expect(q('[data-goods-editor-status]')!.textContent).not.toContain('Нетто > брутто')
  })

  it('места — одно поле: packagesCount и cargoPlacesQuantity вместе, без «Пересчитать»', async () => {
    await mount([item()], { query: '&item=1' })
    await type('packagesCount', '7')
    expect(form.goodsItems[0].packagesCount).toBe(7)
    expect(form.goodsItems[0].cargoPlacesQuantity).toBe(7)
    // только целые
    await type('packagesCount', '2,6')
    expect(form.goodsItems[0].packagesCount).toBe(3)
    expect(form.goodsItems[0].cargoPlacesQuantity).toBe(3)
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

  it('гр. 45 → гр. 46 = гр. 45 / курс USD (0,01), «авто»; правка гр. 45/46 — «вручную» с расчётом и сбросом (16.10.2026)', async () => {
    await mount([item({ customsValueKzt: 450000, statisticValueUsd: null })], { query: '&item=1' })
    const g = () => form.goodsItems[0]
    await type('customsValueKzt', '495120')
    expect(g()).toMatchObject({ customsValueKzt: 495120, statisticValueUsd: 1000, needsTpinRecalc: true })
    // Ручная гр. 45: расчётной считается прежняя (450 000) — «расчёт: …» и «Сбросить к расчёту».
    expect(g()).toMatchObject({ customsValueKztManual: true, customsValueKztCalc: 450000 })
    expect(q('[data-manual-of="45"] [data-manual-badge]')!.textContent).toBe('вручную')
    expect(q('[data-manual-of="45"] [data-manual-calc]')!.textContent!.replace(/\s/g, ' ')).toBe('расчёт: 450 000,00 ₸')
    expect(q('[data-goods-auto="46"]')).not.toBeNull()
    expect(q('[data-manual-of="46"]')).toBeNull()
    await type('statisticValueUsd', '999')
    expect(g()).toMatchObject({ statisticValueUsd: 999, statisticValueUsdManual: true, statisticValueUsdCalc: 1000 })
    expect(q('[data-goods-auto="46"]')).toBeNull()
    // Ручная гр. 46 правкой гр. 45 не перезаписывается.
    await type('customsValueKzt', '990240')
    expect(g().statisticValueUsd).toBe(999)
    // Сброс гр. 46 — гр. 45 / курс USD; сброс гр. 45 — расчётная, гр. 46 за ней.
    ;(q('[data-manual-of="46"] [data-manual-reset]') as HTMLButtonElement).click()
    await settle()
    expect(g()).toMatchObject({ statisticValueUsd: 2000, statisticValueUsdManual: false, statisticValueUsdCalc: null })
    ;(q('[data-manual-of="45"] [data-manual-reset]') as HTMLButtonElement).click()
    await settle()
    expect(g()).toMatchObject({ customsValueKzt: 450000, customsValueKztManual: false, customsValueKztCalc: null, statisticValueUsd: 908.87 })
    expect(q('[data-manual-of="45"]')).toBeNull()
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
    // одна ставка — без подписи ЕТТ/ВТО (сервер их не различает)
    expect(q('[data-goods-tariff-summary]')!.textContent).toBe('Пошлина 6.5% · НДС 16% · антидемпинга нет')
    await click('[data-goods-next]')
    expect(tnved.tariffOptions).toHaveBeenCalledTimes(1)
    await click('[data-goods-next]')
    expect(tnved.tariffOptions).toHaveBeenCalledTimes(2)
    await click('[data-goods-prev]')
    await click('[data-goods-prev]')
    expect(tnved.tariffOptions).toHaveBeenCalledTimes(2)
  })

  it('две ставки пошлины — ЕТТ и ВТО (порядок сервера: ЕТТ, затем действующая ВТО)', async () => {
    tnved.tariffOptions.mockResolvedValue({ data: tariff({ dutyRates: ['10%', '5%'] }) })
    await mount([item()], { query: '&item=1' })
    expect(q('[data-goods-tariff-summary]')!.textContent).toBe('Пошлина ЕТТ 10% · ВТО 5% · НДС 16% · антидемпинга нет')
  })

  it('источник ставки ЕТТ на дату гр. А: «ЕЭК, ред. …, сноска … до …» и «в КЕДЕН: X» при расхождении', async () => {
    tnved.tariffOptions.mockResolvedValue({ data: tariff({ dutyRates: ['0%'], ettRate: {
      date: '2026-10-09', configuredSource: 'eec', effectiveSource: 'eec', effectiveRate: '0%', fallbackReason: null, kedenRate: '6.5%',
      kedenSourceName: null, kedenManualOverride: false, differs: true,
      eec: {
        rateText: '0', rate: '0%', kind: 'footnote', baseRateText: '5', baseRate: '5%', footnoteNumber: '109С', footnoteFrom: null,
        footnoteTo: '2028-12-31', footnoteDecision: null, group: '42', editionId: 7, editionDate: '2026-08-24', fileName: 'ru.42.pdf',
        inForce: true, notInForceSince: null, isCertain: true, pending: [],
      },
    } }) })
    await mount([item()], { query: '&item=1' })
    expect(q('[data-ett-source-main]')!.textContent).toBe('ЕЭК, ред. 24.08.2026, сноска 109С до 31.12.2028')
    expect(q('[data-ett-source-other]')!.textContent).toBe('в КЕДЕН: 6.5%')
    // пошлина ЕТТ — по ЕЭК: заголовок без «КЕДЕН»
    expect(q('[data-goods-tariff-title]')!.textContent).toBe('Ставки · Китай')
  })

  it('ставка по стране: перечень ЕЭК к соглашению (вне перечня 0 %, «ставка ЕТТ», пояснение, «проверьте») и строка КЕДЕН', async () => {
    tnved.tariffOptions.mockResolvedValue({ data: tariff({ countryRate: {
      rate: '0%', country: 'Вьетнам', source: 'Соглашение', kind: 'zero',
      note: 'Пошлина по Соглашению о свободной торговле с Вьетнамом: 0 % (товар вне перечня исключений)', uncertain: false,
    } }) })
    await mount([item()], { query: '&item=1' })
    const box = q('[data-goods-tariff-country]')!
    expect(box.getAttribute('data-goods-tariff-country-kind')).toBe('zero')
    expect(box.textContent).toContain('Страна происхождения Вьетнам: товар вне перечня исключений соглашения о свободной торговле — пошлина 0 %')
    expect(q('[data-goods-tariff-country-note]')!.textContent).toContain('вне перечня исключений')
    expect(q('[data-goods-tariff-country-uncertain]')).toBeNull()
  })

  it('ставка по стране: строка перечня зависит от наименования — предупреждение', async () => {
    tnved.tariffOptions.mockResolvedValue({ data: tariff({ countryRate: {
      rate: '2.5%', country: 'Иран', source: null, kind: 'listedRate', note: 'проверьте наименование', uncertain: true,
    } }) })
    await mount([item()], { query: '&item=1' })
    expect(q('[data-goods-tariff-country]')!.textContent).toContain('ставка по перечню соглашения о свободной торговле — 2.5%')
    expect(q('[data-goods-tariff-country-uncertain]')).not.toBeNull()
  })

  it('ставка по стране из КЕДЕН (без kind) — прежний текст', async () => {
    tnved.tariffOptions.mockResolvedValue({ data: tariff({ countryRate: { rate: '0%', country: 'ЕГИПЕТ', source: null } }) })
    await mount([item()], { query: '&item=1' })
    expect(q('[data-goods-tariff-country]')!.getAttribute('data-goods-tariff-country-kind')).toBe('keden')
    expect(q('[data-goods-tariff-country]')!.textContent).toContain('ставка по соглашению о свободной торговле — 0%')
    expect(q('[data-goods-tariff-country-note]')).toBeNull()
  })

  it('без ettRate (прежний ответ) — строки источника нет', async () => {
    await mount([item()], { query: '&item=1' })
    expect(q('[data-goods-tariff-summary]')).not.toBeNull()
    expect(q('[data-ett-source]')).toBeNull()
    expect(q('[data-goods-tariff-title]')!.textContent).toBe('Ставки КЕДЕН · Китай')
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

  // (баг) НДС 5% — по перечню ПП РК №1204, а не по префиксу группы 30/9018/9019/9021/9022.
  const medicalSwitch = () => q<HTMLElement>('[data-goods-medical]')!
  const clothes = ['предметы одежды, используемые в фармацевтической и медицинской деятельности', 'предметы одежды, используемые при производстве фармацевтической продукции и медицинских изделий']

  it('перечень №1204, часть товаров кода: товары перечня и «включите», 5% не ставится сам; включили — 5%, без призыва', async () => {
    tnved.tariffOptions.mockResolvedValue({ data: tariff({ reducedVat: { status: 'confirm', goods: clothes } }) })
    await mount([item({ tnvedCode: '6204420000', payments: [] })], { query: '&item=1' })
    const hint = q('[data-goods-vat-list="confirm"]')!
    expect(hint.textContent).toContain('Код в перечне ПП РК №1204 (НДС 5%) только для товаров:')
    expect([...hint.querySelectorAll('li')].map((li) => li.textContent)).toEqual(clothes)
    expect(hint.textContent).toContain('включите «Медизделие»')
    expect(medicalSwitch().getAttribute('aria-checked')).toBe('false')
    expect(q('[data-goods-tariff-summary]')!.textContent).toContain('НДС 16%')
    medicalSwitch().click()
    await settle()
    expect(form.goodsItems[0].vatRatePreferential).toBe(0.05)
    expect(q('[data-goods-tariff-summary]')!.textContent).toContain('НДС 5%')
    expect(q('[data-goods-vat-list="confirm"]')!.textContent).not.toContain('включите')
    expect(q('[data-goods-vat-list="missing"]')).toBeNull()
  })

  it('перечень №1204, вся позиция: НДС 5% до расчёта, «ставится сам», переключатель как раньше не включается', async () => {
    tnved.tariffOptions.mockResolvedValue({ data: tariff({ reducedVat: { status: 'auto', goods: ['фармацевтическая продукция'] } }) })
    await mount([item({ tnvedCode: '3004900002', payments: [] })], { query: '&item=1' })
    expect(q('[data-goods-tariff-summary]')!.textContent).toContain('НДС 5%')
    expect(q('[data-goods-vat-list="auto"]')!.textContent).toBe('НДС 5% по перечню ПП РК №1204 — ставится сам')
    expect(medicalSwitch().getAttribute('aria-checked')).toBe('false')
    expect(form.goodsItems[0].vatRatePreferential ?? null).toBeNull()
  })

  it('код не в перечне №1204: без «Медизделие» — ничего; включено вручную — остаётся, с предупреждением', async () => {
    tnved.tariffOptions.mockResolvedValue({ data: tariff({ reducedVat: { status: 'none', goods: [] } }) })
    await mount([item({ tnvedCode: '3004901000', vatRatePreferential: 0.05 }), item({ tnvedCode: '3004901000' })], { query: '&item=1' })
    expect(medicalSwitch().getAttribute('aria-checked')).toBe('true')
    expect(q('[data-goods-vat-list="missing"]')!.textContent).toContain('Код не входит в перечень ПП РК №1204')
    expect(q('[data-goods-tariff-summary]')!.textContent).toContain('НДС 5%')
    expect(form.goodsItems[0].vatRatePreferential).toBe(0.05)
    await click('[data-goods-next]')
    expect(q('[data-goods-vat-list]')).toBeNull()
  })

  it('перечень не загружен (нет reducedVat) — подсказок перечня нет', async () => {
    await mount([item({ vatRatePreferential: 0.05 })], { query: '&item=1' })
    expect(q('[data-goods-tariff-summary]')).not.toBeNull()
    expect(q('[data-goods-vat-list]')).toBeNull()
  })
})

describe('Коды ТН ВЭД всех товаров (без открытия)', () => {
  it('различные коды проверяются один раз; кода нет в справочнике — «Нет в справочнике» в строке, в «С ошибками» и в редакторе', async () => {
    tnved.node.mockImplementation(async (code: string) => {
      if (code === '1902303000') throw Object.assign(new Error('404'), { response: { status: 404 } })
      return { data: { code, name: 'УЗЕЛ', is10: true } }
    })
    await mount([item(), item({ tnvedCode: '1902303000', description: 'ЛАПША' }), item(), item({ tnvedCode: '1902303000' })])
    expect(tnved.node).toHaveBeenCalledTimes(2)
    expect(tnved.node).toHaveBeenCalledWith('1902303000', { silent: true })
    const statuses = [...document.querySelectorAll('[data-goods-row] [data-goods-status]')].map((el) => el.getAttribute('data-goods-status'))
    expect(statuses).toEqual(['ready', 'badCode', 'ready', 'badCode'])
    expect(document.querySelector('[data-goods-row="1"]')!.textContent).toContain('Нет в справочнике')
    expect(document.querySelector('[data-goods-row="1"] [data-goods-code]')!.className).toContain('text-danger')
    const chip = document.querySelector('[data-goods-filter="missing"]') as HTMLButtonElement
    expect(chip.textContent).toContain('С ошибками · 2')
    chip.click()
    await settle()
    expect(document.querySelectorAll('[data-goods-row]')).toHaveLength(2)
    await router.replace({ query: { s: 'goods', item: '2' } })
    await settle()
    expect(q('[data-goods-editor-status]')!.getAttribute('data-goods-editor-status')).toBe('badCode')
    expect(q('[data-graph="33"]')!.textContent).toContain('Кода нет в справочнике')
    // повторных запросов нет (кэш общий со списком)
    expect(tnved.node).toHaveBeenCalledTimes(2)
  })
})

describe('GoodsEditor: поля для перехода «к недостающему»', () => {
  it('у каждого поля — data-graph, data-goods-field и data-goods-index', async () => {
    tnved.tariffOptions.mockResolvedValue({ data: tariff({
      dutyRates: ['10 EUR за 1 Л'],
      excise: [{ key: 'e1', rate: '1%', condition: null, country: null, endDate: null }, { key: 'e2', rate: '2%', condition: null, country: null, endDate: null }],
      antiDumping: [{ key: 'ad1', rate: '20%', condition: null, country: 'КИТАЙ', endDate: null }],
    }) })
    await mount([item(), item()], { query: '&item=2' })
    // Секции этой задачи («Код и описание», «Количество и стоимость» с подсказкой ставок).
    const fields = [...panel()!.querySelectorAll<HTMLElement>('[data-goods-section="code"] [data-goods-field], [data-goods-section="qty"] [data-goods-field]')]
    const keys = fields.map((f) => f.dataset.goodsField)
    expect(keys).toEqual(expect.arrayContaining([
      'tnvedCode', 'description', 'characteristics',
      'quantity', 'unitCode', 'grossWeightKg', 'netWeightKg', 'packagesCount', 'customsValue', 'currency', 'countryOfOrigin',
      'customsValueKzt', 'statisticValueUsd', 'quantityTypeCode', 'exciseKind', 'antiDumpingKind', 'taxVolumeL', 'vatRatePreferential',
    ]))
    for (const f of fields) {
      expect(f.dataset.graph, f.dataset.goodsField).toBeTruthy()
      expect(f.dataset.goodsIndex, f.dataset.goodsField).toBe('1')
    }
    // места и описание — обе гр. 31, но поля разные
    expect(panel()!.querySelector('[data-goods-field="packagesCount"]')!.getAttribute('data-graph')).toBe('31')
  })
})

describe('GoodsEditor: 200 товаров', () => {
  // Бюджет плана — 150 мс в браузере (Chrome dev-сборка, 8 секций: ≈ 52–57 мс на открытие и переключение, замер 10.10).
  // jsdom вдвое-втрое медленнее и под параллельным прогоном `npm test` колеблется (одиночно ≈ 130/148 мс, под нагрузкой —
  // до 330+), поэтому здесь замер только логируется, а граница — защита от катастрофы (1 с), а не бюджет.
  const CATASTROPHIC_MS = 1000

  it('открытие и переключение товара: смонтирован один редактор; время — в логе (граница — от катастрофы)', async () => {
    const many = Array.from({ length: 200 }, (_, i) => item({ description: `ТОВАР ${i + 1}`, tnvedCode: `84713${String(i).padStart(5, '0')}` }))
    await mount(many)
    const opens: number[] = []
    const switches: number[] = []
    for (const n of [100, 150, 50, 120]) {
      let t = performance.now()
      await router.replace({ query: { s: 'goods', item: String(n) } })
      await settle()
      opens.push(performance.now() - t)
      expect(q('[data-goods-editor-title]')!.textContent).toBe(`Товар ${n} из 200`)
      t = performance.now()
      await click('[data-goods-next]')
      switches.push(performance.now() - t)
      expect(q('[data-goods-editor-title]')!.textContent).toBe(`Товар ${n + 1} из 200`)
      expect(document.querySelectorAll('[data-goods-section="qty"]')).toHaveLength(1)
      expect(document.querySelectorAll('[data-goods-section="payments"]')).toHaveLength(1)
      await click('[data-goods-close]')
    }
    console.info(`[perf 200 editor] open ${opens.map((x) => x.toFixed(0)).join('/')} ms, switch ${switches.map((x) => x.toFixed(0)).join('/')} ms`)
    expect(Math.min(...opens)).toBeLessThan(CATASTROPHIC_MS)
    expect(Math.min(...switches)).toBeLessThan(CATASTROPHIC_MS)
  }, 30_000)
})

describe('GoodsEditor: «Характеристики: N строк» в шапке (декларант не находил строки, 15.10)', () => {
  it('число непустых строк; нажатие — к таблице строк и фокус в первую ячейку; строк нет — «строк нет», фокус на «Добавить»', async () => {
    await mount([
      item({ characteristics: [{ name: 'А' }, { name: 'Б' }, {}] }),
      item({ characteristics: Array.from({ length: 21 }, (_, i) => ({ name: `Т${i}` })) }),
      item({ characteristics: [] }),
    ], { query: '&item=1' })
    const entry = () => q('[data-goods-chars-entry]')!
    expect(entry().textContent).toBe('Характеристики: 2 строки')
    expect(entry().getAttribute('title')).toContain('гр. 31')
    entry().click()
    await settle()
    expect(q('[data-goods-tab="code"]')!.getAttribute('aria-current')).toBe('true')
    expect(document.activeElement).toBe(field('char-0-name'))
    expect(field('char-0-name').closest('[data-chars-grid]')).not.toBeNull()

    await click('[data-goods-next]')
    expect(entry().textContent).toBe('Характеристики: 21 строка')
    await click('[data-goods-next]')
    expect(entry().textContent).toBe('Характеристики: строк нет')
    entry().click()
    await settle()
    expect(document.activeElement).toBe(q('[data-chars-add]'))
  })
})

describe('GoodsEditor: строки характеристик гр. 31 (как «Характеристика товаров в группе» КЕДЕН)', () => {
  // Вид «Карточки» (телефон или выбор пользователя); «Таблица» — GoodsCharacteristicsGrid.spec.
  beforeEach(() => { writeCharsMode('cards') })
  const rowsOf = () => form.goodsItems[0].characteristics!
  const rowEls = () => [...panel()!.querySelectorAll<HTMLElement>('[data-char-row]')]

  it('добавить, копировать предыдущую, копировать строку, удалить; правка на месте без «Пересчитать»', async () => {
    await mount([item({ characteristics: [{ name: 'ДУХОВКА', tradeMarkName: 'DESSUS', productModelName: 'DBO-1', quantity: 100, unitCode: '796' }] })], { query: '&item=1' })
    // Одна строка — раскрыта сразу.
    expect(rowEls()).toHaveLength(1)
    expect(q('[data-char-editor="0"]')).not.toBeNull()

    await click('[data-chars-copy-last]')
    expect(rowsOf()).toHaveLength(2)
    expect(rowsOf()[1]).toMatchObject({ name: 'ДУХОВКА', tradeMarkName: 'DESSUS', productModelName: 'DBO-1', quantity: 100 })
    expect(rowsOf()[1]).not.toBe(rowsOf()[0])
    // Новая строка раскрыта и в фокусе — меняется модель.
    expect(document.activeElement).toBe(field('char-1-name'))
    await type('char-1-model', 'dbo-2')
    expect(rowsOf()[1].productModelName).toBe('DBO-2')
    expect(rowsOf()[0].productModelName).toBe('DBO-1')

    await click('[data-chars-add]')
    expect(rowsOf()).toHaveLength(3)
    expect(rowsOf()[2].tradeMarkName ?? null).toBeNull()

    await click('[data-char-copy="0"]')
    expect(rowsOf().map((r) => r.productModelName ?? null)).toEqual(['DBO-1', 'DBO-1', 'DBO-2', null])

    await click('[data-char-remove="1"]')
    expect(rowsOf().map((r) => r.productModelName ?? null)).toEqual(['DBO-1', 'DBO-2', null])
    expect(form.goodsItems[0].needsTpinRecalc).toBe(false)
  })

  it('единица строки — из ОКЕИ (своя, не гр. 41); сводка строки «100 ШТ»', async () => {
    await mount([item({ characteristics: [{ quantity: 2.5 }, { quantity: 100, unitCode: '796' }] })], { query: '&item=1' })
    // Две строки — свёрнуты; раскрывается по нажатию.
    expect(q('[data-char-editor="1"]')).toBeNull()
    expect(q('[data-char-qty="1"]')!.textContent).toContain('100 ШТ')
    await click('[data-char-toggle="0"]')
    expect(field('char-0-unit')).not.toBeNull()
    expect(form.goodsItems[0].unitCode).toBe('796')
  })

  it('сумма строк против гр. 41 / гр. 42 — предупреждение (не блок) под таблицей и у полей', async () => {
    await mount([item({ quantity: 300, unitCode: '796', customsValue: 900, characteristics: [
      { quantity: 100, unitCode: '796', invoiceValue: 300 },
      { quantity: 150, unitCode: '796', invoiceValue: 600 },
      { quantity: 5, unitCode: '166' }, // другая единица — в сумму гр. 41 не идёт
    ] })], { query: '&item=1' })
    expect(q('[data-chars-qty-warning]')!.textContent).toContain('250')
    expect(q('[data-chars-value-warning]')).toBeNull()
    expect(q('[data-goods-field="quantity"]')!.textContent).toContain('250')

    form.goodsItems[0].characteristics![1].quantity = 200
    await settle()
    expect(q('[data-chars-qty-warning]')).toBeNull()
    form.goodsItems[0].customsValue = 1000
    await settle()
    expect(q('[data-chars-value-warning]')!.textContent).toContain('900')
  })

  it('строка без количества с единицей — предупреждение под таблицей (не блок); единственная строка — гр. 41', async () => {
    await mount([item({ quantity: 300, unitCode: '796', characteristics: [{ tradeMarkName: 'A' }] })], { query: '&item=1' })
    expect(q('[data-chars-measure-warning]')).toBeNull()
    expect(q('[data-gr31-preview]')!.textContent).toContain('КОЛИЧЕСТВО: 300 ШТ;')
    await click('[data-chars-copy-last]')
    expect(q('[data-chars-measure-warning]')!.textContent).toContain('1, 2')
  })

  it('текст гр. 31 как в КЕДЕН: «1. {описание}, {строка}: ПРОИЗВОДИТЕЛЬ … КОЛИЧЕСТВО …;» и «2. места, упаковка»', async () => {
    await mount([item({
      description: 'ШТОРЫ ДЛЯ ВАННОЙ', packagesCount: 30, cargoPlacesQuantity: 30, packageKindCode: 'BX', packageQuantity: 30,
      characteristics: [{ name: 'ШТОРЫ ДЛЯ ВАННОЙ', manufacturerName: 'YIWU', tradeMarkName: 'YIWU', productArticle: 'JJ-17', invoiceValue: 1854, quantity: 1800, unitCode: '796' }],
    })], { query: '&item=1' })
    expect(q('[data-gr31-preview]')!.textContent).toContain(
      '1. ШТОРЫ ДЛЯ ВАННОЙ, ШТОРЫ ДЛЯ ВАННОЙ: ПРОИЗВОДИТЕЛЬ: YIWU, ТОВАРНЫЙ ЗНАК: YIWU, МАРКА: ОТСУТСТВУЕТ, МОДЕЛЬ: ОТСУТСТВУЕТ, '
      + 'АРТИКУЛ: JJ-17, СТАНДАРТ (ГОСТ): ОТСУТСТВУЕТ, СОРТ: ОТСУТСТВУЕТ, СТОИМОСТЬ: 1854, КОЛИЧЕСТВО: 1800 ШТ;\n2. 30, BX-30')
  })

  // (баг, итоговое ревью пакета 7, I1) Единственная строка следует за гр. 41 / гр. 42 — пустые поля показывают их подсказкой.
  it('единственная строка без количества и стоимости — подсказки «из гр. 41: …» / «из гр. 42: …»; 2+ строк — нет', async () => {
    await mount([item({ quantity: 5443, unitCode: '112', unit: 'ЛИТР', customsValue: 4233.6, characteristics: [{ tradeMarkName: 'ZIGI-ZAGI' }] })], { query: '&item=1' })
    const nb = (s: string | null | undefined) => (s ?? '').replace(/[\u00a0\u202f]/g, ' ')
    expect(nb(field('char-0-quantity').placeholder)).toBe('из гр. 41: 5 443 Л')
    expect(nb(field('char-0-value').placeholder)).toBe('из гр. 42: 4 233,6')
    expect(nb(q('[data-char-qty="0"]')!.textContent)).toContain('из гр. 41: 5 443 Л')
    expect(nb(q('[data-char-value="0"]')!.textContent)).toContain('из гр. 42: 4 233,6')
    expect(q('[data-gr31-preview]')!.textContent).toContain('СТОИМОСТЬ: 4233.6, КОЛИЧЕСТВО: 5443 Л;')
    // Поле заполнено — своё значение, подсказки нет; копия в строку не пишется.
    expect(form.goodsItems[0].characteristics![0].quantity ?? null).toBeNull()
    await type('char-0-quantity', '10')
    expect(nb(q('[data-char-qty="0"]')!.textContent)).not.toContain('из гр. 41')
    // Пустая вторая строка не в счёт (сервер её отбросит) — строка 1 по-прежнему следует за товаром.
    await click('[data-chars-add]')
    expect(nb(field('char-0-value').placeholder)).toBe('из гр. 42: 4 233,6')
    // Две заполненные строки — подстановки нет.
    await type('char-1-model', 'M2')
    expect(field('char-0-value').placeholder).toBe('')
    expect(q('[data-char-value="0"]')!.textContent).toContain('—')
    expect(q('[data-char-value="1"]')!.textContent).toContain('—')
  })

  // (баг 14.10) Свёрнутая строка в ящике ~800 px: количество, стоимость и кнопки стояли перед № и наименованием.
  it('свёрнутая строка: ячейки по порядку заголовка, у каждой — явная колонка широкой сетки; кнопки последние', async () => {
    await mount([item({ characteristics: [{ name: 'НАПИТОК', quantity: 5443, unitCode: '112', invoiceValue: 4233.6 }, { productModelName: 'M2', productArticle: 'A2' }] })], { query: '&item=1' })
    const cols = (el: Element) => [...el.classList].find((c) => /^@2xl:col-start-\d$/.test(c)) ?? [...el.classList].find((c) => /^col-start-\d$/.test(c))
    const head = q('[data-chars-head]')!
    expect([...head.children].map(cols)).toEqual(['col-start-1', 'col-start-2', '@2xl:col-start-3', '@2xl:col-start-4', '@2xl:col-start-5', '@2xl:col-start-6'])
    for (const row of panel()!.querySelectorAll('[data-char-summary]')) {
      const cells = [...row.children] as HTMLElement[]
      expect(cells.map((c) => c.dataset.cell)).toEqual(['no', 'name', 'qty', 'value', 'model', 'actions'])
      expect(cells.map(cols)).toEqual(['col-start-1', 'col-start-2', '@2xl:col-start-3', '@2xl:col-start-4', '@2xl:col-start-5', '@2xl:col-start-6'])
      // Ни одна ячейка не стоит в строке сетки без своей колонки (иначе раскладчик ставит её раньше № и наименования).
      for (const c of cells) {
        const rowPinned = [...c.classList].some((x) => /^(@2xl:)?row-start-/.test(x))
        if (rowPinned) expect(cols(c), c.dataset.cell).toBeTruthy()
      }
    }
    // Шаблон колонок заголовка и строки — один.
    const tpl = (el: Element) => [...el.classList].find((c) => c.startsWith('@2xl:grid-cols-'))
    expect(tpl(q('[data-char-summary]')!)).toBe(tpl(head))
  })

  it('пустые модель и артикул — «—» (в карточке подпись не обрезает значение)', async () => {
    await mount([item({ characteristics: [{ tradeMarkName: 'A' }, { productModelName: ' ', productArticle: null }] })], { query: '&item=1' })
    for (const i of [0, 1]) {
      const cellEl = q(`[data-char-model="${i}"]`)!
      expect(cellEl.querySelector('.truncate')!.textContent).toBe('—')
      expect(cellEl.querySelector('.shrink-0')!.textContent).toBe('Модель / артикул:')
    }
  })

  it('смена кода сменила ДЕИ, а у строки своя единица — подсказка (не блок), пока единица строки другая', async () => {
    tnved.rates.mockImplementation(async (code: string) => ({
      data: code === '2201900000' ? { unitCode: '112', unitName: 'ЛИТР', unitShortName: 'Л' } : { unitCode: '796', unitName: 'шт' },
    }))
    await mount([item({ tnvedCode: '4202121900', unit: 'шт', unitCode: '796', characteristics: [{ quantity: 800, unitCode: '796' }, { tradeMarkName: 'B' }] })], { query: '&item=1' })
    expect(q('[data-goods-dei-rows-hint]')).toBeNull()
    await type('tnvedCode', '2201900000')
    field('tnvedCode').dispatchEvent(new FocusEvent('blur'))
    await new Promise((r) => setTimeout(r, 0))
    await settle()
    expect(form.goodsItems[0].unitCode).toBe('112')
    const hint = q('[data-goods-dei-rows-hint]')!
    expect(hint.getAttribute('role')).toBe('status')
    expect(hint.textContent).toContain('112 — Л')
    expect(hint.textContent).toContain('строк характеристик 1 ')
    expect(hint.textContent).toContain('796 — ШТ')
    // Единица строки исправлена — подсказка уходит.
    form.goodsItems[0].characteristics![0].unitCode = '112'
    await settle()
    expect(q('[data-goods-dei-rows-hint]')).toBeNull()
  })

  it('просмотр: строки не правятся, кнопок нет; строк нет — подсказка', async () => {
    await mount([item({ characteristics: [{ tradeMarkName: 'A' }] }), item({ characteristics: [] })], { readonly: true, query: '&item=1' })
    expect(q('[data-chars-add]')).toBeNull()
    expect(q('[data-char-remove="0"]')).toBeNull()
    expect(field('char-0-tradeMark').disabled).toBe(true)
    await router.replace({ query: { s: 'goods', item: '2' } })
    await settle()
    expect(q('[data-chars-empty]')).not.toBeNull()
  })
})

describe('GoodsEditor: ширина панели, полоса списка, вкладки (правка №17)', () => {
  const width = () => panel()!.style.getPropertyValue('--w')
  const storedWidth = (user?: string) => localStorage.getItem(user ? `zircon.dt.goodsEditorWidth:${user}` : 'zircon.dt.goodsEditorWidth')
  // buttons — нажатые кнопки (как у PointerEvent): при движении с нажатой — 1, при отпускании — 0.
  const pointer = (target: EventTarget, type: string, clientX: number, buttons = type === 'pointerup' ? 0 : 1) =>
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons, clientX }))

  it('по умолчанию широкая (90% окна); «Сузить» — 780 px, запоминается у пользователя; Alt+↓ и Esc — как раньше; снова открыли — как выбрали', async () => {
    localStorage.setItem('userId', 'u-7')
    await mount([item({ description: 'A' }), item({ description: 'B' })], { query: '&item=1' })
    expect(width()).toBe('90vw')
    expect(panel()!.dataset.goodsEditorWidth).toBe('wide')
    expect(q('[data-goods-width-toggle]')!.getAttribute('aria-label')).toBe('Сузить карточку')
    // Окно 1024 px (jsdom): панель 922 px — полосе списка места нет.
    expect(q('[data-goods-rail]')).toBeNull()

    await click('[data-goods-width-toggle]')
    expect(width()).toBe('780px')
    expect(panel()!.dataset.goodsEditorWidth).toBe('narrow')
    expect(q('[data-goods-width-toggle]')!.getAttribute('aria-label')).toBe('Развернуть карточку')
    expect(storedWidth('u-7')).toBe('narrow')

    await key(q('[data-goods-next]')!, { key: 'ArrowDown', altKey: true })
    expect(itemQuery()).toBe('2')
    expect(width()).toBe('780px')
    await key(field('quantity'), { key: 'Escape' })
    expect(itemQuery()).toBeUndefined()

    await router.replace({ query: { s: 'goods', item: '1' } })
    await settle()
    expect(width()).toBe('780px')
    w.unmount()
    document.body.innerHTML = ''
    await mount([item()], { query: '&item=1' })
    expect(width()).toBe('780px')
    await click('[data-goods-width-toggle]')
    expect(width()).toBe('90vw')
    expect(storedWidth('u-7')).toBe('wide')
  })

  it('край панели тянется мышью: ширина вживую, по отпусканию — запоминается; ←/→ на ручке; рядом с 90% — «широко»; двойной щелчок — сузить', async () => {
    vi.stubGlobal('innerWidth', 1600)
    try {
      await mount([item()], { query: '&item=1' })
      const handle = q('[data-goods-resize]')!
      expect(handle.getAttribute('role')).toBe('separator')
      expect(handle.getAttribute('aria-valuenow')).toBe('1440')
      expect(handle.getAttribute('aria-valuemax')).toBe('1536')

      pointer(handle, 'pointerdown', 160)
      pointer(window, 'pointermove', 600)
      await settle()
      expect(width()).toBe('1000px')
      expect(panel()!.dataset.goodsEditorDragging).toBe('true')
      expect(document.body.style.cursor).toBe('col-resize')
      expect(storedWidth()).toBeNull()
      pointer(window, 'pointerup', 600)
      await settle()
      expect(width()).toBe('min(1000px, calc(100vw - 64px))')
      expect(storedWidth()).toBe('1000')
      expect(panel()!.dataset.goodsEditorDragging).toBeUndefined()
      expect(document.body.style.cursor).toBe('')

      await key(handle, { key: 'ArrowLeft' })
      expect(storedWidth()).toBe('1048')
      await key(handle, { key: 'ArrowRight' })
      await key(handle, { key: 'ArrowRight' })
      expect(storedWidth()).toBe('952')
      expect(handle.getAttribute('aria-valuenow')).toBe('952')

      // Отпустили в 10 px от 90% окна (1440) — «широко»: дальше следует за окном.
      pointer(handle, 'pointerdown', 500)
      pointer(window, 'pointermove', 22)
      pointer(window, 'pointerup', 22)
      await settle()
      expect(storedWidth()).toBe('wide')
      expect(width()).toBe('90vw')

      handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      await settle()
      expect(width()).toBe('780px')
      expect(storedWidth()).toBe('narrow')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('щелчок по ручке без движения не перезаписывает сохранённую ширину (своя 1700 px на окне 1280 — панель ужата окном)', async () => {
    localStorage.setItem('zircon.dt.goodsEditorWidth', '1700')
    vi.stubGlobal('innerWidth', 1280)
    try {
      await mount([item()], { query: '&item=1' })
      const handle = q('[data-goods-resize]')!
      expect(width()).toBe('min(1700px, calc(100vw - 64px))')
      expect(handle.getAttribute('aria-valuenow')).toBe('1216')
      pointer(handle, 'pointerdown', 300)
      pointer(window, 'pointerup', 300)
      await settle()
      expect(storedWidth()).toBe('1700')
      // Дрожание руки на 2 px — тоже щелчок.
      pointer(handle, 'pointerdown', 300)
      pointer(window, 'pointermove', 302)
      pointer(window, 'pointerup', 302)
      await settle()
      expect(storedWidth()).toBe('1700')
      expect(width()).toBe('min(1700px, calc(100vw - 64px))')
      expect(panel()!.dataset.goodsEditorDragging).toBeUndefined()
      // Настоящее перетаскивание — запоминается.
      pointer(handle, 'pointerdown', 300)
      pointer(window, 'pointermove', 400)
      pointer(window, 'pointerup', 400)
      await settle()
      expect(storedWidth()).toBe('1116')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('отпускание потерялось (окно потеряло фокус, мышь движется без кнопки) — перетаскивание заканчивается, ширина больше не следует за мышью', async () => {
    vi.stubGlobal('innerWidth', 1600)
    try {
      await mount([item()], { query: '&item=1' })
      const handle = q('[data-goods-resize]')!
      // ⌘/Alt+Tab посреди перетаскивания: конец на том, что было видно.
      pointer(handle, 'pointerdown', 160)
      pointer(window, 'pointermove', 600)
      await settle()
      expect(width()).toBe('1000px')
      window.dispatchEvent(new Event('blur'))
      await settle()
      expect(panel()!.dataset.goodsEditorDragging).toBeUndefined()
      expect(document.body.style.cursor).toBe('')
      expect(storedWidth()).toBe('1000')
      pointer(window, 'pointermove', 300, 0)
      pointer(window, 'pointermove', 300)
      await settle()
      expect(width()).toBe('min(1000px, calc(100vw - 64px))')

      // Кнопку отпустили вне страницы: первое же движение без кнопки заканчивает перетаскивание, щелчок потом ничего не пишет.
      pointer(handle, 'pointerdown', 600)
      pointer(window, 'pointermove', 500)
      await settle()
      expect(width()).toBe('1100px')
      pointer(window, 'pointermove', 200, 0)
      await settle()
      expect(panel()!.dataset.goodsEditorDragging).toBeUndefined()
      expect(width()).toBe('min(1100px, calc(100vw - 64px))')
      expect(storedWidth()).toBe('1100')
      pointer(window, 'pointermove', 100)
      pointer(window, 'pointerup', 100)
      await settle()
      expect(width()).toBe('min(1100px, calc(100vw - 64px))')
      expect(storedWidth()).toBe('1100')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('широкая панель — слева полоса списка товаров: открытый отмечен, нажатие открывает другой, ↑/↓ по полосе; узкая — без полосы', async () => {
    vi.stubGlobal('innerWidth', 1600)
    try {
      await mount([item({ description: 'A' }), item({ description: 'B', tnvedCode: null }), item({ description: 'C' })], { query: '&item=2' })
      const rail = q('[data-goods-rail]')!
      expect(rail).not.toBeNull()
      expect(rail.getAttribute('aria-label')).toBe('Список товаров')
      // Полоса — после товара в DOM: фокус при открытии и Tab начинаются с шапки товара.
      expect(q('[data-goods-editor-head]')!.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      const items = () => [...rail.querySelectorAll<HTMLElement>('[data-goods-rail-item]')]
      expect(items()).toHaveLength(3)
      expect(items().map((b) => b.getAttribute('aria-current'))).toEqual([null, 'true', null])
      expect(items().map((b) => b.tabIndex)).toEqual([-1, 0, -1])
      expect(items()[0].textContent).toContain('4202 12 190 0')
      expect(items()[1].textContent).toContain('нет кода')
      // Точка — ошибки товара (как фильтр «С ошибками»): без кода — есть, у полного товара — нет.
      expect(items()[1].querySelector('[data-goods-rail-error]')).not.toBeNull()
      expect(items()[1].getAttribute('aria-label')).toContain('есть ошибки')
      expect(items()[0].querySelector('[data-goods-rail-error]')).toBeNull()
      expect(items()[2].textContent).toContain('C')

      items()[2].click()
      await settle()
      expect(itemQuery()).toBe('3')
      expect(q('[data-goods-editor-caption]')!.textContent).toBe('C')
      expect(q('[data-goods-rail-item][aria-current="true"]')!.getAttribute('data-goods-rail-item')).toBe('2')

      items()[2].focus()
      await key(items()[2], { key: 'ArrowUp' })
      expect(document.activeElement).toBe(items()[1])
      await key(items()[1], { key: 'Home' })
      expect(document.activeElement).toBe(items()[0])
      expect(itemQuery()).toBe('3')

      await click('[data-goods-width-toggle]')
      expect(q('[data-goods-rail]')).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('вкладки не помещаются — стрелки ‹ ›; полоса прокручивается, активная вкладка показывается', async () => {
    await mount([item()], { query: '&item=1' })
    const nav = q('[data-goods-tabs]')!
    expect(q('[data-goods-tabs-prev]')).toBeNull()
    expect(q('[data-goods-tabs-next]')).toBeNull()
    Object.defineProperty(nav, 'scrollWidth', { configurable: true, value: 900 })
    Object.defineProperty(nav, 'clientWidth', { configurable: true, value: 400 })
    nav.dispatchEvent(new Event('scroll'))
    await settle()
    expect(q('[data-goods-tabs-prev]')).toBeNull()
    expect(q('[data-goods-tabs-next]')!.getAttribute('aria-label')).toBe('Следующие разделы')

    await click('[data-goods-tabs-next]')
    expect(nav.scrollLeft).toBe(264)
    expect(q('[data-goods-tabs-prev]')).not.toBeNull()
    await click('[data-goods-tabs-next]')
    expect(nav.scrollLeft).toBe(500)
    expect(q('[data-goods-tabs-next]')).toBeNull()
    await click('[data-goods-tabs-prev]')
    expect(nav.scrollLeft).toBe(236)

    // Стрелки — поверх полосы (absolute): появление ‹ не сужает полосу и не уводит показанную вкладку под край (ревью №17).
    expect(q('[data-goods-tabs-prev]')!.className).toContain('absolute')
    expect(q('[data-goods-tabs-wrap]')!.className).toContain('relative')
    expect(nav.className).toContain('flex-1')

    // Активная вкладка (по нажатию или прокрутке секций) — в видимой части полосы и не под стрелкой (стрелка до 36 px).
    const place = (key: string, left: number, w = 70) => {
      const tab = q<HTMLElement>(`[data-goods-tab="${key}"]`)!
      Object.defineProperty(tab, 'offsetLeft', { configurable: true, value: left })
      Object.defineProperty(tab, 'offsetWidth', { configurable: true, value: w })
    }
    const ARROW = 36
    // «Доп. сведения» в середине, справа ещё вкладки: правый край — левее стрелки ›, слева появилась ‹ — полоса той же ширины.
    place('extras', 700)
    await click('[data-goods-tab="extras"]')
    expect(nav.scrollLeft).toBe(700 + 70 + 4 + ARROW - 400)
    expect(700 + 70).toBeLessThanOrEqual(nav.scrollLeft + 400 - ARROW)
    expect(q('[data-goods-tabs-prev]')).not.toBeNull()
    expect(q('[data-goods-tabs-next]')).not.toBeNull()
    // Левее видимого: левый край — правее стрелки ‹.
    place('packaging', 300)
    await click('[data-goods-tab="packaging"]')
    expect(nav.scrollLeft).toBe(300 - 4 - ARROW)
    expect(300).toBeGreaterThanOrEqual(nav.scrollLeft + ARROW)
    // Последняя вкладка — прокрутка до конца (не дальше), стрелки › нет.
    place('payments', 820)
    await click('[data-goods-tab="payments"]')
    expect(nav.scrollLeft).toBe(500)
    expect(q('[data-goods-tabs-next]')).toBeNull()
    place('code', 0)
    await click('[data-goods-tab="code"]')
    expect(nav.scrollLeft).toBe(0)
    expect(q('[data-goods-tabs-prev]')).toBeNull()
  })

  it('200 товаров, полоса списка видна: ввод в открытый товар перерисовывает одну его строку полосы, а не все', async () => {
    const updates: Record<string, number> = { GoodsEditorRail: 0, GoodsEditorRailRow: 0 }
    const counter = {
      updated(this: { $options: { __name?: string } }) {
        const n = this.$options.__name
        if (n && n in updates) updates[n]++
      },
    }
    vi.stubGlobal('innerWidth', 1600)
    try {
      const many = Array.from({ length: 200 }, (_, i) => item({ description: `ТОВАР ${i + 1}`, tnvedCode: `84713${String(i).padStart(5, '0')}` }))
      await mount(many, { query: '&item=100', mixins: [counter] })
      expect(q('[data-goods-rail]')).not.toBeNull()
      expect(panel()!.querySelectorAll('[data-goods-rail-item]')).toHaveLength(200)
      updates.GoodsEditorRail = 0
      updates.GoodsEditorRailRow = 0
      const t = performance.now()
      for (const v of ['Н', 'НО', 'НОВ', 'НОВО', 'НОВОЕ']) await type('description', v)
      const typeMs = (performance.now() - t) / 5
      expect(model.items.value[99].description).toBe('НОВОЕ')
      expect(q('[data-goods-rail-item="99"]')!.textContent).toContain('НОВОЕ')
      // Строка открытого товара — по разу на букву; полоса и остальные 199 строк не перерисовываются.
      expect(updates.GoodsEditorRail).toBe(0)
      expect(updates.GoodsEditorRailRow).toBeLessThanOrEqual(5)
      console.info(`[perf 200 editor + rail] type ${typeMs.toFixed(0)} ms, rail row updates ${updates.GoodsEditorRailRow}`)

      // Переход к другому товару — перерисовываются только две строки (была открыта — стала открыта).
      updates.GoodsEditorRailRow = 0
      await click('[data-goods-next]')
      expect(q('[data-goods-rail-item][aria-current="true"]')!.getAttribute('data-goods-rail-item')).toBe('100')
      expect(updates.GoodsEditorRailRow).toBe(2)
    } finally {
      vi.unstubAllGlobals()
    }
  }, 30_000)
})
