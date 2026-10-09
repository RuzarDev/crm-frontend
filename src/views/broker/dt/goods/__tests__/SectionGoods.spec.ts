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
import { useDtGoods, type GoodsReadinessItem } from '../useDtGoods'
import { resetDtTnvedCheckCache } from '../tnvedCodeCheck'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))
const excel = vi.hoisted(() => ({ readGoodsExcel: vi.fn() }))
vi.mock('@/utils/goodsExcel', async (orig) => ({ ...(await orig<typeof import('@/utils/goodsExcel')>()), readGoodsExcel: excel.readGoodsExcel }))
const xlsx = vi.hoisted(() => ({ exportXlsx: vi.fn(async () => undefined) }))
vi.mock('@/views/broker/list', async (orig) => ({ ...(await orig<typeof import('@/views/broker/list')>()), exportXlsx: xlsx.exportXlsx }))
vi.mock('@/api/references', () => ({ referencesApi: { listClassifiers: vi.fn(async () => []), listOkeiUnits: vi.fn(async () => []), listCountries: vi.fn(async () => []) } }))
vi.mock('@/api/prohibitionCodes', () => ({ prohibitionCodesApi: { list: vi.fn(async () => []), suggest: vi.fn(async () => ({ tnved: '', codes: [], fetchedAtUtc: null, stale: false, warning: null })) } }))
// Редактор товара (открывается по строке): проверка кода, ставки КЕДЕН и ТРОИС — без сети.
vi.mock('@/api/tnved', () => ({ tnvedApi: {
  node: vi.fn(async (code: string) => ({ data: { code, name: 'УЗЕЛ', is10: true } })),
  rates: vi.fn(async () => ({ data: {} })),
  tariffOptions: vi.fn(async () => ({ data: { countryRate: null, excise: [], antiDumping: [], dutyRates: [] } })),
} }))
vi.mock('@/api/trois', () => ({ troisApi: { check: vi.fn(async () => []), search: vi.fn(async () => []) }, troisDate: (s: string) => s, troisTrustedShort: () => '' }))
vi.mock('@/api/kedenProcedureLists', async (orig) => ({ ...(await orig<typeof import('@/api/kedenProcedureLists')>()), kedenProcedureListsApi: { get: vi.fn(async () => ({})) } }))

import SectionGoods from '../SectionGoods.vue'
import { tnvedApi } from '@/api/tnved'

const item = (o: Partial<Import40GoodsItemInput> = {}): Import40GoodsItemInput => ({
  description: 'НОУТБУКИ', tnvedCode: '8471300000', tnvedDescription: null, countryOfOrigin: '156', quantity: 10, unit: 'ШТ',
  unitCode: '796', grossWeightKg: 420.5, netWeightKg: 384, packagesCount: 2, cargoPlacesQuantity: 2, quantityTypeCode: null,
  customsValue: 25000, currency: 'USD', customsValueKzt: 12610400, valuationMethodCode: '1',
  payments: [{ taxModeCode: '2010', amountKzt: 2017664 } as never], needsTpinRecalc: false, markings: [], extras: null, ...o,
})

let w: VueWrapper
let router: Router
let pinia: ReturnType<typeof createPinia>
let form: DtFormState
const readiness = ref<GoodsReadinessItem[] | null>(null)
const canEdit = ref(true)
let model: ReturnType<typeof useDtGoods>

const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await flushPromises()
    await nextTick()
  }
}
const mount = async (goods: Import40GoodsItemInput[], o: { readonly?: boolean; query?: string; currency?: string } = {}) => {
  form = reactive({ ...emptyDtForm(), currency: o.currency ?? 'USD', goodsItems: goods }) as DtFormState
  canEdit.value = !o.readonly
  model = useDtGoods(form, { readiness: () => readiness.value, canEdit })
  const Page = defineComponent({
    setup: () => () => h(SectionGoods, {
      model,
      currency: form.currency || null,
      dtNumber: '55302/091026/0001234',
      readonly: !!o.readonly,
      countryOptions: [{ value: '156', label: '156 — КИТАЙ', alpha2: 'CN' }, { value: '458', label: '458 — МАЛАЙЗИЯ', alpha2: 'MY' }],
      'onCalc-payments': () => emitted.push('calc-payments'),
      'onCalc-tpin': () => emitted.push('calc-tpin'),
    }),
  })
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/import-40/:caseId/dt/:dtId', name: 'import-40-dt', component: Page }] })
  await router.push(`/import-40/c1/dt/d1?s=goods${o.query ?? ''}`)
  await router.isReady()
  w = mountWithI18n(defineComponent({ render: () => h(RouterView) }), { attachTo: document.body, global: { plugins: [pinia, router] } })
  await settle()
}
let emitted: string[] = []
const rows = () => w.findAll('[data-goods-row]')
// Значение ячейки (без подписи карточки телефона); неразрывные пробелы — обычными.
const cellTexts = (i: number) => rows()[i].findAll('td').map((td) => {
  const v = td.find('[data-z-value]')
  return (v.exists() ? v.text() : td.text()).replace(/\u00A0/g, ' ')
})
const key = (o: KeyboardEventInit, target: EventTarget = document.body) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...o }))
const check = async (i: number) => {
  await rows()[i].find('[role="checkbox"]').trigger('click')
  await settle()
}

beforeEach(() => {
  resetDtTnvedCheckCache()
  pinia = createPinia()
  setActivePinia(pinia)
  useClassifiersStore().cache = {
    '2005': [{ id: '1', classifierCode: '2005', code: '1', nameRu: 'ПО СТОИМОСТИ СДЕЛКИ', sortOrder: 0, isActive: true }],
    '2013': [{ id: '2', classifierCode: '2013', code: 'CT', nameRu: 'КАРТОННАЯ КОРОБКА', sortOrder: 0, isActive: true }],
  }
  readiness.value = null
  emitted = []
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('SectionGoods: таблица', () => {
  it('заголовок с числом, колонки доски, валюта гр. 22 в «Фактурной», страна буквами, «нет кода», статусы', async () => {
    readiness.value = [{ goodsIndex: 1 }, { goodsIndex: 1 }]
    await mount([
      item(),
      item({ tnvedCode: null, description: 'МЫШИ', customsValue: 640, payments: [] }),
      item({ description: 'СУМКИ', needsTpinRecalc: true, countryOfOrigin: '458' }),
    ])
    expect(w.get('[data-goods-count]').text()).toBe('3')
    const heads = w.findAll('thead th').map((th) => th.text())
    expect(heads).toEqual(expect.arrayContaining(['№', 'Код ТН ВЭД', 'Описание · страна', 'Брутто / нетто, кг', 'Фактурная, USD', 'Гр. 45 / ТПиН, ₸', 'Статус']))
    // брутто / нетто и гр. 45 / ТПиН — по две строки в ячейке; «№ N» перед кодом — только в карточке телефона
    expect(cellTexts(0)).toEqual(['', '1', '№ 18471 30 000 0, Открыть товар 1', 'НОУТБУКИCN', '420,5384,0', '25 000,00', '12 610 4002 017 664', 'Готов'])
    expect(rows()[0].get('[data-goods-card-n]').classes()).toContain('sm:hidden')
    expect(rows()[1].get('[data-goods-card-n]').text()).toBe('№ 2')
    expect(rows()[1].find('[data-goods-no-code]').text()).toBe('нет кода, Открыть товар 2')
    // строка без aria-label (не прячет содержимое ячеек); открыть — кнопкой в ячейке кода
    expect(rows()[0].attributes('aria-label')).toBeUndefined()
    expect(rows()[0].attributes('tabindex')).toBeUndefined()
    expect(rows()[0].get('button[data-goods-open]').text()).toContain('8471 30 000 0')
    // у корня раздела нет data-graph: «к недостающему» не подсвечивает весь раздел
    expect(w.get('[data-dt-goods]').attributes('data-graph')).toBeUndefined()
    expect(cellTexts(1).slice(-2)).toEqual(['12 610 400—', 'Не хватает 2'])
    expect(rows()[2].text()).toContain('MY')
    expect(rows()[2].get('[data-goods-status]').attributes('data-goods-status')).toBe('stale')
    expect(cellTexts(2).at(-1)).toBe('Пересчитать')
  })

  it('узкий раздел (панель «До подачи»): без горизонтальной прокрутки — сначала уходят веса, потом гр. 45 / ТПиН', async () => {
    const heads = () => w.findAll('thead th').map((th) => th.text())
    const spy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(743)
    try {
      await mount([item()])
      expect(heads()).not.toContain('Брутто / нетто, кг')
      expect(heads()).toContain('Гр. 45 / ТПиН, ₸')
      expect(w.find('[data-z-scroller] table').attributes('style') ?? '').not.toContain('--z-table-x')
      w.unmount()
      spy.mockReturnValue(583)
      await mount([item()])
      expect(heads()).not.toContain('Брутто / нетто, кг')
      expect(heads()).not.toContain('Гр. 45 / ТПиН, ₸')
      expect(heads()).toEqual(expect.arrayContaining(['№', 'Код ТН ВЭД', 'Описание · страна', 'Фактурная, USD', 'Статус']))
    } finally {
      spy.mockRestore()
    }
  })

  it('без гр. 22 — «Фактурная» без валюты, код валюты у суммы', async () => {
    await mount([item({ currency: 'EUR' })], { currency: '' })
    expect(w.findAll('thead th').map((th) => th.text())).toContain('Фактурная')
    expect(cellTexts(0)[5]).toBe('25 000,00 EUR')
  })

  it('пусто — «Товаров нет» с «Добавить» и «Из Excel»; «Добавить» открывает новый товар', async () => {
    await mount([])
    expect(w.get('[data-goods-empty]').text()).toContain('Товаров нет')
    expect(w.find('[data-goods-empty-excel]').exists()).toBe(true)
    await w.get('[data-goods-empty-add]').trigger('click')
    await settle()
    expect(form.goodsItems).toHaveLength(1)
    expect(form.goodsItems[0].currency).toBe('USD')
    expect(router.currentRoute.value.query).toMatchObject({ s: 'goods', item: '1' })
  })
})

describe('SectionGoods: поиск и фильтры', () => {
  const three = () => [
    item({ tnvedCode: '8471300000', description: 'НОУТБУКИ' }),
    item({ tnvedCode: null, description: 'МЫШИ', tradeMarkName: 'LOGITECH' }),
    item({ tnvedCode: '4202121900', description: 'СУМКИ', needsTpinRecalc: true }),
  ]

  it('поиск по коду, описанию и марке; «ничего не найдено» со сбросом', async () => {
    await mount(three())
    const input = w.get('input[data-goods-search]')
    await input.setValue('4202 12')
    await settle()
    expect(rows().map((r) => r.attributes('data-goods-row'))).toEqual(['2'])
    await input.setValue('logitech')
    await settle()
    expect(rows().map((r) => r.attributes('data-goods-row'))).toEqual(['1'])
    await input.setValue('нет такого')
    await settle()
    expect(w.find('[data-goods-not-found]').exists()).toBe(true)
    await w.get('[data-goods-reset]').trigger('click')
    await settle()
    expect(rows()).toHaveLength(3)
  })

  it('чипы «С ошибками · N» и «Пересчитать · N»: счётчики и отбор; повторное нажатие снимает', async () => {
    await mount(three())
    const missing = w.get('[data-goods-filter="missing"]')
    const stale = w.get('[data-goods-filter="stale"]')
    expect(missing.text()).toBe('С ошибками · 1')
    expect(stale.text()).toBe('Пересчитать · 1')
    await missing.trigger('click')
    await settle()
    expect(rows().map((r) => r.attributes('data-goods-row'))).toEqual(['1'])
    expect(missing.attributes('aria-pressed')).toBe('true')
    await stale.trigger('click')
    await settle()
    expect(rows().map((r) => r.attributes('data-goods-row'))).toEqual(['2'])
    await stale.trigger('click')
    await settle()
    expect(rows()).toHaveLength(3)
  })

  it('«/» — фокус в поиск (не из поля ввода)', async () => {
    await mount(three())
    key({ key: '/' })
    await settle()
    expect(document.activeElement).toBe(w.get('input[data-goods-search]').element)
  })
})

describe('SectionGoods: выбор и массовые действия', () => {
  it('выбор строк → тёмная панель «Выбрано N»; Esc снимает выделение', async () => {
    await mount([item(), item(), item()])
    expect(w.find('[data-goods-bulk]').exists()).toBe(false)
    // живая область смонтирована заранее (иначе первое появление панели не озвучивается)
    const live = w.get('[role="status"][aria-live="polite"]')
    expect(live.text()).toBe('')
    await check(0)
    await check(2)
    expect(w.get('[data-goods-bulk-count]').text()).toBe('Выбрано 2')
    expect(w.get('[role="status"][aria-live="polite"]').text()).toBe('Выбрано 2')
    key({ key: 'Escape' })
    await settle()
    expect(w.find('[data-goods-bulk]').exists()).toBe(false)
  })

  it('«Дублировать» — копии сразу после исходных', async () => {
    await mount([item({ description: 'A' }), item({ description: 'B' })])
    await check(0)
    await w.get('[data-goods-bulk-duplicate]').trigger('click')
    await settle()
    expect(form.goodsItems.map((g) => g.description)).toEqual(['A', 'A', 'B'])
    expect(form.goodsItems[1]).not.toBe(form.goodsItems[0])
    expect(toast.success).toHaveBeenCalledWith('Добавлено копий: 1')
  })

  it('«Удалить» — вопрос с номерами и документами, привязанными только к ним; «Отмена» ничего не трогает', async () => {
    await mount([item({ description: 'A' }), item({ description: 'B' }), item({ description: 'C' }), item({ description: 'D' })])
    form.doc44Items = [
      { docTypeCode: '01011', docNumber: 'C1', goodsItemIndexes: '1,2' } as never, // только удаляемые → уйдёт
      { docTypeCode: '01011', docNumber: 'C2', goodsItemIndexes: '2,3' } as never, // останется за товаром D
    ]
    form.prevDocItems = [{ docTypeCode: '09013', docNumber: 'P', docDate: null, goodsNumber: null, goodsItemIndex: 1, sortOrder: 0 }]
    await check(1)
    await check(2)
    await w.get('[data-goods-bulk-remove]').trigger('click')
    await settle()
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Удалить товары № 2–3?')
    expect(confirmState.content).toContain('гр. 44 — 1, гр. 40 — 1')
    expect(confirmState.danger).toBe(true)
    confirmState.resolve(false)
    await settle()
    expect(form.goodsItems).toHaveLength(4)

    await w.get('[data-goods-bulk-remove]').trigger('click')
    await settle()
    confirmState.resolve(true)
    await settle()
    expect(form.goodsItems.map((g) => g.description)).toEqual(['A', 'D'])
    expect(form.doc44Items.map((d) => [d.docNumber, d.goodsItemIndexes])).toEqual([['C2', '1']])
    expect(form.prevDocItems).toEqual([])
    expect(w.find('[data-goods-bulk]').exists()).toBe(false)
    expect(toast.success).toHaveBeenCalledWith('Удалено товаров: 2')
  })

  it('«Удалить» одного товара без документов — короткий вопрос', async () => {
    await mount([item(), item()])
    await check(1)
    await w.get('[data-goods-bulk-remove]').trigger('click')
    await settle()
    expect(confirmState.title).toBe('Удалить товар № 2?')
    expect(confirmState.content).toBe('Данные этих товаров пропадут.')
  })

  it('«Применить к выбранным…» — группы, пометка «у N товаров», значения из товара-образца; применяется только отмеченное', async () => {
    await mount([
      item({ valuationMethodCode: '1', tempImportMonths: 6, countryOfOrigin: '156' }),
      item({ valuationMethodCode: null, tempImportMonths: null, countryOfOrigin: '458' }),
      item({ valuationMethodCode: null, tempImportMonths: null, countryOfOrigin: '458' }),
    ])
    await check(0)
    await check(1)
    await check(2)
    await w.get('[data-goods-bulk-apply]').trigger('click')
    await settle()
    const modal = document.querySelector('[data-goods-apply-modal]') as HTMLElement
    expect(modal).not.toBeNull()
    expect(modal.querySelector('[data-goods-apply-note]')!.textContent).toContain('(3: № 1–3)')
    const groups = [...modal.querySelectorAll('[data-goods-apply-group]')].map((g) => g.getAttribute('data-goods-apply-group'))
    expect(groups).toEqual(['country', 'procedure', 'valuation', 'preferences', 'ois', 'restrictions', 'gr33Codes', 'certification', 'tempImport', 'packaging'])
    const groupBox = (g: string) => modal.querySelector(`[data-goods-apply-group="${g}"] [role="checkbox"]`) as HTMLElement
    groupBox('valuation').click()
    groupBox('tempImport').click()
    await settle()
    const ok = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Применить') as HTMLButtonElement
    ok.click()
    await settle()
    expect(form.goodsItems.map((g) => [g.valuationMethodCode, g.tempImportMonths, g.countryOfOrigin])).toEqual([
      ['1', 6, '156'], ['1', 6, '458'], ['1', 6, '458'],
    ])
    // месяцы временного ввоза — основа платежей: у изменённых товаров «Пересчитать»
    expect(form.goodsItems.map((g) => !!g.needsTpinRecalc)).toEqual([false, true, true])
    expect(toast.success).toHaveBeenCalledWith('Изменено товаров: 2')
  })
})

describe('SectionGoods: итоги и расчёт', () => {
  it('итоги внизу: товаров, мест, брутто, нетто, фактурная с кодом валюты, гр. 45, ТПиН; «Платежи устарели»', async () => {
    await mount([item(), item({ needsTpinRecalc: true, cargoPlacesQuantity: 3, grossWeightKg: 100, netWeightKg: 90, customsValue: 1000, customsValueKzt: 500000, payments: [{ amountKzt: 1000.5 } as never] })])
    const total = (k: string) => w.get(`[data-total="${k}"] dd`).text()
    expect(total('goods')).toBe('2')
    expect(total('places')).toBe('5')
    expect(total('gross')).toBe('520,5')
    expect(total('net')).toBe('474,0')
    expect(total('invoice')).toBe('26 000,00 USD')
    expect(total('kzt45')).toBe('13 110 400 ₸')
    expect(total('tpin')).toBe('2 018 664,5 ₸')
    expect(w.find('[data-goods-stale]').exists()).toBe(true)
  })

  it('«Рассчитать» — расчёт платежей страницы; «Ещё» → «ТПиН по данным экрана»', async () => {
    await mount([item()])
    expect(w.find('[data-goods-stale]').exists()).toBe(false)
    await w.get('[data-goods-calc]').trigger('click')
    expect(emitted).toEqual(['calc-payments'])
    await w.get('[data-goods-calc-more]').trigger('pointerdown', { button: 0, ctrlKey: false })
    await w.get('[data-goods-calc-more]').trigger('keydown', { key: 'Enter' })
    await settle()
    const tpin = [...document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent?.includes('ТПиН по данным экрана')) as HTMLElement
    expect(tpin).toBeTruthy()
    tpin.click()
    await settle()
    expect(emitted).toEqual(['calc-payments', 'calc-tpin'])
  })
})

describe('SectionGoods: открытие товара (?item=N)', () => {
  it('кнопка кода (клавиатура) открывает товар — один переход', async () => {
    await mount([item(), item({ description: 'БЛОКИ' })])
    const replace = vi.spyOn(router, 'replace')
    await rows()[1].get('button[data-goods-open]').trigger('click')
    await settle()
    expect(router.currentRoute.value.query).toMatchObject({ s: 'goods', item: '2' })
    expect(replace).toHaveBeenCalledTimes(1)
  })

  it('клик по строке — ?item=N (с 1) вместе с ?s=goods и панель «Товар N из M»; закрытие убирает item', async () => {
    await mount([item(), item({ description: 'БЛОКИ' })])
    await rows()[1].trigger('click')
    await settle()
    expect(router.currentRoute.value.query).toMatchObject({ s: 'goods', item: '2' })
    expect(document.querySelector('[data-dt-goods-editor]')?.textContent).toContain('Товар 2 из 2')
    expect(rows()[1].attributes('data-open')).toBeDefined()
    await router.replace({ query: { s: 'goods' } })
    await settle()
    expect(document.querySelector('[data-dt-goods-editor][data-state="open"]')).toBeNull()
  })

  it('адрес с ?item=N открывает товар; товар выше удалён — номер в адресе догоняет; открытый удалён — закрыто', async () => {
    await mount([item({ description: 'A' }), item({ description: 'B' }), item({ description: 'C' })], { query: '&item=3' })
    expect(document.querySelector('[data-dt-goods-editor]')?.textContent).toContain('Товар 3 из 3')
    model.remove([0])
    await settle()
    expect(router.currentRoute.value.query.item).toBe('2')
    model.remove([1])
    await settle()
    expect(router.currentRoute.value.query.item).toBeUndefined()
  })

  it('номер вне списка — закрыто, item из адреса убирается', async () => {
    await mount([item()], { query: '&item=9' })
    expect(router.currentRoute.value.query.item).toBeUndefined()
    expect(document.querySelector('[data-dt-goods-editor][data-state="open"]')).toBeNull()
  })

  it('N — новый товар в конце и открыт', async () => {
    await mount([item()])
    key({ key: 'n', code: 'KeyN' })
    await settle()
    expect(form.goodsItems).toHaveLength(2)
    expect(router.currentRoute.value.query.item).toBe('2')
    // в поле ввода N — просто буква
    const input = w.get('input[data-goods-search]').element
    key({ key: 'n', code: 'KeyN' }, input)
    await settle()
    expect(form.goodsItems).toHaveLength(2)
  })
})

describe('SectionGoods: Excel', () => {
  const file = (name: string) => new File(['x'], name)
  const pick = async (f: File) => {
    const input = w.get('[data-goods-excel-input]')
    Object.defineProperty(input.element, 'files', { value: [f], configurable: true })
    await input.trigger('change')
    await settle()
  }

  it('«Из Excel»: предпросмотр (строк, что распознано, без кода) → «Добавить в конец»', async () => {
    excel.readGoodsExcel.mockResolvedValue({
      goods: [
        { description: 'БОЛТЫ', tnvedCode: '7318150000', tnvedDescription: 'БОЛТЫ', countryOfOrigin: null, quantity: 100, unit: 'CT', unitCode: null, grossWeightKg: 12.5, netWeightKg: null, packagesCount: 3, quantityTypeCode: null, customsValue: null, currency: null },
        { description: 'ГАЙКИ', tnvedCode: null, tnvedDescription: 'ГАЙКИ', countryOfOrigin: null, quantity: null, unit: 'шт', unitCode: null, grossWeightKg: 4, netWeightKg: null, packagesCount: null, quantityTypeCode: null, customsValue: null, currency: null },
      ],
    })
    await mount([item({ description: 'ПЕРВЫЙ' })])
    await pick(file('goods.xlsx'))
    const modal = document.querySelector('[data-goods-excel-modal]') as HTMLElement
    expect(modal.querySelector('[data-goods-excel-rows]')!.textContent).toBe('Строк с товарами: 2')
    expect(modal.querySelector('[data-goods-excel-field="code"]')!.textContent).toContain('1 из 2')
    expect(modal.querySelector('[data-goods-excel-field="gross"]')!.textContent).toContain('2 из 2')
    expect(modal.querySelector('[data-goods-excel-no-code]')!.textContent).toContain('Без кода ТН ВЭД: 1')
    expect(modal.querySelectorAll('[data-goods-excel-preview-row]')).toHaveLength(2)
    // X1: «Вид упаковки товара» — в вид упаковки гр. 31; нераспознанный не переносится и назван
    expect(modal.querySelector('[data-goods-excel-field="packaging"]')!.textContent).toContain('1 из 2')
    expect(modal.querySelector('[data-goods-excel-unknown-packaging]')!.textContent).toContain('«шт»')
    expect(form.goodsItems).toHaveLength(1)
    const append = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Добавить в конец') as HTMLButtonElement
    append.click()
    await settle()
    expect(form.goodsItems.map((g) => g.description)).toEqual(['ПЕРВЫЙ', 'БОЛТЫ', 'ГАЙКИ'])
    expect(form.goodsItems[1]).toMatchObject({ tnvedCode: '7318150000', quantity: 100, grossWeightKg: 12.5, packagesCount: 3, cargoPlacesQuantity: 3, currency: 'USD', payments: [] })
    expect(form.goodsItems.slice(1).map((g) => [g.packageKindCode, g.unit])).toEqual([['CT', null], [null, null]])
    expect(toast.success).toHaveBeenCalledWith('Добавлено товаров из Excel: 2')
  })

  it('не Excel — ошибка; проблема разбора — предупреждение прежним текстом', async () => {
    await mount([item()])
    await pick(file('goods.csv'))
    expect(toast.error).toHaveBeenCalledWith('Допустим только Excel-файл (.xlsx)')
    excel.readGoodsExcel.mockResolvedValue({ problem: 'noGoods' })
    await pick(file('goods.xlsx'))
    expect(toast.warning).toHaveBeenCalled()
    expect(document.querySelector('[data-goods-excel-modal]')).toBeNull()
  })

  it('«В Excel» — все товары с ключевыми графами, имя файла с номером ДТ', async () => {
    await mount([item(), item({ tnvedCode: null, payments: [] })])
    await w.get('[data-goods-export]').trigger('click')
    await settle()
    expect(xlsx.exportXlsx).toHaveBeenCalledTimes(1)
    const [base, sheet, rowsOut] = xlsx.exportXlsx.mock.calls[0] as unknown as [string, string, Record<string, unknown>[]]
    expect(base).toBe('Товары_ДТ_55302_091026_0001234')
    expect(sheet).toBe('Товары')
    expect(rowsOut).toHaveLength(2)
    expect(rowsOut[0]).toEqual({
      '№': 1, 'Код ТН ВЭД': '8471300000', 'Описание': 'НОУТБУКИ', 'Страна происхождения': '156', 'Количество': 10, 'ДЕИ': '796 — ШТ',
      'Брутто, кг': 420.5, 'Нетто, кг': 384, 'Места': 2, 'Фактурная стоимость': 25000, 'Валюта': 'USD', 'Гр. 45, ₸': 12610400,
      'Гр. 46, USD': null, 'ТПиН, ₸': 2017664,
    })
    expect(rowsOut[1]['Код ТН ВЭД']).toBeNull()
    expect(rowsOut[1]['ТПиН, ₸']).toBeNull()
  })
})

describe('SectionGoods: только просмотр', () => {
  it('без чекбоксов, добавления, Excel-загрузки и расчёта; «В Excel» и открытие товара доступны', async () => {
    await mount([item(), item()], { readonly: true })
    expect(w.findAll('[role="checkbox"]')).toHaveLength(0)
    expect(w.find('[data-goods-add]').exists()).toBe(false)
    expect(w.find('[data-goods-excel]').exists()).toBe(false)
    expect(w.find('[data-goods-calc]').exists()).toBe(false)
    expect(w.find('[data-goods-export]').exists()).toBe(true)
    key({ key: 'n', code: 'KeyN' })
    await settle()
    expect(form.goodsItems).toHaveLength(2)
    await rows()[0].trigger('click')
    await settle()
    expect(router.currentRoute.value.query.item).toBe('1')
  })
})

describe('SectionGoods: проверка кодов ТН ВЭД', () => {
  it('повторный вход в раздел не спрашивает уже проверенные коды (кэш сессии); новый код — спрашивается', async () => {
    const node = vi.mocked(tnvedApi.node)
    await mount([item(), item({ tnvedCode: '8517620003' }), item()])
    expect(node.mock.calls.map((c) => c[0]).sort()).toEqual(['8471300000', '8517620003'])
    w.unmount()
    document.body.innerHTML = ''
    await mount([item(), item({ tnvedCode: '8517620003' }), item({ tnvedCode: '8528521000' })])
    expect(node.mock.calls.map((c) => c[0]).sort()).toEqual(['8471300000', '8517620003', '8528521000'])
  })

  it('сбой сети — код не помечен; при повторном входе спрашивается снова один раз', async () => {
    const node = vi.mocked(tnvedApi.node)
    node.mockRejectedValueOnce(Object.assign(new Error('500'), { response: { status: 500 } }))
    await mount([item()])
    expect(node).toHaveBeenCalledTimes(1)
    expect(rows()[0].get('[data-goods-status]').attributes('data-goods-status')).not.toBe('badCode')
    w.unmount()
    document.body.innerHTML = ''
    await mount([item()])
    expect(node).toHaveBeenCalledTimes(2)
  })
})

describe('SectionGoods: 200 товаров', () => {
  it('рендер списка и поиск укладываются в бюджет (jsdom — верхняя граница для браузера)', async () => {
    const many = Array.from({ length: 200 }, (_, i) => item({
      description: `ТОВАР ${i + 1}`, tnvedCode: `84713${String(i).padStart(5, '0')}`, needsTpinRecalc: i % 7 === 0,
    }))
    const t0 = performance.now()
    await mount(many)
    const mountMs = performance.now() - t0
    expect(rows()).toHaveLength(200)
    const input = w.get('input[data-goods-search]')
    const t1 = performance.now()
    await input.setValue('ТОВАР 19')
    await settle()
    const searchMs = performance.now() - t1
    expect(rows().length).toBe(11) // 19, 190–199
    const t2 = performance.now()
    await input.setValue('')
    await settle()
    const resetMs = performance.now() - t2
    const t3 = performance.now()
    await check(5)
    const selectMs = performance.now() - t3
    // Правка одного поля товара (как ввод в редакторе) → таблица обновилась
    const t4 = performance.now()
    form.goodsItems[7].customsValue = 12345
    await nextTick()
    const editMs = performance.now() - t4
    expect(cellTexts(7)[5]).toBe('12 345,00')
    console.info(`[perf 200] mount ${mountMs.toFixed(0)} ms, search ${searchMs.toFixed(0)} ms, reset ${resetMs.toFixed(0)} ms, select ${selectMs.toFixed(0)} ms, edit ${editMs.toFixed(0)} ms`)
    expect(rows()).toHaveLength(200)
    expect(searchMs).toBeLessThan(1500)
    expect(selectMs).toBeLessThan(1500)
  }, 30_000)
})
