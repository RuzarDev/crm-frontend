import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { DocumentPackageDto } from '@/types/api'

const api = vi.hoisted(() => ({
  list: vi.fn(), getById: vi.fn(), create: vi.fn(), uploadFile: vi.fn(), clients: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/documentPackages', () => ({
  documentPackagesApi: { list: api.list, getById: api.getById, create: api.create, uploadFile: api.uploadFile },
}))
vi.mock('@/api/reestr', () => ({ reestrApi: { listPortfolioClients: api.clients } }))
vi.mock('@/ui/message', () => ({ message: api.toast }))

import PackagesView from '../PackagesView.vue'
import ZPagination from '@/components/z/ZPagination.vue'
import { useAuthStore } from '@/stores/auth'

// Панель и окно — заглушки (проверяются состав экрана и запросы); загрузка файла выбирает один файл.
const DrawerStub = {
  props: ['open'], emits: ['update:open'],
  template: '<div v-if="open" data-drawer><slot name="title" /></div>',
}
const ModalStub = {
  props: ['open', 'okButtonProps'], emits: ['ok', 'update:open'],
  template: '<div v-if="open" data-modal><slot /><button data-ok type="button" @click="$emit(\'ok\')" /></div>',
}
const UploadStub = defineComponent({
  emits: ['select'],
  setup: (_, { emit }) => () => h('button', { type: 'button', onClick: () => emit('select', [new File(['x'], 'invoice.pdf')]) }),
})

const pkg = (o: Partial<DocumentPackageDto>): DocumentPackageDto => ({
  id: 'p', trainNumber: '2457', comment: null, status: 'uploaded', createdByExpeditorId: 'e1', createdByExpeditorUsername: 'Ақжол Логистик',
  createdAtUtc: '2026-10-08T04:14:00Z', updatedAtUtc: '2026-10-08T04:14:00Z', reviewedByUserId: null, reviewedAtUtc: null,
  reviewComment: null, files: [], containers: [],
  ...o,
})
const ITEMS = [
  pkg({ id: 'a', trainNumber: 'Поезд 2457', status: 'needsFix', comment: 'нет веса брутто', createdAtUtc: '2026-10-08T04:14:00Z' }),
  pkg({ id: 'b', trainNumber: 'Поезд 2451', status: 'accepted', createdAtUtc: '2026-10-07T04:14:00Z' }),
  pkg({ id: 'c', trainNumber: 'ATG-12 / авто', status: 'uploaded', createdAtUtc: '2026-10-06T04:14:00Z' }),
  pkg({ id: 'd', trainNumber: 'Поезд 2440', status: 'processed', createdAtUtc: '2026-10-04T04:14:00Z' }),
  pkg({ id: 'e', trainNumber: 'Поезд 2433', status: 'processed', createdAtUtc: '2026-10-02T04:14:00Z' }),
]

let w: VueWrapper
let router: Router
const as = (role: string, perms: string[]) => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = perms
}
const mountView = async () => {
  w = mountWithI18n(PackagesView, {
    attachTo: document.body,
    global: { plugins: [router], stubs: { ZDrawer: DrawerStub, ZModal: ModalStub, ZUpload: UploadStub } },
  })
  await flushPromises()
}
const has = (sel: string) => w.find(sel).exists()
const trains = () => w.findAll('[data-package-open]').map((b) => b.text())
const segments = () => w.findAll('[data-packages-segments] button').map((b) => b.text().replace(/\s+/g, ' '))

beforeEach(async () => {
  setActivePinia(createPinia())
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  await router.push('/document-packages')
  api.list.mockResolvedValue({ items: ITEMS, totalCount: 5 })
  api.getById.mockImplementation(async (id: string) => ITEMS.find((p) => p.id === id))
  api.clients.mockResolvedValue([{ id: 'c1', username: 'alfa', declarationCount: 3 }, { id: 'c2', username: 'beta', declarationCount: 1 }])
  as('importer', ['reestr.read', 'packages.manage'])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('PackagesView: список', () => {
  it('один запрос без фильтров; заголовок со счётчиком; строки по дате создания', async () => {
    await mountView()
    expect(api.list).toHaveBeenCalledTimes(1)
    expect(api.list).toHaveBeenCalledWith(undefined, { silent: true })
    expect(w.get('h1').text()).toBe('Пакеты документов')
    expect(w.get('[data-packages-count]').text()).toBe('5')
    expect(trains()).toEqual(['Поезд 2457', 'Поезд 2451', 'ATG-12 / авто', 'Поезд 2440', 'Поезд 2433'])
    expect(w.findAll('tbody tr')[0].text()).toContain('нет веса брутто')
  })

  it('переключатель со счётчиками; статус и поиск фильтруют на клиенте, без новых запросов', async () => {
    await mountView()
    expect(segments()).toEqual(['Все 5', 'Загружен 1', 'Нужна правка 1', 'Принят 1', 'Обработан 2'])
    await w.findAll('[data-packages-segments] button')[4].trigger('click')
    await flushPromises()
    expect(trains()).toEqual(['Поезд 2440', 'Поезд 2433'])

    await w.get('input[type="search"]').setValue('2433')
    expect(trains()).toEqual(['Поезд 2433'])
    expect(segments()).toEqual(['Все 1', 'Загружен 0', 'Нужна правка 0', 'Принят 0', 'Обработан 1'])
    await w.get('input[type="search"]').setValue('веса брутто')
    expect(segments()[0]).toBe('Все 1')
    expect(api.list).toHaveBeenCalledTimes(1)
  })

  it('ничего не найдено: пустое состояние со сбросом фильтров', async () => {
    await mountView()
    await w.get('input[type="search"]').setValue('нет такого')
    expect(w.text()).toContain('Ничего не нашлось')
    await w.get('[data-packages-reset]').trigger('click')
    expect(trains()).toHaveLength(5)
  })

  it('пакетов нет: «Новый пакет» в пустом состоянии — только тем, кто вправе создавать', async () => {
    api.list.mockResolvedValue({ items: [], totalCount: 0 })
    as('administrator', [])
    await mountView()
    expect(w.text()).toContain('Пакетов документов пока нет')
    expect(w.findAll('button').filter((b) => b.text() === 'Новый пакет')).toHaveLength(2)
    w.unmount()
    as('importer', ['reestr.read', 'packages.manage'])
    await mountView()
    expect(w.text()).toContain('Экспедитор загружает документы')
    expect(w.findAll('button').filter((b) => b.text() === 'Новый пакет')).toHaveLength(0)
  })

  it('на сервере пакетов больше, чем пришло, — подсказка «Показаны последние»', async () => {
    api.list.mockResolvedValue({ items: ITEMS, totalCount: 312 })
    await mountView()
    expect(w.get('[data-packages-truncated]').text()).toBe('Показаны последние 5 — уточните поиск')
    expect(w.get('[data-packages-count]').text()).toBe('312')
  })

  it('не загрузилось: блок ошибки с «Повторить», тост не дублируется (silent)', async () => {
    api.list.mockRejectedValueOnce(new Error('500'))
    await mountView()
    expect(has('[data-packages-error]')).toBe(true)
    expect(has('[data-packages-table]')).toBe(false)
    await w.get('[data-packages-retry]').trigger('click')
    await flushPromises()
    expect(has('[data-packages-error]')).toBe(false)
    expect(trains()).toHaveLength(5)
  })
})

describe('PackagesView: страница и «Обновить»', () => {
  const MANY = Array.from({ length: 30 }, (_, i) => pkg({
    id: `m${i}`, trainNumber: `Поезд ${100 + i}`, status: 'uploaded', createdAtUtc: new Date(Date.UTC(2026, 9, 8) - i * 3600_000).toISOString(),
  }))
  const pageNo = () => w.getComponent(ZPagination).props('current')
  const toPage2 = async () => {
    w.getComponent(ZPagination).vm.$emit('change', 2)
    await flushPromises()
    expect(pageNo()).toBe(2)
    expect(trains()[0]).toBe('Поезд 125')
  }

  it('новый поиск и смена статуса возвращают на первую страницу', async () => {
    api.list.mockResolvedValue({ items: MANY, totalCount: 30 })
    await mountView()
    await toPage2()
    await w.get('input[type="search"]').setValue('Поезд')
    await flushPromises()
    expect(pageNo()).toBe(1)
    expect(trains()[0]).toBe('Поезд 100')

    await toPage2()
    await w.findAll('[data-packages-segments] button')[1].trigger('click')
    await flushPromises()
    expect(pageNo()).toBe(1)
  })

  it('«Обновить» перечитывает список, страница остаётся', async () => {
    api.list.mockResolvedValue({ items: MANY, totalCount: 30 })
    await mountView()
    await toPage2()
    await w.get('[data-packages-refresh]').trigger('click')
    await flushPromises()
    expect(api.list).toHaveBeenCalledTimes(2)
    expect(pageNo()).toBe(2)
  })
})

describe('PackagesView: роли', () => {
  const headers = () => w.findAll('thead th').map((th) => th.text())

  it('колонка «Экспедитор» — только у проверяющего; «Новый пакет» — экспедитору и администратору', async () => {
    await mountView()
    expect(headers()).toContain('Экспедитор')
    expect(has('[data-packages-new]')).toBe(false)
    expect(has('[data-packages-clients]')).toBe(false)
    expect(api.clients).not.toHaveBeenCalled()
    w.unmount()

    as('administrator', [])
    await mountView()
    expect(headers()).toContain('Экспедитор')
    expect(has('[data-packages-new]')).toBe(true)
    w.unmount()

    as('expeditor', ['reestr.read'])
    await mountView()
    expect(headers()).not.toContain('Экспедитор')
    expect(has('[data-packages-new]')).toBe(true)
  })

  it('экспедитор видит строку «Ваши клиенты: имя (N), …»; без клиентов — подсказка', async () => {
    as('expeditor', ['reestr.read'])
    await mountView()
    expect(w.get('[data-packages-clients]').text()).toBe('Ваши клиенты: alfa (3), beta (1)')
    w.unmount()
    api.clients.mockResolvedValue([])
    await mountView()
    expect(w.get('[data-packages-clients]').text()).toBe('Клиенты пока не привязаны')
  })
})

describe('PackagesView: панель пакета', () => {
  it('клик по строке открывает панель и перечитывает пакет; строка подсвечена', async () => {
    await mountView()
    expect(has('[data-drawer]')).toBe(false)
    await w.findAll('tbody tr')[1].trigger('click')
    await flushPromises()
    expect(has('[data-drawer]')).toBe(true)
    expect(w.get('[data-package-title]').text()).toBe('Поезд 2451')
    expect(api.getById).toHaveBeenCalledWith('b', { silent: true })
    expect(w.findAll('tbody tr')[1].classes()).toContain('bg-zircon-soft')
    expect(w.findAll('tbody tr')[0].classes()).not.toContain('bg-zircon-soft')
  })

  it('кнопка с номером поезда тоже открывает панель (с клавиатуры)', async () => {
    await mountView()
    await w.findAll('[data-package-open]')[2].trigger('click')
    await flushPromises()
    expect(w.get('[data-package-title]').text()).toBe('ATG-12 / авто')
    expect(api.getById).toHaveBeenCalledWith('c', { silent: true })
  })
})

describe('PackagesView: создание', () => {
  beforeEach(() => as('expeditor', ['reestr.read']))

  const fillAndCreate = async (withFile: boolean) => {
    await mountView()
    await w.get('[data-packages-new]').trigger('click')
    await w.get('[data-create-train]').setValue(' 2460 ')
    await w.get('[data-create-containers]').setValue('MRSU4885849\n\n DRYU9953726 ')
    if (withFile) await w.get('[data-create-upload]').trigger('click')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
  }

  it('создаёт пакет с номерами контейнеров, грузит файлы, открывает панель созданного', async () => {
    const created = pkg({ id: 'new1', trainNumber: '2460', status: 'uploaded' })
    api.create.mockResolvedValue(created)
    api.uploadFile.mockResolvedValue({})
    api.list.mockResolvedValueOnce({ items: ITEMS, totalCount: 5 }).mockResolvedValue({ items: [created, ...ITEMS], totalCount: 6 })
    api.getById.mockResolvedValue(created)
    await fillAndCreate(true)
    expect(api.create).toHaveBeenCalledWith({ trainNumber: '2460', comment: null, containerNumbers: ['MRSU4885849', 'DRYU9953726'] })
    expect(api.uploadFile).toHaveBeenCalledTimes(1)
    expect(api.uploadFile.mock.calls[0][0]).toBe('new1')
    expect(api.toast.success).toHaveBeenCalledWith('Пакет создан')
    expect(api.toast.warning).not.toHaveBeenCalled()
    expect(has('[data-modal]')).toBe(false)
    expect(w.get('[data-package-title]').text()).toBe('2460')
    expect(api.list).toHaveBeenCalledTimes(2)
  })

  it('без номера поезда не создаёт — ошибка по месту, окно остаётся', async () => {
    await mountView()
    await w.get('[data-packages-new]').trigger('click')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.create).not.toHaveBeenCalled()
    expect(w.text()).toContain('Укажите номер поезда / состава')
    expect(has('[data-modal]')).toBe(true)
  })

  it('пакет создан, а файл не загрузился: окно закрывается, список обновляется, открывается панель пакета; повтор не создаёт дубль', async () => {
    const created = pkg({ id: 'new1', trainNumber: '2460', status: 'uploaded' })
    api.create.mockResolvedValue(created)
    api.uploadFile.mockRejectedValue(new Error('400'))
    api.list.mockResolvedValueOnce({ items: ITEMS, totalCount: 5 }).mockResolvedValue({ items: [created, ...ITEMS], totalCount: 6 })
    api.getById.mockResolvedValue(created)
    await fillAndCreate(true)
    expect(api.create).toHaveBeenCalledTimes(1)
    expect(has('[data-modal]')).toBe(false)
    expect(api.list).toHaveBeenCalledTimes(2)
    expect(w.get('[data-package-title]').text()).toBe('2460')
    expect(api.getById).toHaveBeenCalledWith('new1', { silent: true })
    expect(api.toast.warning).toHaveBeenCalledWith('Пакет создан, но часть файлов не загрузилась — добавьте их в открывшейся панели')
    expect(api.toast.success).not.toHaveBeenCalled()
  })

  it('сам пакет не создался: окно остаётся открытым, панель не открывается', async () => {
    api.create.mockRejectedValue(new Error('400'))
    await fillAndCreate(false)
    expect(has('[data-modal]')).toBe(true)
    expect(has('[data-drawer]')).toBe(false)
    expect(api.list).toHaveBeenCalledTimes(1)
  })
})
