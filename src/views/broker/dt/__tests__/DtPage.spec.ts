import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import { vUppercase } from '@/directives/uppercase'
import type { Import40CaseDto, KedenReadinessDto } from '@/api/import40'
import { caseDto, fullDto, fullGoodsDto } from './dtFixture'

const api = vi.hoisted(() => ({
  get: vi.fn(), updateDeclaration: vi.fn(), kedenReadiness: vi.fn(), ratesOnDate: vi.fn(),
  downloadKedenXml: vi.fn(), blankPdf: vi.fn(), downloadAllDocuments: vi.fn(),
  splitSuggestion: vi.fn(), splitDeclaration: vi.fn(), calculatePayments: vi.fn(), calculateTpin: vi.fn(), calculateCustomsValue: vi.fn(),
}))
const dts = vi.hoisted(() => ({ get: vi.fn() }))
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
vi.mock('@/api/import40Contract', () => ({ import40ContractApi: contract }))
vi.mock('@/ui/message', () => ({ message: toast }))
vi.mock('@/stores/classifiers', () => ({ useClassifiersStore: () => ({ loadMany: vi.fn(async () => undefined), load: vi.fn(async () => []), cache: {}, options: () => [] }) }))
const brokerFirms = vi.hoisted(() => ({ listBrokerFirms: vi.fn(), getBrokerFirmByBin: vi.fn(), upsertBrokerFirm: vi.fn() }))
vi.mock('@/api/brokerFirms', () => brokerFirms)
vi.mock('@/api/kato', async (orig) => ({ ...(await orig<typeof import('@/api/kato')>()), katoApi: { search: vi.fn(async () => []), get: vi.fn(async () => null) } }))

import DtPage from '../DtPage.vue'
import { useAuthStore } from '@/stores/auth'
import { confirmState } from '@/ui/confirm'

// Прежние разделы — заглушки: видно, какой смонтирован; у «Сторон» есть поле гр. 8 (переход «к недостающему»);
// кнопки data-emit шлют события прежних разделов (проверка, что страница их слушает).
const sectionStub = (name: string, inner = '', emits: string[] = []) => defineComponent({
  name,
  props: ['modelValue', 'form', 'readonly', 'reloadKey', 'save'],
  emits: ['update:modelValue', ...emits],
  template: `<div data-stub="${name}" :data-readonly="String(readonly)" :data-reload-key="reloadKey">${inner}</div>`,
})
// Товары: две страны происхождения (гр. 16 → «000»), «Рассчитать» и «ТПиН по данным экрана». Раздел правит товары
// через модель страницы (useDtGoods) на месте — как настоящий SectionGoods.
const goodsStub = defineComponent({
  name: 'SectionGoods',
  props: ['model', 'readonly', 'currency', 'dtNumber', 'countryOptions', 'paymentsLoading'],
  emits: ['calc-tpin', 'calc-payments'],
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
    <button data-emit="calc-tpin" type="button" @click="$emit('calc-tpin')" />
    <button data-emit="calc-payments" type="button" @click="$emit('calc-payments')" />
  </div>`,
})
const stubs = {
  DtLegacyForm: { props: ['disabled'], template: '<div data-legacy-form :data-disabled="String(disabled)"><slot /></div>' },
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
  DtSectionDts: sectionStub('DtSectionDts', `<button data-dts-save type="button" @click="save()" />`),
  SectionClosing: sectionStub('SectionClosing'),
  DtPaymentsCalcModal: {
    props: ['open'],
    emits: ['toggle-medical', 'apply'],
    template: `<div v-if="open" data-payments-modal><button data-emit="toggle-medical" type="button" @click="$emit('toggle-medical', 0, false)" /></div>`,
  },
  Import40FactPaymentsSection: { template: '<div data-fact-payments />' },
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
    expect(router.currentRoute.value.query.s).toBe('docs')
    key({ key: 'ArrowUp', altKey: true })
    key({ key: 'ArrowUp', altKey: true })
    await settle()
    expect(stub()).toBe('SectionCustoms')
  })

  it('«Завершение» — с фактическими платежами гр. В', async () => {
    await open('?s=closing')
    expect(stub()).toBe('SectionClosing')
    expect(w.find('[data-fact-payments]').exists()).toBe(true)
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
    // Товар фикстуры помечен «пересчитать ТПиН» — точка «платежи устарели».
    expect(navItem('goods').find('[data-dt-nav-stale]').exists()).toBe(true)
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
    expect(w.find('[data-fact-payments]').exists()).toBe(true)
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

  it('правка: «Печать бланка» сначала сохраняет; сохранение не удалось — бланк не печатается', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
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
    expect(openSpy).toHaveBeenCalledTimes(1)
    api.updateDeclaration.mockRejectedValueOnce(Object.assign(new Error('500'), { response: { status: 500 } }))
    await printFromMore()
    expect(api.updateDeclaration).toHaveBeenCalledTimes(2)
    expect(api.blankPdf).toHaveBeenCalledTimes(1)
    expect(openSpy).toHaveBeenCalledTimes(1)
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
    expect(w.get('[data-legacy-form]').attributes('data-disabled')).toBe('true')
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

  it('?calc=payments после разделения — окно расчёта платежей и адрес без параметра', async () => {
    api.calculatePayments.mockResolvedValue({ goodsRows: [], totalsByTaxMode: {} })
    await open('?calc=payments')
    expect(router.currentRoute.value.query.calc).toBeUndefined()
    expect(api.updateDeclaration).toHaveBeenCalledTimes(1)
    expect(api.calculatePayments).toHaveBeenCalledWith('case1', 'dt1')
    expect(w.find('[data-payments-modal]').exists()).toBe(true)
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

  it('«Рассчитать ТПиН» (Товары) — гр. 45, затем ТПиН по товарам с экрана', async () => {
    api.calculateCustomsValue.mockResolvedValue({ goods: [{ index: 0, customsValueKzt: 700000 }] })
    api.calculateTpin.mockResolvedValue({ goodsRows: [{ index: 0, rows: [{ taxModeCode: '2010', amount: 70000, rate: 10 }] }], totalsByTaxMode: {} })
    await open('?s=goods')
    await emit('calc-tpin')
    expect(api.calculateTpin).toHaveBeenCalledTimes(1)
    expect(api.calculateTpin.mock.calls[0][0][0]).toMatchObject({ index: 0, tnvedCode: '7318150000', customsValueKzt: 700000 })
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('ТПиН рассчитан для 1 тов.'))
  })

  it('«Рассчитать» в итогах товаров — сохранить и окно расчёта платежей', async () => {
    api.calculatePayments.mockResolvedValue({ goodsRows: [], totalsByTaxMode: {} })
    await open('?s=goods')
    await emit('calc-payments')
    expect(api.calculatePayments).toHaveBeenCalledTimes(1)
    expect(w.find('[data-payments-modal]').exists()).toBe(true)
  })

  it('авто гр. 16: разные страны происхождения у товаров — «000»', async () => {
    await open('?s=goods')
    await w.get('[data-goods-mixed]').trigger('click')
    await settle()
    key({ key: 's', code: 'KeyS', metaKey: true })
    await settle()
    expect(api.updateDeclaration.mock.calls.at(-1)![2]).toMatchObject({ originCountryCode: '000' })
  })

  it('ДТС: сохранение раздела — через страницу (с сообщением); раздел перечитывается при каждом открытии', async () => {
    await open('?s=dts')
    const firstKey = w.get('[data-stub="DtSectionDts"]').attributes('data-reload-key')
    await w.get('[data-dts-save]').trigger('click')
    await settle()
    expect(api.updateDeclaration).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('ДТ сохранена')
    const afterSave = w.get('[data-stub="DtSectionDts"]').attributes('data-reload-key')
    expect(afterSave).not.toBe(firstKey)
    await navItem('docs').trigger('click')
    await settle()
    await navItem('dts').trigger('click')
    await settle()
    expect(w.get('[data-stub="DtSectionDts"]').attributes('data-reload-key')).not.toBe(afterSave)
  })

  it('«Медизделие» в окне платежей — сохранить с новым НДС и пересчитать', async () => {
    api.calculatePayments.mockResolvedValue({ goodsRows: [], totalsByTaxMode: {} })
    await open()
    await w.get('[data-dt-calc-payments]').trigger('click')
    await settle()
    expect(api.calculatePayments).toHaveBeenCalledTimes(1)
    await emit('toggle-medical')
    expect(api.calculatePayments).toHaveBeenCalledTimes(2)
    const body = api.updateDeclaration.mock.calls.at(-1)![2] as { goodsItems: { vatRatePreferential: number | null }[] }
    expect(body.goodsItems[0].vatRatePreferential).toBeNull()
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
