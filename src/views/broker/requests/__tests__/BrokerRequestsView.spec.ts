import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { Import40BoardRow } from '@/api/import40Board'

const api = vi.hoisted(() => ({
  board: vi.fn(), update: vi.fn(), create: vi.fn(), clients: vi.fn(), staff: vi.fn(), posts: vi.fn(), toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/import40Board', () => ({ import40BoardApi: { list: api.board } }))
vi.mock('@/api/import40', async (orig) => ({
  ...(await orig<typeof import('@/api/import40')>()),
  import40Api: { update: api.update, create: api.create, listClients: api.clients },
}))
vi.mock('@/api/manage', () => ({ manageApi: { staff: api.staff } }))
vi.mock('@/api/references', () => ({ referencesApi: { listCustomsPosts: api.posts } }))
vi.mock('@/ui/message', () => ({ message: api.toast }))

import BrokerRequestsView from '../BrokerRequestsView.vue'
import { useAuthStore } from '@/stores/auth'
import { formatMoney } from '@/ui/number'

const row = (o: Partial<Import40BoardRow>): Import40BoardRow => ({
  id: 'r1', number: 'ИМ-2026-0001', clientId: 'c1', clientName: 'ТОО Альфа', cargo: 'ноутбуки', post: 'Нур-Жолы',
  status: 2, step: 3, isProblem: false, hasClientMessage: false,
  assignedDeclarantId: null, assignedDeclarantName: null, assignedKppId: null, assignedKppName: null,
  containerNumbers: [], declarationsCount: 0, tnvedCodes: [], customsPaymentsKzt: 0,
  createdAtUtc: '2026-10-01T08:00:00Z', updatedAtUtc: '2026-10-08T08:00:00Z',
  ...o,
})
// updatedAtUtc по убыванию: a новее b, b новее c и так далее — порядок строк в таблице по умолчанию.
const ALL = [
  row({ id: 'a', number: 'ИМ-2026-0001', status: 2, updatedAtUtc: '2026-10-08T08:00:00Z', tnvedCodes: ['8471300000', '8414593000'], customsPaymentsKzt: 1517600 }),
  row({ id: 'b', number: 'ИМ-2026-0002', status: 6, updatedAtUtc: '2026-10-07T08:00:00Z' }),
  row({ id: 'e', number: 'ИМ-2026-0005', status: 3, isProblem: true, hasClientMessage: true, updatedAtUtc: '2026-10-06T08:00:00Z' }),
  row({ id: 'c', number: 'ИМ-2026-0003', status: 0, updatedAtUtc: '2026-10-05T08:00:00Z' }),
  row({ id: 'd', number: 'ИМ-2026-0004', status: 8, updatedAtUtc: '2026-10-04T08:00:00Z' }),
]
const MINE = [ALL[0]]

let w: VueWrapper
let pinia: Pinia
let router: Router
const stub = { template: '<div/>' }
const DropdownStub = {
  props: ['items'], emits: ['select'],
  template: '<div><slot /><button v-for="i in items" :key="i.key" type="button" :data-item="i.key" @click="$emit(\'select\', i.key)">{{ i.label }}</button></div>',
}

const mountAt = async (path: string) => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(BrokerRequestsView, { attachTo: document.body, global: { plugins: [pinia, router], stubs: { ZDropdown: DropdownStub } } })
  await flushPromises()
}
const numbers = () => w.findAll('[data-request-link]').map((n) => n.text())
const asStaff = (perms: string[]) => {
  const auth = useAuthStore()
  auth.role = 'declarant'
  auth.permissions = perms
  auth.userId = 'me'
}

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/import-40', component: stub }, { path: '/import-40/:id', component: stub }, { path: '/:p(.*)*', component: stub }],
  })
  api.board.mockImplementation(async (view: string) => ({ items: view === 'my' ? MINE : ALL, truncated: false }))
  api.update.mockResolvedValue({})
  api.clients.mockResolvedValue([{ id: 'c1', username: 'alfa', companyName: 'ТОО Альфа' }])
  api.posts.mockResolvedValue([{ id: 'p1', name: 'Нур-Жолы', isActive: true }])
  api.staff.mockResolvedValue([
    { id: 's1', username: 'aigerim', displayName: 'Айгерим', roles: ['declarant'] },
    { id: 's2', username: 'daniyar', displayName: null, roles: ['kpp'] },
  ])
  asStaff(['import40.read', 'import40.assign', 'import40.declarant'])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('BrokerRequestsView', () => {
  it('при открытии уходят оба запроса, справочники окна создания не грузятся', async () => {
    await mountAt('/import-40?tab=active')
    expect(api.board).toHaveBeenCalledWith('all', { silent: true })
    expect(api.board).toHaveBeenCalledWith('my', { silent: true })
    expect(api.board).toHaveBeenCalledTimes(2)
    expect(api.clients).not.toHaveBeenCalled()
    expect(w.get('h1').text()).toBe('Заявки')
  })

  it('по умолчанию — «Мои» (ответ view=my), бухгалтеру — «В работе»', async () => {
    await mountAt('/import-40')
    expect(numbers()).toEqual(['ИМ-2026-0001'])
    w.unmount()
    useAuthStore().businessRoles = ['accountant']
    await mountAt('/import-40')
    expect(numbers()).toEqual(['ИМ-2026-0001', 'ИМ-2026-0002', 'ИМ-2026-0005'])
  })

  it('?tab=all — старая ссылка, открывает «В работе»; вкладки со счётчиками', async () => {
    await mountAt('/import-40?tab=all')
    const tabs = w.findAll('[role="tab"]')
    expect(tabs.map((t) => t.text())).toEqual(['В работе 3', 'Ждут клиента 2', 'Мои 1', 'Черновики 1', 'Завершённые 1'])
    expect(tabs[0].attributes('aria-selected')).toBe('true')
    expect(numbers()).toEqual(['ИМ-2026-0001', 'ИМ-2026-0002', 'ИМ-2026-0005'])
    expect(w.get('[data-requests-count]').text()).toBe('3')
  })

  it('смена вкладки пишется в адрес; «Ждут клиента» — счёт выставлен и проблемы с вопросом', async () => {
    await mountAt('/import-40?tab=active')
    await w.findAll('[role="tab"]')[1].trigger('mousedown')
    await w.findAll('[role="tab"]')[1].trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(router.currentRoute.value.query.tab).toBe('waiting')
    expect(numbers()).toEqual(['ИМ-2026-0002', 'ИМ-2026-0005'])
  })

  it('строка: код ТН ВЭД в формате и «+N», платежи, тег проблемы', async () => {
    await mountAt('/import-40?tab=active')
    const first = w.findAll('tbody tr')[0]
    expect(first.text()).toContain('8471 30 000 0')
    expect(first.text()).toContain('+1')
    expect(first.text()).toContain(formatMoney(1517600))
    expect(w.findAll('tbody tr')[2].text()).toContain('проблема')
  })

  it('клик по строке открывает карточку заявки', async () => {
    await mountAt('/import-40?tab=active')
    await w.findAll('tbody tr')[1].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/import-40/b')
  })

  it('без права import40.assign колонки выбора нет', async () => {
    asStaff(['import40.read', 'import40.declarant'])
    await mountAt('/import-40?tab=active')
    expect(w.findAll('[role="checkbox"]').length).toBe(0)
  })

  it('во вкладке «Завершённые» выбора нет и при праве', async () => {
    await mountAt('/import-40?tab=done')
    expect(numbers()).toEqual(['ИМ-2026-0004'])
    expect(w.findAll('[role="checkbox"]').length).toBe(0)
  })

  it('назначение двум заявкам: два update, один тост, перезагрузка и снятие выбора', async () => {
    await mountAt('/import-40?tab=active')
    const boxes = w.findAll('tbody [role="checkbox"]')
    await boxes[0].trigger('click')
    await boxes[1].trigger('click')
    await flushPromises()
    expect(api.staff).toHaveBeenCalledTimes(1)
    expect(w.get('[data-requests-selection]').text()).toContain('Выбрано: 2')
    await w.get('[data-item="s1"]').trigger('click')
    await flushPromises()
    expect(api.update).toHaveBeenCalledTimes(2)
    expect(api.update).toHaveBeenCalledWith('a', { assignedDeclarantId: 's1' }, { silent: true })
    expect(api.update).toHaveBeenCalledWith('b', { assignedDeclarantId: 's1' }, { silent: true })
    expect(api.toast.success).toHaveBeenCalledTimes(1)
    expect(api.toast.success).toHaveBeenCalledWith('Назначено: 2')
    expect(api.toast.warning).not.toHaveBeenCalled()
    expect(api.board).toHaveBeenCalledTimes(4)
    expect(w.find('[data-requests-selection]').exists()).toBe(false)
  })

  it('часть назначений не прошла — одно предупреждение с итогом', async () => {
    api.update.mockImplementation(async (id: string) => { if (id === 'b') throw new Error('403'); return {} })
    await mountAt('/import-40?tab=active')
    const boxes = w.findAll('tbody [role="checkbox"]')
    await boxes[0].trigger('click')
    await boxes[1].trigger('click')
    await flushPromises()
    await w.get('[data-item="s2"]').trigger('click')
    await flushPromises()
    expect(api.update).toHaveBeenCalledWith('a', { assignedKppId: 's2' }, { silent: true })
    expect(api.toast.warning).toHaveBeenCalledTimes(1)
    expect(api.toast.warning).toHaveBeenCalledWith('Назначено: 1, не удалось: 1')
    expect(api.toast.success).not.toHaveBeenCalled()
  })

  it('выбор снимается при смене фильтров', async () => {
    await mountAt('/import-40?tab=active')
    await w.findAll('tbody [role="checkbox"]')[0].trigger('click')
    await flushPromises()
    expect(w.find('[data-requests-selection]').exists()).toBe(true)
    await w.get('input[type="search"]').setValue('0002')
    await flushPromises()
    expect(w.find('[data-requests-selection]').exists()).toBe(false)
    expect(numbers()).toEqual(['ИМ-2026-0002'])
  })

  it('поиск без результатов: «Ничего не нашлось» и сброс фильтров', async () => {
    await mountAt('/import-40?tab=active')
    await w.get('input[type="search"]').setValue('нет такого')
    await flushPromises()
    expect(w.text()).toContain('Ничего не нашлось')
    await w.get('[data-requests-reset]').trigger('click')
    await flushPromises()
    expect(numbers().length).toBe(3)
  })

  it('«Новая заявка» — только тем, кто вправе создавать', async () => {
    await mountAt('/import-40?tab=active')
    expect(w.find('[data-requests-new]').exists()).toBe(true)
    w.unmount()
    asStaff(['import40.read'])
    await mountAt('/import-40?tab=active')
    expect(w.find('[data-requests-new]').exists()).toBe(false)
    w.unmount()
    // администратору — всегда
    useAuthStore().role = 'administrator'
    await mountAt('/import-40?tab=active')
    expect(w.find('[data-requests-new]').exists()).toBe(true)
  })

  it('?new=1 открывает окно создания и убирает параметр; справочники грузятся при открытии', async () => {
    await mountAt('/import-40?tab=active&new=1')
    expect(document.body.querySelector('[data-create-request]')).not.toBeNull()
    expect(router.currentRoute.value.query.new).toBeUndefined()
    expect(router.currentRoute.value.query.tab).toBe('active')
    expect(api.clients).toHaveBeenCalledTimes(1)
  })

  it('?new=1 без права создавать — окно не открывается', async () => {
    asStaff(['import40.read'])
    await mountAt('/import-40?tab=active&new=1')
    expect(document.body.querySelector('[data-create-request]')).toBeNull()
    expect(router.currentRoute.value.query.new).toBeUndefined()
  })

  it('ошибка загрузки — блок с «Повторить», повтор перезагружает', async () => {
    api.board.mockRejectedValueOnce(new Error('500'))
    await mountAt('/import-40?tab=active')
    expect(w.find('[data-requests-error]').exists()).toBe(true)
    expect(w.text()).toContain('Не удалось загрузить список')
    expect(w.find('[data-requests-table]').exists()).toBe(false)
    await w.get('[data-requests-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-requests-error]').exists()).toBe(false)
    expect(numbers().length).toBe(3)
    expect(api.board).toHaveBeenCalledTimes(3)
  })

  it('усечённый ответ — строка «Показаны последние …»', async () => {
    api.board.mockImplementation(async (view: string) => ({ items: view === 'my' ? MINE : ALL, truncated: view !== 'my' }))
    await mountAt('/import-40?tab=active')
    expect(w.get('[data-requests-truncated]').text()).toBe('Показаны последние 5 — уточните поиск')
  })

  it('«Excel» выгружает отфильтрованные строки текущей вкладки', async () => {
    const list = await import('@/views/broker/list')
    const spy = vi.spyOn(list, 'exportXlsx').mockResolvedValue(undefined)
    await mountAt('/import-40?tab=active')
    await w.get('input[type="search"]').setValue('0002')
    await flushPromises()
    await w.get('[data-requests-excel]').trigger('click')
    await flushPromises()
    expect(spy).toHaveBeenCalledTimes(1)
    const rows = spy.mock.calls[0][2] as Record<string, unknown>[]
    expect(rows.map((r) => r['Заявка'])).toEqual(['ИМ-2026-0002'])
    spy.mockRestore()
  })
})
