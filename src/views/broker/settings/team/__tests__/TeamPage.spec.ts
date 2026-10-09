import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { TeamMemberDto } from '@/types/api'

const api = vi.hoisted(() => ({
  team: vi.fn(), clients: vi.fn(), expeditors: vi.fn(), onboarding: vi.fn(), editExpeditor: vi.fn(),
  registerStaff: vi.fn(), catalog: vi.fn(), setUserRoles: vi.fn(), confirm: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/users', () => ({
  usersApi: { team: api.team, getCatalogClients: api.clients, getCatalogExpeditors: api.expeditors, editExpeditor: api.editExpeditor, registerStaff: api.registerStaff },
}))
vi.mock('@/api/clientsOnboarding', () => ({ clientsOnboardingApi: { list: api.onboarding } }))
vi.mock('@/api/permissions', async (orig) => ({
  ...(await orig<typeof import('@/api/permissions')>()),
  permissionsApi: { catalog: api.catalog, setUserRoles: api.setUserRoles },
}))
vi.mock('@/ui/message', () => ({ message: api.toast }))
vi.mock('@/ui/confirm', () => ({ useConfirm: () => ({ confirm: api.confirm }) }))

import TeamPage from '../TeamPage.vue'
import FilterChip from '@/components/broker/FilterChip.vue'
import { useAuthStore } from '@/stores/auth'

// Панель сотрудника — заглушка слотов (содержимое проверяет MemberDrawer.spec).
const DrawerStub = {
  props: ['open'], emits: ['update:open'],
  template: '<div v-if="open" data-drawer><slot name="title" /><slot /><div><slot name="footer" /></div></div>',
}
// Окно — заглушка (механика Reka не проверяется): состав экрана и запросы.
const ModalStub = {
  props: ['open', 'okButtonProps'], emits: ['ok', 'update:open'],
  template: '<div v-if="open" data-modal><slot /><button data-ok type="button" @click="$emit(\'ok\')" /></div>',
}

const member = (o: Partial<TeamMemberDto>): TeamMemberDto => ({
  id: 'x', username: 'login', displayName: null, systemRole: 'importer', businessRoles: ['declarant'],
  createdAtUtc: '2026-08-12T04:00:00Z', isPoaRepresentative: false, clientCount: 0, ...o,
})
const TEAM = [
  member({ id: 'm1', username: 'a.kuanysh', displayName: 'Ахметов Куаныш', systemRole: 'administrator', businessRoles: ['declarant', 'rop'], clientCount: 3 }),
  member({ id: 'm2', username: 'd.seitkali', displayName: 'Динара Сейткали', businessRoles: ['declarant'] }),
  member({ id: 'm3', username: 'e.muratov', displayName: 'Ержан Муратов', businessRoles: ['kpp'] }),
  member({ id: 'm4', username: 'plain', displayName: null, businessRoles: ['accountant'] }),
]
const CLIENTS = [
  { id: 'c1', username: 'kazakhmys', role: 'client', createdAtUtc: '2026-03-12T04:00:00Z', brokers: [{ id: 'm1', username: 'a.kuanysh', role: 'broker' }], expeditors: [] },
  { id: 'c2', username: 'altyn', role: 'client', createdAtUtc: '2026-04-01T04:00:00Z', brokers: [], expeditors: [] },
]
const ONBOARDING = [
  { id: 'c1', username: 'kazakhmys', email: 'f@k.kz', companyName: 'ТОО «Казахмыс Трейд»', bin: '160440012345', phone: null, status: 'Active', emailConfirmed: true, hasContract: true, hasPoa: true, createdAtUtc: '', inviteExpiresAtUtc: null },
  { id: 'c2', username: 'altyn', email: null, companyName: 'ТОО «Altyn Med»', bin: '200540031208', phone: null, status: 'Blocked', emailConfirmed: true, hasContract: true, hasPoa: true, createdAtUtc: '', inviteExpiresAtUtc: null },
]
const EXPEDITORS = [
  { id: 'e1', username: 'exp.one', role: 'expeditor', createdAtUtc: '2026-05-01T04:00:00Z', clients: [{ id: 'c1', username: 'kazakhmys', role: 'client' }] },
  { id: 'e2', username: 'exp.two', role: 'expeditor', createdAtUtc: '2026-05-02T04:00:00Z', clients: [] },
]

let w: VueWrapper
let router: Router
const as = (role: string, perms: string[]) => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = perms
}
const mountPage = async (path = '/settings/team') => {
  await router.push(path)
  w = mountWithI18n(TeamPage, {
    attachTo: document.body,
    global: { plugins: [router], stubs: { ZModal: ModalStub, ZDrawer: DrawerStub } },
  })
  await flushPromises()
}
const names = () => w.findAll('[data-member-name]').map((n) => n.text())
const tabs = () => w.findAll('[data-team-tabs] button').map((b) => b.text().replace(/\s+/g, ' '))
const tabBtn = (i: number) => w.findAll('[data-team-tabs] button')[i]
const search = async (v: string) => { await w.get('input[type="search"]').setValue(v); await flushPromises() }

beforeEach(async () => {
  setActivePinia(createPinia())
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  api.team.mockResolvedValue(TEAM)
  api.clients.mockResolvedValue(CLIENTS)
  api.expeditors.mockResolvedValue(EXPEDITORS)
  api.onboarding.mockResolvedValue(ONBOARDING)
  api.editExpeditor.mockResolvedValue(undefined)
  api.catalog.mockResolvedValue([])
  as('sales', ['users.read', 'users.write', 'clients.manage', 'clients.read'])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('TeamPage: шапка и вкладки', () => {
  it('заголовок, подзаголовок, три вкладки со счётчиками; запросы тихие', async () => {
    await mountPage()
    expect(w.get('h1').text()).toBe('Команда')
    expect(w.get('[data-team-hint]').text()).toBe('Сотрудники, клиенты и экспедиторы · кто что может')
    expect(tabs()).toEqual(['Сотрудники 4', 'Клиенты 2', 'Экспедиторы 2'])
    expect(api.team).toHaveBeenCalledWith({ silent: true })
    expect(api.clients).toHaveBeenCalledWith({ silent: true })
    expect(api.expeditors).toHaveBeenCalledWith({ silent: true })
  })

  it('без users.write кнопки «Добавить сотрудника» нет, с правом — есть', async () => {
    as('sales', ['users.read'])
    await mountPage()
    expect(w.find('[data-team-add]').exists()).toBe(false)
    w.unmount()
    as('sales', ['users.read', 'users.write'])
    await mountPage()
    expect(w.get('[data-team-add]').text()).toBe('Добавить сотрудника')
  })
})

describe('TeamPage: сотрудники', () => {
  it('имя (или логин), логин, роли чипами; администратор — отдельный чип', async () => {
    await mountPage()
    expect(names()).toEqual(['Ахметов Куаныш', 'Динара Сейткали', 'Ержан Муратов', 'plain'])
    const rows = w.findAll('tbody tr')
    expect(rows[0].find('[data-member-login]').text()).toBe('a.kuanysh')
    expect(rows[0].findAll('[data-member-role]').map((r) => r.text())).toEqual(['Декларант', 'РОП'])
    expect(rows[0].get('[data-member-admin]').text()).toBe('Администратор')
    expect(rows[1].find('[data-member-admin]').exists()).toBe(false)
  })

  it('поиск по имени и по логину', async () => {
    await mountPage()
    await search('сейткали')
    expect(names()).toEqual(['Динара Сейткали'])
    await search('e.mura')
    expect(names()).toEqual(['Ержан Муратов'])
    await search('нет такого')
    expect(w.text()).toContain('Ничего не нашлось')
    expect(tabs()[0]).toBe('Сотрудники 0')
  })

  it('фильтр по роли: бизнес-роль и «Администратор»', async () => {
    await mountPage()
    const chip = w.findComponent(FilterChip)
    expect(chip.props('options').map((o: { label: string }) => o.label)).toEqual(['Декларант', 'КПП', 'МПП', 'Бухгалтер', 'Продажи', 'РОП', 'Администратор'])
    chip.vm.$emit('update:value', 'declarant')
    await flushPromises()
    expect(names()).toEqual(['Ахметов Куаныш', 'Динара Сейткали'])
    chip.vm.$emit('update:value', 'administrator')
    await flushPromises()
    expect(names()).toEqual(['Ахметов Куаныш'])
    chip.vm.$emit('update:value', null)
    await flushPromises()
    expect(names()).toHaveLength(4)
  })

  it('клик по строке кладёт сотрудника в адрес ?member= и подсвечивает строку; повторный клик снимает', async () => {
    await mountPage()
    await w.findAll('[data-member-open]')[1].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.member).toBe('m2')
    expect(w.findAll('tbody tr')[1].classes()).toContain('bg-tone-info-bg')
    expect(w.findAll('tbody tr')[0].classes()).not.toContain('bg-tone-info-bg')
    await w.findAll('[data-member-open]')[1].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.member).toBeUndefined()
  })

  it('?member=<id> при открытии подсвечивает строку', async () => {
    await mountPage('/settings/team?member=m3')
    expect(w.findAll('tbody tr')[2].classes()).toContain('bg-tone-info-bg')
    expect((w.vm as unknown as { selected: TeamMemberDto }).selected.id).toBe('m3')
  })

  it('ошибка загрузки — «Не удалось загрузить» и «Повторить», который перечитывает список', async () => {
    api.team.mockRejectedValueOnce(new Error('boom'))
    await mountPage()
    expect(w.get('[data-team-error]').text()).toContain('Не удалось загрузить')
    expect(tabs()[0]).toBe('Сотрудники')
    await w.get('[data-team-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-team-error]').exists()).toBe(false)
    expect(names()).toHaveLength(4)
  })

  it('пустая команда — отдельный текст', async () => {
    api.team.mockResolvedValue([])
    await mountPage()
    expect(w.text()).toContain('Сотрудников пока нет')
  })
})

describe('TeamPage: панель сотрудника', () => {
  it('?member=<id> открывает панель сотрудника; «Отмена» снимает выбор', async () => {
    await mountPage('/settings/team?member=m2')
    expect(w.get('[data-drawer] [data-drawer-name]').text()).toBe('Динара Сейткали')
    await w.get('[data-member-cancel]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.member).toBeUndefined()
    expect(w.find('[data-drawer]').exists()).toBe(false)
  })

  it('несохранённые роли: при смене строки спрашивают; отказ — остаёмся на сотруднике', async () => {
    as('administrator', ['users.read', 'users.assign_role'])
    await mountPage('/settings/team?member=m2')
    await w.get('[data-member-role="kpp"]').trigger('click')
    api.confirm.mockResolvedValueOnce(false)
    await w.findAll('[data-member-row]')[2].trigger('click')
    await flushPromises()
    expect(api.confirm).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.query.member).toBe('m2')
    api.confirm.mockResolvedValueOnce(true)
    await w.findAll('[data-member-row]')[2].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.member).toBe('m3')
  })
})

describe('TeamPage: клиенты', () => {
  it('компания, логин, статус; кнопки «Добавить клиента» нет; клик ведёт в карточку клиента', async () => {
    await mountPage()
    await tabBtn(1).trigger('click')
    await flushPromises()
    expect(w.findAll('[data-client-name]').map((n) => n.text())).toEqual(['ТОО «Казахмыс Трейд»', 'ТОО «Altyn Med»'])
    expect(w.findAll('[data-client-login]').map((n) => n.text())).toEqual(['kazakhmys', 'altyn'])
    expect(w.findAll('[data-client-status]').map((n) => n.text())).toEqual(['Активен', 'Заблокирован'])
    expect(w.text()).not.toMatch(/Добавить клиента/)
    expect(w.get('[data-team-clients-hint]').text()).toContain('Клиентов приглашают в разделе «Клиенты»')
    await w.findAll('[data-client-open]')[0].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/clients/c1')
  })

  it('поиск по компании и БИН; без права clients.read — имя по логину, без статуса и без запроса онбординга', async () => {
    await mountPage()
    await tabBtn(1).trigger('click')
    await search('160440')
    expect(w.findAll('[data-client-name]').map((n) => n.text())).toEqual(['ТОО «Казахмыс Трейд»'])
    w.unmount()
    api.onboarding.mockClear()
    as('sales', ['users.read'])
    await mountPage()
    await tabBtn(1).trigger('click')
    await flushPromises()
    expect(api.onboarding).not.toHaveBeenCalled()
    expect(w.findAll('[data-client-name]').map((n) => n.text())).toEqual(['altyn', 'kazakhmys'])
    expect(w.find('[data-client-status]').exists()).toBe(false)
  })

  it('без clients.read строка клиента не нажимается: нет кнопки и перехода в карточку', async () => {
    as('sales', ['users.read'])
    await mountPage()
    await tabBtn(1).trigger('click')
    await flushPromises()
    expect(w.find('[data-client-open]').exists()).toBe(false)
    await w.findAll('[data-client-name]')[0].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/settings/team')
  })
})

describe('TeamPage: экспедиторы', () => {
  it('логин и число клиентов; «Изменить» только при clients.manage', async () => {
    await mountPage()
    await tabBtn(2).trigger('click')
    await flushPromises()
    expect(w.findAll('[data-expeditor-login]').map((n) => n.text())).toEqual(['exp.one', 'exp.two'])
    expect(w.findAll('[data-expeditor-count]').map((n) => n.text())).toEqual(['1', '0'])
    expect(w.findAll('[data-expeditor-edit]')).toHaveLength(2)
    w.unmount()
    as('sales', ['users.read'])
    await mountPage()
    await tabBtn(2).trigger('click')
    await flushPromises()
    expect(w.find('[data-expeditor-edit]').exists()).toBe(false)
  })

  it('«Изменить»: логин и клиенты уходят в PUT с полем clientsId', async () => {
    await mountPage()
    await tabBtn(2).trigger('click')
    await flushPromises()
    await w.findAll('[data-expeditor-edit]')[0].trigger('click')
    await flushPromises()
    expect(w.get<HTMLInputElement>('[data-expeditor-username]').element.value).toBe('exp.one')
    await w.get('[data-expeditor-username]').setValue('  exp.uno ')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.editExpeditor).toHaveBeenCalledWith('e1', { username: 'exp.uno', clientsId: ['c1'] }, { silent: true })
    expect(api.expeditors).toHaveBeenCalledTimes(2)
  })

  it('ошибка сохранения показывается в окне текстом сервера', async () => {
    api.editExpeditor.mockRejectedValueOnce({ response: { data: { detail: 'Логин уже занят' } } })
    await mountPage()
    await tabBtn(2).trigger('click')
    await flushPromises()
    await w.findAll('[data-expeditor-edit]')[1].trigger('click')
    await flushPromises()
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(w.get('[data-expeditor-error]').text()).toContain('Логин уже занят')
  })
})

describe('TeamPage: добавление сотрудника', () => {
  it('после создания список перечитан, строка выбрана (?member=)', async () => {
    const created = member({ id: 'm9', username: 'new.one', businessRoles: ['kpp'] })
    api.registerStaff.mockResolvedValue(undefined)
    api.setUserRoles.mockResolvedValue(undefined)
    api.team.mockResolvedValueOnce(TEAM).mockResolvedValue([...TEAM, created])
    await mountPage()
    await w.get('[data-team-add]').trigger('click')
    await flushPromises()
    await w.get('[data-add-username]').setValue('new.one')
    await w.get('[data-add-password]').setValue('Passw0rd!')
    await w.get('[data-add-repeat]').setValue('Passw0rd!')
    await w.get('[data-add-role="kpp"]').trigger('click')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.member).toBe('m9')
    expect(names()).toContain('new.one')
  })
})
