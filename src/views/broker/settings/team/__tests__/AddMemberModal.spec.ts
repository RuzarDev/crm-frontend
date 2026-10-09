import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'

const api = vi.hoisted(() => ({
  registerStaff: vi.fn(), team: vi.fn(), catalog: vi.fn(), setUserRoles: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/users', () => ({ usersApi: { registerStaff: api.registerStaff, team: api.team } }))
vi.mock('@/api/permissions', async (orig) => ({
  ...(await orig<typeof import('@/api/permissions')>()),
  permissionsApi: { catalog: api.catalog, setUserRoles: api.setUserRoles },
}))
vi.mock('@/ui/message', () => ({ message: api.toast }))

import AddMemberModal from '../AddMemberModal.vue'
import { useAuthStore } from '@/stores/auth'

const ModalStub = {
  props: ['open'], emits: ['ok', 'update:open'],
  template: '<div v-if="open" data-modal><slot /><button data-ok type="button" @click="$emit(\'ok\')" /></div>',
}

let w: VueWrapper
const as = (role: string) => { useAuthStore().role = role }
const mountIt = async () => {
  w = mountWithI18n(AddMemberModal, { props: { open: true }, attachTo: document.body, global: { stubs: { ZModal: ModalStub } } })
  await flushPromises()
}
const fill = async (o: { u?: string; p?: string; r?: string; roles?: string[] }) => {
  if (o.u !== undefined) await w.get('[data-add-username]').setValue(o.u)
  if (o.p !== undefined) await w.get('[data-add-password]').setValue(o.p)
  if (o.r !== undefined) await w.get('[data-add-repeat]').setValue(o.r)
  for (const r of o.roles ?? []) await w.get(`[data-add-role="${r}"]`).trigger('click')
}
const labelOf = (sel: string) => w.get(sel).element.closest('label')!.textContent ?? ''
const submit = async () => { await w.get('[data-ok]').trigger('click'); await flushPromises() }

beforeEach(() => {
  setActivePinia(createPinia())
  api.catalog.mockResolvedValue([
    { code: 'declarant', label: 'Брокер-декларант (импорт)', scope: 'ДТ' },
    { code: 'kpp', label: 'Менеджер КПП', scope: 'граница' },
    { code: 'mpp', label: 'Транзит (реестр)', scope: 'транзит' },
    { code: 'sales', label: 'Продажи', scope: 'клиенты' },
  ])
  api.registerStaff.mockResolvedValue(undefined)
  api.setUserRoles.mockResolvedValue(undefined)
  api.team.mockResolvedValue([{ id: 'u1', username: 'new.one' }])
  as('sales')
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('AddMemberModal', () => {
  it('роли — флажки из каталога сервера с короткими подписями; флажка «Администратор» у не-администратора нет', async () => {
    await mountIt()
    expect(w.findAll('[data-add-role]').map((r) => r.attributes('data-add-role'))).toEqual(['declarant', 'kpp', 'mpp', 'sales'])
    expect(labelOf('[data-add-role="declarant"]')).toContain('Декларант')
    expect(labelOf('[data-add-role="declarant"]')).toContain('ДТ, ДТС, КЕДЕН')
    expect(w.find('[data-add-admin]').exists()).toBe(false)
  })

  it('администратор видит флажок «Администратор»', async () => {
    as('administrator')
    await mountIt()
    expect(labelOf('[data-add-admin]')).toContain('Администратор')
  })

  it('валидация: логин, пароль ≥ 8, повтор, ≥ 1 роль — запросов нет', async () => {
    await mountIt()
    await submit()
    expect(w.text()).toContain('Укажите логин')
    expect(w.text()).toContain('Пароль — минимум 8 символов')
    expect(w.get('[data-add-roles-error]').text()).toBe('Отметьте хотя бы одну роль')
    await fill({ u: 'a.b', p: 'short', r: 'other' })
    await flushPromises()
    expect(w.text()).toContain('Пароль — минимум 8 символов')
    expect(w.text()).toContain('Пароли не совпадают')
    await submit()
    expect(api.registerStaff).not.toHaveBeenCalled()
  })

  it('пароль проверяется на месте, до отправки', async () => {
    await mountIt()
    await w.get('[data-add-password]').setValue('1234567')
    expect(w.text()).toContain('Пароль — минимум 8 символов')
    await w.get('[data-add-password]').setValue('12345678')
    expect(w.text()).not.toContain('Пароль — минимум 8 символов')
  })

  it('«Сгенерировать» заполняет оба поля одинаковым паролем ≥ 8 знаков и показывает его', async () => {
    await mountIt()
    await w.get('[data-add-generate]').trigger('click')
    const p = w.get<HTMLInputElement>('[data-add-password]').element.value
    expect(p.length).toBeGreaterThanOrEqual(8)
    expect(w.get<HTMLInputElement>('[data-add-repeat]').element.value).toBe(p)
    expect(w.get('[data-add-generated-text]').text()).toBe(`Пароль: ${p}`)
  })

  it('пароль набрали руками — строка со сгенерированным и «Скопировать» исчезают', async () => {
    await mountIt()
    await w.get('[data-add-generate]').trigger('click')
    expect(w.find('[data-add-generated]').exists()).toBe(true)
    await w.get('[data-add-password]').setValue('MyOwnPass1')
    expect(w.find('[data-add-generated]').exists()).toBe(false)
    expect(w.find('[data-add-copy]').exists()).toBe(false)
  })

  it('два запроса: регистрация (тип аккаунта по основной роли) и роли; created с id', async () => {
    await mountIt()
    await fill({ u: ' new.one ', p: 'Passw0rd!', r: 'Passw0rd!', roles: ['sales', 'mpp'] })
    await submit()
    // основная роль — первая в порядке списка (mpp), а не в порядке нажатий: mpp → broker
    expect(api.registerStaff).toHaveBeenCalledWith({ username: 'new.one', password: 'Passw0rd!', role: 'broker', businessRole: 'mpp' })
    expect(api.setUserRoles).toHaveBeenCalledWith('u1', ['mpp', 'sales'], { silent: true })
    expect(w.emitted('created')).toEqual([[{ id: 'u1', username: 'new.one' }]])
    expect(w.emitted('update:open')).toEqual([[false]])
  })

  it.each([
    [['declarant'], 'importer'],
    [['sales'], 'sales'],
    [['kpp'], 'importer'],
  ])('системная роль для %j — %s', async (roles, system) => {
    await mountIt()
    await fill({ u: 'new.one', p: 'Passw0rd!', r: 'Passw0rd!', roles })
    await submit()
    expect(api.registerStaff.mock.calls[0][0].role).toBe(system)
  })

  it('администратор с флажком: role=administrator; роли необязательны, без них второго запроса нет', async () => {
    as('administrator')
    await mountIt()
    await fill({ u: 'boss', p: 'Passw0rd!', r: 'Passw0rd!' })
    await w.get('[data-add-admin]').trigger('click')
    await submit()
    expect(api.registerStaff).toHaveBeenCalledWith({ username: 'boss', password: 'Passw0rd!', role: 'administrator' })
    expect(api.setUserRoles).not.toHaveBeenCalled()
    expect(w.emitted('created')).toBeTruthy()
  })

  it('ошибка сервера (403) — текстом в окне, окно открыто, created нет', async () => {
    api.registerStaff.mockRejectedValue({ response: { status: 403, data: { detail: 'Создать администратора может только администратор' } } })
    await mountIt()
    await fill({ u: 'x', p: 'Passw0rd!', r: 'Passw0rd!', roles: ['kpp'] })
    await submit()
    expect(w.get('[data-add-member-error]').text()).toContain('Создать администратора может только администратор')
    expect(w.emitted('created')).toBeUndefined()
    expect(w.emitted('update:open')).toBeUndefined()
    expect(api.setUserRoles).not.toHaveBeenCalled()
  })

  it('роли не назначились — сотрудник всё равно создан: предупреждение с текстом сервера и created', async () => {
    api.setUserRoles.mockRejectedValue({ response: { data: { detail: 'Нет права назначать роли' } } })
    await mountIt()
    await fill({ u: 'new.one', p: 'Passw0rd!', r: 'Passw0rd!', roles: ['kpp'] })
    await submit()
    expect(api.toast.warning).toHaveBeenCalledWith('Сотрудник создан, но роли назначить не удалось: Нет права назначать роли')
    expect(w.emitted('created')).toEqual([[{ id: 'u1', username: 'new.one' }]])
  })
})
