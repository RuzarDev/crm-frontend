import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { DocumentPackageDto } from '@/types/api'
import { draftFromPartia, partiaToBody } from '../partiaModel'
import { container, fullPartia, pkg } from './packageFixture'

const api = vi.hoisted(() => ({
  getById: vi.fn(), createClientConsolidation: vi.fn(), updateClientConsolidation: vi.fn(),
  uploadFile: vi.fn(), linkFile: vi.fn(), downloadFile: vi.fn(),
}))
const reestr = vi.hoisted(() => ({ listPortfolioClients: vi.fn() }))
const onboarding = vi.hoisted(() => ({ list: vi.fn() }))
const invoice = vi.hoisted(() => ({ extractGoods: vi.fn() }))
const tnved = vi.hoisted(() => ({ node: vi.fn(), rates: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/documentPackages', () => ({ documentPackagesApi: api }))
vi.mock('@/api/reestr', () => ({ reestrApi: reestr }))
vi.mock('@/api/clientsOnboarding', () => ({ clientsOnboardingApi: onboarding }))
vi.mock('@/api/invoice', () => ({ invoiceApi: invoice }))
vi.mock('@/api/tnved', () => ({ tnvedApi: tnved }))
vi.mock('@/api/references', async () => ({ referencesApi: (await import('@/views/broker/transit/record/sections/__tests__/harness')).refsApi }))
vi.mock('@/ui/message', () => ({ message: toast }))

import PartiaPage from '../PartiaPage.vue'
import { useAuthStore } from '@/stores/auth'
import { confirmState } from '@/ui/confirm'
import { ComboStub, SelectStub, primeRefs } from '@/views/broker/transit/record/sections/__tests__/harness'

const ModalStub = {
  props: ['open', 'title', 'okButtonProps'], emits: ['ok', 'update:open'],
  template: '<div v-if="open" data-modal :data-title="title"><slot /><slot name="footer" /><button data-ok type="button" @click="$emit(\'ok\')" /></div>',
}
const DrawerStub = {
  props: ['open', 'title'], emits: ['update:open'],
  template: '<div v-if="open" data-drawer :data-title="title"><slot /><slot name="footer" /></div>',
}
const stubs = { ZSelect: SelectStub, ZCombobox: ComboStub, ZModal: ModalStub, ZDrawer: DrawerStub }
const App = defineComponent({ render: () => h(RouterView) })

let w: VueWrapper
let router: Router
let stored: DocumentPackageDto

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } })
const settle = async () => {
  await flushPromises()
  await nextTick()
  await flushPromises()
}
const as = (role: string, perms: string[]) => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = perms
}
const BROKER = ['reestr.read', 'reestr.write', 'packages.manage', 'clients.read']
const open = async (path = '/document-packages/pkg1/partia/p1') => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(App, { attachTo: document.body, global: { plugins: [router], stubs } })
  await settle()
}
const has = (sel: string) => w.find(sel).exists()
const typeIn = async (sel: string, text: string) => {
  const host = w.get(sel)
  const input = host.element.tagName === 'INPUT' ? host : host.get('input')
  ;(input.element as HTMLInputElement).value = text
  await input.trigger('input')
  await nextTick()
}
const mockMedia = (wide: boolean) => {
  window.matchMedia = ((q: string) => ({
    matches: wide && q.includes('min-width: 1280px'), media: q, onchange: null, addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  setActivePinia(createPinia())
  const other = { template: '<div data-other-page />' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/document-packages/:id/workspace', name: 'document-packages-workspace', component: other },
      { path: '/document-packages/:id/partia/:partiaId', name: 'document-packages-partia', component: PartiaPage },
      { path: '/:p(.*)*', component: other },
    ],
  })
  stored = pkg()
  api.getById.mockImplementation(async () => structuredClone(stored))
  api.updateClientConsolidation.mockImplementation(async () => structuredClone(stored))
  api.downloadFile.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }))
  reestr.listPortfolioClients.mockResolvedValue([
    { id: 'u-k', username: 'kazakhmys', declarationCount: 1 },
    { id: 'u-b', username: 'client_beta', declarationCount: 0 },
  ])
  onboarding.list.mockResolvedValue([
    { id: 'u-k', username: 'kazakhmys', companyName: 'ТОО «Казахмыс Трейд»' },
    { id: 'u-b', username: 'client_beta', companyName: null },
  ])
  tnved.node.mockResolvedValue({ data: { is10: true, name: 'X' } })
  tnved.rates.mockResolvedValue(null)
  primeRefs()
  mockMedia(true)
  URL.createObjectURL = vi.fn(() => 'blob:doc') as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL
  as('importer', BROKER)
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('PartiaPage: загрузка', () => {
  it('партия загружается тихо: шапка, поля, стороны, товары, гр.44, строка транзита, документы', async () => {
    await open()
    expect(api.getById).toHaveBeenCalledWith('pkg1', { silent: true })
    expect(w.get('[data-partia-context]').text()).toBe('Поезд 1234 · контейнер MRSU 488584 9')
    expect(w.get('[data-partia-title]').text()).toBe('Партия · ТОО «Казахмыс Трейд»')
    expect(has('[data-partia-dirty]')).toBe(false)
    // Клиент — логин, подпись — компания.
    const client = w.get('[data-partia-client]')
    expect(client.attributes('data-value')).toBe('kazakhmys')
    expect(client.get('[data-option="kazakhmys"]').text()).toBe('ТОО «Казахмыс Трейд»')
    expect(client.get('[data-option="client_beta"]').text()).toBe('client_beta')
    expect((w.get('[data-partia-station] input').element as HTMLInputElement).value).toBe('Сарыагаш')
    expect((w.get('[data-partia-seal]').element as HTMLInputElement).value).toBe('SL-123')
    expect((w.get('[data-partia-customs] input').element as HTMLInputElement).value).toBe('ТП «Сарыагаш»')
    const shipper = w.get('[data-party="shipper"]')
    expect(shipper.text()).toContain('Lenovo Ltd')
    expect(shipper.get('[data-party-address]').text()).toBe('CN · Guangdong, Shenzhen, Nanshan 1')
    expect(w.findAll('[data-goods-card]')).toHaveLength(2)
    expect(w.findAll('[data-doc44-row]')).toHaveLength(1)
    expect(has('[data-doc44-more]')).toBe(false)
    expect(w.get('[data-partia-transit-text]').text()).toBe(
      'заполнены: основное, организации, перевозчики… — 10 из 10 разделов',
    )
    // Вкладки просмотра: файлы партии, затем контейнера; инвойс партии — в списке инвойсов.
    expect(w.findAll('[data-doc-tab]').map((b) => b.attributes('data-doc-tab'))).toEqual(['f-inv', 'f-tsd', 'f-rail'])
    expect(w.get('[data-doc-tab="f-rail"]').text()).toContain('контейнер')
    expect(w.findAll('[data-partia-invoice]').map((b) => b.text())).toEqual(['invoice.pdf'])
    expect(api.downloadFile).toHaveBeenCalledWith('pkg1', 'f-inv')
    expect(w.get('[data-doc-pdf]').attributes('src')).toBe('blob:doc')
  })

  it('404 — «Партия не найдена» со ссылкой на разбор; чужой id партии — тоже', async () => {
    api.getById.mockRejectedValueOnce(httpError(404))
    await open()
    expect(w.get('[data-partia-not-found]').text()).toContain('Партия не найдена')
    expect(w.get('[data-partia-not-found] a').attributes('href')).toBe('/document-packages/pkg1/workspace')
    w.unmount()
    await open('/document-packages/pkg1/partia/nope')
    expect(has('[data-partia-not-found]')).toBe(true)
    expect(has('[data-partia-header]')).toBe(false)
  })

  it('прочая ошибка — «Не удалось открыть партию» и «Повторить»', async () => {
    api.getById.mockRejectedValueOnce(httpError(500))
    await open()
    expect(w.get('[data-partia-error]').text()).toContain('Не удалось открыть партию')
    await w.get('[data-partia-retry]').trigger('click')
    await settle()
    expect(has('[data-partia-error]')).toBe(false)
    expect(has('[data-partia-header]')).toBe(true)
  })

  it('без документов — подсказка привязать их на странице разбора', async () => {
    stored = pkg({ files: [] })
    await open()
    expect(w.get('[data-doc-empty]').text()).toBe('К партии ещё не привязаны документы — привяжите их на странице разбора')
  })
})

describe('PartiaPage: правка и сохранение', () => {
  it('правка → «не сохранено» → «Сохранить партию» шлёт полное тело PUT', async () => {
    await open()
    await typeIn('[data-partia-seal]', 'NEW-1')
    await typeIn('[data-partia-customs]', 'КПП Хоргос')
    expect(has('[data-partia-dirty]')).toBe(true)
    await w.get('[data-partia-save]').trigger('click')
    await settle()
    const expected = draftFromPartia(fullPartia())
    expected.sealNumber = 'NEW-1'
    expected.destinationCustomsAuthority = 'КПП Хоргос'
    expect(api.updateClientConsolidation).toHaveBeenCalledWith('pkg1', 'c1', 'p1', partiaToBody(expected))
    expect(toast.success).toHaveBeenCalledWith('Партия успешно обновлена')
  })

  it('Ctrl/⌘+S сохраняет; пока открыто подтверждение — нет', async () => {
    await open()
    await typeIn('[data-partia-seal]', 'X')
    const e = new KeyboardEvent('keydown', { key: 's', metaKey: true, cancelable: true })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    await settle()
    expect(api.updateClientConsolidation).toHaveBeenCalledTimes(1)
    await typeIn('[data-partia-seal]', 'Y')
    void router.push('/document-packages/pkg1/workspace')
    await settle()
    expect(confirmState.open).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true }))
    await settle()
    expect(api.updateClientConsolidation).toHaveBeenCalledTimes(1)
  })

  it('стороны: карточка → окно → «Применить» пишет адрес в черновик', async () => {
    await open()
    await w.get('[data-party="consignee"]').trigger('click')
    const modal = w.get('[data-party-modal]')
    expect(modal.attributes('data-title')).toBe('Получатель')
    await typeIn('[data-party-modal] [data-party-f="city"]', 'Астана')
    await typeIn('[data-party-modal] [data-party-f="street"]', 'Кабанбай батыра 1')
    await w.get('[data-party-modal] [data-ok]').trigger('click')
    await nextTick()
    expect(w.get('[data-party="consignee"] [data-party-address]').text()).toBe('KZ · Алматинская, Астана, Кабанбай батыра 1')
    expect(has('[data-partia-dirty]')).toBe(true)
  })

  it('«Из инвойса» при товарах: «Добавить к существующим» — в конец (клиент — id из портфеля)', async () => {
    invoice.extractGoods.mockResolvedValue({
      status: 'done', matchResult: 'matched', aiUsed: true, confidence: 0.9, source: 'ai', runId: 'r',
      header: { currencyCode: 'USD' }, items: [{ commodityCode: '4202121900', customsValue: 900, weightKg: 54, quantity: 120, commodityCodeDeprecation: null }],
    })
    await open()
    const input = w.get('[data-import-input]')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'inv.pdf')], configurable: true })
    await input.trigger('change')
    await settle()
    expect(invoice.extractGoods).toHaveBeenCalledWith(expect.any(File), 'u-k')
    await w.get('[data-import-append]').trigger('click')
    await settle()
    expect(w.findAll('[data-goods-card]')).toHaveLength(3)
  })

  it('битый transitDataJson — плашка и «Сохранить всё равно» (PUT с force)', async () => {
    stored = pkg({ containers: [container({ consolidations: [fullPartia({ transitDataJson: '[1,2]' })] }), container({ id: 'c2', consolidations: [] })] })
    await open()
    expect(w.get('[data-partia-transit-broken]').text()).toContain('Транзитные данные партии не прочитались')
    await w.get('[data-partia-save]').trigger('click')
    await settle()
    expect(api.updateClientConsolidation).not.toHaveBeenCalled()
    await w.get('[data-partia-force-save]').trigger('click')
    await settle()
    expect(api.updateClientConsolidation).toHaveBeenCalledTimes(1)
  })

  it('инвойс к сохранённой партии: загрузка + привязка как инвойс, файл — во вкладках', async () => {
    const withInvoice = pkg()
    withInvoice.files.push({ ...withInvoice.files[2], id: 'f-new', originalFileName: 'new.pdf' })
    api.uploadFile.mockResolvedValue({ id: 'f-new' })
    api.linkFile.mockResolvedValue(withInvoice)
    await open()
    const input = w.get('[data-partia-invoice-input]')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'new.pdf')], configurable: true })
    await input.trigger('change')
    await settle()
    expect(api.uploadFile).toHaveBeenCalledWith('pkg1', expect.any(File))
    expect(api.linkFile).toHaveBeenCalledWith('pkg1', 'f-new', { containerId: null, clientConsolidationId: 'p1', documentType: 'invoice' })
    expect(toast.success).toHaveBeenCalledWith('Инвойс прикреплён')
    expect(w.findAll('[data-partia-invoice]').map((b) => b.text())).toEqual(['invoice.pdf', 'new.pdf'])
    expect(w.get('[data-doc-tab="f-new"]').attributes('aria-selected')).toBe('true')
  })
})

describe('PartiaPage: новая партия', () => {
  const created = () => {
    const after = pkg()
    after.containers[1].consolidations = [fullPartia({ id: 'p-new', containerId: 'c2', clientName: 'client_beta', transitDataJson: null })]
    return after
  }

  it('клиент обязателен; создание, инвойсы из очереди, переход на адрес партии', async () => {
    api.createClientConsolidation.mockImplementation(async () => {
      stored = created()
      return structuredClone(stored)
    })
    api.uploadFile.mockResolvedValue({ id: 'f-q' })
    api.linkFile.mockImplementation(async () => structuredClone(stored))
    await open('/document-packages/pkg1/partia/new?container=c2')
    expect(w.get('[data-partia-title]').text()).toBe('Новая партия')
    expect(w.get('[data-partia-context]').text()).toBe('Поезд 1234 · контейнер TCLU 123456 7')
    expect(w.get('[data-partia-client]').attributes('data-value')).toBe('')
    expect(has('[data-partia-pending-hint]')).toBe(true)

    await w.get('[data-partia-save]').trigger('click')
    await settle()
    expect(api.createClientConsolidation).not.toHaveBeenCalled()
    expect(w.get('[data-partia-save-error]').text()).toContain('Выберите клиента партии.')

    await w.get('[data-partia-client] [data-option="client_beta"]').trigger('click')
    const input = w.get('[data-partia-invoice-input]')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'q.pdf')], configurable: true })
    await input.trigger('change')
    await nextTick()
    expect(w.findAll('[data-partia-pending]').map((x) => x.text())).toEqual(['q.pdf'])

    await w.get('[data-partia-save]').trigger('click')
    await settle()
    expect(api.createClientConsolidation).toHaveBeenCalledWith('pkg1', 'c2', expect.objectContaining({ clientName: 'client_beta' }))
    expect(api.uploadFile).toHaveBeenCalledWith('pkg1', expect.any(File), { silent: true })
    expect(api.linkFile).toHaveBeenCalledWith('pkg1', 'f-q', { containerId: null, clientConsolidationId: 'p-new', documentType: 'invoice' }, { silent: true })
    expect(router.currentRoute.value.path).toBe('/document-packages/pkg1/partia/p-new')
    expect(confirmState.open).toBe(false)
    expect(has('[data-partia-dirty]')).toBe(false)
    // Переход на созданную не перечитывает её.
    expect(api.getById).toHaveBeenCalledTimes(1)
  })

  it('создана, но не нашлась в ответе — плашка с «Обновить» (перезагрузка), повторного POST нет', async () => {
    api.createClientConsolidation.mockImplementation(async () => structuredClone(stored))
    await open('/document-packages/pkg1/partia/new?container=c2')
    await w.get('[data-partia-client] [data-option="client_beta"]').trigger('click')
    await w.get('[data-partia-save]').trigger('click')
    await settle()
    expect(w.get('[data-partia-created-lost]').text()).toContain('Партия создана, но не нашлась в ответе сервера')
    expect(router.currentRoute.value.path).toBe('/document-packages/pkg1/partia/new')
    await w.get('[data-partia-save]').trigger('click')
    await settle()
    expect(api.createClientConsolidation).toHaveBeenCalledTimes(1)
    await w.get('[data-partia-refresh]').trigger('click')
    await settle()
    expect(api.getById).toHaveBeenCalledTimes(2)
    expect(has('[data-partia-created-lost]')).toBe(false)
  })

  it('пустой портфель — подсказка обратиться к администратору', async () => {
    reestr.listPortfolioClients.mockResolvedValue([])
    await open('/document-packages/pkg1/partia/new?container=c2')
    expect(w.text()).toContain('Нет клиентов в вашем портфеле — обратитесь к администратору')
  })

  it('без права правки новой партии нет — назад к разбору', async () => {
    as('expeditor', ['reestr.read'])
    await open('/document-packages/pkg1/partia/new?container=c2')
    expect(router.currentRoute.value.path).toBe('/document-packages/pkg1/workspace')
  })
})

describe('PartiaPage: защита ухода', () => {
  it('крестик с правками спрашивает «Уйти без сохранения?»: «Остаться» — на месте, «Уйти» — к разбору', async () => {
    await open()
    await typeIn('[data-partia-seal]', 'X')
    await w.get('[data-partia-close]').trigger('click')
    await settle()
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Уйти без сохранения?')
    expect(confirmState.content).toBe('В партии есть несохранённые изменения. Если уйти со страницы, они пропадут.')
    expect(confirmState.okText).toBe('Уйти без сохранения')
    expect(confirmState.cancelText).toBe('Остаться')
    confirmState.resolve(false)
    await settle()
    expect(router.currentRoute.value.path).toBe('/document-packages/pkg1/partia/p1')
    await w.get('[data-partia-cancel]').trigger('click')
    await settle()
    confirmState.resolve(true)
    await settle()
    expect(router.currentRoute.value.path).toBe('/document-packages/pkg1/workspace')
  })

  it('без правок «Отмена» уходит без вопроса; beforeunload — только с правками', async () => {
    await open()
    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)
    await typeIn('[data-partia-seal]', 'X')
    const dirty = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirty)
    expect(dirty.defaultPrevented).toBe(true)
    w.unmount()
    await open()
    await w.get('[data-partia-cancel]').trigger('click')
    await settle()
    expect(confirmState.open).toBe(false)
    expect(router.currentRoute.value.path).toBe('/document-packages/pkg1/workspace')
  })
})

describe('PartiaPage: только чтение и ширина', () => {
  it('без reestr.write: поля disabled без подсказок; нет «Сохранить», «Из инвойса», «Прикрепить»', async () => {
    as('expeditor', ['reestr.read'])
    await open()
    expect(has('[data-partia-save]')).toBe(false)
    expect(has('[data-partia-cancel]')).toBe(false)
    expect(has('[data-import-button]')).toBe(false)
    expect(has('[data-partia-attach]')).toBe(false)
    expect(w.get('[data-partia-client]').attributes('data-disabled')).toBe('true')
    expect(w.get('[data-partia-station]').attributes('data-disabled')).toBe('true')
    expect(w.get('[data-partia-seal]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-partia-seal]').attributes('placeholder') ?? '').toBe('')
    expect(w.get('[data-party="shipper"]').element.tagName).toBe('DIV')
    expect(reestr.listPortfolioClients).not.toHaveBeenCalled()
    // Транзитная декларация открывается для просмотра.
    await w.get('[data-partia-transit-open]').trigger('click')
    await nextTick()
    expect(w.find('[data-transit-drawer] [data-section-add]').exists()).toBe(false)
  })

  it('уже 1280 px: просмотр скрыт, «Документ» открывает его в шторке', async () => {
    mockMedia(false)
    await open()
    expect(has('[data-partia-viewer]')).toBe(false)
    expect(has('[data-doc-viewer]')).toBe(false)
    await w.get('[data-partia-document]').trigger('click')
    await settle()
    expect(w.get('[data-partia-doc-drawer]').find('[data-doc-viewer]').exists()).toBe(true)
    expect(api.downloadFile).toHaveBeenCalledWith('pkg1', 'f-inv')
  })
})
