import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { h } from 'vue'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import { confirmState } from '@/ui/confirm'
import type { PermissionMatrix } from '@/api/permissions'

const api = vi.hoisted(() => ({
  matrix: vi.fn(), updateRole: vi.fn(), reset: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/permissions', async (orig) => ({
  ...(await orig<typeof import('@/api/permissions')>()),
  permissionsApi: { matrix: api.matrix, updateRole: api.updateRole, reset: api.reset },
}))
vi.mock('@/ui/message', () => ({ message: api.toast }))

import RolesPage from '../RolesPage.vue'
import { useAuthStore } from '@/stores/auth'

const role = (code: string, permissions: string[], editable = true) => ({ code, label: code, scope: 'x', editable, permissions })
const matrixData = (): PermissionMatrix => ({
  roles: [
    role('declarant', ['import40.read', 'import40.declarant']),
    role('kpp', ['import40.read']),
    role('accountant', ['finance.read', 'finance.write', 'users.read']),
    role('client', ['import40.read']),
    role('expeditor', []),
    role('administrator', ['import40.read', 'import40.declarant', 'finance.read', 'finance.write', 'users.read', 'roles.manage'], false),
  ],
  groups: [
    { area: 'Импорт 40', permissions: [{ code: 'import40.read', label: 'Видеть заявки' }, { code: 'import40.declarant', label: 'ДТ' }] },
    { area: 'Финансы', permissions: [{ code: 'finance.read', label: 'Счета' }, { code: 'finance.write', label: 'Выставлять' }] },
    { area: 'Администрирование', permissions: [{ code: 'users.read', label: 'Видеть' }, { code: 'roles.manage', label: 'Матрица' }] },
  ],
})

let w: VueWrapper
let router: Router
const App = { render: () => h(RouterView) }
const as = (role: string, perms: string[], businessRoles: string[] = []) => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = perms
  auth.businessRoles = businessRoles
}
const open = async () => {
  await router.push('/settings/roles')
  await router.isReady()
  w = mountWithI18n(App, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
}
const cell = (r: string, p: string) => w.get(`[data-roles-cell="${r}|${p}"]`)
const box = (r: string, p: string) => cell(r, p).get('[role="checkbox"]')
const isOn = (r: string, p: string) => box(r, p).attributes('aria-checked') === 'true' || box(r, p).attributes('data-state') === 'checked'
const toggle = async (r: string, p: string) => { await box(r, p).trigger('click'); await flushPromises() }
const bar = () => w.find('[data-savebar]')

beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings/roles', component: RolesPage },
      { path: '/:p(.*)*', component: { template: '<div data-other />' } },
    ],
  })
  api.matrix.mockImplementation(async () => matrixData())
  api.updateRole.mockResolvedValue(undefined)
  api.reset.mockResolvedValue(undefined)
  as('sales', ['users.read', 'roles.manage'], ['sales'])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('RolesPage: состав', () => {
  it('шапка, подпись, столбцы ролей сотрудников и «Админ» с замком; клиента и экспедитора нет', async () => {
    await open()
    expect(w.get('h1').text()).toBe('Роли и права')
    expect(w.get('[data-roles-hint]').text()).toContain('вступает в силу при следующем входе')
    expect(w.findAll('[data-roles-head]').map((h) => h.attributes('data-roles-head'))).toEqual(['declarant', 'kpp', 'accountant', 'administrator'])
    expect(w.get('[data-roles-head="declarant"]').text()).toBe('Декларант')
    expect(w.get('[data-roles-head="administrator"]').text()).toBe('Админ')
    expect(w.get('[data-roles-head="administrator"]').find('svg').exists()).toBe(true)
    expect(api.matrix).toHaveBeenCalledWith({ silent: true })
  })
  it('группы капителью и подписи прав из enum.permission.* (не с сервера)', async () => {
    await open()
    expect(w.findAll('[data-roles-group] th[scope="colgroup"]').map((t) => t.text())).toEqual(['Импорт 40', 'Финансы', 'Администрирование'])
    expect(w.get('[data-roles-row="finance.read"] th').text()).toBe('Видеть счета')
    expect(w.get('[data-roles-row="roles.manage"] th').text()).toBe('Менять матрицу прав')
  })
  it('отмеченное из матрицы; столбец «Админ» всегда отмечен и недоступен', async () => {
    await open()
    expect(isOn('declarant', 'import40.declarant')).toBe(true)
    expect(isOn('kpp', 'import40.declarant')).toBe(false)
    expect(isOn('administrator', 'finance.write')).toBe(true)
    expect(box('administrator', 'finance.write').attributes('disabled')).toBeDefined()
  })
  it('ошибка загрузки — «Не удалось загрузить» и «Повторить»', async () => {
    api.matrix.mockRejectedValueOnce(new Error('x'))
    await open()
    expect(w.get('[data-roles-load-error]').text()).toContain('Не удалось загрузить')
    await w.get('[data-roles-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-roles-table]').exists()).toBe(true)
  })
})

describe('RolesPage: недоступные ячейки', () => {
  it('без roles.manage недоступно всё, «Вернуть по умолчанию» скрыта', async () => {
    as('sales', ['users.read'], ['sales'])
    await open()
    expect(w.findAll('[data-roles-cell] [role="checkbox"]').every((b) => b.attributes('disabled') !== undefined)).toBe(true)
    expect(cell('kpp', 'import40.read').attributes('title')).toBe('Менять права может только сотрудник с правом управлять ролями')
    expect(w.find('[data-roles-reset]').exists()).toBe(false)
  })
  it('столбец своей роли и права «Администрирования» (добавление) — с причиной в title; снять админ-право можно', async () => {
    as('sales', ['users.read', 'roles.manage'], ['kpp'])
    await open()
    expect(box('kpp', 'finance.read').attributes('disabled')).toBeDefined()
    expect(cell('kpp', 'finance.read').attributes('title')).toBe('Свою роль менять нельзя: попросите коллегу или администратора')
    expect(box('declarant', 'roles.manage').attributes('disabled')).toBeDefined()
    expect(cell('declarant', 'roles.manage').attributes('title')).toContain('«Администрирование»')
    expect(box('accountant', 'users.read').attributes('disabled')).toBeUndefined()
    expect(box('declarant', 'finance.read').attributes('disabled')).toBeUndefined()
  })
  it('администратор меняет всё, кроме столбца «Админ»', async () => {
    as('administrator', [], ['kpp'])
    await open()
    expect(box('kpp', 'roles.manage').attributes('disabled')).toBeUndefined()
    expect(box('administrator', 'roles.manage').attributes('disabled')).toBeDefined()
  })
})

describe('RolesPage: правки и сохранение', () => {
  it('изменённая ячейка подсвечена; панель «1 изменение · …»; «Отменить» возвращает', async () => {
    await open()
    expect(bar().exists()).toBe(false)
    await toggle('accountant', 'import40.declarant')
    expect(cell('accountant', 'import40.declarant').attributes('data-changed')).toBeDefined()
    expect(bar().exists()).toBe(true)
    expect(w.get('[data-savebar-text]').text()).toBe('1 изменение · Бухгалтер получит «Оформлять ДТ»')
    await toggle('declarant', 'finance.read')
    expect(w.get('[data-savebar-text]').text().startsWith('2 изменения · ')).toBe(true)
    await w.get('[data-savebar-cancel]').trigger('click')
    await flushPromises()
    expect(bar().exists()).toBe(false)
    expect(isOn('accountant', 'import40.declarant')).toBe(false)
    expect(api.updateRole).not.toHaveBeenCalled()
  })
  it('«Сохранить» отправляет только изменённые роли, по одной, в порядке каталога', async () => {
    await open()
    await toggle('accountant', 'import40.declarant')
    await toggle('kpp', 'finance.read')
    await toggle('kpp', 'import40.declarant')
    await w.get('[data-savebar-save]').trigger('click')
    await flushPromises()
    expect(api.updateRole.mock.calls).toEqual([
      ['kpp', ['import40.read', 'import40.declarant', 'finance.read'], { silent: true }],
      ['accountant', ['import40.declarant', 'finance.read', 'finance.write', 'users.read'], { silent: true }],
    ])
    expect(api.toast.success).toHaveBeenCalledWith('Права сохранены. Сотрудники получат их при следующем входе')
    expect(bar().exists()).toBe(false)
  })
  it('ошибка одной роли: сохранённая остаётся, ошибка (detail сервера) показана, правка не потеряна', async () => {
    api.updateRole.mockImplementation(async (code: string) => {
      if (code === 'accountant') throw { response: { data: { detail: 'Нельзя выдавать права администрирования' } } }
    })
    await open()
    await toggle('kpp', 'finance.read')
    await toggle('accountant', 'finance.write')
    await w.get('[data-savebar-save]').trigger('click')
    await flushPromises()
    expect(api.updateRole).toHaveBeenCalledTimes(2)
    expect(w.get('[data-roles-error]').text()).toBe('Сохранено ролей: 1 из 2. Не сохранились: «Бухгалтер»: Нельзя выдавать права администрирования')
    expect(api.toast.success).not.toHaveBeenCalled()
    expect(w.get('[data-savebar-text]').text()).toContain('Бухгалтер лишится')
    expect(cell('kpp', 'finance.read').attributes('data-changed')).toBeUndefined()
    expect(cell('accountant', 'finance.write').attributes('data-changed')).toBeDefined()
  })
  it('ошибка единственной роли — только текст сервера', async () => {
    api.updateRole.mockRejectedValue({ response: { data: { detail: 'Свою роль менять нельзя' } } })
    await open()
    await toggle('kpp', 'finance.read')
    await w.get('[data-savebar-save]').trigger('click')
    await flushPromises()
    expect(w.get('[data-roles-error]').text()).toBe('Свою роль менять нельзя')
  })
})

describe('RolesPage: доработки после ревью', () => {
  it('панель снизу не внутри блока с overflow-x-clip (иначе обрезаются её вылеты на всю ширину)', async () => {
    await open()
    await toggle('kpp', 'finance.read')
    expect(bar().element.closest('.overflow-x-clip')).toBeNull()
    expect(w.get('[data-roles-body]').classes()).toContain('overflow-x-clip')
  })
  it('причина недоступности есть и в подписи флажка', async () => {
    as('sales', ['users.read', 'roles.manage'], ['kpp'])
    await open()
    expect(box('kpp', 'finance.read').attributes('aria-label')).toBe(
      'Видеть счета — КПП. Свою роль менять нельзя: попросите коллегу или администратора',
    )
    expect(box('declarant', 'finance.read').attributes('aria-label')).toBe('Видеть счета — Декларант')
  })
  it('снять админ-право и сохранить: уходит PUT без этого права', async () => {
    await open()
    await toggle('accountant', 'users.read')
    expect(w.get('[data-savebar-text]').text()).toBe('1 изменение · Бухгалтер лишится «Видеть сотрудников»')
    await w.get('[data-savebar-save]').trigger('click')
    await flushPromises()
    expect(api.updateRole).toHaveBeenCalledWith('accountant', ['finance.read', 'finance.write'], { silent: true })
    expect(api.toast.success).toHaveBeenCalled()
  })
  it('две роли не сохранились — в сообщении обе причины', async () => {
    api.updateRole.mockImplementation(async (code: string) => {
      throw { response: { data: { detail: code === 'kpp' ? 'причина А' : 'причина Б' } } }
    })
    await open()
    await toggle('kpp', 'finance.read')
    await toggle('accountant', 'import40.read')
    await w.get('[data-savebar-save]').trigger('click')
    await flushPromises()
    expect(w.get('[data-roles-error]').text()).toBe('«КПП»: причина А; «Бухгалтер»: причина Б')
    expect(w.get('[data-savebar-text]').text().startsWith('2 изменения')).toBe(true)
  })
  it('«Обновить» не удалась при загруженной матрице — ошибка с «Повторить», таблица и правки на месте', async () => {
    await open()
    await toggle('kpp', 'finance.read')
    api.matrix.mockRejectedValueOnce(new Error('x'))
    await w.get('[data-roles-refresh]').trigger('click')
    await flushPromises()
    confirmState.resolve(true)
    await flushPromises()
    expect(w.find('[data-roles-reload-error]').exists()).toBe(true)
    expect(w.find('[data-roles-table]').exists()).toBe(true)
    await w.get('[data-roles-reload-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-roles-reload-error]').exists()).toBe(false)
  })
  it('сброс удался, перезагрузка нет: без тоста успеха, правки сброшены, таблица заблокирована, плашка и «Повторить»', async () => {
    as('administrator', [], [])
    await open()
    await toggle('kpp', 'finance.read')
    api.matrix.mockRejectedValueOnce(new Error('x'))
    await w.get('[data-roles-reset]').trigger('click')
    await flushPromises()
    confirmState.resolve(true)
    await flushPromises()
    expect(api.reset).toHaveBeenCalled()
    expect(api.toast.success).not.toHaveBeenCalled()
    expect(bar().exists()).toBe(false)
    expect(w.get('[data-roles-error]').text()).toContain('обновить не удалось')
    expect(w.findAll('[data-roles-cell] [role="checkbox"]').every((b) => b.attributes('disabled') !== undefined)).toBe(true)
    await w.get('[data-roles-reload-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-roles-error]').exists()).toBe(false)
    expect(box('kpp', 'finance.read').attributes('disabled')).toBeUndefined()
  })
})

describe('RolesPage: сброс, обновление, уход', () => {
  it('«Вернуть по умолчанию» видна только администратору: сервер отказывает держателю roles.manage', async () => {
    await open()
    expect(w.find('[data-roles-reset]').exists()).toBe(false)
    w.unmount()
    as('administrator', [], [])
    await open()
    expect(w.find('[data-roles-reset]').exists()).toBe(true)
  })
  it('«Вернуть по умолчанию» — после подтверждения; отказ ничего не делает', async () => {
    as('administrator', [], [])
    await open()
    await w.get('[data-roles-reset]').trigger('click')
    await flushPromises()
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Вернуть права по умолчанию?')
    confirmState.resolve(false)
    await flushPromises()
    expect(api.reset).not.toHaveBeenCalled()
    await w.get('[data-roles-reset]').trigger('click')
    await flushPromises()
    confirmState.resolve(true)
    await flushPromises()
    expect(api.reset).toHaveBeenCalledWith({ silent: true })
    expect(api.matrix).toHaveBeenCalledTimes(2)
    expect(api.toast.success).toHaveBeenCalledWith('Права возвращены по умолчанию')
  })
  it('«Обновить» с несохранёнными правками спрашивает; без правок — сразу', async () => {
    await open()
    await w.get('[data-roles-refresh]').trigger('click')
    await flushPromises()
    expect(confirmState.open).toBe(false)
    expect(api.matrix).toHaveBeenCalledTimes(2)
    await toggle('kpp', 'finance.read')
    await w.get('[data-roles-refresh]').trigger('click')
    await flushPromises()
    expect(confirmState.open).toBe(true)
    confirmState.resolve(false)
    await flushPromises()
    expect(api.matrix).toHaveBeenCalledTimes(2)
    expect(bar().exists()).toBe(true)
    await w.get('[data-roles-refresh]').trigger('click')
    await flushPromises()
    confirmState.resolve(true)
    await flushPromises()
    expect(api.matrix).toHaveBeenCalledTimes(3)
    expect(bar().exists()).toBe(false)
  })
  it('уход со страницы с правками спрашивает; без правок — нет; beforeunload — только с правками', async () => {
    await open()
    const unload = () => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented }
    expect(unload()).toBe(false)
    await router.push('/elsewhere')
    await flushPromises()
    expect(confirmState.open).toBe(false)
    expect(router.currentRoute.value.path).toBe('/elsewhere')

    await router.push('/settings/roles')
    await flushPromises()
    await toggle('kpp', 'finance.read')
    expect(unload()).toBe(true)
    void router.push('/elsewhere')
    await flushPromises()
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Уйти без сохранения?')
    confirmState.resolve(false)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/settings/roles')
    void router.push('/elsewhere')
    await flushPromises()
    confirmState.resolve(true)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/elsewhere')
  })
})
