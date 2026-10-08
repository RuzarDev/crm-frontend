import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, onMounted } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ReestrEntry } from '@/types/api'
import { fullEntry } from './recordFixture'

const api = vi.hoisted(() => ({
  getById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), changeStatus: vi.fn(), getList: vi.fn(),
  listClientsForCreate: vi.fn(), listFilterClients: vi.fn(),
}))
const tnved = vi.hoisted(() => ({ node: vi.fn(), rates: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
const docsReload = vi.hoisted(() => vi.fn())
vi.mock('@/api/reestr', () => ({ reestrApi: api }))
vi.mock('@/api/tnved', () => ({ tnvedApi: tnved }))
vi.mock('@/api/references', async () => ({ referencesApi: (await import('../sections/__tests__/harness')).refsApi }))
vi.mock('@/ui/message', () => ({ message: toast }))

import TransitRecordPage from '../TransitRecordPage.vue'
import { useAuthStore } from '@/stores/auth'
import { confirmState } from '@/ui/confirm'
import { ComboStub, SelectStub, primeRefs } from '../sections/__tests__/harness'

// Вкладки (Task 5) — заглушки: видно пропсы, счётчики приходят при монтировании, как у настоящих.
const DocsStub = defineComponent({
  name: 'RecordDocuments',
  props: ['reestrId', 'status', 'dirty'],
  emits: ['applied', 'count'],
  setup(p, { emit, expose }) {
    expose({ reload: docsReload })
    onMounted(() => emit('count', 4))
    return () => h('div', { 'data-docs-stub': '', 'data-id': p.reestrId, 'data-dirty': String(p.dirty), 'data-status': String(p.status) })
  },
})
const HistoryStub = defineComponent({
  name: 'RecordHistory',
  props: ['reestrId', 'refreshKey'],
  setup: (p) => () => h('div', { 'data-history-stub': '', 'data-key': String(p.refreshKey) }),
})
const CommentsStub = defineComponent({
  name: 'RecordComments',
  props: ['reestrId', 'readonly'],
  emits: ['count'],
  setup(p, { emit }) {
    onMounted(() => emit('count', 2))
    return () => h('div', { 'data-comments-stub': '', 'data-readonly': String(p.readonly) })
  },
})
const DropdownStub = {
  props: ['items'], emits: ['select'],
  template: '<div><slot /><button v-for="i in items" :key="i.key" type="button" :data-menu-item="i.key" @click="$emit(\'select\', i.key)">{{ i.label }}</button></div>',
}
const ModalStub = {
  props: ['open', 'okButtonProps', 'title'], emits: ['ok', 'update:open'],
  template: '<div v-if="open" data-modal><slot /><button data-ok type="button" @click="$emit(\'ok\')" /></div>',
}
const stubs = {
  ZSelect: SelectStub, ZCombobox: ComboStub, ZDropdown: DropdownStub, ZModal: ModalStub,
  RecordDocuments: DocsStub, RecordHistory: HistoryStub, RecordComments: CommentsStub,
}

const App = defineComponent({ render: () => h(RouterView) })

let w: VueWrapper
let pinia: Pinia
let router: Router
let stored: Record<string, ReestrEntry>

const httpError = (status: number, data?: unknown) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } })
const deferred = <T>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}
const as = (role: string, perms: string[], userId = 'u1') => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = perms
  auth.userId = userId
}
const settle = async () => {
  await flushPromises()
  await nextTick()
  await flushPromises()
}
const open = async (path = '/reestr/r1') => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(App, { attachTo: document.body, global: { plugins: [pinia, router], stubs } })
  await settle()
}
const has = (sel: string) => w.find(sel).exists()
const f = (key: string) => w.get(`[data-f="${key}"]`)
const input = (key: string) => (f(key).element.tagName === 'INPUT' ? f(key) : f(key).get('input'))
const type = async (key: string, text: string) => {
  ;(input(key).element as HTMLInputElement).value = text
  await input(key).trigger('input')
  await nextTick()
}
const crumbs = () => w.findAll('[data-record-header] nav li').map((li) => li.text().replace('/', '').trim())
const tabs = () => w.findAll('[role="tab"]').map((b) => b.text().replace(/\s+/g, ' ').trim())
const shown = (sel: string) => (w.get(sel).element as HTMLElement).style.display !== 'none'
const visiblePanel = (key: string) => shown(`[data-record-panel="${key}"]`)

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  const stub = { template: '<div data-other-page />' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/reestr', name: 'reestr', component: stub },
      { path: '/reestr/:id', name: 'reestr-record', component: TransitRecordPage },
      { path: '/my-documents', component: stub },
      { path: '/clients/:id', component: stub },
    ],
  })
  stored = {
    r1: fullEntry(),
    r2: fullEntry({ id: 'r2', data: { ...fullEntry().data, '№': 'R-2', 'Контейнер': 'MRSU4885849' } }),
  }
  api.getById.mockImplementation(async (id: string) => {
    if (!stored[id]) throw httpError(404)
    return structuredClone(stored[id])
  })
  api.update.mockResolvedValue(undefined)
  api.create.mockResolvedValue({ id: 'new-id' })
  api.delete.mockResolvedValue(undefined)
  api.changeStatus.mockResolvedValue(undefined)
  api.getList.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 25, totalPages: 0 })
  api.listClientsForCreate.mockResolvedValue([
    { id: 'c1', username: 'ТОО «Казахмыс Трейд»', declarationCount: 3 },
    { id: 'c2', username: 'ТОО «Бета»', declarationCount: 0 },
  ])
  tnved.node.mockResolvedValue({ data: { is10: true, name: 'Ноутбуки' } })
  tnved.rates.mockResolvedValue(null)
  primeRefs()
  as('administrator', [])
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('TransitRecordPage: загрузка и шапка', () => {
  it('шапка: крошки, контейнер, статус, клиент, маршрут, ТД; вкладки со счётчиками; без правок плашки нет', async () => {
    await open()
    expect(api.getById).toHaveBeenCalledWith('r1', { silent: true })
    expect(crumbs()).toEqual(['Транзит', '2026-0030'])
    expect(w.get('[data-record-title]').text()).toBe('DRYU 995372 6')
    expect(w.get('[data-record-status]').text()).toBe('Подан')
    expect(w.get('[data-record-client]').text()).toBe('ТОО «Казахмыс Трейд»')
    expect(w.get('[data-record-route]').text()).toContain('Хоргос → Сарыагаш')
    expect(w.get('[data-record-td]').text().replace(/\s+/g, ' ')).toContain('ТД 56000/221')
    expect(tabs()).toEqual(['Данные', 'Документы 4', 'История статусов', 'Комментарии 2'])
    expect(has('[data-record-savebar]')).toBe(false)
    // Все разделы «Данных» и меню.
    expect(w.findAll('[data-record-section]')).toHaveLength(13)
    expect(has('[data-record-nav]')).toBe(true)
  })

  it('без контейнера — «Запись № …»; из «Моих документов» — крошки «Мои документы»', async () => {
    stored.r1 = fullEntry({ data: { ...fullEntry().data, 'Контейнер': null } })
    await open('/reestr/r1?from=my-documents')
    expect(w.get('[data-record-title]').text()).toBe('Запись № 2026-0030')
    expect(crumbs()).toEqual(['Мои документы', '2026-0030'])
    expect(w.get('[data-record-header] nav a').attributes('href')).toBe('/my-documents')
  })

  it('404 — «Запись не найдена» со ссылкой к списку', async () => {
    await open('/reestr/missing')
    expect(w.get('[data-record-not-found]').text()).toContain('Запись не найдена')
    expect(w.get('[data-record-not-found] a').attributes('href')).toBe('/reestr')
    expect(has('[data-record-header]')).toBe(false)
  })

  it('прочая ошибка — «Не удалось открыть» и «Повторить»', async () => {
    api.getById.mockRejectedValueOnce(httpError(500))
    await open()
    expect(w.get('[data-record-error]').text()).toContain('Не удалось открыть запись')
    await w.get('[data-record-retry]').trigger('click')
    await settle()
    expect(api.getById).toHaveBeenCalledTimes(2)
    expect(w.get('[data-record-title]').text()).toBe('DRYU 995372 6')
  })

  it('загрузка — скелетон по форме страницы', async () => {
    const d = deferred<ReestrEntry>()
    api.getById.mockReturnValueOnce(d.promise)
    await open()
    expect(has('[data-record-skeleton]')).toBe(true)
    d.resolve(fullEntry())
    await settle()
    expect(has('[data-record-skeleton]')).toBe(false)
  })

  it('устаревший код ТН ВЭД — предупреждение над разделами', async () => {
    stored.r1 = fullEntry({ deprecationWarning: { deprecatedCode: '8471300000', replacementCodes: ['8471301000', '8471309000'], sourceVersion: '01.01.2026' } })
    await open()
    const alert = w.get('[data-record-deprecation]')
    expect(alert.text()).toContain('Код ТН ВЭД 8471300000 устарел')
    expect(alert.text()).toContain('с 01.01.2026')
    expect(alert.text()).toContain('8471301000')
  })
})

describe('TransitRecordPage: вкладки', () => {
  it('?tab= читается; переключение пишет ?tab= через replace; «Данные» — без параметра', async () => {
    await open('/reestr/r1?tab=documents')
    expect(visiblePanel('documents')).toBe(true)
    expect(visiblePanel('data')).toBe(false)
    expect(w.get('[data-docs-stub]').attributes()).toMatchObject({ 'data-id': 'r1', 'data-dirty': 'false', 'data-status': '1' })
    const replace = vi.spyOn(router, 'replace')
    const comments = w.findAll('[role="tab"]').find((b) => b.text().startsWith('Комментарии'))!
    await comments.trigger('mousedown', { button: 0 })
    await comments.trigger('focus')
    await settle()
    expect(router.currentRoute.value.query.tab).toBe('comments')
    expect(replace).toHaveBeenCalled()
    expect(visiblePanel('comments')).toBe(true)
    const data = w.findAll('[role="tab"]').find((b) => b.text() === 'Данные')!
    await data.trigger('mousedown', { button: 0 })
    await settle()
    expect(router.currentRoute.value.query.tab).toBeUndefined()
    expect(visiblePanel('data')).toBe(true)
  })

  it('неизвестная вкладка — «Данные»; клиенту история скрыта, ?tab=history — «Данные»', async () => {
    as('client', ['reestr.read'])
    await open('/reestr/r1?tab=history')
    expect(tabs()).toEqual(['Данные', 'Документы 4', 'Комментарии 2'])
    expect(has('[data-history-stub]')).toBe(false)
    expect(visiblePanel('data')).toBe(true)
  })

  it('правки не теряются при переходе между вкладками; «Документы» знают о правках (dirty)', async () => {
    await open()
    await type('Груз', 'Ноутбуки Lenovo')
    await router.replace({ query: { tab: 'documents' } })
    await settle()
    expect(w.get('[data-docs-stub]').attributes('data-dirty')).toBe('true')
    await router.replace({ query: {} })
    await settle()
    expect((input('Груз').element as HTMLInputElement).value).toBe('Ноутбуки Lenovo')
  })

  it('автозаполнение применено («applied») — запись перечитывается', async () => {
    await open()
    w.findComponent({ name: 'RecordDocuments' }).vm.$emit('applied', 1)
    await settle()
    expect(api.getById).toHaveBeenCalledTimes(2)
  })
})

describe('TransitRecordPage: права', () => {
  it('без reestr.write — без плашки сохранения, поля только для чтения, без «Сменить статус» и «⋯»', async () => {
    as('importer', ['reestr.read'])
    await open()
    expect(has('[data-record-savebar]')).toBe(false)
    expect(has('[data-record-change-status]')).toBe(false)
    expect(has('[data-record-more]')).toBe(false)
    const data = w.get('[data-record-panel="data"]')
    // Разделы КЕДЕН — выключенные поля, товары и гр. 44 — текстом: включённых полей нет вовсе.
    expect(data.findAll('input:not([disabled]), textarea:not([disabled])')).toHaveLength(0)
    expect(input('Груз').attributes('disabled')).toBeDefined()
    // Ctrl+S ничего не отправляет.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    await settle()
    expect(api.update).not.toHaveBeenCalled()
  })

  it('клиент: данные только для чтения, комментарии — чтение, история скрыта', async () => {
    as('client', ['reestr.read'])
    await open()
    expect(has('[data-record-savebar]')).toBe(false)
    expect(w.get('[data-comments-stub]').attributes('data-readonly')).toBe('true')
    expect(w.get('[data-record-panel="data"]').findAll('input:not([disabled])')).toHaveLength(0)
  })

  it('status.change — «Сменить статус»; reestr.delete — «Удалить запись» в «⋯»', async () => {
    as('importer', ['reestr.read', 'status.change'])
    await open()
    expect(has('[data-record-change-status]')).toBe(true)
    expect(has('[data-record-more]')).toBe(false)
    w.unmount()
    as('importer', ['reestr.read', 'reestr.delete'])
    await open()
    expect(has('[data-record-change-status]')).toBe(false)
    expect(w.findAll('[data-menu-item]').map((b) => b.attributes('data-menu-item'))).toEqual(['delete'])
  })
})

describe('TransitRecordPage: правка и сохранение', () => {
  it('правка → плашка с названием раздела → «Сохранить» → update полным телом исходной записи', async () => {
    await open()
    await type('Груз', 'Ноутбуки Lenovo')
    expect(w.get('[data-savebar-text]').text()).toBe('Есть несохранённые изменения · строка реестра')
    await w.get('[data-savebar-save]').trigger('click')
    await settle()
    expect(api.update).toHaveBeenCalledTimes(1)
    const [id, body] = api.update.mock.calls[0]
    expect(id).toBe('r1')
    expect(body).toMatchObject({
      cargoDescription: 'Ноутбуки Lenovo',
      customsPost: '57507 — ТП «Сарыагаш»',
      sealNumber: 'SL-123',
      status: 1,
      clientId: 'c1',
      pricePerDeclarationWithVat: 30000,
      grandTotalWithVat: 45000,
    })
    expect(body.goodsItems).toHaveLength(2)
    expect(body.doc44Items[0]).toMatchObject({ authorizedBody: 'Орган', formBlankNumber: 'BL-55' })
    expect(body.organizations).toHaveLength(1)
    expect(body.guarantees).toHaveLength(1)
    expect(toast.success).toHaveBeenCalledWith('Запись успешно обновлена')
    expect(has('[data-record-savebar]')).toBe(false)
  })

  it('«Отменить» возвращает значения и убирает плашку', async () => {
    await open()
    await type('Груз', 'Другое')
    await w.get('[data-savebar-cancel]').trigger('click')
    await settle()
    expect((input('Груз').element as HTMLInputElement).value).toBe('Ноутбуки')
    expect(has('[data-record-savebar]')).toBe(false)
    expect(api.getById).toHaveBeenCalledTimes(1)
  })

  it('Ctrl/⌘+S сохраняет', async () => {
    await open()
    await type('Груз', 'Ноутбуки Lenovo')
    const e = new KeyboardEvent('keydown', { key: 's', metaKey: true, cancelable: true })
    window.dispatchEvent(e)
    await settle()
    expect(e.defaultPrevented).toBe(true)
    expect(api.update).toHaveBeenCalledTimes(1)
  })

  it('ошибка сохранения — плашка с текстом сервера над вкладками; следующая правка её убирает', async () => {
    api.update.mockRejectedValueOnce(httpError(400, { error: 'Код ТН ВЭД не найден' }))
    await open()
    await type('Груз', 'x')
    await w.get('[data-savebar-save]').trigger('click')
    await settle()
    const alert = w.get('[data-record-save-error]')
    expect(alert.text()).toContain('Запись не сохранена')
    expect(alert.text()).toContain('Код ТН ВЭД не найден')
    expect(has('[data-record-savebar]')).toBe(true)
    await type('Груз', 'xy')
    expect(has('[data-record-save-error]')).toBe(false)
  })

  it('пока идёт сохранение — кнопка в загрузке и не нажимается повторно', async () => {
    const d = deferred<void>()
    api.update.mockReturnValueOnce(d.promise)
    await open()
    await type('Груз', 'x')
    await w.get('[data-savebar-save]').trigger('click')
    await nextTick()
    expect(w.get('[data-savebar-save]').attributes('aria-busy')).toBe('true')
    await w.get('[data-savebar-save]').trigger('click')
    d.resolve()
    await settle()
    expect(api.update).toHaveBeenCalledTimes(1)
  })

  it('таможня отправления длиннее 32 знаков — сохранение не уходит, плашка объясняет', async () => {
    stored.r1 = fullEntry({ transit: { ...fullEntry().transit, departureCustomsOffice: 'ТАМОЖЕННЫЙ ПОСТ БЕЗ КОДА С ДЛИННЫМ НАЗВАНИЕМ' } })
    await open()
    await type('Груз', 'x')
    await w.get('[data-savebar-save]').trigger('click')
    await settle()
    expect(api.update).not.toHaveBeenCalled()
    expect(w.get('[data-record-save-error]').text()).toContain('длиннее 32 знаков')
  })

  it('не удалось перечитать — плашка с «Повторить»: повтор перечитывает, правки остаются', async () => {
    await open()
    await type('Груз', 'моя правка')
    api.getById.mockRejectedValueOnce(httpError(500))
    w.findComponent({ name: 'RecordDocuments' }).vm.$emit('applied', 1)
    await settle()
    expect(w.get('[data-record-reload-error]').text()).toContain('Не удалось обновить запись')
    await w.get('[data-record-reload-retry]').trigger('click')
    await settle()
    expect(has('[data-record-reload-error]')).toBe(false)
    expect((input('Груз').element as HTMLInputElement).value).toBe('моя правка')
    expect(api.getById).toHaveBeenCalledTimes(3)
  })
})

describe('TransitRecordPage: новая запись', () => {
  it('без вкладок; «Клиент *» сверху «Основного», первый по умолчанию; create → replace на /reestr/:id', async () => {
    await open('/reestr/new')
    expect(api.getById).not.toHaveBeenCalled()
    expect(w.findAll('[role="tab"]')).toHaveLength(0)
    expect(w.get('[data-record-title]').text()).toBe('Новая запись')
    expect(has('[data-record-status]')).toBe(false)
    expect(has('[data-record-change-status]')).toBe(false)
    expect(w.get('[data-savebar-text]').text()).toBe('Новая запись ещё не сохранена')
    const client = w.get('#sec-main [data-record-client-select]')
    expect(client.attributes('data-value')).toBe('c1')
    await client.get('[data-option="c2"]').trigger('click')
    await type('Груз', 'Ноутбуки')
    const replace = vi.spyOn(router, 'replace')
    stored['new-id'] = fullEntry({ id: 'new-id', clientId: 'c2' })
    await w.get('[data-savebar-save]').trigger('click')
    await settle()
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'c2', cargoDescription: 'Ноутбуки' }))
    expect(replace).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/reestr/new-id')
    // Переход на созданную запись не грузит её второй раз (её уже перечитал save).
    expect(api.getById).toHaveBeenCalledTimes(1)
    expect(tabs()[0]).toBe('Данные')
    expect(has('[data-record-savebar]')).toBe(false)
  })

  it('«Отменить» у новой — к списку (с правками — после подтверждения)', async () => {
    await open('/reestr/new')
    await w.get('[data-savebar-cancel]').trigger('click')
    await settle()
    expect(router.currentRoute.value.path).toBe('/reestr')
  })

  it('без reestr.write новая запись не открывается — к списку', async () => {
    as('importer', ['reestr.read'])
    await open('/reestr/new')
    expect(router.currentRoute.value.path).toBe('/reestr')
  })

  it('ушли на другую запись, пока создавалась новая — адрес не подменяется', async () => {
    const d = deferred<{ id: string }>()
    api.create.mockReturnValueOnce(d.promise)
    await open('/reestr/new')
    await type('Груз', 'Ноутбуки')
    await w.get('[data-savebar-save]').trigger('click')
    await nextTick()
    const nav = router.push('/reestr/r2')
    await settle()
    confirmState.resolve(true)
    await nav
    await settle()
    stored['new-id'] = fullEntry({ id: 'new-id' })
    d.resolve({ id: 'new-id' })
    await settle()
    expect(router.currentRoute.value.path).toBe('/reestr/r2')
    expect(w.get('[data-record-title]').text()).toBe('MRSU 488584 9')
  })
})

describe('TransitRecordPage: защита правок, статус, удаление', () => {
  it('уход с правками спрашивает: «Вернуться» оставляет, «Закрыть без сохранения» уводит', async () => {
    await open()
    await type('Груз', 'x')
    const first = router.push('/reestr')
    await settle()
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Закрыть без сохранения?')
    expect(confirmState.okText).toBe('Закрыть без сохранения')
    expect(confirmState.cancelText).toBe('Вернуться к записи')
    expect(confirmState.danger).toBe(true)
    confirmState.resolve(false)
    await first
    await settle()
    expect(router.currentRoute.value.path).toBe('/reestr/r1')
    const second = router.push('/reestr')
    await settle()
    confirmState.resolve(true)
    await second
    await settle()
    expect(router.currentRoute.value.path).toBe('/reestr')
  })

  it('без правок уходит без вопроса; beforeunload — только с правками', async () => {
    await open()
    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)
    await type('Груз', 'x')
    const dirty = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirty)
    expect(dirty.defaultPrevented).toBe(true)
    await w.get('[data-savebar-cancel]').trigger('click')
    await router.push('/reestr')
    await settle()
    expect(confirmState.open).toBe(false)
    expect(router.currentRoute.value.path).toBe('/reestr')
  })

  it('переход на другую запись с правками тоже спрашивает', async () => {
    await open()
    await type('Груз', 'x')
    const nav = router.push('/reestr/r2')
    await settle()
    expect(confirmState.open).toBe(true)
    confirmState.resolve(false)
    await nav
    expect(router.currentRoute.value.path).toBe('/reestr/r1')
  })

  it('«Сменить статус» → PATCH → запись перечитывается, история обновляется', async () => {
    await open()
    expect(w.get('[data-history-stub]').attributes('data-key')).toBe('0')
    await w.get('[data-record-change-status]').trigger('click')
    await settle()
    const modal = w.get('[data-modal]')
    await modal.get('[data-option="2"]').trigger('click')
    stored.r1 = fullEntry({ status: 2 })
    await modal.get('[data-ok]').trigger('click')
    await settle()
    expect(api.changeStatus).toHaveBeenCalledWith('r1', 2)
    expect(api.getById).toHaveBeenCalledTimes(2)
    expect(w.get('[data-record-status]').text()).toBe('Выпущено')
    expect(w.get('[data-history-stub]').attributes('data-key')).toBe('1')
  })

  it('«Удалить запись» → подтверждение → DELETE → к списку (без вопроса о правках)', async () => {
    await open()
    await type('Груз', 'x')
    await w.get('[data-menu-item="delete"]').trigger('click')
    await settle()
    expect(confirmState.title).toBe('Удалить эту запись?')
    confirmState.resolve(true)
    await settle()
    expect(api.delete).toHaveBeenCalledWith('r1')
    expect(router.currentRoute.value.path).toBe('/reestr')
    expect(confirmState.open).toBe(false)
  })

  it('удаление отменили — запрос не уходит', async () => {
    await open()
    await w.get('[data-menu-item="delete"]').trigger('click')
    await settle()
    confirmState.resolve(false)
    await settle()
    expect(api.delete).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/reestr/r1')
  })
})
