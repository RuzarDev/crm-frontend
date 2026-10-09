import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { TeamMemberDto } from '@/types/api'

const api = vi.hoisted(() => ({
  declarantProfile: vi.fn(), linkedClients: vi.fn(), editBroker: vi.fn(), editStaffClients: vi.fn(),
  resetPassword: vi.fn(), deleteUser: vi.fn(), catalog: vi.fn(), setUserRoles: vi.fn(), setPoa: vi.fn(), confirm: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/users', () => ({
  usersApi: {
    declarantProfile: api.declarantProfile, linkedClients: api.linkedClients, editBroker: api.editBroker,
    editStaffClients: api.editStaffClients, resetPassword: api.resetPassword, deleteUser: api.deleteUser,
  },
}))
vi.mock('@/api/permissions', async (orig) => ({
  ...(await orig<typeof import('@/api/permissions')>()),
  permissionsApi: { catalog: api.catalog, setUserRoles: api.setUserRoles, setPoaRepresentative: api.setPoa },
}))
vi.mock('@/ui/message', () => ({ message: api.toast }))
vi.mock('@/ui/confirm', () => ({ useConfirm: () => ({ confirm: api.confirm }) }))

import MemberDrawer from '../MemberDrawer.vue'
import MemberClients from '../MemberClients.vue'
import { useAuthStore } from '@/stores/auth'

// Панель и окно — заглушки (механика Reka не проверяется): содержимое, слоты и запросы.
const DrawerStub = {
  props: ['open'], emits: ['update:open'],
  template: '<div v-if="open" data-drawer><div data-title><slot name="title" /></div><slot /><div data-footer><slot name="footer" /></div></div>',
}
const ModalStub = { props: ['open'], emits: ['update:open'], template: '<div v-if="open" data-modal><slot /></div>' }

const member = (o: Partial<TeamMemberDto> = {}): TeamMemberDto => ({
  id: 'm2', username: 'd.seitkali', displayName: 'Динара Сейткали', systemRole: 'importer', businessRoles: ['declarant'],
  createdAtUtc: '2026-08-12T04:00:00Z', isPoaRepresentative: false, clientCount: 0, ...o,
})
const CLIENT_OPTIONS = [{ value: 'c1', label: 'Казахмыс Трейд' }, { value: 'c2', label: 'Altyn Med' }]
const PROFILE = {
  fullName: 'Динара Сейткали', position: null, phone: null, iin: '900412450123',
  powerOfAttorneyNumber: '14', powerOfAttorneyDate: '2026-01-01', powerOfAttorneyValidUntil: '2026-12-31',
  idDocTypeCode: null, idDocNumber: null, idDocIssueDate: null, idDocIssuedBy: null, idDocCountryCode: null,
}

let w: VueWrapper
const as = (role: string, perms: string[], userId = 'me') => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = perms
  auth.userId = userId
}
const FULL = ['users.read', 'users.write', 'users.assign_role', 'users.delete', 'clients.manage']
const mountIt = async (m: TeamMemberDto | null = member()) => {
  w = mountWithI18n(MemberDrawer, {
    props: { member: m, clientOptions: CLIENT_OPTIONS },
    attachTo: document.body,
    global: { stubs: { ZDrawer: DrawerStub, ZModal: ModalStub } },
  })
  await flushPromises()
}
const err = (status: number, detail: string) => Object.assign(new Error(detail), { response: { status, data: { detail } } })
const role = (c: string) => w.get(`[data-member-role="${c}"]`)
const checked = (c: string) => role(c).attributes('aria-checked') === 'true' || role(c).attributes('data-state') === 'checked'
const click = async (sel: string) => { await w.get(sel).trigger('click'); await flushPromises() }

beforeEach(() => {
  setActivePinia(createPinia())
  api.catalog.mockResolvedValue([
    { code: 'declarant', label: 'Брокер-декларант (импорт)', scope: 'ДТ' },
    { code: 'kpp', label: 'Менеджер КПП', scope: 'граница' },
    { code: 'mpp', label: 'Транзит (реестр)', scope: 'транзит' },
    { code: 'rop', label: 'РОП', scope: 'отчёты' },
  ])
  api.declarantProfile.mockResolvedValue(PROFILE)
  api.linkedClients.mockResolvedValue([])
  api.setUserRoles.mockResolvedValue(undefined)
  api.setPoa.mockResolvedValue(undefined)
  api.editBroker.mockResolvedValue(undefined)
  api.editStaffClients.mockResolvedValue(undefined)
  api.deleteUser.mockResolvedValue(undefined)
  api.resetPassword.mockResolvedValue({ username: 'd.seitkali', temporaryPassword: 'Tmp-Pass-4821' })
  api.confirm.mockResolvedValue(true)
  as('administrator', FULL)
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('MemberDrawer: шапка и роли', () => {
  it('шапка: имя, «логин · с ДД.ММ.ГГГГ»; без выбранного сотрудника панель закрыта', async () => {
    await mountIt()
    expect(w.get('[data-drawer-name]').text()).toBe('Динара Сейткали')
    expect(w.get('[data-member-since]').text()).toBe('d.seitkali · с 12.08.2026')
    w.unmount()
    await mountIt(null)
    expect(w.find('[data-drawer]').exists()).toBe(false)
  })

  it('роли — флажки с короткой подписью области и подсказкой про повторный вход', async () => {
    await mountIt()
    const label = (c: string) => role(c).element.closest('label')!.textContent ?? ''
    expect(label('declarant')).toContain('Декларант')
    expect(label('declarant')).toContain('ДТ, ДТС, КЕДЕН')
    expect(label('kpp')).toContain('граница, СВХ')
    expect(checked('declarant')).toBe(true)
    expect(checked('kpp')).toBe(false)
    expect(w.get('[data-member-roles-hint]').text()).toBe('Изменения применятся сразу: сотруднику нужно будет войти заново')
  })

  it('роли сохраняются одним PUT в порядке списка; затем saved, клиенты не трогаются', async () => {
    await mountIt()
    expect(w.get('[data-member-save]').attributes('disabled')).toBeDefined()
    await click('[data-member-role="rop"]')
    await click('[data-member-role="kpp"]')
    await click('[data-member-save]')
    expect(api.setUserRoles).toHaveBeenCalledTimes(1)
    expect(api.setUserRoles).toHaveBeenCalledWith('m2', ['declarant', 'kpp', 'rop'], { silent: true })
    expect(api.editBroker).not.toHaveBeenCalled()
    expect(api.editStaffClients).not.toHaveBeenCalled()
    expect(w.emitted('saved')).toHaveLength(1)
    expect(api.toast.success).toHaveBeenCalledWith('Сохранено')
  })

  it('нельзя снять все роли: ошибка и недоступное «Сохранить»', async () => {
    await mountIt()
    await click('[data-member-role="declarant"]')
    expect(w.get('[data-member-roles-error]').text()).toBe('Отметьте хотя бы одну роль')
    expect(w.get('[data-member-save]').attributes('disabled')).toBeDefined()
  })

  it('себе без администратора роли менять нельзя: флажки недоступны, есть пояснение', async () => {
    as('sales', FULL, 'm2')
    await mountIt()
    expect(role('declarant').attributes('disabled')).toBeDefined()
    expect(w.get('[data-member-roles-lock]').text()).toBe('Свои роли может менять только администратор')
  })

  it('администратор себе роли менять может', async () => {
    as('administrator', FULL, 'm2')
    await mountIt()
    expect(role('declarant').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-member-roles-lock]').exists()).toBe(false)
    await click('[data-member-role="kpp"]')
    await click('[data-member-save]')
    expect(api.setUserRoles).toHaveBeenCalledWith('m2', ['declarant', 'kpp'], { silent: true })
  })

  it('роли администратора не-администратор менять не может; без users.assign_role флажки недоступны', async () => {
    as('sales', FULL)
    await mountIt(member({ systemRole: 'administrator' }))
    expect(role('declarant').attributes('disabled')).toBeDefined()
    expect(w.get('[data-member-roles-lock]').text()).toBe('Роли администратора меняет только администратор')
    w.unmount()
    as('sales', ['users.read'])
    await mountIt()
    expect(role('declarant').attributes('disabled')).toBeDefined()
    expect(w.get('[data-member-roles-lock]').text()).toBe('У вас нет права менять роли')
  })

  it('ошибка сервера 409 «последний администратор» — текстом в панели, панель не закрывается', async () => {
    api.setUserRoles.mockRejectedValue(err(409, 'Нельзя лишить прав последнего администратора'))
    await mountIt(member({ systemRole: 'administrator' }))
    await click('[data-member-role="kpp"]')
    await click('[data-member-save]')
    expect(w.get('[data-member-error]').text()).toContain('Нельзя лишить прав последнего администратора')
    expect(w.emitted('saved')).toBeUndefined()
  })

  it('ошибка сервера 403 при смене ролей показывается в панели', async () => {
    api.setUserRoles.mockRejectedValue(err(403, 'Роли администратора меняет только администратор'))
    await mountIt()
    await click('[data-member-role="kpp"]')
    await click('[data-member-save]')
    expect(w.get('[data-member-error]').text()).toContain('меняет только администратор')
  })
})

describe('MemberDrawer: профиль декларанта', () => {
  it('есть роль declarant — ИИН, доверенность «№ … до …» и переключатель представителя', async () => {
    await mountIt()
    expect(api.declarantProfile).toHaveBeenCalledWith('m2', { silent: true })
    expect(w.get('[data-profile-iin]').text()).toBe('900412450123')
    expect(w.get('[data-profile-poa]').text()).toBe('№ 14 до 31.12.2026')
    const sw = w.get('[data-member-poa]')
    expect(sw.attributes('aria-checked')).toBe('false')
    await sw.trigger('click')
    await flushPromises()
    expect(api.setPoa).toHaveBeenCalledWith('m2', true, { silent: true })
    expect(w.emitted('changed')).toHaveLength(1)
  })

  it('ошибка переключателя возвращает его назад и показывает текст сервера', async () => {
    api.setPoa.mockRejectedValue(err(409, 'Профиль неполный'))
    await mountIt()
    await w.get('[data-member-poa]').trigger('click')
    await flushPromises()
    expect(w.get('[data-member-poa]').attributes('aria-checked')).toBe('false')
    expect(w.get('[data-member-error]').text()).toContain('Профиль неполный')
  })

  it('профиля нет (204) — пояснение, переключателя нет', async () => {
    api.declarantProfile.mockResolvedValue(null)
    await mountIt()
    expect(w.get('[data-member-profile-empty]').text()).toBe('Сотрудник ещё не заполнил профиль декларанта')
    expect(w.find('[data-member-poa]').exists()).toBe(false)
  })

  it('сбой загрузки профиля — «Повторить»', async () => {
    api.declarantProfile.mockRejectedValueOnce(new Error('x'))
    await mountIt()
    expect(w.find('[data-member-profile-error]').exists()).toBe(true)
    await click('[data-member-profile-retry]')
    expect(w.get('[data-profile-iin]').text()).toBe('900412450123')
  })

  it('без роли declarant блока и запроса нет; поставили флажок — блок появляется', async () => {
    await mountIt(member({ businessRoles: ['kpp'] }))
    expect(w.find('[data-member-profile]').exists()).toBe(false)
    expect(api.declarantProfile).not.toHaveBeenCalled()
    await click('[data-member-role="declarant"]')
    expect(w.find('[data-member-profile]').exists()).toBe(true)
    expect(api.declarantProfile).toHaveBeenCalledTimes(1)
  })
})

describe('MemberDrawer: клиенты', () => {
  it('МПП: список привязанных; добавление и удаление сохраняются через PUT users/staff/{id}/clients', async () => {
    api.linkedClients.mockResolvedValue([{ id: 'c1', username: 'kazakhmys' }])
    await mountIt(member({ businessRoles: ['mpp'] }))
    expect(api.linkedClients).toHaveBeenCalledWith('m2', 'importer', { silent: true })
    expect(w.findAll('[data-member-client-name]').map((n) => n.text())).toEqual(['Казахмыс Трейд'])
    w.findComponent(MemberClients).vm.$emit('update:value', [{ id: 'c1', label: 'Казахмыс Трейд' }, { id: 'c2', label: 'Altyn Med' }])
    await flushPromises()
    expect(w.findAll('[data-member-client-name]')).toHaveLength(2)
    await click('[data-member-client-remove]')
    await click('[data-member-save]')
    expect(api.editStaffClients).toHaveBeenCalledWith('m2', { clientIds: ['c2'] }, { silent: true })
    expect(api.setUserRoles).not.toHaveBeenCalled()
  })

  it('системный брокер: PUT users/brokers/{id} с username null', async () => {
    api.linkedClients.mockResolvedValue([{ id: 'c1', username: 'kazakhmys' }])
    await mountIt(member({ systemRole: 'broker', businessRoles: ['mpp'] }))
    expect(api.linkedClients).toHaveBeenCalledWith('m2', 'broker', { silent: true })
    await click('[data-member-client-remove]')
    await click('[data-member-save]')
    expect(api.editBroker).toHaveBeenCalledWith('m2', { username: null, clientIds: [] }, { silent: true })
  })

  it('без clients.manage или без роли МПП блока клиентов нет', async () => {
    as('sales', ['users.read', 'users.assign_role'])
    await mountIt(member({ businessRoles: ['mpp'] }))
    expect(w.find('[data-member-clients-section]').exists()).toBe(false)
    w.unmount()
    as('administrator', FULL)
    await mountIt(member({ businessRoles: ['kpp'] }))
    expect(w.find('[data-member-clients-section]').exists()).toBe(false)
    expect(api.linkedClients).not.toHaveBeenCalled()
  })
})

describe('MemberDrawer: временный пароль', () => {
  it('подтверждение → окно с паролем (моно) и текстом; закрыли — пароль забыт', async () => {
    await mountIt()
    await click('[data-member-reset]')
    expect(api.confirm).toHaveBeenCalledTimes(1)
    expect(api.confirm.mock.calls[0][0].title).toContain('Динара Сейткали')
    expect(api.resetPassword).toHaveBeenCalledWith('m2', { silent: true })
    expect(w.get('[data-temp-password]').text()).toBe('Tmp-Pass-4821')
    expect(w.get('[data-temp-password]').element.tagName).toBe('CODE')
    expect(w.get('[data-temp-password-dialog], [data-modal]').text()).toContain('Старые сессии завершатся, при входе попросим сменить пароль')
    await click('[data-temp-close]')
    expect(w.find('[data-temp-password]').exists()).toBe(false)
  })

  it('отказ в подтверждении — запроса нет', async () => {
    api.confirm.mockResolvedValue(false)
    await mountIt()
    await click('[data-member-reset]')
    expect(api.resetPassword).not.toHaveBeenCalled()
  })

  it('только администратор и не себе', async () => {
    as('sales', FULL)
    await mountIt()
    expect(w.find('[data-member-reset]').exists()).toBe(false)
    w.unmount()
    as('administrator', FULL, 'm2')
    await mountIt()
    expect(w.find('[data-member-reset]').exists()).toBe(false)
  })

  it('ошибка сервера показывается в панели', async () => {
    api.resetPassword.mockRejectedValue(err(403, 'Свой пароль так не меняют'))
    await mountIt()
    await click('[data-member-reset]')
    expect(w.get('[data-member-error]').text()).toContain('Свой пароль так не меняют')
    expect(w.find('[data-temp-password]').exists()).toBe(false)
  })
})

describe('MemberDrawer: удаление', () => {
  it('подтверждение с именем → DELETE → deleted', async () => {
    await mountIt()
    await click('[data-member-delete]')
    expect(api.confirm.mock.calls[0][0].title).toBe('Удалить сотрудника Динара Сейткали?')
    expect(api.deleteUser).toHaveBeenCalledWith('m2', { silent: true })
    expect(w.emitted('deleted')).toHaveLength(1)
  })

  it('отказ — ничего не удаляется', async () => {
    api.confirm.mockResolvedValue(false)
    await mountIt()
    await click('[data-member-delete]')
    expect(api.deleteUser).not.toHaveBeenCalled()
    expect(w.emitted('deleted')).toBeUndefined()
  })

  it('себя удалить нельзя; без users.delete кнопки нет; администратора удаляет только администратор', async () => {
    as('administrator', FULL, 'm2')
    await mountIt()
    expect(w.find('[data-member-delete]').exists()).toBe(false)
    w.unmount()
    as('sales', ['users.read'])
    await mountIt()
    expect(w.find('[data-member-delete]').exists()).toBe(false)
    w.unmount()
    as('sales', FULL)
    await mountIt(member({ systemRole: 'administrator' }))
    expect(w.find('[data-member-delete]').exists()).toBe(false)
  })

  it('409 «последний администратор» показывается в панели, событие deleted не уходит', async () => {
    api.deleteUser.mockRejectedValue(err(409, 'Нельзя удалить последнего администратора'))
    await mountIt(member({ systemRole: 'administrator' }))
    await click('[data-member-delete]')
    expect(w.get('[data-member-error]').text()).toContain('Нельзя удалить последнего администратора')
    expect(w.emitted('deleted')).toBeUndefined()
  })
})

describe('MemberDrawer: закрытие', () => {
  it('без правок «Отмена» закрывает сразу, без вопроса', async () => {
    await mountIt()
    await click('[data-member-cancel]')
    expect(api.confirm).not.toHaveBeenCalled()
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('с правками — вопрос; «Продолжить» оставляет панель, «Закрыть без сохранения» закрывает', async () => {
    await mountIt()
    await click('[data-member-role="kpp"]')
    api.confirm.mockResolvedValueOnce(false)
    await click('[data-member-cancel]')
    expect(api.confirm).toHaveBeenCalledTimes(1)
    expect(api.confirm.mock.calls[0][0]).toMatchObject({ title: 'Закрыть без сохранения?', okText: 'Закрыть без сохранения', cancelText: 'Продолжить' })
    expect(w.emitted('close')).toBeUndefined()
    await click('[data-member-cancel]')
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('крестик (update:open=false из панели) тоже спрашивает; при отказе close не уходит', async () => {
    await mountIt()
    await click('[data-member-role="kpp"]')
    api.confirm.mockResolvedValueOnce(false)
    w.findComponent(DrawerStub).vm.$emit('update:open', false)
    await flushPromises()
    expect(api.confirm).toHaveBeenCalledTimes(1)
    expect(w.emitted('close')).toBeUndefined()
    w.findComponent(DrawerStub).vm.$emit('update:open', false)
    await flushPromises()
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('canLeave доступен странице: с правками — вопрос, ответ возвращается', async () => {
    await mountIt()
    const leave = () => (w.vm as unknown as { canLeave: () => Promise<boolean> }).canLeave()
    expect(await leave()).toBe(true)
    await click('[data-member-role="kpp"]')
    api.confirm.mockResolvedValueOnce(false)
    expect(await leave()).toBe(false)
    expect(api.confirm).toHaveBeenCalledTimes(1)
  })

  it('после закрытия с отказом от правок черновик сброшен: панели нет — вопроса нет, повторное открытие чистое', async () => {
    await mountIt()
    await click('[data-member-role="kpp"]')
    await click('[data-member-cancel]')
    expect(w.emitted('close')).toHaveLength(1)
    await w.setProps({ member: null })
    expect(await (w.vm as unknown as { canLeave: () => Promise<boolean> }).canLeave()).toBe(true)
    await w.setProps({ member: member() })
    await flushPromises()
    expect(checked('kpp')).toBe(false)
    expect(api.confirm).toHaveBeenCalledTimes(1)
    await click('[data-member-cancel]')
    expect(api.confirm).toHaveBeenCalledTimes(1)
  })
})

describe('MemberDrawer: правки (раунд 1)', () => {
  it('отметили МПП — блок клиентов появляется сразу, список грузится', async () => {
    await mountIt(member({ businessRoles: ['kpp'] }))
    expect(w.find('[data-member-clients-section]').exists()).toBe(false)
    await click('[data-member-role="mpp"]')
    expect(w.find('[data-member-clients-section]').exists()).toBe(true)
    expect(api.linkedClients).toHaveBeenCalledWith('m2', 'importer', { silent: true })
  })

  it('справочник клиентов пришёл позже привязок — подписи подставляются', async () => {
    api.linkedClients.mockResolvedValue([{ id: 'c1', username: 'kazakhmys' }])
    w = mountWithI18n(MemberDrawer, {
      props: { member: member({ businessRoles: ['mpp'] }), clientOptions: [] },
      attachTo: document.body,
      global: { stubs: { ZDrawer: DrawerStub, ZModal: ModalStub } },
    })
    await flushPromises()
    expect(w.get('[data-member-client-name]').text()).toBe('kazakhmys')
    await w.setProps({ clientOptions: CLIENT_OPTIONS })
    expect(w.get('[data-member-client-name]').text()).toBe('Казахмыс Трейд')
  })

  it('сохранение — одно перечитывание списка (только saved); пока идёт, флажки недоступны', async () => {
    let done!: () => void
    api.setUserRoles.mockReturnValue(new Promise<void>((r) => { done = r }))
    await mountIt()
    await click('[data-member-role="kpp"]')
    await w.get('[data-member-save]').trigger('click')
    await flushPromises()
    expect(role('declarant').attributes('disabled')).toBeDefined()
    expect(w.get('[data-member-cancel]').attributes('disabled')).toBeDefined()
    done()
    await flushPromises()
    expect(w.emitted('changed')).toBeUndefined()
    expect(w.emitted('saved')).toHaveLength(1)
  })

  it('роли сохранились, клиенты нет — changed (список перечитать) и ошибка в панели', async () => {
    api.linkedClients.mockResolvedValue([{ id: 'c1', username: 'k' }])
    api.editStaffClients.mockRejectedValue(err(409, 'Не получилось'))
    await mountIt(member({ businessRoles: ['mpp'] }))
    await click('[data-member-role="kpp"]')
    await click('[data-member-client-remove]')
    await click('[data-member-save]')
    expect(w.emitted('changed')).toHaveLength(1)
    expect(w.emitted('saved')).toBeUndefined()
    expect(w.get('[data-member-error]').text()).toContain('Не получилось')
  })
})
