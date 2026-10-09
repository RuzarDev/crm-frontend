import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { Import40CaseDto, KedenReadinessDto } from '@/api/import40'
import { caseDto, fullDto } from './dtFixture'

const api = vi.hoisted(() => ({
  get: vi.fn(), updateDeclaration: vi.fn(), kedenReadiness: vi.fn(), ratesOnDate: vi.fn(),
  downloadKedenXml: vi.fn(), blankPdf: vi.fn(), downloadAllDocuments: vi.fn(),
  splitSuggestion: vi.fn(), splitDeclaration: vi.fn(), calculatePayments: vi.fn(), calculateTpin: vi.fn(), calculateCustomsValue: vi.fn(),
}))
const dts = vi.hoisted(() => ({ get: vi.fn() }))
const refs = vi.hoisted(() => ({ listCountries: vi.fn(), listCustomsPosts: vi.fn(), listExpenseTypes: vi.fn() }))
const tnved = vi.hoisted(() => ({ currencies: vi.fn() }))
const contract = vi.hoisted(() => ({ getProfile: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/import40', async (orig) => ({ ...(await orig<typeof import('@/api/import40')>()), import40Api: api }))
vi.mock('@/api/dts', () => ({ dtsApi: dts }))
vi.mock('@/api/references', () => ({ referencesApi: refs }))
vi.mock('@/api/tnved', () => ({ tnvedApi: tnved }))
vi.mock('@/api/import40Contract', () => ({ import40ContractApi: contract }))
vi.mock('@/ui/message', () => ({ message: toast }))
vi.mock('@/stores/classifiers', () => ({ useClassifiersStore: () => ({ loadMany: vi.fn(async () => undefined), options: () => [] }) }))

import DtPage from '../DtPage.vue'
import { useAuthStore } from '@/stores/auth'
import { confirmState } from '@/ui/confirm'

// Прежние разделы — заглушки: видно, какой смонтирован; у «Сторон» есть поле гр. 8 (переход «к недостающему»).
const sectionStub = (name: string, inner = '') => defineComponent({
  name,
  props: ['modelValue', 'readonly'],
  template: `<div data-stub="${name}" :data-readonly="String(readonly)">${inner}</div>`,
})
const stubs = {
  DtLegacyForm: { props: ['disabled'], template: '<div data-legacy-form :data-disabled="String(disabled)"><slot /></div>' },
  DtDeclarationNumberBar: sectionStub('DtDeclarationNumberBar'),
  DtSectionGeneral: sectionStub('DtSectionGeneral'),
  DtSectionParties: sectionStub('DtSectionParties', '<label data-graph="8">Получатель<input data-recv /></label>'),
  DtSectionCountries: sectionStub('DtSectionCountries'),
  DtSectionTransport: sectionStub('DtSectionTransport'),
  DtSectionFinance: sectionStub('DtSectionFinance'),
  DtSectionCustoms: sectionStub('DtSectionCustoms'),
  DtSectionGoods: sectionStub('DtSectionGoods'),
  DtSectionDocs: sectionStub('DtSectionDocs'),
  DtSectionDts: sectionStub('DtSectionDts'),
  DtSectionClosing: sectionStub('DtSectionClosing'),
  DtPaymentsCalcModal: { props: ['open'], template: '<div v-if="open" data-payments-modal />' },
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
const open = async (query = '') => {
  await router.push(`/import-40/case1/dt/dt1${query}`)
  await router.isReady()
  w = mountWithI18n(App, { attachTo: document.body, global: { plugins: [pinia, router], stubs } })
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
    expect(stub()).toBe('DtDeclarationNumberBar')
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
    expect(stub()).toBe('DtSectionParties')
    expect(navItem('parties').attributes('aria-current')).toBe('true')
    await navItem('goods').trigger('click')
    await settle()
    expect(router.currentRoute.value.query.s).toBe('goods')
    expect(stub()).toBe('DtSectionGoods')
    // Первый раздел — без ?s=.
    await navItem('number').trigger('click')
    await settle()
    expect(router.currentRoute.value.query.s).toBeUndefined()
    expect(stub()).toBe('DtDeclarationNumberBar')
  })

  it('Alt+↓ / Alt+↑ — соседний раздел', async () => {
    await open('?s=goods')
    key({ key: 'ArrowDown', altKey: true })
    await settle()
    expect(router.currentRoute.value.query.s).toBe('docs')
    key({ key: 'ArrowUp', altKey: true })
    key({ key: 'ArrowUp', altKey: true })
    await settle()
    expect(stub()).toBe('DtSectionCustoms')
  })

  it('«Завершение» — с фактическими платежами гр. В', async () => {
    await open('?s=closing')
    expect(stub()).toBe('DtSectionClosing')
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
    expect(w.find('[data-dt-panel-aside]').exists()).toBe(false)
    expect(w.find('[data-dt-panel-toggle]').exists()).toBe(false)
    expect(toast.error).not.toHaveBeenCalled()
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
})
