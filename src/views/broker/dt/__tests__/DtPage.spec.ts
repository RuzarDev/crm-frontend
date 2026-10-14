import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import { vUppercase } from '@/directives/uppercase'
import type { Import40CaseDto, KedenReadinessDto } from '@/api/import40'
import { caseDto, fullDto, fullGoodsDto } from './dtFixture'
import { dtsGoods, dtsSheet, dtsView } from '../dts/__tests__/dtsFixture'

const api = vi.hoisted(() => ({
  get: vi.fn(), updateDeclaration: vi.fn(), kedenReadiness: vi.fn(), ratesOnDate: vi.fn(),
  downloadKedenXml: vi.fn(), blankPdf: vi.fn(), downloadAllDocuments: vi.fn(),
  splitSuggestion: vi.fn(), splitDeclaration: vi.fn(), calculatePayments: vi.fn(), calculateCustomsValue: vi.fn(),
}))
const dts = vi.hoisted(() => ({ get: vi.fn(), pdf: vi.fn(), xml: vi.fn() }))
const refs = vi.hoisted(() => ({ listCountries: vi.fn(), listCustomsPosts: vi.fn(), listExpenseTypes: vi.fn(), listOkeiUnits: vi.fn(async () => []) }))
// Редактор товара: проверка кода, ДЕИ и ставки КЕДЕН — без сети.
const tnved = vi.hoisted(() => ({
  currencies: vi.fn(),
  node: vi.fn(async (code: string) => ({ data: { code, name: 'УЗЕЛ', is10: true } })),
  rates: vi.fn(async () => ({ data: {} })),
  tariffOptions: vi.fn(async () => ({ data: { countryRate: null, excise: [], antiDumping: [], dutyRates: [] } })),
}))
const contract = vi.hoisted(() => ({ getProfile: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/import40', async (orig) => ({ ...(await orig<typeof import('@/api/import40')>()), import40Api: api }))
vi.mock('@/api/dts', () => ({ dtsApi: dts }))
vi.mock('@/api/references', () => ({ referencesApi: refs }))
vi.mock('@/api/tnved', () => ({ tnvedApi: tnved }))
vi.mock('@/api/trois', async (orig) => ({ ...(await orig<typeof import('@/api/trois')>()), troisApi: { check: vi.fn(async () => []), search: vi.fn(async () => []) } }))
vi.mock('@/api/kedenProcedureLists', async (orig) => ({ ...(await orig<typeof import('@/api/kedenProcedureLists')>()), kedenProcedureListsApi: { get: vi.fn(async () => ({})) } }))
vi.mock('@/api/import40Contract', () => ({ import40ContractApi: contract }))
vi.mock('@/api/prohibitionCodes', () => ({ prohibitionCodesApi: { list: vi.fn(async () => []), suggest: vi.fn(async () => ({ tnved: '', codes: [], fetchedAtUtc: null, stale: false, warning: null })) } }))
vi.mock('@/ui/message', () => ({ message: toast }))
vi.mock('@/stores/classifiers', () => ({ useClassifiersStore: () => ({ loadMany: vi.fn(async () => undefined), load: vi.fn(async () => []), cache: {}, options: () => [] }) }))
const brokerFirms = vi.hoisted(() => ({ listBrokerFirms: vi.fn(), getBrokerFirmByBin: vi.fn(), upsertBrokerFirm: vi.fn() }))
vi.mock('@/api/brokerFirms', () => brokerFirms)
vi.mock('@/api/kato', async (orig) => ({ ...(await orig<typeof import('@/api/kato')>()), katoApi: { search: vi.fn(async () => []), get: vi.fn(async () => null) } }))

import DtPage from '../DtPage.vue'
import { useAuthStore } from '@/stores/auth'
import { confirmState } from '@/ui/confirm'
import { resetDtTnvedCheckCache } from '../goods/tnvedCodeCheck'

// Прежние разделы — заглушки: видно, какой смонтирован; у «Сторон» есть поле гр. 8 (переход «к недостающему»);
// кнопки data-emit шлют события прежних разделов (проверка, что страница их слушает).
const sectionStub = (name: string, inner = '', emits: string[] = []) => defineComponent({
  name,
  props: ['modelValue', 'form', 'readonly', 'reloadKey', 'save'],
  emits: ['update:modelValue', ...emits],
  template: `<div data-stub="${name}" :data-readonly="String(readonly)" :data-reload-key="reloadKey">${inner}</div>`,
})
// Товары: две страны происхождения (гр. 16 → «000»), «Рассчитать». Раздел правит товары
// через модель страницы (useDtGoods) на месте — как настоящий SectionGoods.
const goodsStub = defineComponent({
  name: 'SectionGoods',
  props: ['model', 'readonly', 'currency', 'dtNumber', 'countryOptions', 'paymentsLoading'],
  emits: ['calc-payments'],
  setup(props) {
    const mixed = () => {
      const items = props.model.items.value as { countryOfOrigin: string | null }[]
      items.forEach((g, i) => { g.countryOfOrigin = i ? 'DE' : 'CN' })
      if (items.length < 2) props.model.append([{ ...items[0], countryOfOrigin: 'DE' }])
    }
    return { mixed }
  },
  template: `<div data-stub="SectionGoods" :data-readonly="String(readonly)">
    <button data-goods-mixed type="button" @click="mixed" />
    <button data-goods-remove-first type="button" @click="model.remove([0])" />
    <button data-emit="calc-payments" type="button" @click="$emit('calc-payments')" />
  </div>`,
})
const stubs = {
  SectionNumber: sectionStub('SectionNumber'),
  SectionGeneral: sectionStub('SectionGeneral'),
  SectionParties: sectionStub('SectionParties', '<label data-graph="8">Получатель<input data-recv /></label>'),
  SectionCountries: sectionStub('SectionCountries'),
  SectionTransport: sectionStub('SectionTransport'),
  // data-set-currency — выбор гр. 22 (раздел пишет в форму страницы, как настоящий).
  SectionFinance: sectionStub('SectionFinance', `<button data-emit="calc-customs-value" type="button" @click="$emit('calc-customs-value')" />
    <button data-set-currency type="button" @click="form.currency = 'EUR'" />`, ['calc-customs-value']),
  SectionCustoms: sectionStub('SectionCustoms'),
  SectionGoods: goodsStub,
  SectionDocs: sectionStub('SectionDocs'),
  SectionDts: sectionStub('SectionDts'),
  SectionClosing: sectionStub('SectionClosing'),
}

const App = defineComponent({ render: () => h(RouterView) })
let w: VueWrapper
let pinia: Pinia
let router: Router
let server: Import40CaseDto

const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await flushPromises()
    await nextTick()
  }
}
const as = (o: { role?: string; permissions?: string[]; userId?: string }) => {
  const auth = useAuthStore()
  auth.role = o.role ?? 'employee'
  auth.businessRole = 'declarant'
  auth.businessRoles = ['declarant']
  auth.permissions = o.permissions ?? ['import40.read', 'import40.declarant']
  auth.userId = o.userId ?? 'me'
}
// real — разделы, которые монтируются настоящими (без заглушки).
const open = async (query = '', real: string[] = []) => {
  await router.push(`/import-40/case1/dt/dt1${query}`)
  await router.isReady()
  const used = Object.fromEntries(Object.entries(stubs).filter(([name]) => !real.includes(name)))
  w = mountWithI18n(App, { attachTo: document.body, global: { plugins: [pinia, router], directives: { uppercase: vUppercase }, stubs: used } })
  await settle()
}
const readinessDto = (o: Partial<KedenReadinessDto> = {}): KedenReadinessDto => ({
  missing: [], filled: 40, total: 46, blankFilled: 40, blankTotal: 46, blankEmptyGraphs: [], items: [], ...o,
} as unknown as KedenReadinessDto)
const navItem = (k: string) => w.get(`[data-dt-nav-item="${k}"]`)
const stub = () => w.find('[data-stub]').attributes('data-stub')
const key = (o: KeyboardEventInit) => window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...o }))

beforeEach(() => {
  resetDtTnvedCheckCache()
  localStorage.clear()
  pinia = createPinia()
  setActivePinia(pinia)
  const page = { template: '<div data-other-page />' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/import-40', component: page },
      { path: '/import-40/:id', component: page },
      { path: '/import-40/:caseId/dt/:dtId', name: 'import-40-dt', component: DtPage },
    ],
  })
  as({})
  server = caseDto({ status: 2, assignedDeclarantId: 'me', declarations: [fullDto({ splitRole: null, rateType: 'ETT' })] })
  api.get.mockImplementation(async () => structuredClone(server))
  api.updateDeclaration.mockImplementation(async () => ({ ...structuredClone(server.declarations[0]), updatedAtUtc: '2026-10-09T13:00:00.000001Z' }))
  api.kedenReadiness.mockResolvedValue(readinessDto({
    missing: ['Гр.8, получатель: дом длиннее 20 знаков', 'Товар 1: код ТНВЭД (гр.33)'],
    items: [
      { text: 'Гр.8, получатель: дом длиннее 20 знаков', graph: '8', goodsIndex: null },
      { text: 'Товар 1: код ТНВЭД (гр.33)', graph: '33', goodsIndex: 0 },
    ],
  }))
  api.ratesOnDate.mockResolvedValue({ rates: { USD: 495.12, EUR: 541.3 }, official: true })
  api.blankPdf.mockResolvedValue({ blob: new Blob(['%PDF']), fileName: 'dt.pdf' })
  dts.get.mockResolvedValue({ sheet: {}, missing: ['ДТС: нет места'], mismatchGoods: [], items: [{ text: 'ДТС: нет места', graph: 'ДТС', goodsIndex: null }] })
  refs.listCountries.mockResolvedValue([])
  refs.listCustomsPosts.mockResolvedValue([])
  refs.listExpenseTypes.mockResolvedValue([])
  tnved.currencies.mockResolvedValue({ data: [] })
  contract.getProfile.mockResolvedValue(null)
  brokerFirms.listBrokerFirms.mockResolvedValue([])
  ;(globalThis as { URL: typeof URL }).URL.createObjectURL = vi.fn(() => 'blob:x')
  ;(globalThis as { URL: typeof URL }).URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  confirmState.resolve(false) // незакрытое окно подтверждения (напр. «Печатная форма готова») не переходит в следующий тест
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('DtPage: загрузка', () => {
  it('скелетон, пока ДТ грузится; потом шапка и раздел «Номер и дата»', async () => {
    let release!: (v: Import40CaseDto) => void
    api.get.mockImplementationOnce(() => new Promise((r) => { release = r }))
    await router.push('/import-40/case1/dt/dt1')
    await router.isReady()
    w = mountWithI18n(App, { attachTo: document.body, global: { plugins: [pinia, router], stubs } })
    await settle()
    expect(w.find('[data-dt-skeleton]').exists()).toBe(true)
    expect(w.find('[data-dt-header]').exists()).toBe(false)
    release(structuredClone(server))
    await settle()
    expect(w.find('[data-dt-skeleton]').exists()).toBe(false)
    expect(w.get('[data-dt-number]').text()).toBe('55302/091026/0000123')
    expect(stub()).toBe('SectionNumber')
  })

  it('ошибка загрузки — «Повторить» перечитывает', async () => {
    api.get.mockRejectedValueOnce(Object.assign(new Error('500'), { response: { status: 500 } }))
    await open()
    expect(w.find('[data-dt-load-error]').exists()).toBe(true)
    await w.get('[data-dt-load-retry]').trigger('click')
    await settle()
    expect(w.find('[data-dt-load-error]').exists()).toBe(false)
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('ДТ не найдена — сообщение и переход к списку заявок', async () => {
    server = caseDto({ declarations: [fullDto({ id: 'other' })] })
    await open()
    expect(toast.error).toHaveBeenCalledWith('Декларация не найдена')
    expect(router.currentRoute.value.path).toBe('/import-40')
  })
})

describe('DtPage: разделы и ?s=', () => {
  it('раздел из адреса; клик в навигации меняет ?s= и монтирует раздел', async () => {
    await open('?s=parties')
    expect(stub()).toBe('SectionParties')
    expect(navItem('parties').attributes('aria-current')).toBe('true')
    await navItem('goods').trigger('click')
    await settle()
    expect(router.currentRoute.value.query.s).toBe('goods')
    expect(stub()).toBe('SectionGoods')
    // Первый раздел — без ?s=.
    await navItem('number').trigger('click')
    await settle()
    expect(router.currentRoute.value.query.s).toBeUndefined()
    expect(stub()).toBe('SectionNumber')
  })

  it('Alt+↓ / Alt+↑ — соседний раздел', async () => {
    await open('?s=goods')
    key({ key: 'ArrowDown', altKey: true })
    await settle()
    expect(router.currentRoute.value.query.s).toBe('payments')
    key({ key: 'ArrowUp', altKey: true })
    key({ key: 'ArrowUp', altKey: true })
    await settle()
    expect(stub()).toBe('SectionCustoms')
  })

  it('«Платежи» (гр. 47, В) — между «Товарами» и «Документами», с фактическими платежами гр. В; в «Завершении» их нет', async () => {
    await open('?s=closing')
    expect(stub()).toBe('SectionClosing')
    expect(w.find('[data-dt-fact-payments]').exists()).toBe(false)
    const nav = w.findAll('[data-dt-nav-item]').map((a) => a.attributes('data-dt-nav-item'))
    expect(nav.slice(nav.indexOf('goods'), nav.indexOf('goods') + 3)).toEqual(['goods', 'payments', 'docs'])
    expect(navItem('payments').text()).toContain('гр. 47, В')
    expect(navItem('goods').text()).toContain('гр. 31–46')
    expect(navItem('closing').text()).toContain('гр. 48, 52, 54')
    await navItem('payments').trigger('click')
    await settle()
    expect(w.get('[data-dt-payments]').find('[data-dt-fact-payments]').exists()).toBe(true)
    expect(w.find('[data-payments-calc]').exists()).toBe(true)
    // гр. В сохранённой ДТ — в таблице (строка 1010)
    expect(w.findAll('[data-dt-fact-payments] [data-fact-row]').map((r) => r.attributes('data-fact-row'))).toEqual(['1010'])
  })
})

describe('DtPage: готовность', () => {
  it('отметки разделов по серверу: число, галочка, кружок; ДТС — из GET …/dts', async () => {
    await open()
    expect(api.kedenReadiness).toHaveBeenCalledWith('case1', 'dt1', { silent: true })
    expect(dts.get).toHaveBeenCalledWith('case1', 'dt1', { silent: true })
    expect(navItem('parties').get('[data-dt-nav-count]').text()).toBe('1')
    expect(navItem('goods').get('[data-dt-nav-count]').text()).toBe('1')
    expect(navItem('dts').get('[data-dt-nav-count]').text()).toBe('1')
    expect(navItem('countries').attributes('data-mark')).toBe('done')
    expect(navItem('general').attributes('data-mark')).toBe('unknown')
    // Товар фикстуры помечен «пересчитать ТПиН» — точка «платежи устарели» у раздела «Платежи».
    expect(navItem('payments').find('[data-dt-nav-stale]').exists()).toBe(true)
    expect(navItem('goods').find('[data-dt-nav-stale]').exists()).toBe(false)
  })

  it('клик по пункту «До подачи» — раздел и подсветка поля по data-graph', async () => {
    await open()
    const aside = w.get('[data-dt-panel-aside]')
    expect(aside.findAll('[data-dt-panel-item]')).toHaveLength(3)
    await aside.get('[data-section="parties"]').trigger('click')
    await settle()
    expect(router.currentRoute.value.query.s).toBe('parties')
    const field = w.get('[data-graph="8"]')
    expect(field.attributes('data-dt-flash')).toBeDefined()
    expect(document.activeElement).toBe(w.get('[data-recv]').element)
  })

  it('пункт «До подачи» про товар — раздел «Товары» и этот товар открыт (?item=N)', async () => {
    await open('', ['SectionGoods'])
    await w.get('[data-dt-panel-aside]').get('[data-section="goods"]').trigger('click')
    await settle()
    expect(router.currentRoute.value.query).toMatchObject({ s: 'goods', item: '1' })
    expect(document.querySelector('[data-dt-goods-editor][data-state="open"]')?.textContent).toContain('Товар 1 из 1')
    expect(document.querySelector('[data-dt-goods-editor] [data-goods-index="0"]')).not.toBeNull()
    // Поле пункта (гр. 33) — в редакторе товара: подсветка и фокус в коде ТН ВЭД.
    const code = document.querySelector('[data-dt-goods-editor] [data-goods-index="0"] [data-graph="33"]') as HTMLElement
    expect(code.hasAttribute('data-dt-flash')).toBe(true)
    expect(document.activeElement).toBe(code.querySelector('input[data-f="tnvedCode"]'))
  })

  it('пункт про места товара (гр. 31) — фокус на «Мест», а не на описании (поле по тексту пункта, не только по графе)', async () => {
    const text = 'Товар 1: количество грузовых мест или частично занятых мест (гр.31)'
    api.kedenReadiness.mockResolvedValue(readinessDto({ missing: [text], items: [{ text, graph: '31', goodsIndex: 0 }] }))
    await open('', ['SectionGoods'])
    await w.get('[data-dt-panel-aside] [data-dt-panel-item]').trigger('click')
    await settle()
    const places = document.querySelector('[data-dt-goods-editor] [data-goods-index="0"] [data-goods-field="packagesCount"]') as HTMLElement
    expect(places.hasAttribute('data-dt-flash')).toBe(true)
    expect(document.activeElement).toBe(places.querySelector('input'))
  })

  it('пункт «нет ни одной строки платежа (гр.47)» — раздел «Платежи» (волна 6в)', async () => {
    const text = 'Товар 1: нет ни одной строки платежа (гр.47)'
    api.kedenReadiness.mockResolvedValue(readinessDto({ missing: [text], items: [{ text, graph: '47', goodsIndex: 0 }] }))
    await open('', ['SectionGoods'])
    expect(navItem('payments').get('[data-dt-nav-count]').text()).toBe('1')
    await w.get('[data-dt-panel-aside] [data-dt-panel-item]').trigger('click')
    await settle()
    expect(router.currentRoute.value.query).toEqual({ s: 'payments' })
    expect(w.find('[data-dt-payments]').exists()).toBe(true)
  })

  it('пункт «гр. 36 вне списка КЕДЕН» — фокус на поле названной льготы (пошлина), а не на первом поле гр. 36', async () => {
    const text = 'Товар 1: КЕДЕН при процедуре ИМ40 не предлагает гр.36 пошлина «ПП» (есть: ОО, Z)'
    api.kedenReadiness.mockResolvedValue(readinessDto({ missing: [text], items: [{ text, graph: '36', goodsIndex: 0 }] }))
    await open('', ['SectionGoods'])
    await w.get('[data-dt-panel-aside] [data-dt-panel-item]').trigger('click')
    await settle()
    const duty = document.querySelector('[data-dt-goods-editor] [data-goods-index="0"] [data-goods-field="prefDutyCode"]') as HTMLElement
    expect(duty.hasAttribute('data-dt-flash')).toBe(true)
    expect(duty.contains(document.activeElement)).toBe(true)
  })

  it('пункт без названного поля — фокус на поле графы с предупреждением (data-z-status у ZField), а не на первом', async () => {
    server = caseDto({
      status: 2, assignedDeclarantId: 'me',
      declarations: [fullDto({ splitRole: null, goodsItems: [fullGoodsDto({ oisRegNumber: 'ПЛОХОЙ' })] })],
    })
    const text = 'Товар 1: проверьте сведения (гр.33)'
    api.kedenReadiness.mockResolvedValue(readinessDto({ missing: [text], items: [{ text, graph: '33', goodsIndex: 0 }] }))
    await open('', ['SectionGoods'])
    await w.get('[data-dt-panel-aside] [data-dt-panel-item]').trigger('click')
    await settle()
    const reg = document.querySelector('[data-dt-goods-editor] [data-goods-index="0"] [data-goods-field="oisRegNumber"]') as HTMLElement
    expect(reg.querySelector(':scope > [data-z-status="warning"]')).not.toBeNull()
    expect(reg.hasAttribute('data-dt-flash')).toBe(true)
    expect(reg.contains(document.activeElement)).toBe(true)
  })

  it('пункт «коды запретов (гр.33)» — фокус в поле кодов гр. 33, а не в коде ТН ВЭД (тоже гр. 33)', async () => {
    const text = 'Товар 1: коды запретов и ограничений (гр.33) — хотя бы один, например C1700 / D0100'
    api.kedenReadiness.mockResolvedValue(readinessDto({ missing: [text], items: [{ text, graph: '33', goodsIndex: 0 }] }))
    await open('', ['SectionGoods'])
    await w.get('[data-dt-panel-aside] [data-dt-panel-item]').trigger('click')
    await settle()
    const codes = document.querySelector('[data-dt-goods-editor] [data-goods-index="0"] [data-goods-field="prohibitionCode"]') as HTMLElement
    expect(codes.hasAttribute('data-dt-flash')).toBe(true)
    expect(document.activeElement).toBe(codes.querySelector('input[data-f="prohibitionCode"]'))
  })

  it('пункт «гр.31 доп. сведения — маркировка: …» — к маркировке товара', async () => {
    const text = 'Товар 1: гр.31 доп. сведения — маркировка: нет ни одного номера (кода) идентификации'
    api.kedenReadiness.mockResolvedValue(readinessDto({ missing: [text], items: [{ text, graph: '31', goodsIndex: 0 }] }))
    await open('', ['SectionGoods'])
    await w.get('[data-dt-panel-aside] [data-dt-panel-item]').trigger('click')
    await settle()
    const marks = document.querySelector('[data-dt-goods-editor] [data-goods-index="0"] [data-goods-field="markings"]') as HTMLElement
    expect(marks.hasAttribute('data-dt-flash')).toBe(true)
    expect(marks.contains(document.activeElement)).toBe(true)
  })

  it('пункт «гр.31 — строка …: стандарт (ГОСТ) длиннее 40» — к строкам характеристик товара', async () => {
    const text = 'Товар 1: гр.31 — стандарт (ГОСТ) длиннее 40 символов'
    api.kedenReadiness.mockResolvedValue(readinessDto({ missing: [text], items: [{ text, graph: '31', goodsIndex: 0 }] }))
    await open('', ['SectionGoods'])
    await w.get('[data-dt-panel-aside] [data-dt-panel-item]').trigger('click')
    await settle()
    const field = document.querySelector('[data-dt-goods-editor] [data-goods-index="0"] [data-goods-field="characteristics"]') as HTMLElement
    expect(field).not.toBeNull()
    expect(field.hasAttribute('data-dt-flash')).toBe(true)
    expect(field.contains(document.activeElement)).toBe(true)
  })

  it('переход к пункту после несохранённого удаления: открывается тот самый товар (по снимку ответа), удалённый — только раздел', async () => {
    const first = fullGoodsDto()
    server = caseDto({
      status: 2, assignedDeclarantId: 'me',
      declarations: [fullDto({ splitRole: null, goodsItems: [first, { ...first, description: 'ВТОРОЙ' }] })],
    })
    api.kedenReadiness.mockResolvedValue(readinessDto({
      missing: ['Товар 1: код ТНВЭД (гр.33)', 'Товар 2: код ТНВЭД (гр.33)'],
      items: [
        { text: 'Товар 1: код ТНВЭД (гр.33)', graph: '33', goodsIndex: 0 },
        { text: 'Товар 2: код ТНВЭД (гр.33)', graph: '33', goodsIndex: 1 },
      ],
    }))
    await open('?s=goods')
    await w.get('[data-goods-remove-first]').trigger('click')
    await settle()
    const items = () => w.findAll('[data-dt-panel-aside] [data-dt-panel-item]')
    // «Товар 2» ответа — теперь первый в списке
    await items()[1].trigger('click')
    await settle()
    expect(router.currentRoute.value.query).toEqual({ s: 'goods', item: '1' })
    // «Товар 1» ответа удалён — открывается только раздел, без чужого товара
    await router.replace({ query: { s: 'parties' } })
    await settle()
    await items()[0].trigger('click')
    await settle()
    expect(router.currentRoute.value.query).toEqual({ s: 'goods' })
  })

  it('товар открыт — переход в другой раздел убирает ?item', async () => {
    await open('?s=goods&item=1', ['SectionGoods'])
    expect(router.currentRoute.value.query.item).toBe('1')
    // Alt+↓ при открытом товаре — не смена раздела (панель товара — окно; соседний товар — Task 3)
    key({ key: 'ArrowDown', altKey: true })
    await settle()
    expect(router.currentRoute.value.query).toEqual({ s: 'goods', item: '1' })
    await navItem('docs').trigger('click')
    await settle()
    expect(router.currentRoute.value.query).toEqual({ s: 'docs' })
  })

  it('уже 1280 — «До подачи» из шапки открывает выезжающую панель', async () => {
    await open()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    await w.get('[data-dt-panel-toggle]').trigger('click')
    await settle()
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).not.toBeNull()
    expect(dialog.querySelector('[data-dt-panel-readiness]')).not.toBeNull()
    expect(dialog.querySelectorAll('[data-dt-panel-item]')).toHaveLength(3)
  })

  it('без права декларанта: готовность и ДТС не запрашиваются, раздела ДТС нет, панели нет', async () => {
    as({ permissions: ['import40.read'] })
    await open()
    expect(api.kedenReadiness).not.toHaveBeenCalled()
    expect(dts.get).not.toHaveBeenCalled()
    expect(w.find('[data-dt-nav-item="dts"]').exists()).toBe(false)
    // Курсы НБ РК на дату гр. А — всем, кто открыл ДТ; списка «До подачи» нет.
    const aside = w.get('[data-dt-panel-aside]')
    expect(aside.find('[data-dt-panel-readiness]').exists()).toBe(false)
    expect(aside.find('[data-dt-panel-rates]').exists()).toBe(true)
    expect(aside.findAll('[data-dt-rate]').map((r) => r.text().slice(0, 3))).toEqual(['USD', 'EUR'])
    expect(w.get('[data-dt-panel-toggle]').text()).toBe('Курсы НБ РК')
    expect(toast.error).not.toHaveBeenCalled()
  })
})

describe('DtPage: настоящие разделы «Номер», «Общие», «Страны»', () => {
  it('«Номер и дата»: посты страницы, правка цифр меняет номер в шапке и ставит «Есть несохранённые»', async () => {
    refs.listCustomsPosts.mockResolvedValue([{ name: '55302 — Т/П «Алматы-Центр»' }])
    await open('', ['SectionNumber'])
    const post = w.get('[data-dt-number-section] input[role="combobox"]')
    expect((post.element as HTMLInputElement).value).toBe('55302 — Т/П «Алматы-Центр»')
    const tail = w.get('input[placeholder="0000000"]')
    ;(tail.element as HTMLInputElement).value = '0000777'
    await tail.trigger('input')
    await settle()
    expect(w.get('[data-dt-number]').text()).toBe('55302/091026/0000777')
    expect(w.get('[data-dt-number-result]').text()).toBe('55302/091026/0000777')
    expect(w.get('[data-dt-header]').text()).toContain('Есть несохранённые изменения')
  })

  it('«к недостающему»: пункт гр. А — подсветка и фокус на посте подачи', async () => {
    api.kedenReadiness.mockResolvedValue(readinessDto({
      missing: ['Гр.А: номер ДТ'], items: [{ text: 'Гр.А: номер ДТ', graph: 'А', goodsIndex: null }],
    }))
    await open('', ['SectionNumber'])
    await w.get('[data-dt-panel-aside] [data-dt-panel-item]').trigger('click')
    await settle()
    const field = w.get('[data-graph="А"]')
    expect(field.attributes('data-dt-flash')).toBeDefined()
    expect(document.activeElement).toBe(field.get('input').element)
  })

  it('«Общие» и «Страны» в просмотре: поля с data-graph, выбор недоступен', async () => {
    as({ permissions: ['import40.read'] })
    await open('?s=general', ['SectionGeneral', 'SectionCountries'])
    expect(w.findAll('[data-graph="1"]')).toHaveLength(3)
    expect(w.get('[data-graph="1"] input').attributes('disabled')).toBeDefined()
    await navItem('countries').trigger('click')
    await settle()
    expect(w.get('[data-dt-countries]').exists()).toBe(true)
    expect(w.findAll('[data-dt-countries] [data-graph]').map((e) => e.attributes('data-graph'))).toEqual(['15', '17', '11', '16'])
    expect(w.get('[data-graph="16"] input').attributes('disabled')).toBeDefined()
  })
})

describe('DtPage: настоящий раздел «Транспорт»', () => {
  it('правка ТС в разделе (номер в верхнем регистре) уходит в PUT', async () => {
    server = caseDto({ declarations: [fullDto({ splitRole: null, inlandTransportModeCode: '30', borderTransportModeCode: '30', arrivalTransportNumbers: [] })] })
    await open('?s=transport', ['SectionTransport'])
    expect(w.find('[data-dt-transport]').exists()).toBe(true)
    await w.get('[data-transport-arrival] [data-transport-add]').trigger('click')
    const num = w.get('[data-transport-arrival] input[data-transport-number]')
    await num.setValue('ab123')
    await settle()
    expect(w.get('[data-dt-header]').text()).toContain('Есть несохранённые изменения')
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    expect(api.updateDeclaration).toHaveBeenCalledTimes(1)
    const body = api.updateDeclaration.mock.calls[0][2] as { arrivalTransportNumbers: { number: string; isTrailer: boolean }[] }
    expect(body.arrivalTransportNumbers).toMatchObject([{ number: 'AB123', isTrailer: false }])
  })
})

describe('DtPage: настоящие разделы «Условия и стоимость» и «Органы и место товаров»', () => {
  const finance = () => w.get('[data-dt-finance]')

  it('результат «Рассчитать там. стоимость» показан в разделе, не только тостом', async () => {
    api.calculateCustomsValue.mockResolvedValue({ goods: [{ index: 0, customsValueKzt: 700000 }] })
    await open('?s=finance', ['SectionFinance'])
    expect(w.find('[data-recalc-result]').exists()).toBe(false)
    await w.get('[data-calc-customs-value]').trigger('click')
    await settle()
    expect(api.calculateCustomsValue).toHaveBeenCalledWith(expect.objectContaining({ onDate: '2026-10-05' }))
    expect(toast.success).toHaveBeenCalled()
    const res = w.get('[data-recalc-result]')
    expect(res.text()).toContain('Гр. 45 пересчитана: товаров — 1')
    expect(res.text().replace(/\s/g, ' ')).toContain('700 000,00 ₸')
    // Платежи (гр. 47) этой кнопкой не считаются.
    expect(api.calculatePayments).not.toHaveBeenCalled()
  })

  it('гр. 12: после загрузки — по сохранённой ДТ, после правки — предварительно', async () => {
    server = caseDto({ status: 2, assignedDeclarantId: 'me', declarations: [fullDto({ splitRole: null, rateType: 'ETT', totalSheets: 1 })] })
    await open('?s=finance', ['SectionFinance'])
    expect(w.get('[data-customs-value]').attributes('data-source')).toBe('server')
    expect(w.get('[data-customs-value-tag]').text()).toBe('по сохранённой ДТ')
    await w.get('[data-exchange-rate]').setValue('500')
    await w.get('[data-exchange-rate]').trigger('blur')
    await settle()
    expect(w.get('[data-customs-value]').attributes('data-source')).toBe('preview')
    expect(w.get('[data-customs-value-tag]').text()).toBe('предварительно')
  })

  it('тип ставок — тегом; «Ещё» со сменой — только администратору', async () => {
    server = caseDto({ status: 2, assignedDeclarantId: 'me', declarations: [fullDto({ splitRole: null, rateType: 'EATT', totalSheets: 1 })] })
    await open('?s=finance', ['SectionFinance'])
    expect(w.get('[data-rate-type-tag]').text()).toBe('ВТО')
    expect(finance().find('[data-rate-type] input').exists()).toBe(false)
    expect(w.find('[data-rate-type-more]').exists()).toBe(false)
    w.unmount()
    as({ role: 'administrator' })
    await open('?s=finance', ['SectionFinance'])
    expect(w.find('[data-rate-type-more]').exists()).toBe(true)
  })

  it('«Органы»: правка номера СВХ и кода 52 уходит в PUT; открытие раздела форму не меняет', async () => {
    server = caseDto({ status: 2, assignedDeclarantId: 'me', declarations: [fullDto({ splitRole: null, rateType: 'ETT', totalSheets: 1 })] })
    await open('?s=customs', ['SectionCustoms'])
    expect(w.get('[data-dt-header]').text()).not.toContain('Есть несохранённые изменения')
    await w.get('[data-on-transport]').trigger('click')
    await w.get('[data-location-station]').setValue('ст.аксенгер')
    await settle()
    expect(w.get('[data-dt-header]').text()).toContain('Есть несохранённые изменения')
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    expect(api.updateDeclaration.mock.calls.at(-1)![2]).toMatchObject({ goodsLocationCode: '52', goodsLocationStation: 'СТ.АКСЕНГЕР' })
  })
})

describe('DtPage: настоящий раздел «Стороны»', () => {
  it('открытие не сохраняет; гр. 8 / 9 с «Совпадает» повторяют гр. 14 с загрузки; правка гр. 14 уходит в PUT с копией', async () => {
    // Листы — как считает страница (иначе она сама поправит гр. 3 и пометит ДТ изменённой).
    server = caseDto({ status: 2, assignedDeclarantId: 'me', declarations: [fullDto({ splitRole: null, totalSheets: 1 })] })
    refs.listCountries.mockResolvedValue([
      { id: 'c1', code: '156', name: 'Китай', isActive: true, alpha2: 'CN' },
      { id: 'c2', code: '398', name: 'Казахстан', isActive: true, alpha2: 'KZ' },
    ])
    await open('?s=parties', ['SectionParties'])
    expect(w.get('[data-dt-header]').text()).not.toContain('Есть несохранённые изменения')
    // Старые буквенные коды сторон («CN», «KZ») — по справочнику, как цифровые ОКСМ; форма не меняется.
    expect((w.get('[data-party="sender"] [data-party-input="countryCode"]').element as HTMLInputElement).value).toBe('156 — Китай')
    expect((w.get('[data-party="declarant"] [data-party-input="countryCode"]').element as HTMLInputElement).value).toBe('398 — Казахстан')
    expect(api.updateDeclaration).not.toHaveBeenCalled()
    expect(w.get('[data-party="receiver"] [data-party-same-summary]').text()).toBe('Те же данные, что в гр. 14 · ТОО ДЕКЛАРАНТ · 111111111111')
    await w.get('[data-party="declarant"] [data-party-input="city"]').setValue('караганда')
    await settle()
    expect(w.get('[data-dt-header]').text()).toContain('Есть несохранённые изменения')
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    expect(api.updateDeclaration).toHaveBeenCalledTimes(1)
    expect(api.updateDeclaration.mock.calls[0][2]).toMatchObject({
      declarantCity: 'КАРАГАНДА',
      sender: { countryCode: 'CN' },
      receiver: { name: 'ТОО ДЕКЛАРАНТ', city: 'КАРАГАНДА', street: 'D-STREET' },
      receiverBin: '111111111111',
      receiverKatoCode: '751110002',
      financialSubjectName: 'ТОО ДЕКЛАРАНТ',
      financialSubjectCity: 'КАРАГАНДА',
    })
  })

  it('загрузка, как прежний экран: гр. 8 / 9 с «Совпадает» = гр. 14 и в PUT из другого раздела (без пометки «изменено»)', async () => {
    server = caseDto({ status: 2, assignedDeclarantId: 'me', declarations: [fullDto({ splitRole: null, totalSheets: 1 })] })
    await open()
    expect(w.get('[data-dt-header]').text()).not.toContain('Есть несохранённые изменения')
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    expect(api.updateDeclaration.mock.calls[0][2]).toMatchObject({
      receiver: { name: 'ТОО ДЕКЛАРАНТ', city: 'D-CITY' }, receiverBin: '111111111111', financialSubjectName: 'ТОО ДЕКЛАРАНТ',
    })
  })

  it('без «Совпадает» загрузка гр. 8 / 9 не трогает; к недостающему гр. 8 — фокус в поле', async () => {
    server = caseDto({ declarations: [fullDto({ splitRole: null, consigneeEqualsDeclarant: false, financialSubjectEqualsDeclarant: false })] })
    await open('', ['SectionParties'])
    await w.get('[data-dt-panel-aside] [data-dt-panel-item]').trigger('click')
    await settle()
    const field = w.get('[data-party="receiver"] [data-graph="8"]')
    expect(field.attributes('data-dt-flash')).toBeDefined()
    expect(document.activeElement).toBe(field.get('input').element)
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    expect(api.updateDeclaration.mock.calls[0][2]).toMatchObject({ receiver: { name: 'ТОО ПОЛУЧАТЕЛЬ' }, financialSubjectName: 'ФИНЛИЦО' })
  })
})

describe('DtPage: настоящие разделы «Документы» и «Завершение»', () => {
  it('«Документы»: открытие не сохраняет; правка документа гр. 44 и строки гр. 40 уходит в PUT массивами целиком', async () => {
    server = caseDto({ status: 2, assignedDeclarantId: 'me', declarations: [fullDto({ splitRole: null, totalSheets: 1 })] })
    await open('?s=docs', ['SectionDocs'])
    expect(w.find('[data-dt-docs]').exists()).toBe(true)
    expect(w.get('[data-dt-header]').text()).not.toContain('Есть несохранённые изменения')
    expect(api.updateDeclaration).not.toHaveBeenCalled()
    await w.get('[data-prev-row] input[data-f="docNumber"]').setValue('prev-9')
    await w.get('[data-doc44-row] input[data-f="docNumber"]').setValue('INV-77')
    await settle()
    expect(w.get('[data-dt-header]').text()).toContain('Есть несохранённые изменения')
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    const body = api.updateDeclaration.mock.calls[0][2] as { doc44Items: { docNumber: string }[]; prevDocItems: { docNumber: string; sortOrder: number }[] }
    expect(body.doc44Items.map((d) => d.docNumber)).toEqual(['INV-77'])
    expect(body.prevDocItems).toMatchObject([{ docNumber: 'PREV-9', sortOrder: 0 }])
  })

  it('к недостающему гр. 44 из панели «До подачи» открывает «Документы» и ставит фокус в список', async () => {
    server = caseDto({ status: 2, assignedDeclarantId: 'me', declarations: [fullDto({ splitRole: null, totalSheets: 1 })] })
    api.kedenReadiness.mockResolvedValue(readinessDto({
      missing: ['Гр.44: нет документов'],
      items: [{ text: 'Гр.44: нет документов', graph: '44', goodsIndex: null }],
    }))
    await open('', ['SectionDocs'])
    await w.get('[data-dt-panel-aside] [data-dt-panel-item]').trigger('click')
    await settle()
    expect(router.currentRoute.value.query.s).toBe('docs')
    const field = w.get('[data-graph="44"]')
    expect(field.attributes('data-dt-flash')).toBeDefined()
  })

  it('«Завершение»: открытие не сохраняет и не меняет номер договора, даже при одной фирме в справочнике; правка подписанта — в PUT', async () => {
    server = caseDto({ status: 2, assignedDeclarantId: 'me', declarations: [fullDto({ splitRole: null, totalSheets: 1, brokerContractNumber: null })] })
    brokerFirms.listBrokerFirms.mockResolvedValue([{ id: 'f', name: 'ТОО БРОКЕР', bin: '123456789012', address: null, contractNumber: 'К-1', contractDate: null, contractValidUntil: null, createdAtUtc: '', updatedAtUtc: '' }])
    await open('?s=closing', ['SectionClosing'])
    expect(w.find('[data-dt-closing]').exists()).toBe(true)
    expect(brokerFirms.listBrokerFirms).toHaveBeenCalled()
    expect(w.get('[data-dt-header]').text()).not.toContain('Есть несохранённые изменения')
    expect((w.get('input[data-contract-number]').element as HTMLInputElement).value).toBe('')
    expect(api.updateDeclaration).not.toHaveBeenCalled()
    await w.get('input[data-signatory-name]').setValue('петров п.')
    await settle()
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    expect(api.updateDeclaration.mock.calls[0][2]).toMatchObject({ signatoryFullName: 'ПЕТРОВ П.', brokerContractNumber: null })
  })

  it('просмотр: «Завершение» без справочника фирм-брокеров (он не запрашивается)', async () => {
    server = caseDto({ status: 2, assignedDeclarantId: 'someone-else', declarations: [fullDto({ splitRole: null })] })
    await open('?s=closing', ['SectionClosing'])
    expect(w.find('[data-broker-firm]').exists()).toBe(false)
    expect(brokerFirms.listBrokerFirms).not.toHaveBeenCalled()
  })
})

describe('DtPage: сохранение и режимы', () => {
  it('⌘S / Ctrl+S — сохранить с сообщением', async () => {
    await open()
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    expect(api.updateDeclaration).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('ДТ сохранена')
    key({ key: 's', code: 'KeyS', ctrlKey: true })
    await settle()
    expect(api.updateDeclaration).toHaveBeenCalledTimes(2)
  })

  // Вкладка печати — заглушка окна (window.open по клику, PDF — в её location).
  const fakeTab = () => {
    const tab = { closed: false, location: { href: '' }, document: { title: '', body: { textContent: '' } }, close: vi.fn(() => { tab.closed = true }) }
    return tab
  }

  it('правка: «Печать бланка» сначала сохраняет; сохранение не удалось — бланк не печатается', async () => {
    // Платежи товара записаны и свежие — вопроса о гр. 47 перед печатью нет.
    server = caseDto({ status: 2, assignedDeclarantId: 'me', declarations: [fullDto({ splitRole: null, goodsItems: [fullGoodsDto({ needsTpinRecalc: false })] })] })
    const tabs = [fakeTab(), fakeTab()]
    const openSpy = vi.spyOn(window, 'open').mockReturnValueOnce(tabs[0] as unknown as Window).mockReturnValueOnce(tabs[1] as unknown as Window)
    const printFromMore = async () => {
      await w.get('[data-dt-more]').trigger('keydown', { key: 'Enter' })
      await settle()
      ;([...document.body.querySelectorAll('[role="menuitem"]')].find((i) => i.textContent?.includes('Печать бланка')) as HTMLElement).click()
      await settle()
    }
    await open()
    await printFromMore()
    expect(api.updateDeclaration).toHaveBeenCalledTimes(1)
    expect(api.updateDeclaration.mock.invocationCallOrder[0]).toBeLessThan(api.blankPdf.mock.invocationCallOrder[0])
    expect(api.blankPdf).toHaveBeenCalledWith('case1', 'dt1')
    // (баг, итоговое ревью I2) Вкладка — по клику, до сохранения и PDF (поздний window.open блокируется); PDF — в неё.
    expect(openSpy).toHaveBeenCalledTimes(1)
    expect(openSpy).toHaveBeenCalledWith('', '_blank')
    expect(openSpy.mock.invocationCallOrder[0]).toBeLessThan(api.updateDeclaration.mock.invocationCallOrder[0])
    expect(tabs[0].location.href).toBe('blob:x')
    expect(tabs[0].document.body.textContent).toBe('Готовим печатную форму ДТ…')
    expect(confirmState.open).toBe(false)
    api.updateDeclaration.mockRejectedValueOnce(Object.assign(new Error('500'), { response: { status: 500 } }))
    await printFromMore()
    expect(api.updateDeclaration).toHaveBeenCalledTimes(2)
    expect(api.blankPdf).toHaveBeenCalledTimes(1)
    // Сохранение не удалось — открытая по клику вкладка закрывается.
    expect(openSpy).toHaveBeenCalledTimes(2)
    expect(tabs[1].close).toHaveBeenCalled()
    expect(tabs[1].location.href).toBe('')
    openSpy.mockRestore()
  })

  it('(баг) печать: браузер заблокировал вкладку — окно «Открыть печатную форму», по кнопке — PDF', async () => {
    server = caseDto({ status: 2, assignedDeclarantId: 'me', declarations: [fullDto({ splitRole: null, goodsItems: [fullGoodsDto({ needsTpinRecalc: false })] })] })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    await open()
    await w.get('[data-dt-more]').trigger('keydown', { key: 'Enter' })
    await settle()
    ;([...document.body.querySelectorAll('[role="menuitem"]')].find((i) => i.textContent?.includes('Печать бланка')) as HTMLElement).click()
    await settle()
    expect(api.blankPdf).toHaveBeenCalledTimes(1)
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Печатная форма готова')
    expect(confirmState.content).toContain('блокировка всплывающих окон')
    expect(confirmState.okText).toBe('Открыть печатную форму')
    confirmState.resolve(true)
    await settle()
    expect(openSpy).toHaveBeenLastCalledWith('blob:x', '_blank')
    openSpy.mockRestore()
  })

  // В правке «Печать бланка» — в меню «Ещё».
  const printFromMenu = async () => {
    await w.get('[data-dt-more]').trigger('keydown', { key: 'Enter' })
    await settle()
    ;([...document.body.querySelectorAll('[role="menuitem"]')].find((i) => i.textContent?.includes('Печать бланка')) as HTMLElement).click()
    await settle()
  }

  // (баг 13.10) Бланк печатает только записанные строки гр. 47: у ДТ владельца их не было — «Всего: 0,00» и пустая гр. В.
  it('печать: у товара нет записанных платежей — вопрос; «Печатать как есть» — бланк без расчёта', async () => {
    server = caseDto({ status: 2, assignedDeclarantId: 'me', declarations: [fullDto({ splitRole: null, goodsItems: [fullGoodsDto({ payments: [], needsTpinRecalc: false })] })] })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    await open()
    await printFromMenu()
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Платежи гр. 47 и гр. В не записаны')
    expect(confirmState.content).toContain('У товаров 1 нет записанных строк гр. 47')
    expect(confirmState.okText).toBe('Рассчитать и печатать')
    expect(api.blankPdf).not.toHaveBeenCalled()
    confirmState.resolve(false)
    await settle()
    expect(api.calculatePayments).not.toHaveBeenCalled()
    expect(api.blankPdf).toHaveBeenCalledWith('case1', 'dt1')
    expect(openSpy).toHaveBeenCalledTimes(1)
    openSpy.mockRestore()
  })

  it('(баг) печать: расчёт перед печатью не удался — бланк не печатается, вкладка закрывается', async () => {
    server = caseDto({ status: 2, assignedDeclarantId: 'me', declarations: [fullDto({ splitRole: null, factPayments: [], goodsItems: [fullGoodsDto({ payments: [], needsTpinRecalc: false })] })] })
    api.calculateCustomsValue.mockResolvedValue({ goods: [{ index: 0, customsValueKzt: 841067.1 }] })
    api.calculatePayments.mockRejectedValueOnce(Object.assign(new Error('500'), { response: { status: 500 } }))
    const tab = fakeTab()
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    await open()
    await printFromMenu()
    confirmState.resolve(true)
    await settle()
    await settle()
    expect(api.calculatePayments).toHaveBeenCalledTimes(1)
    expect(api.blankPdf).not.toHaveBeenCalled()
    expect(tab.close).toHaveBeenCalled()
    openSpy.mockRestore()
  })

  it('печать: «Рассчитать и печатать» — расчёт, запись гр. 47 и гр. В, сохранение, затем бланк', async () => {
    server = caseDto({ status: 2, assignedDeclarantId: 'me', declarations: [fullDto({ splitRole: null, factPayments: [], goodsItems: [fullGoodsDto({ payments: [], needsTpinRecalc: false })] })] })
    api.calculateCustomsValue.mockResolvedValue({ goods: [{ index: 0, customsValueKzt: 841067.1 }] })
    api.calculatePayments.mockResolvedValue({
      goodsRows: [{ index: 0, rows: [
        { taxModeCode: '1010', amount: 665.38, rate: 6, rateKind: 'S', rateLabel: '6 МРП' },
        { taxModeCode: '5060', amount: 175442.94, base: 1096518.38, rate: 16, rateKind: '%', rateLabel: '16%' },
      ] }],
      totalsByTaxMode: { 1010: 665.38, 5060: 175442.94 }, grandTotalB: 176109,
    })
    const tab = fakeTab()
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    await open()
    await printFromMenu()
    // С вопросом вкладка открывается по клику ответа — иначе она закрыла бы окно вопроса.
    expect(openSpy).not.toHaveBeenCalled()
    confirmState.resolve(true)
    await settle()
    await settle()
    expect(openSpy).toHaveBeenCalledTimes(1)
    expect(openSpy.mock.invocationCallOrder[0]).toBeLessThan(api.calculatePayments.mock.invocationCallOrder[0])
    expect(api.calculatePayments).toHaveBeenCalledTimes(1)
    expect(api.blankPdf).toHaveBeenCalledTimes(1)
    expect(tab.location.href).toBe('blob:x')
    const lastPut = api.updateDeclaration.mock.calls.at(-1)![2] as { goodsItems: { payments: { taxModeCode: string; amountKzt: number }[] }[]; factPayments: { taxModeCode: string; amount: number }[] }
    expect(lastPut.goodsItems[0].payments.map((p) => [p.taxModeCode, p.amountKzt])).toEqual([['1010', 665.38], ['5060', 175442.94]])
    expect(lastPut.factPayments.map((p) => [p.taxModeCode, p.amount])).toEqual([['1010', 666], ['5060', 175443]])
    expect(api.updateDeclaration.mock.invocationCallOrder.at(-1)!).toBeLessThan(api.blankPdf.mock.invocationCallOrder[0])
    expect(api.calculatePayments.mock.invocationCallOrder[0]).toBeLessThan(api.blankPdf.mock.invocationCallOrder[0])
    openSpy.mockRestore()
  })

  it('печать: расчёт готов, но не записан — «Записать и печатать» пишет предпросмотр без нового расчёта', async () => {
    server = caseDto({ status: 2, assignedDeclarantId: 'me', declarations: [fullDto({ splitRole: null, factPayments: [], goodsItems: [fullGoodsDto({ payments: [], needsTpinRecalc: false })] })] })
    api.calculateCustomsValue.mockResolvedValue({ goods: [{ index: 0, customsValueKzt: 750000 }] })
    api.calculatePayments.mockResolvedValue({ goodsRows: [{ index: 0, rows: [{ taxModeCode: '5060', amount: 84000 }] }], totalsByTaxMode: { 5060: 84000 }, grandTotalB: 84000 })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    await open('?calc=payments')
    expect(w.get('[data-dt-payments]').attributes('data-state')).toBe('preview')
    await printFromMenu()
    expect(confirmState.okText).toBe('Записать и печатать')
    expect(confirmState.content).toContain('не записан')
    confirmState.resolve(true)
    await settle()
    await settle()
    expect(api.calculatePayments).toHaveBeenCalledTimes(1)
    const lastPut = api.updateDeclaration.mock.calls.at(-1)![2] as { goodsItems: { payments: { taxModeCode: string }[] }[] }
    expect(lastPut.goodsItems[0].payments.map((p) => p.taxModeCode)).toEqual(['5060'])
    expect(api.blankPdf).toHaveBeenCalledTimes(1)
    openSpy.mockRestore()
  })

  it('просмотр (закреплена за другим): плашка с ФИО и этапом, печать без PUT, ⌘S не сохраняет', async () => {
    server = caseDto({
      status: 3, assignedDeclarantId: 'other', assignedDeclarantName: 'Сейткали Д.',
      declarations: [fullDto({ splitRole: null })],
    })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    await open()
    const banner = w.get('[data-dt-banner-view]').text()
    expect(banner).toContain('Сейткали Д.')
    expect(banner).toContain('ДТ подана')
    expect(w.find('[data-dt-save]').exists()).toBe(false)
    // «Разделить на ЕТТ/ВТО» виден и в просмотре — выключен, с причиной (фидбек №17).
    await w.get('[data-dt-more]').trigger('keydown', { key: 'Enter' })
    await settle()
    const item = [...document.body.querySelectorAll('[role="menuitem"]')].find((i) => i.textContent?.includes('Разделить на ЕТТ/ВТО')) as HTMLElement
    expect(item.getAttribute('data-disabled')).not.toBeNull()
    expect(item.querySelector('[data-z-dropdown-hint]')?.textContent).toBe('Декларация закреплена за другим декларантом — разделение недоступно')
    expect([...document.body.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent?.trim())).not.toContain('Печать бланка')
    key({ key: 'Escape' })
    await w.get('[data-dt-print]').trigger('click')
    await settle()
    expect(api.blankPdf).toHaveBeenCalledWith('case1', 'dt1')
    expect(openSpy).toHaveBeenCalled()
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    expect(api.updateDeclaration).not.toHaveBeenCalled()
    await navItem('dts').trigger('click')
    await settle()
    expect(w.get('[data-stub="SectionDts"]').attributes('data-readonly')).toBe('true')
    openSpy.mockRestore()
  })

  it('разделённая ДТ: плашка со ссылками на ЕТТ и ВТО, тег «Разделена», правка и XML закрыты', async () => {
    server = caseDto({
      status: 2, assignedDeclarantId: 'me',
      declarations: [
        fullDto({ isSplitReplaced: true }),
        fullDto({ id: 'e1', declarationNumber: '55302/091026/0001235', splitSourceDeclarationId: 'dt1', splitRole: 'ETT' }),
        fullDto({ id: 'v1', declarationNumber: '55302/091026/0001236', splitSourceDeclarationId: 'dt1', splitRole: 'VTO' }),
      ],
    })
    await open()
    const banner = w.get('[data-dt-banner-split]')
    expect(banner.get('[data-dt-split-ett]').attributes('href')).toBe('/import-40/case1/dt/e1')
    expect(banner.get('[data-dt-split-vto]').attributes('href')).toBe('/import-40/case1/dt/v1')
    expect(w.get('[data-dt-tag]').text()).toBe('Разделена')
    expect(w.find('[data-dt-banner-view]').exists()).toBe(false)
    expect(w.find('[data-dt-xml]').exists()).toBe(false)
    expect(w.find('[data-dt-save]').exists()).toBe(false)
    // Заменённая ДТ из выгрузки исключена — готовность и ДТС не спрашиваем, курсы остаются.
    expect(api.kedenReadiness).not.toHaveBeenCalled()
    expect(dts.get).not.toHaveBeenCalled()
    expect(w.get('[data-dt-panel-aside]').find('[data-dt-panel-readiness]').exists()).toBe(false)
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    expect(api.updateDeclaration).not.toHaveBeenCalled()
  })

  it('XML с ошибками — пункты из ответа в панели; после сохранения — снова готовность', async () => {
    api.downloadKedenXml.mockResolvedValue({ errors: ['Гр.8, получатель: дом длиннее 20 знаков', 'Что-то без графы'] })
    await open()
    await w.get('[data-dt-xml]').trigger('click')
    await settle()
    expect(api.updateDeclaration).toHaveBeenCalledTimes(1) // сохранение перед выгрузкой
    expect(toast.warning).toHaveBeenCalledWith('XML не сформирован: заполните обязательные поля')
    const items = w.get('[data-dt-panel-aside]').findAll('[data-dt-panel-item]')
    // 2 ошибки XML + пункт ДТС.
    expect(items.map((i) => i.attributes('data-section'))).toEqual(['parties', 'general', 'dts'])
    // Следующее сохранение — ошибки XML устарели, снова серверная готовность (B1).
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    const fresh = w.get('[data-dt-panel-aside]').findAll('[data-dt-panel-item]')
    expect(fresh.map((i) => i.attributes('data-section'))).toEqual(['parties', 'goods', 'dts'])
  })

  it('409: плашка «изменена в другом окне»; «Перезагрузить» с несохранённым — сначала подтверждение', async () => {
    api.updateDeclaration.mockRejectedValueOnce(Object.assign(new Error('409'), { response: { status: 409, data: { detail: 'Изменена' } } }))
    await open()
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    expect(w.find('[data-dt-conflict]').exists()).toBe(true)
    expect(w.get('[data-dt-save-state]').text()).toBe('Не сохранено')
    await w.get('[data-dt-conflict-reload]').trigger('click')
    await settle()
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Перезагрузить ДТ?')
    confirmState.resolve(false)
    await settle()
    expect(api.get).toHaveBeenCalledTimes(1)
    await w.get('[data-dt-conflict-reload]').trigger('click')
    await settle()
    confirmState.resolve(true)
    await settle()
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(w.find('[data-dt-conflict]').exists()).toBe(false)
  })

  it('?calc=payments после разделения — «Платежи», расчёт (гр. 45 → сохранить → расчёт) и адрес без параметра', async () => {
    api.calculateCustomsValue.mockResolvedValue({ goods: [{ index: 0, customsValueKzt: 700000 }] })
    api.calculatePayments.mockResolvedValue({ goodsRows: [{ index: 0, rows: [{ taxModeCode: '5060', amount: 84000 }] }], totalsByTaxMode: { 5060: 84000 }, grandTotalB: 84000 })
    await open('?calc=payments')
    expect(router.currentRoute.value.query).toEqual({ s: 'payments' })
    expect(api.calculateCustomsValue).toHaveBeenCalledTimes(1)
    expect(api.updateDeclaration).toHaveBeenCalledTimes(1)
    expect(api.calculatePayments).toHaveBeenCalledWith('case1', 'dt1')
    expect(api.calculateCustomsValue.mock.invocationCallOrder[0]).toBeLessThan(api.updateDeclaration.mock.invocationCallOrder[0])
    expect(api.updateDeclaration.mock.invocationCallOrder[0]).toBeLessThan(api.calculatePayments.mock.invocationCallOrder[0])
    // гр. 45 шага 1 — в сохранённой перед расчётом ДТ
    expect((api.updateDeclaration.mock.calls[0][2] as { goodsItems: { customsValueKzt: number }[] }).goodsItems[0].customsValueKzt).toBe(700000)
    expect(w.get('[data-dt-payments]').attributes('data-state')).toBe('preview')
    expect(w.get('[data-payments-total="5060"]').text()).toMatch(/НДС\s*84\s000\s₸/)
  })

  it('?calc=payments в просмотре — без расчёта и сохранения', async () => {
    server = caseDto({ status: 2, assignedDeclarantId: 'someone-else', declarations: [fullDto({ splitRole: null })] })
    await open('?calc=payments')
    expect(router.currentRoute.value.query.calc).toBeUndefined()
    expect(api.calculateCustomsValue).not.toHaveBeenCalled()
    expect(api.calculatePayments).not.toHaveBeenCalled()
    expect(api.updateDeclaration).not.toHaveBeenCalled()
  })

  it('успешная выгрузка XML: сохранить, скачать, сообщение с подсказкой про гр. 54, свежая готовность', async () => {
    api.downloadKedenXml.mockResolvedValue({ blob: new Blob(['<xml/>']), fileName: 'dt.xml' })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await open()
    expect(api.kedenReadiness).toHaveBeenCalledTimes(1)
    await w.get('[data-dt-xml]').trigger('click')
    await settle()
    expect(api.updateDeclaration).toHaveBeenCalledTimes(1)
    expect(api.downloadKedenXml).toHaveBeenCalledWith('case1', 'dt1')
    expect(click).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('XML для КЕДЕН сформирован'), duration: 8 }))
    // После сохранения (afterSave) и после выгрузки — готовность перечитана.
    expect(api.kedenReadiness.mock.calls.length).toBeGreaterThanOrEqual(3)
    click.mockRestore()
  })

  it('после разделения — переход в ДТ ВТО; платежи не пересчитаны — с ?calc=payments', async () => {
    api.splitSuggestion.mockResolvedValue([{ sortOrder: 0, tnvedCode: '7318150000', vtoStatus: 'ВТО', isVtoCandidate: true }])
    api.splitDeclaration.mockResolvedValue({ originalDeclarationId: 'dt1', ettDeclarationId: null, vtoDeclarationId: 'v1', paymentsRecalculated: false })
    await open()
    await w.get('[data-dt-more]').trigger('keydown', { key: 'Enter' })
    await settle()
    ;([...document.body.querySelectorAll('[role="menuitem"]')].find((i) => i.textContent?.includes('Разделить')) as HTMLElement).click()
    await settle()
    expect(api.updateDeclaration).toHaveBeenCalledTimes(1) // сохранение перед подсказкой
    ;([...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Создать ДТ ВТО') as HTMLButtonElement).click()
    await settle()
    expect(api.splitDeclaration).toHaveBeenCalledWith('case1', 'dt1', { vtoGoodSortOrders: [0] })
    expect(toast.warning).toHaveBeenCalledWith('Платежи в новых ДТ посчитать не удалось — откройте их и нажмите «Рассчитать платежи»')
    expect(toast.success).toHaveBeenCalledWith('Создана ДТ по ставкам ВТО, платежи пересчитаны по пониженной ставке')
    expect(router.currentRoute.value.path).toBe('/import-40/case1/dt/v1')
    expect(router.currentRoute.value.query.calc).toBe('payments')
  })
})

describe('DtPage: переход к полю со справкой по графе', () => {
  it('гр. 17 («Страны»): фокус на выборе страны, а не на «?» справки', async () => {
    api.kedenReadiness.mockResolvedValue(readinessDto({
      missing: ['Страна назначения (гр.17)'], items: [{ text: 'Страна назначения (гр.17)', graph: '17', goodsIndex: null }],
    }))
    await open('', ['SectionCountries'])
    await w.get('[data-dt-panel-aside] [data-dt-panel-item]').trigger('click')
    await settle()
    const field = w.get('[data-graph="17"]')
    expect(field.find('[data-dt-guide-trigger]').exists()).toBe(true)
    expect(field.attributes('data-dt-flash')).toBeDefined()
    const focused = document.activeElement as HTMLElement
    expect(field.element.contains(focused)).toBe(true)
    expect(focused.closest('[data-dt-guide-trigger]')).toBeNull()
  })
})

describe('DtPage: события прежних разделов', () => {
  const emit = async (name: string) => {
    await w.get(`[data-emit="${name}"]`).trigger('click')
    await settle()
  }

  it('«Рассчитать там. стоимость» (Условия) — пересчёт гр. 45 на дату гр. А', async () => {
    api.calculateCustomsValue.mockResolvedValue({ goods: [{ index: 0, customsValueKzt: 700000 }] })
    await open('?s=finance')
    await emit('calc-customs-value')
    expect(api.calculateCustomsValue).toHaveBeenCalledWith(expect.objectContaining({ onDate: '2026-10-05' }))
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Таможенная стоимость рассчитана (1 тов.)'))
  })

  it('«Рассчитать» в итогах товаров — «Платежи» и расчёт с предпросмотром', async () => {
    api.calculateCustomsValue.mockResolvedValue({ goods: [{ index: 0, customsValueKzt: 700000 }] })
    api.calculatePayments.mockResolvedValue({ goodsRows: [{ index: 0, rows: [], error: 'Нет кода ТН ВЭД' }], totalsByTaxMode: {}, grandTotalB: 0 })
    await open('?s=goods')
    await emit('calc-payments')
    expect(router.currentRoute.value.query.s).toBe('payments')
    expect(api.calculatePayments).toHaveBeenCalledTimes(1)
    expect(w.find('[data-payments-preview]').exists()).toBe(true)
    // ошибка расчёта — в карточке товара, товар — в списке «не пересчитаны»
    expect(w.get('[data-payments-goods][data-goods-index="0"] [data-payments-goods-issue]').text()).toContain('Нет кода ТН ВЭД — платежи не рассчитаны')
    expect(w.get('[data-payments-not-recalculated]').text()).toContain('товары 1')
  })

  it('авто гр. 16: разные страны происхождения у товаров — «000»', async () => {
    await open('?s=goods')
    await w.get('[data-goods-mixed]').trigger('click')
    await settle()
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    expect(api.updateDeclaration.mock.calls.at(-1)![2]).toMatchObject({ originCountryCode: '000' })
  })

  it('«Рассчитать платежи» в шапке → «Платежи» → предпросмотр → «Записать в гр. 47 и гр. В» — гр. 47 и гр. В в PUT', async () => {
    api.calculateCustomsValue.mockResolvedValue({ goods: [{ index: 0, customsValueKzt: 700000 }] })
    api.calculatePayments.mockResolvedValue({
      goodsRows: [{ index: 0, rows: [{ taxModeCode: '1010', amount: 8650 }, { taxModeCode: '5060', amount: 84000, base: 700000, rate: 12 }] }],
      totalsByTaxMode: { 1010: 8650, 5060: 84000 },
      grandTotalB: 92650,
    })
    await open()
    await w.get('[data-dt-calc-payments]').trigger('click')
    await settle()
    expect(router.currentRoute.value.query.s).toBe('payments')
    expect(api.updateDeclaration).toHaveBeenCalledTimes(1)
    expect(w.get('[data-dt-payments]').attributes('data-state')).toBe('preview')
    await w.get('[data-payments-apply]').trigger('click')
    await settle()
    expect(api.updateDeclaration).toHaveBeenCalledTimes(2)
    const body = api.updateDeclaration.mock.calls[1][2] as { goodsItems: { payments: { taxModeCode: string; amountKzt: number }[]; needsTpinRecalc: boolean }[]; factPayments: { taxModeCode: string; amount: number; paymentMethodCode: string }[] }
    expect(body.goodsItems[0].payments.map((p) => [p.taxModeCode, p.amountKzt])).toEqual(expect.arrayContaining([['1010', 8650], ['5060', 84000]]))
    expect(body.goodsItems[0].needsTpinRecalc).toBe(false)
    expect(body.factPayments.map((p) => [p.taxModeCode, p.amount])).toEqual(expect.arrayContaining([['1010', 8650], ['5060', 84000]]))
    expect(toast.success).toHaveBeenCalledWith('Платежи записаны в гр. 47 и гр. В')
    expect(w.get('[data-dt-payments]').attributes('data-state')).toBe('idle')
    expect(navItem('payments').find('[data-dt-nav-stale]').exists()).toBe(false)
  })

  it('просмотр: «Платежи» без «Рассчитать», в шапке нет «Рассчитать платежи»', async () => {
    server = caseDto({ status: 2, assignedDeclarantId: 'someone-else', declarations: [fullDto({ splitRole: null })] })
    await open('?s=payments')
    expect(w.find('[data-dt-payments]').exists()).toBe(true)
    expect(w.find('[data-payments-calc]').exists()).toBe(false)
    expect(w.find('[data-dt-calc-payments]').exists()).toBe(false)
    // суммы и таблица видны, правок нет
    expect(w.find('[data-dt-fact-payments]').exists()).toBe(true)
    expect(w.find('[data-fact-add]').exists()).toBe(false)
    expect(w.find('[data-fact-remove]').exists()).toBe(false)
    expect(w.get('[data-payments-total="1010"]').text()).toMatch(/3\s₸/)
    expect(w.get('[data-payments-medical]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-payments-recalc]').exists()).toBe(false)
  })
})

// Правила товаров, которые прежний экран выполнял всегда смонтированным разделом «Товары»: теперь — страница.
describe('DtPage: правила товаров без открытия «Товаров»', () => {
  const sheets1 = (goods: Partial<Parameters<typeof fullGoodsDto>[0]> = {}) =>
    caseDto({ status: 2, assignedDeclarantId: 'me', declarations: [fullDto({ splitRole: null, totalSheets: 1, goodsItems: [fullGoodsDto(goods)] })] })
  const lastPutGoods = () => (api.updateDeclaration.mock.calls.at(-1)![2] as { goodsItems: { currency: string | null; statisticValueUsd: number | null }[] }).goodsItems

  it('гр. 22 в «Условиях» — валюта товаров в расчёте там. стоимости, в PUT и перед XML', async () => {
    server = sheets1()
    api.calculateCustomsValue.mockResolvedValue({ goods: [{ index: 0, customsValueKzt: 700000 }] })
    api.downloadKedenXml.mockResolvedValue({ blob: new Blob(['<xml/>']), fileName: 'dt.xml' })
    await open('?s=finance')
    await w.get('[data-set-currency]').trigger('click')
    await settle()
    await w.get('[data-emit="calc-customs-value"]').trigger('click')
    await settle()
    expect(api.calculateCustomsValue.mock.calls[0][0].goods[0]).toMatchObject({ index: 0, currency: 'EUR' })
    await w.get('[data-dt-xml]').trigger('click')
    await settle()
    expect(api.downloadKedenXml).toHaveBeenCalled()
    expect(lastPutGoods()[0].currency).toBe('EUR')
    expect(w.find('[data-stub="SectionGoods"]').exists()).toBe(false)
  })

  it('загрузка: товары в другой валюте молча приводятся к гр. 22 (без пометки «изменено» и без «Пересчитать»)', async () => {
    server = sheets1({ currency: 'CNY', needsTpinRecalc: false })
    await open()
    expect(w.get('[data-dt-header]').text()).not.toContain('Есть несохранённые изменения')
    expect(api.updateDeclaration).not.toHaveBeenCalled()
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    expect(lastPutGoods()[0].currency).toBe('USD')
    expect((lastPutGoods()[0] as { needsTpinRecalc?: boolean }).needsTpinRecalc).toBe(false)
  })

  it('смена гр. 22 пользователем: валюта товара меняется — платежи товара помечаются «Пересчитать»', async () => {
    server = sheets1({ currency: 'USD', needsTpinRecalc: false })
    await open('?s=finance')
    await w.get('[data-set-currency]').trigger('click')
    await settle()
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    expect(lastPutGoods()[0].currency).toBe('EUR')
    expect((lastPutGoods()[0] as { needsTpinRecalc?: boolean }).needsTpinRecalc).toBe(true)
  })

  it('гр. 46 пустая — гр. 45 / курс USD на дату гр. А (0,01) уходит в PUT; введённую не трогает', async () => {
    server = sheets1({ statisticValueUsd: null })
    // Курс приходит из сети после загрузки ДТ — как прежний экран, заполнение по нему — правка (автосейв).
    api.ratesOnDate.mockImplementation(() => new Promise((r) => setTimeout(() => r({ rates: { USD: 495.12, EUR: 541.3 }, official: true }), 0)))
    await open()
    expect(w.get('[data-dt-header]').text()).toContain('Есть несохранённые изменения')
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    expect(lastPutGoods()[0].statisticValueUsd).toBe(1514.78) // 750 000 / 495,12
    w.unmount()
    api.updateDeclaration.mockClear()
    server = sheets1({ statisticValueUsd: 1500 })
    await open()
    expect(w.get('[data-dt-header]').text()).not.toContain('Есть несохранённые изменения')
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    expect(lastPutGoods()[0].statisticValueUsd).toBe(1500)
  })

  it('просмотр: гр. 46 не заполняется и PUT нет', async () => {
    server = caseDto({ status: 3, assignedDeclarantId: 'other', declarations: [fullDto({ splitRole: null, goodsItems: [fullGoodsDto({ statisticValueUsd: null })] })] })
    await open()
    expect(w.get('[data-dt-header]').text()).not.toContain('Есть несохранённые изменения')
    expect(api.updateDeclaration).not.toHaveBeenCalled()
  })
})

describe('DtPage: ДТС', () => {
  const dtsGets = () => dts.get.mock.calls.length
  const savedToast = () => toast.success.mock.calls.some(([m]) => m === 'ДТ сохранена')

  it('один GET …/dts: при загрузке, на каждое сохранение и на каждый вход — и при открытом разделе (§5-8)', async () => {
    dts.get.mockResolvedValue(dtsView())
    await open('?s=dts', ['SectionDts'])
    expect(dtsGets()).toBe(1)
    expect(dts.get).toHaveBeenCalledWith('case1', 'dt1', { silent: true })
    // Раздел и навигация — из одного ответа: в плашке и в числе раздела только пункты ДТС, пункт ДТ — числом.
    expect(w.findAll('[data-dts-missing-item]').map((i) => i.text())).toEqual(['ДТС: не указано место для гр.17 (раздел «ДТС»)'])
    expect(navItem('dts').get('[data-dt-nav-count]').text()).toBe('1')
    expect(w.get('[data-dts-dt-missing]').text()).toContain('не хватает 1')
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    expect(api.updateDeclaration).toHaveBeenCalledTimes(1)
    expect(dtsGets()).toBe(2)
    await navItem('docs').trigger('click')
    await settle()
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    expect(dtsGets()).toBe(3) // сохранение вне раздела — отметка и «До подачи» тоже свежие
    await navItem('dts').trigger('click')
    await settle()
    expect(dtsGets()).toBe(4) // вход в раздел
    // Вход в раздел, пока идёт загрузка после сохранения, — тот же запрос, а не второй.
    await navItem('docs').trigger('click')
    await settle()
    let release!: (v: unknown) => void
    dts.get.mockImplementationOnce(() => new Promise((r) => { release = r }))
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    expect(dtsGets()).toBe(5)
    await navItem('dts').trigger('click')
    await settle()
    expect(dtsGets()).toBe(5)
    release(dtsView({ items: [], missing: [] }))
    await settle()
    expect(w.find('[data-dts-missing]').exists()).toBe(false)
  })

  it('правой колонки нет — «До подачи» кнопкой в шапке и на широком экране; ссылка из плашки открывает панель', async () => {
    dts.get.mockResolvedValue(dtsView())
    await open('?s=dts', ['SectionDts'])
    expect(w.find('[data-dt-panel-aside]').exists()).toBe(false)
    expect(w.get('[data-dt-panel-toggle]').classes()).not.toContain('xl:hidden')
    await w.get('[data-dts-open-panel]').trigger('click')
    await settle()
    expect(document.body.querySelector('[role="dialog"] [data-dt-panel-readiness]')).not.toBeNull()
    key({ key: 'Escape' })
    await navItem('docs').trigger('click')
    await settle()
    expect(w.find('[data-dt-panel-aside]').exists()).toBe(true)
    expect(w.get('[data-dt-panel-toggle]').classes()).toContain('xl:hidden')
  })

  it('просмотр: печать, инф. лист и XML — без PUT и без «ДТ сохранена»', async () => {
    server = caseDto({ status: 3, assignedDeclarantId: 'other', declarations: [fullDto({ splitRole: null })] })
    dts.get.mockResolvedValue(dtsView())
    dts.pdf.mockResolvedValue(new Blob(['%PDF']))
    dts.xml.mockResolvedValue({ blob: new Blob(['<x/>']), fileName: 'dts.xml' })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    await open('?s=dts', ['SectionDts'])
    await w.get('[data-dts-print]').trigger('click')
    await settle()
    await w.get('[data-dts-info-sheet]').trigger('click')
    await settle()
    await w.get('[data-dts-xml]').trigger('click')
    await settle()
    expect(dts.pdf.mock.calls.map((c) => c[2])).toEqual(['pdf', 'info-sheet-pdf'])
    expect(openSpy).toHaveBeenCalledTimes(2)
    expect(dts.xml).toHaveBeenCalledWith('case1', 'dt1')
    expect(toast.success).toHaveBeenCalledWith('XML ДТС сформирован')
    expect(api.updateDeclaration).not.toHaveBeenCalled()
    expect(savedToast()).toBe(false)
    expect(dtsGets()).toBe(1)
    openSpy.mockRestore()
  })

  it('XML с правом: тихое сохранение (без «ДТ сохранена») и один GET на него; 400 — список в плашке', async () => {
    dts.get.mockResolvedValue(dtsView())
    dts.xml.mockResolvedValue({ errors: ['Гр.8, получатель: дом длиннее 20 знаков', 'ДТС: нет места'] })
    await open('?s=dts', ['SectionDts'])
    await w.get('[data-dts-xml]').trigger('click')
    await settle()
    expect(api.updateDeclaration).toHaveBeenCalledTimes(1)
    expect(savedToast()).toBe(false)
    expect(dtsGets()).toBe(2)
    expect(toast.warning).toHaveBeenCalledWith('XML ДТС не сформирован — заполните недостающее')
    expect(w.get('[data-dts-xml-errors]').findAll('li')).toHaveLength(2)
  })

  it('«Пересчитать гр. 45» — шаг 1 расчёта (гр. 45/46 по счёту и расходам), сохранение, свежая ДТС; платежи устарели', async () => {
    server = caseDto({ status: 2, assignedDeclarantId: 'me', declarations: [fullDto({ splitRole: null, goodsItems: [fullGoodsDto({ needsTpinRecalc: false })] })] })
    dts.get.mockResolvedValue(dtsView({ mismatchGoods: [1], sheet: dtsSheet({ goods: [dtsGoods(1, { box25Kzt: 755000, declaredCustomsValueKzt: 750000 })] }) }))
    api.calculateCustomsValue.mockResolvedValue({ goods: [{ index: 0, customsValueKzt: 755000, statisticValueUsd: 1524.88 }] })
    await open('?s=dts', ['SectionDts'])
    expect(navItem('payments').find('[data-dt-nav-stale]').exists()).toBe(false)
    expect(w.get('[data-dts-row="1"]').find('[data-dts-mismatch]').exists()).toBe(true)
    dts.get.mockResolvedValue(dtsView({ sheet: dtsSheet({ goods: [dtsGoods(1, { box25Kzt: 755000, declaredCustomsValueKzt: 755000 })] }) }))
    await w.get('[data-dts-row-recalc]').trigger('click')
    await settle()
    expect(api.calculateCustomsValue).toHaveBeenCalledTimes(1)
    const put = api.updateDeclaration.mock.calls.at(-1)![2] as { goodsItems: { customsValueKzt: number; statisticValueUsd: number }[] }
    expect(put.goodsItems[0]).toMatchObject({ customsValueKzt: 755000, statisticValueUsd: 1524.88 })
    expect(dtsGets()).toBe(2)
    expect(w.find('[data-dts-mismatch]').exists()).toBe(false)
    expect(navItem('payments').find('[data-dt-nav-stale]').exists()).toBe(true)
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Гр. 45 пересчитана (товаров: 1)'))
  })

  it('пункт «место для гр. 17» в «До подачи» — к полю «Место для гр. 17» раздела «ДТС» (фокус в поле)', async () => {
    dts.get.mockResolvedValue(dtsView())
    await open('', ['SectionDts'])
    const item = w.findAll('[data-dt-panel-aside] [data-dt-panel-item]').find((i) => i.attributes('data-section') === 'dts')!
    await item.trigger('click')
    await settle()
    expect(router.currentRoute.value.query.s).toBe('dts')
    const field = document.querySelector('[data-dts-place-field]') as HTMLElement
    expect(field.hasAttribute('data-dt-flash')).toBe(true)
    expect(document.activeElement).toBe(field.querySelector('input'))
  })

  it('разделённая ДТ: раздел «ДТС» без GET …/dts', async () => {
    server = caseDto({
      status: 2, assignedDeclarantId: 'me',
      declarations: [fullDto({ isSplitReplaced: true }), fullDto({ id: 'v1', splitSourceDeclarationId: 'dt1', splitRole: 'VTO' })],
    })
    await open('?s=dts', ['SectionDts'])
    await navItem('docs').trigger('click')
    await settle()
    await navItem('dts').trigger('click')
    await settle()
    expect(w.find('[data-dt-dts]').exists()).toBe(true)
    expect(dts.get).not.toHaveBeenCalled()
    expect(w.find('[data-dts-skeleton]').exists()).toBe(false)
  })
})

describe('DtPage: раздел «Платежи» (волна 6в)', () => {
  const calcRes = () => ({
    goodsRows: [{ index: 0, rows: [{ taxModeCode: '1010', amount: 8650 }, { taxModeCode: '5060', amount: 84000, base: 700000, rate: 12 }] }],
    totalsByTaxMode: { 1010: 8650, 5060: 84000 },
    grandTotalB: 92650,
  })
  beforeEach(() => {
    api.calculateCustomsValue.mockResolvedValue({ goods: [{ index: 0, customsValueKzt: 700000 }] })
    api.calculatePayments.mockImplementation(async () => calcRes())
  })
  const calcFromHeader = async () => {
    await w.get('[data-dt-calc-payments]').trigger('click')
    await settle()
  }

  it('пункт гр. 47 «До подачи» — карточка того же товара (по снимку ответа после несохранённого удаления); свёрнутая раскрывается', async () => {
    const clean = fullGoodsDto({ needsTpinRecalc: false })
    server = caseDto({
      status: 2, assignedDeclarantId: 'me',
      declarations: [fullDto({ splitRole: null, goodsItems: ['ПЕРВЫЙ', 'ВТОРОЙ', 'ТРЕТИЙ', '4', '5', '6', '7'].map((description) => ({ ...clean, description })) })],
    })
    const text = 'Товар 3: нет ни одной строки платежа (гр.47)'
    api.kedenReadiness.mockResolvedValue(readinessDto({ missing: [text], items: [{ text, graph: '47', goodsIndex: 2 }] }))
    await open('?s=goods')
    await w.get('[data-goods-remove-first]').trigger('click')
    await settle()
    await w.get('[data-dt-panel-aside] [data-dt-panel-item]').trigger('click')
    await settle()
    expect(router.currentRoute.value.query).toEqual({ s: 'payments' })
    // товары без замечаний свёрнуты (их больше 5); «Товар 3» ответа теперь на позиции 1 — раскрыта только его карточка
    expect(w.findAll('[data-payments-goods]').map((c) => c.attributes('data-goods-index'))).toEqual(['1'])
    expect(w.get('[data-payments-goods][data-goods-index="1"]').text()).toContain('ТРЕТИЙ')
    expect(w.get('[data-payments-goods][data-goods-index="1"] [data-graph="47"]').attributes('data-dt-flash')).toBeDefined()
    // фокус — на карточку товара (в строках платежей полей нет)
    expect(document.activeElement).toBe(w.get('[data-payments-goods][data-goods-index="1"]').element)
    expect(w.get('[data-payments-more]').text()).toContain('Ещё товаров без замечаний: 5')
    await w.get('[data-payments-show-all]').trigger('click')
    expect(w.findAll('[data-payments-goods]')).toHaveLength(6)
  })

  it('пункт гр. В «До подачи» — таблица фактических платежей, фокус в первой строке', async () => {
    const text = 'гр.В: нет фактических платежей'
    api.kedenReadiness.mockResolvedValue(readinessDto({ missing: [text], items: [{ text, graph: 'В', goodsIndex: null }] }))
    await open('?s=goods')
    await w.get('[data-dt-panel-aside] [data-dt-panel-item]').trigger('click')
    await settle()
    expect(router.currentRoute.value.query).toEqual({ s: 'payments' })
    const rows = w.get('[data-fact-rows]')
    expect(rows.attributes('data-dt-flash')).toBeDefined()
    expect(rows.get('[data-fact-row]').element.contains(document.activeElement)).toBe(true)
  })

  it('«Медизделие — НДС 5%» в карточке: «Пересчитать» у товара, предпросмотр сброшен («Записать» недоступно), НДС — в PUT', async () => {
    await open()
    // записанный расчёт — платежи свежие
    await calcFromHeader()
    await w.get('[data-payments-apply]').trigger('click')
    await settle()
    expect(navItem('payments').find('[data-dt-nav-stale]').exists()).toBe(false)
    await calcFromHeader()
    expect(w.get('[data-dt-payments]').attributes('data-state')).toBe('preview')
    // предпросмотр: суммы расчёта в карточке с пометкой «расчёт, не записан»
    const line = w.get('[data-payments-goods][data-goods-index="0"] [data-payments-line="5060"]')
    expect(line.attributes('data-fresh')).toBeDefined()
    expect(line.text()).toMatch(/84\s000,00/)
    expect(line.text()).toContain('расчёт, не записан')
    const medical = () => w.get('[data-payments-goods][data-goods-index="0"] [data-payments-medical]')
    expect(medical().attributes('aria-checked')).toBe('true') // фикстура: НДС 5%
    ;(medical().element as HTMLElement).click()
    await settle()
    expect(medical().attributes('aria-checked')).toBe('false')
    expect(w.get('[data-dt-payments]').attributes('data-state')).toBe('stale-preview')
    expect(w.find('[data-payments-changed]').exists()).toBe(true)
    expect(w.find('[data-payments-apply]').exists()).toBe(false)
    expect(w.find('[data-payments-totals-outdated]').exists()).toBe(true)
    expect(navItem('payments').find('[data-dt-nav-stale]').exists()).toBe(true)
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    const body = api.updateDeclaration.mock.calls.at(-1)![2] as { goodsItems: { vatRatePreferential: number | null; needsTpinRecalc: boolean }[] }
    expect(body.goodsItems[0]).toMatchObject({ vatRatePreferential: null, needsTpinRecalc: true })
  })

  it('(§5-1) после «Записать» гр. В в таблице — новые суммы; правка плательщика их не откатывает (в PUT — новые)', async () => {
    await open('?s=payments')
    await calcFromHeader()
    await w.get('[data-payments-apply]').trigger('click')
    await settle()
    expect(w.findAll('[data-fact-row]').map((r) => r.attributes('data-fact-row'))).toEqual(['1010', '5060'])
    expect((w.get('[data-fact-row="1010"] input[data-fact="amount"]').element as HTMLInputElement).value).toMatch(/^8\s650$/)
    const payer = w.get('[data-fact-row="5060"] input[data-fact="payer"]').element as HTMLInputElement
    payer.value = '201140012345'
    payer.dispatchEvent(new Event('input'))
    await settle()
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    const body = api.updateDeclaration.mock.calls.at(-1)![2] as { factPayments: { taxModeCode: string; amount: number; payerTaxpayerId: string | null }[] }
    expect(body.factPayments.map((p) => [p.taxModeCode, p.amount, p.payerTaxpayerId])).toEqual([['1010', 8650, '123'], ['5060', 84000, '201140012345']])
  })

  it('«Открыть товар →» в карточке с ошибкой расчёта — редактор этого товара', async () => {
    api.calculatePayments.mockResolvedValue({ goodsRows: [{ index: 0, rows: [], error: 'Укажите код ТНВЭД и стоимость' }], totalsByTaxMode: {}, grandTotalB: 0 })
    await open()
    await calcFromHeader()
    await w.get('[data-payments-goods][data-goods-index="0"] [data-payments-open-goods]').trigger('click')
    await settle()
    expect(router.currentRoute.value.query).toEqual({ s: 'goods', item: '1' })
  })

  it('«Открыть товар →» — прокрутка к платежам товара, когда редактор смонтировался (не через один тик)', async () => {
    api.calculatePayments.mockResolvedValue({ goodsRows: [{ index: 0, rows: [], error: 'Укажите код ТНВЭД и стоимость' }], totalsByTaxMode: {}, grandTotalB: 0 })
    const scrolled: Element[] = []
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) { scrolled.push(this) })
    // Редактор «монтируется» не сразу: первые 3 поиска блока платежей ничего не находят.
    const qs = Document.prototype.querySelector
    let misses = 3
    const qsSpy = vi.spyOn(Document.prototype, 'querySelector').mockImplementation(function (this: Document, sel: string) {
      if (sel.includes('[data-goods-field="payments"]') && misses > 0) { misses -= 1; return null }
      return qs.call(this, sel)
    })
    try {
      await open('', ['SectionGoods'])
      await calcFromHeader()
      await w.get('[data-payments-goods][data-goods-index="0"] [data-payments-open-goods]').trigger('click')
      await vi.waitFor(() => expect(scrolled.some((el) => el.matches('[data-dt-goods-editor] [data-goods-index="0"] [data-goods-field="payments"]'))).toBe(true), { timeout: 2000 })
      expect(router.currentRoute.value.query).toEqual({ s: 'goods', item: '1' })
      expect(misses).toBe(0)
    } finally {
      spy.mockRestore()
      qsSpy.mockRestore()
    }
  })

  it('≥ 1280: «Итого по видам» — в правой колонке вместо «До подачи» (в разделе — нет), «До подачи» — кнопкой в шапке', async () => {
    const mm = vi.fn((q: string) => ({ matches: q.includes('80rem'), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    vi.stubGlobal('matchMedia', mm)
    try {
      await open('?s=payments')
      const aside = w.get('[data-dt-panel-aside]')
      expect(aside.find('[data-payments-totals]').exists()).toBe(true)
      expect(aside.find('[data-dt-panel-readiness]').exists()).toBe(false)
      expect(w.get('[data-dt-section]').find('[data-payments-totals]').exists()).toBe(false)
      expect(w.get('[data-dt-panel-toggle]').classes()).not.toContain('xl:hidden')
      await navItem('docs').trigger('click')
      await settle()
      expect(w.get('[data-dt-panel-aside]').find('[data-dt-panel-readiness]').exists()).toBe(true)
      expect(w.get('[data-dt-panel-toggle]').classes()).toContain('xl:hidden')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('уже 1280: «Итого по видам» — в разделе над фактическими платежами; сверка гр. 47 ↔ гр. В', async () => {
    await open('?s=payments')
    const section = w.get('[data-dt-payments]')
    const html = section.html()
    expect(html.indexOf('data-payments-totals')).toBeGreaterThan(-1)
    expect(html.indexOf('data-payments-totals')).toBeLessThan(html.indexOf('data-dt-fact-payments'))
    // гр. 47 фикстуры: 1010 = 3 ₸, гр. В: 1010 = 20 000 ₸ — расходятся
    expect(section.get('[data-payments-diff-code="1010"]').text()).toMatch(/гр\. 47 — 3,00 ₸, гр\. В — 20\s000,00 ₸/)
  })
})
