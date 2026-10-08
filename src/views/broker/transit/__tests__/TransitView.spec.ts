import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ReestrEntry } from '@/types/api'

const api = vi.hoisted(() => ({
  getList: vi.fn(), exportFile: vi.fn(), clients: vi.fn(), filterClients: vi.fn(), changeStatus: vi.fn(),
  del: vi.fn(), bulkDelete: vi.fn(), upload: vi.fn(), create: vi.fn(), update: vi.fn(),
  saveBlob: vi.fn(), importOpen: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/reestr', () => ({
  reestrApi: {
    getList: api.getList, exportFile: api.exportFile, listClientsForCreate: api.clients, listFilterClients: api.filterClients,
    changeStatus: api.changeStatus, delete: api.del, bulkDelete: api.bulkDelete, uploadFile: api.upload, create: api.create, update: api.update,
  },
}))
vi.mock('@/ui/message', () => ({ message: api.toast }))
vi.mock('@/ui/download', () => ({ saveBlob: api.saveBlob }))
// Форма записи (AntD, тяжёлая) — заглушка с теми же пропсами; видно, в каком режиме её открыли.
vi.mock('@/components/ReestrForm.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'ReestrForm',
      props: ['open', 'loading', 'entry', 'clientOptions', 'statusHistoryRefreshKey', 'viewMode', 'initialTab', 'saveError'],
      emits: ['submit', 'cancel', 'applied'],
      setup: (p) => () => h('div', {
        'data-form': '', 'data-open': String(!!p.open), 'data-mode': p.viewMode, 'data-tab': p.initialTab, 'data-entry': p.entry?.id ?? '',
      }),
    }),
  }
})
vi.mock('@/components/ImportInvoiceButton.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'ImportInvoiceButton',
      props: { clientOptions: Array, hideTrigger: Boolean },
      emits: ['imported'],
      setup: (p, { expose }) => {
        expose({ open: api.importOpen })
        return () => h('div', { 'data-import-stub': '', 'data-hide': String(!!p.hideTrigger) })
      },
    }),
  }
})

import TransitView from '../TransitView.vue'
import FilterChip from '@/components/broker/FilterChip.vue'
import PeriodChip from '@/components/broker/PeriodChip.vue'
import ZPagination from '@/components/z/ZPagination.vue'
import { useAuthStore } from '@/stores/auth'
import { useReestrStore } from '@/stores/reestr'
import { confirmState } from '@/ui/confirm'

const entry = (id: string, o: Partial<ReestrEntry> = {}, data: Record<string, string | null> = {}): ReestrEntry => ({
  id, createdAtUtc: '2026-10-08T08:00:00Z', status: 0, clientId: 'c1', grandTotalWithVat: 86400,
  data: {
    '№': `2026-00${id}`, 'Дата': '2026-10-08', 'Контейнер': 'MRSU4885849', 'Получатель': 'ТОО «Альфа»', 'Станция назначения': 'Достык',
    'Пост': null, 'Отправитель': null, 'Отправка': null, 'Груз': 'Ноутбуки', 'Подкод': null, 'Код ТНВЭД': '8471300000',
    'Количество мест': '9', 'Вес': '8529', 'ТД': '56000/221', 'Кол-во ТД': '1', 'Количество доп.листов': null, ...data,
  },
  goods: [], doc44: [], transit: {} as ReestrEntry['transit'], organizations: [], carriers: [], transportMeans: [], identificationMeans: [],
  packages: [], containers: [], precedingDocs: [], cargoOperations: [], guarantees: [],
  ...o,
})
const ENTRIES = [
  entry('31'),
  entry('30', { status: 2, grandTotalWithVat: null }, { 'Количество мест': '3', 'Вес': '12.5', 'Получатель': null }),
]

let w: VueWrapper
let pinia: Pinia
let router: Router
const DropdownStub = {
  props: ['items'], emits: ['select'],
  template: '<div><slot /><button v-for="i in items" :key="i.key" type="button" :data-item="i.key" :data-checked="i.checked" @click="$emit(\'select\', i.key)">{{ i.label }}</button></div>',
}

const as = (role: string, perms: string[]) => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = perms
}
const mountAt = async (path = '/reestr') => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(TransitView, { attachTo: document.body, global: { plugins: [pinia, router], stubs: { ZDropdown: DropdownStub } } })
  await flushPromises()
}
const lastList = () => api.getList.mock.calls.at(-1)![0]
const row = (i: number) => w.findAll('tbody tr')[i]
const rowActions = (i = 0) => ['view', 'documents', 'edit', 'more'].filter((a) => row(i).find(`[data-row-${a}]`).exists())
const rowMenu = (i = 0) => row(i).findAll('[data-transit-actions] [data-item]').map((b) => b.attributes('data-item'))
const has = (sel: string) => w.find(sel).exists()
const form = () => w.get('[data-form]')

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  api.getList.mockImplementation(async (p: { page: number; pageSize: number }) => ({ items: ENTRIES, totalCount: 60, page: p.page, pageSize: p.pageSize, totalPages: 3 }))
  api.clients.mockResolvedValue([{ id: 'c1', username: 'alfa', declarationCount: 0 }, { id: 'c2', username: 'beta', declarationCount: 0 }])
  api.filterClients.mockResolvedValue([{ id: 'c1', username: 'alfa', declarationCount: 0 }])
  api.exportFile.mockResolvedValue(new Blob(['x']))
  api.changeStatus.mockResolvedValue(undefined)
  api.bulkDelete.mockResolvedValue({ deleted: 2 })
  api.del.mockResolvedValue(undefined)
  localStorage.clear()
  as('administrator', [])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('TransitView: роли', () => {
  it('клиент: только «Выгрузить» и «Документы» (клиентский вид), без выбора и фильтров клиента/периода', async () => {
    as('client', ['reestr.read'])
    await mountAt()
    expect(['new', 'upload', 'import', 'more'].filter((k) => has(`[data-transit-${k}]`))).toEqual([])
    expect(has('[data-transit-export]')).toBe(true)
    expect(rowActions()).toEqual(['documents'])
    expect(w.findAll('[role="checkbox"]')).toHaveLength(0)
    expect(w.findAllComponents(FilterChip)).toHaveLength(1)
    expect(w.findComponent(PeriodChip).exists()).toBe(false)
    expect(api.clients).not.toHaveBeenCalled()
    expect(api.filterClients).not.toHaveBeenCalled()
    expect(has('[data-import-stub]')).toBe(false)
    await row(0).get('[data-row-documents]').trigger('click')
    expect(form().attributes()).toMatchObject({ 'data-open': 'true', 'data-mode': 'client', 'data-tab': 'documents', 'data-entry': '31' })
  })

  it('экспедитор: «Просмотр» (readonly, данные) и «Документы» (форма, документы); фильтры портфеля есть', async () => {
    as('expeditor', ['reestr.read'])
    await mountAt()
    expect(has('[data-transit-new]')).toBe(false)
    expect(rowActions()).toEqual(['view', 'documents'])
    expect(w.findAllComponents(FilterChip)).toHaveLength(2)
    expect(w.findComponent(PeriodChip).exists()).toBe(true)
    expect(api.filterClients).toHaveBeenCalledTimes(1)
    expect(api.clients).not.toHaveBeenCalled()
    await row(0).get('[data-row-view]').trigger('click')
    expect(form().attributes()).toMatchObject({ 'data-mode': 'readonly', 'data-tab': 'data' })
    await row(1).get('[data-row-documents]').trigger('click')
    expect(form().attributes()).toMatchObject({ 'data-mode': 'default', 'data-tab': 'documents', 'data-entry': '30' })
  })

  it('сотрудник только с reestr.read: «Документы» (форма на документах), без правки, выбора и создания', async () => {
    as('importer', ['reestr.read'])
    await mountAt()
    expect(rowActions()).toEqual(['documents'])
    expect(has('[data-transit-new]')).toBe(false)
    expect(w.findAll('[role="checkbox"]')).toHaveLength(0)
    expect(w.findAllComponents(FilterChip)).toHaveLength(2)
    await row(0).get('[data-row-documents]').trigger('click')
    expect(form().attributes()).toMatchObject({ 'data-mode': 'default', 'data-tab': 'documents' })
  })

  it('МПП (write + status.change): «Изменить», меню со сменой статуса без удаления, выбор строк', async () => {
    as('importer', ['reestr.read', 'reestr.write', 'status.change'])
    await mountAt()
    expect(rowActions()).toEqual(['documents', 'edit', 'more'])
    expect(rowMenu()).toEqual(['status'])
    expect(w.findAll('tbody [role="checkbox"]')).toHaveLength(2)
    expect(['new', 'upload', 'import'].every((k) => has(`[data-transit-${k}]`))).toBe(true)
    expect(api.clients).toHaveBeenCalledTimes(1)
    await row(0).get('[data-row-edit]').trigger('click')
    expect(form().attributes()).toMatchObject({ 'data-mode': 'default', 'data-tab': 'data', 'data-entry': '31' })
  })

  it('администратор: всё, в меню строки — статус и удаление', async () => {
    await mountAt()
    expect(rowActions()).toEqual(['documents', 'edit', 'more'])
    expect(rowMenu()).toEqual(['status', 'delete'])
    expect(w.findAll('tbody [role="checkbox"]')).toHaveLength(2)
    expect(w.get('[data-import-stub]').attributes('data-hide')).toBe('true')
  })

  it('колонка выбора — только при reestr.delete или status.change', async () => {
    as('importer', ['reestr.read', 'reestr.write'])
    await mountAt()
    expect(w.findAll('[role="checkbox"]')).toHaveLength(0)
    w.unmount()
    as('importer', ['reestr.read', 'reestr.delete'])
    await mountAt()
    expect(w.findAll('tbody [role="checkbox"]')).toHaveLength(2)
    expect(rowMenu()).toEqual(['delete'])
  })
})

describe('TransitView: список и фильтры', () => {
  it('запрос по 25, строки: контейнер, ТН ВЭД, числа, «—», дата; итоги страницы', async () => {
    await mountAt()
    expect(lastList()).toMatchObject({ page: 1, pageSize: 25 })
    expect(w.get('[data-transit-count]').text()).toBe('60')
    const first = row(0).text()
    expect(first).toContain('MRSU 488584 9')
    expect(first).toContain('8471 30 000 0')
    expect(first).toContain('08.10.2026')
    expect(first).toContain('8 529')
    expect(first).toContain('В работе')
    expect(row(1).text()).toContain('Выпущено')
    expect(row(1).find('[data-transit-actions]').exists()).toBe(true)
    const sums = Object.fromEntries(w.findAll('[data-sum]').map((c) => [c.attributes('data-sum'), c.text()]))
    expect(sums).toMatchObject({ places: '12', weight: '8 541,5', total: '86 400' })
    expect(w.get('[data-transit-summary]').text()).toContain('Итого по странице')
    expect(w.get('[data-transit-updated]').text()).toMatch(/^Обновлено \d{2}:\d{2}$/)
  })

  it('страница 2 уходит на сервер (не сбрасывается на 1) и снимает выбор', async () => {
    await mountAt()
    await w.findAll('tbody [role="checkbox"]')[0].trigger('click')
    expect(has('[data-transit-selection]')).toBe(true)
    w.findComponent(ZPagination).vm.$emit('change', 2, 25)
    await flushPromises()
    expect(lastList()).toMatchObject({ page: 2, pageSize: 25 })
    expect(has('[data-transit-selection]')).toBe(false)
  })

  it('смена фильтра — страница 1, сброс выбора; значения пишутся в стор и при возврате видны в полях', async () => {
    await mountAt()
    w.findComponent(ZPagination).vm.$emit('change', 3, 25)
    await flushPromises()
    await w.findAll('tbody [role="checkbox"]')[0].trigger('click')
    w.findAllComponents(FilterChip)[0].vm.$emit('update:value', '2')
    await flushPromises()
    expect(lastList()).toMatchObject({ page: 1, status: 2 })
    expect(has('[data-transit-selection]')).toBe(false)
    w.findAllComponents(FilterChip)[1].vm.$emit('update:value', 'c1')
    w.findComponent(PeriodChip).vm.$emit('update:value', ['2026-10-01', '2026-10-08'])
    await flushPromises()
    expect(lastList()).toMatchObject({ page: 1, status: 2, clientId: 'c1', documentDateFrom: '2026-10-01', documentDateTo: '2026-10-08' })
    await w.get('input[type="search"]').setValue('MRSU')
    await w.get('input[type="search"]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(lastList()).toMatchObject({ search: 'MRSU', page: 1 })
    // уход и возврат: поля показывают фильтры из стора
    w.unmount()
    await mountAt()
    expect((w.get('input[type="search"]').element as HTMLInputElement).value).toBe('MRSU')
    expect(w.findAllComponents(FilterChip)[0].props('value')).toBe('2')
    expect(w.findAllComponents(FilterChip)[1].props('value')).toBe('c1')
    expect(w.findComponent(PeriodChip).props('value')).toEqual(['2026-10-01', '2026-10-08'])
    expect(lastList()).toMatchObject({ search: 'MRSU', status: 2, clientId: 'c1' })
  })

  it('?q= при открытии и пока экран открыт запускает поиск', async () => {
    await mountAt('/reestr?q=GESU6824305')
    expect(lastList()).toMatchObject({ search: 'GESU6824305' })
    await router.push('/reestr?q=%20MRSU4885849%20')
    await flushPromises()
    expect(lastList()).toMatchObject({ search: 'MRSU4885849', page: 1 })
    expect((w.get('input[type="search"]').element as HTMLInputElement).value).toBe('MRSU4885849')
  })

  it('ошибка загрузки — блок с «Повторить», повтор перезагружает', async () => {
    api.getList.mockRejectedValueOnce(new Error('500'))
    await mountAt()
    expect(has('[data-transit-table]')).toBe(false)
    expect(w.get('[data-transit-error]').text()).toContain('Не удалось загрузить список')
    await w.get('[data-transit-retry]').trigger('click')
    await flushPromises()
    expect(has('[data-transit-error]')).toBe(false)
    expect(w.findAll('tbody tr').length).toBeGreaterThan(1)
  })

  it('пусто с фильтром — «Ничего не нашлось» и сброс; без фильтра сотруднику — «Новая запись»', async () => {
    api.getList.mockImplementation(async (p: { page: number; pageSize: number }) => ({ items: [], totalCount: 0, page: p.page, pageSize: p.pageSize, totalPages: 0 }))
    useReestrStore().statusFilter = 4
    await mountAt()
    expect(w.text()).toContain('Ничего не нашлось')
    await w.get('[data-transit-reset]').trigger('click')
    await flushPromises()
    expect(lastList().status).toBeUndefined()
    expect(w.text()).toContain('Записей пока нет')
  })

  it('«Колонки»: скрытые по умолчанию и запоминание выбора', async () => {
    await mountAt()
    const heads = () => w.findAll('thead th').map((th) => th.text())
    expect(heads()).not.toContain('Пост')
    expect(heads()).toContain('Вес, кг')
    expect(w.get('[data-item="post"]').attributes('data-checked')).toBe('false')
    await w.get('[data-item="post"]').trigger('click')
    await w.get('[data-item="weight"]').trigger('click')
    expect(heads()).toContain('Пост')
    expect(heads()).not.toContain('Вес, кг')
    expect(JSON.parse(localStorage.getItem('zircon.transit.columns')!)).toEqual(['shipper', 'shipment', 'subcode', 'weight', 'tdCount', 'extraSheets'])
    w.unmount()
    await mountAt()
    expect(heads()).toContain('Пост')
    expect(heads()).not.toContain('Вес, кг')
  })
})

describe('TransitView: действия', () => {
  it('«Выгрузить» — exportFile с текущими фильтрами, файл через saveBlob', async () => {
    const s = useReestrStore()
    s.setSearch('MRSU')
    s.statusFilter = 1
    s.clientFilter = 'c1'
    s.documentDateFrom = '2026-10-01'
    s.documentDateTo = '2026-10-08'
    await mountAt()
    await w.get('[data-transit-export]').trigger('click')
    await flushPromises()
    expect(api.exportFile).toHaveBeenCalledWith({ search: 'MRSU', status: 1, clientId: 'c1', documentDateFrom: '2026-10-01', documentDateTo: '2026-10-08' })
    expect(api.saveBlob).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/^reestr-\d{4}-\d{2}-\d{2}\.xlsx$/))
  })

  it('выгрузка клиента — без фильтра по клиенту; ошибка — сообщение', async () => {
    as('client', ['reestr.read'])
    useReestrStore().clientFilter = 'c9'
    api.exportFile.mockRejectedValueOnce(new Error('500'))
    await mountAt()
    await w.get('[data-transit-export]').trigger('click')
    await flushPromises()
    expect(api.exportFile.mock.calls[0][0].clientId).toBeUndefined()
    expect(api.toast.error).toHaveBeenCalledWith('Не удалось выгрузить реестр')
  })

  it('«Импорт из инвойса» открывает окно компонента через open(); пункт меню «⋯» — тоже', async () => {
    await mountAt()
    await w.get('[data-transit-import]').trigger('click')
    expect(api.importOpen).toHaveBeenCalledTimes(1)
    await w.get('[data-item="import"]').trigger('click')
    expect(api.importOpen).toHaveBeenCalledTimes(2)
  })

  it('сохранение записи без клиента — сообщение «Выберите клиента», запрос не уходит', async () => {
    await mountAt()
    await w.get('[data-transit-new]').trigger('click')
    expect(form().attributes()).toMatchObject({ 'data-open': 'true', 'data-mode': 'default', 'data-tab': 'data', 'data-entry': '' })
    w.findComponent({ name: 'ReestrForm' }).vm.$emit('submit', { data: {}, status: 0 })
    await flushPromises()
    expect(api.toast.error).toHaveBeenCalledWith('Выберите клиента')
    expect(api.create).not.toHaveBeenCalled()
    expect(form().attributes('data-open')).toBe('true')
  })

  it('правка записи: update по id, окно закрывается', async () => {
    api.update.mockResolvedValue(undefined)
    await mountAt()
    await row(0).get('[data-row-edit]').trigger('click')
    w.findComponent({ name: 'ReestrForm' }).vm.$emit('submit', { data: { 'Груз': 'Ноутбуки' }, status: 1 })
    await flushPromises()
    expect(api.update).toHaveBeenCalledWith('31', expect.objectContaining({ clientId: 'c1', status: 1 }))
    expect(form().attributes('data-open')).toBe('false')
  })

  it('смена статуса одной записи: тот же статус — без запроса', async () => {
    await mountAt()
    await row(0).get('[data-item="status"]').trigger('click')
    await flushPromises()
    const modal = document.body.querySelector('[data-transit-status-modal]') as HTMLElement
    expect(modal).not.toBeNull()
    const ok = [...modal.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Сохранить')!
    ok.click()
    await flushPromises()
    expect(api.changeStatus).not.toHaveBeenCalled()
    expect(w.findComponent({ name: 'TransitStatusModal' }).props('open')).toBe(false)
  })

  it('смена статуса одной записи: запрос, перечёт списка, ключ истории статусов растёт', async () => {
    await mountAt()
    const calls = api.getList.mock.calls.length
    await row(0).get('[data-item="status"]').trigger('click')
    await flushPromises()
    w.findComponent({ name: 'TransitStatusModal' }).findComponent({ name: 'ZSelect' }).vm.$emit('update:value', 3)
    await flushPromises()
    const modal = document.body.querySelector('[data-transit-status-modal]') as HTMLElement
    ;[...modal.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Сохранить')!.click()
    await flushPromises()
    expect(api.changeStatus).toHaveBeenCalledWith('31', 3)
    expect(api.getList.mock.calls.length).toBe(calls + 1)
    expect(w.findComponent({ name: 'ReestrForm' }).props('statusHistoryRefreshKey')).toBe(1)
    expect(w.findComponent({ name: 'TransitStatusModal' }).props('open')).toBe(false)
  })

  it('«Загрузить Excel»: клиент выбран заранее; без клиента — ошибка у поля; успех закрывает окно', async () => {
    api.upload.mockResolvedValue({ imported: 4 })
    await mountAt()
    await w.get('[data-transit-upload]').trigger('click')
    await flushPromises()
    const modal = w.findComponent({ name: 'TransitUploadModal' })
    expect(modal.props('open')).toBe(true)
    const file = new File(['x'], 'reestr.xlsx')
    const select = modal.findComponent({ name: 'ZSelect' })
    expect(select.props('value')).toBe('c1')
    select.vm.$emit('update:value', null)
    await flushPromises()
    const zone = modal.findComponent({ name: 'ZUpload' })
    expect(zone.props('accept')).toBe('.xlsx,.xls')
    expect(zone.props('maxSizeMb')).toBe(10)
    await zone.props('customRequest')!({ file, onSuccess: () => {}, onError: () => {} })
    await flushPromises()
    expect(api.upload).not.toHaveBeenCalled()
    expect(document.body.querySelector('[data-transit-upload-modal]')!.textContent).toContain('Выберите клиента для импорта')
    select.vm.$emit('update:value', 'c2')
    await zone.props('customRequest')!({ file, onSuccess: () => {}, onError: () => {} })
    await flushPromises()
    expect(api.upload).toHaveBeenCalledWith(file, 'c2')
    expect(api.toast.success).toHaveBeenCalledWith('Успешно импортировано записей: 4')
    expect(modal.props('open')).toBe(false)
  })

  it('удаление записи — после подтверждения', async () => {
    await mountAt()
    await row(1).get('[data-item="delete"]').trigger('click')
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Удалить эту запись?')
    expect(confirmState.danger).toBe(true)
    confirmState.resolve(true)
    await flushPromises()
    expect(api.del).toHaveBeenCalledWith('30')
  })

  it('выбор: «Сменить статус» нескольким и «Удалить» с подтверждением', async () => {
    await mountAt()
    const boxes = w.findAll('tbody [role="checkbox"]')
    await boxes[0].trigger('click')
    await boxes[1].trigger('click')
    expect(w.get('[data-transit-selection]').text()).toContain('Выбрано: 2')
    await w.get('[data-bulk-status]').trigger('click')
    await flushPromises()
    const modal = document.body.querySelector('[data-transit-status-modal]') as HTMLElement
    expect(modal.textContent).toContain('записей — 2')
    w.findComponent({ name: 'TransitStatusModal' }).findComponent({ name: 'ZSelect' }).vm.$emit('update:value', 7)
    await flushPromises()
    ;[...modal.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Сохранить')!.click()
    await flushPromises()
    expect(api.changeStatus.mock.calls).toEqual([['31', 7, { silent: true }], ['30', 7, { silent: true }]])
    expect(api.toast.success).toHaveBeenCalledWith('Статус изменён: 2 из 2')
    expect(has('[data-transit-selection]')).toBe(false)

    await w.findAll('tbody [role="checkbox"]')[0].trigger('click')
    await w.get('[data-bulk-delete]').trigger('click')
    expect(confirmState.title).toBe('Удалить выбранные записи?')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.bulkDelete).toHaveBeenCalledWith(['31'])
    expect(has('[data-transit-selection]')).toBe(false)
  })
})
