import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { h } from 'vue'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { DeclarantProfileDto } from '@/api/declarantProfile'
import type { ProfileDto } from '@/types/api'

const api = vi.hoisted(() => ({
  profileGet: vi.fn(), profileUpdate: vi.fn(),
  declGet: vi.fn(), declUpdate: vi.fn(),
  changePassword: vi.fn(), listClassifiers: vi.fn(), setLocale: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/profile', () => ({ profileApi: { get: api.profileGet, update: api.profileUpdate } }))
vi.mock('@/api/declarantProfile', () => ({ declarantProfileApi: { get: api.declGet, update: api.declUpdate } }))
vi.mock('@/api/auth', () => ({ authApi: { changePassword: api.changePassword } }))
vi.mock('@/api/references', () => ({ referencesApi: { listClassifiers: api.listClassifiers, listCountries: vi.fn(async () => [{ alpha2: 'KZ', name: 'Казахстан' }]) } }))
vi.mock('@/ui/message', () => ({ message: api.toast }))
vi.mock('@/i18n', async (orig) => ({ ...(await orig<typeof import('@/i18n')>()), setLocale: api.setLocale }))

import ProfilePage from '../ProfilePage.vue'
import { useAuthStore } from '@/stores/auth'
import { useProfileStore } from '@/stores/profile'

const profile = (over: Partial<ProfileDto> = {}): ProfileDto => ({
  userId: 'u1', username: 'd.seitkali', displayName: 'Динара Сейткали', phone: '+7 701 555 12 40', companyName: null, innBin: null, role: 'importer', ...over,
})
const decl = (over: Partial<DeclarantProfileDto> = {}): DeclarantProfileDto => ({
  fullName: 'Сейткали Динара Ерлановна', position: 'Декларант', phone: '+7 701 555 12 40', iin: '900412450123',
  powerOfAttorneyNumber: '14', powerOfAttorneyDate: '2026-01-02', powerOfAttorneyValidUntil: '2026-12-31',
  idDocTypeCode: '21', idDocNumber: '045612378', idDocIssueDate: '2019-03-12', idDocIssuedBy: 'МВД РК', idDocCountryCode: 'KZ',
  ...over,
})

let w: VueWrapper
let router: Router
const App = { render: () => h(RouterView) }
const as = (role: string, perms: string[] = [], extra: { mustChange?: boolean; businessRoles?: string[]; modules?: string[] } = {}) => {
  const auth = useAuthStore()
  auth.role = role
  auth.username = 'd.seitkali'
  auth.permissions = perms
  auth.businessRoles = extra.businessRoles ?? []
  auth.modules = extra.modules ?? []
  auth.setMustChangePassword(!!extra.mustChange)
}
const open = async (path = '/profile') => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(App, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
}
const card = (k: string) => w.find(`[data-profile-card="${k}"]`)
const cards = () => w.findAll('[data-profile-card]').map((c) => c.attributes('data-profile-card'))
const input = (sel: string) => w.get(sel)
const saveOf = (k: string) => card(k).get('[data-card-save]')

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/profile', component: ProfilePage },
      { path: '/:p(.*)*', component: { template: '<div data-other />' } },
    ],
  })
  api.profileGet.mockImplementation(async () => ({ data: profile() }))
  api.profileUpdate.mockImplementation(async (d: Record<string, unknown>) => ({ data: profile({ ...(d as object) } as Partial<ProfileDto>) }))
  api.declGet.mockImplementation(async () => decl())
  api.declUpdate.mockImplementation(async (d: DeclarantProfileDto) => d)
  api.listClassifiers.mockResolvedValue([{ id: '1', classifierCode: 'id-doc-types', code: '21', nameRu: 'Удостоверение личности', sortOrder: 1, isActive: true }])
  api.changePassword.mockResolvedValue({ accessToken: 'h.e30.new', role: 'importer', mustChangePassword: false })
  as('importer')
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('ProfilePage: шапка и карточки', () => {
  it('шапка: инициалы, имя, «логин · роли · компания»', async () => {
    as('broker', [], { businessRoles: ['declarant'] })
    api.profileGet.mockResolvedValue({ data: profile({ role: 'broker', companyName: 'AQNIET' }) })
    await open()
    expect(w.get('[data-profile-name]').text()).toBe('Динара Сейткали')
    expect(w.get('[data-profile-meta]').text()).toBe('d.seitkali · Брокер-декларант (импорт) · AQNIET')
  })

  it('сотрудник без особых прав: личные данные, язык, пароль; декларант не грузится', async () => {
    await open()
    expect(cards()).toEqual(['personal', 'language', 'password'])
    expect(api.declGet).not.toHaveBeenCalled()
  })

  it('карточка декларанта — по праву import40.declarant, а не по основной роли', async () => {
    as('importer', ['import40.declarant', 'import40.kpp'], { businessRoles: ['mpp', 'declarant'] })
    await open()
    expect(cards()).toEqual(['personal', 'declarant', 'language', 'password'])
    expect(api.declGet).toHaveBeenCalledTimes(1)
  })

  it('клиент Импорта 40: «Компания» со ссылкой в /import-40/company, формы имени нет', async () => {
    as('client', [], { modules: ['import40'] })
    await open()
    expect(cards()).toEqual(['company', 'language', 'password'])
    await w.get('[data-open-company]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/import-40/company')
  })

  it('ошибка загрузки профиля — блок с «Повторить», а не пустые формы; повтор подтягивает карточки', async () => {
    api.profileGet.mockRejectedValueOnce(new Error('boom'))
    await open()
    expect(w.find('[data-profile-error]').exists()).toBe(true)
    expect(cards()).toEqual([])
    await w.get('[data-profile-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-profile-error]').exists()).toBe(false)
    expect(cards()).toEqual(['personal', 'language', 'password'])
  })
})

describe('ProfilePage: личные данные', () => {
  it('«Сохранить» доступна только после правки; сотрудник без компании её не отправляет', async () => {
    await open()
    expect(saveOf('personal').attributes('disabled')).toBeDefined()
    await input('[data-profile="phone"]').setValue('+7 700 111 22 33')
    expect(saveOf('personal').attributes('disabled')).toBeUndefined()
    await card('personal').trigger('submit')
    await flushPromises()
    const payload = api.profileUpdate.mock.calls[0][0]
    expect(payload).toEqual({ displayName: 'Динара Сейткали', phone: '+7 700 111 22 33' })
    expect('companyName' in payload).toBe(false)
  })

  it('брокер: компания и БИН показаны и уходят (очищенное поле — пустой строкой)', async () => {
    as('broker')
    api.profileGet.mockResolvedValue({ data: profile({ role: 'broker', companyName: 'AQNIET', innBin: '180940012345' }) })
    await open()
    await input('[data-profile="innBin"]').setValue('')
    await card('personal').trigger('submit')
    await flushPromises()
    expect(api.profileUpdate.mock.calls[0][0]).toEqual({ displayName: 'Динара Сейткали', phone: '+7 701 555 12 40', companyName: 'AQNIET', innBin: '' })
  })
})

describe('ProfilePage: профиль декларанта', () => {
  const asDeclarant = () => as('importer', ['import40.declarant'])

  it('ошибка загрузки — состояние ошибки, формы и «Сохранить» нет: пустой формой данные не затереть', async () => {
    asDeclarant()
    api.declGet.mockRejectedValueOnce(new Error('boom'))
    await open()
    expect(card('declarant').find('[data-declarant-error]').exists()).toBe(true)
    expect(card('declarant').find('[data-declarant="fullName"]').exists()).toBe(false)
    expect(card('declarant').find('[data-card-save]').exists()).toBe(false)
    await card('declarant').trigger('submit')
    await flushPromises()
    expect(api.declUpdate).not.toHaveBeenCalled()
    // «Повторить» — форма появляется с настоящими данными
    await card('declarant').get('[data-declarant-retry]').trigger('click')
    await flushPromises()
    expect((input('[data-declarant="fullName"]').element as HTMLInputElement).value).toBe('Сейткали Динара Ерлановна')
  })

  it('все поля профиля показаны и круглым образом уходят при сохранении', async () => {
    asDeclarant()
    await open()
    const f = (k: string) => (input(`[data-declarant="${k}"]`).element as HTMLInputElement)
    for (const k of ['fullName', 'position', 'iin', 'idDocNumber', 'idDocIssuedBy', 'phone', 'powerOfAttorneyNumber', 'idDocIssueDate', 'powerOfAttorneyDate', 'powerOfAttorneyValidUntil', 'idDocTypeCode', 'idDocCountryCode']) {
      expect(w.find(`[data-declarant="${k}"]`).exists(), k).toBe(true)
    }
    expect(f('position').value).toBe('Декларант')
    expect(f('idDocIssuedBy').value).toBe('МВД РК')
    expect(f('phone').value).toBe('+7 701 555 12 40')
    // правим каждое текстовое поле
    await input('[data-declarant="fullName"]').setValue('Иванов Иван')
    await input('[data-declarant="position"]').setValue('Старший декларант')
    await input('[data-declarant="iin"]').setValue('900412450124')
    await input('[data-declarant="idDocNumber"]').setValue('045612999')
    await input('[data-declarant="idDocIssuedBy"]').setValue('МВД')
    await input('[data-declarant="phone"]').setValue('+7 700 111 22 33')
    await input('[data-declarant="powerOfAttorneyNumber"]').setValue('15')
    await card('declarant').trigger('submit')
    await flushPromises()
    expect(api.declUpdate).toHaveBeenCalledTimes(1)
    // даты, документ и страна, которых не трогали, уходят как загружены
    expect(api.declUpdate.mock.calls[0][0]).toEqual(decl({
      fullName: 'Иванов Иван', position: 'Старший декларант', iin: '900412450124', idDocNumber: '045612999',
      idDocIssuedBy: 'МВД', phone: '+7 700 111 22 33', powerOfAttorneyNumber: '15',
    }))
    expect(api.toast.success).toHaveBeenCalled()
    expect(saveOf('declarant').attributes('disabled')).toBeDefined()
  })

  it('ИИН не из 12 цифр: ошибка на месте, запроса нет', async () => {
    asDeclarant()
    await open()
    await input('[data-declarant="iin"]').setValue('90041245012')
    await card('declarant').trigger('submit')
    await flushPromises()
    expect(card('declarant').text()).toContain('ИИН — ровно 12 цифр')
    expect(api.declUpdate).not.toHaveBeenCalled()
    await input('[data-declarant="iin"]').setValue('900412450124')
    await card('declarant').trigger('submit')
    await flushPromises()
    expect(api.declUpdate).toHaveBeenCalledTimes(1)
  })

  it('пустой профиль: имя и телефон берутся из аккаунта; подстановка — не правка, «Сохранить» ждёт правки и уносит подставленное', async () => {
    asDeclarant()
    api.declGet.mockResolvedValue({ ...decl(), fullName: null, phone: null })
    await open()
    expect((input('[data-declarant="fullName"]').element as HTMLInputElement).value).toBe('Динара Сейткали')
    expect(saveOf('declarant').attributes('disabled')).toBeDefined()
    await card('declarant').trigger('submit')
    await flushPromises()
    expect(api.declUpdate).not.toHaveBeenCalled()
    await input('[data-declarant="position"]').setValue('Старший декларант')
    expect(saveOf('declarant').attributes('disabled')).toBeUndefined()
    await card('declarant').trigger('submit')
    await flushPromises()
    expect(api.declUpdate.mock.calls[0][0]).toMatchObject({ fullName: 'Динара Сейткали', phone: '+7 701 555 12 40', position: 'Старший декларант' })
  })

  it('отказ сервера показан в карточке', async () => {
    asDeclarant()
    api.declUpdate.mockRejectedValueOnce({ response: { data: { error: 'ИИН должен содержать 12 цифр' } } })
    await open()
    await input('[data-declarant="idDocNumber"]').setValue('1')
    await card('declarant').trigger('submit')
    await flushPromises()
    expect(card('declarant').get('[data-declarant-save-error]').text()).toBe('ИИН должен содержать 12 цифр')
  })
})

describe('ProfilePage: язык', () => {
  it('сегмент переключает язык интерфейса', async () => {
    await open()
    const kk = card('language').findAll('button').find((b) => b.text() === 'Қазақша')!
    await kk.trigger('click')
    await flushPromises()
    expect(api.setLocale).toHaveBeenCalledWith('kk')
  })

  it('подпись слева и сегмент справа на экране от 640px (не на всю ширину карточки)', async () => {
    await open()
    const field = card('language').get('[data-language-field]')
    expect(field.classes()).toContain('sm:flex-row')
    expect(field.classes()).toContain('items-start')
    expect(card('language').get('[data-language]').classes()).not.toContain('w-full')
  })
})

describe('ProfilePage: пароль', () => {
  const fill = async (cur: string, next: string, rep: string) => {
    await input('[data-password="current"]').setValue(cur)
    await input('[data-password="next"]').setValue(next)
    await input('[data-password="repeat"]').setValue(rep)
  }

  it('смена: запрос silent, новый токен принят, поля очищены', async () => {
    await open()
    await fill('old-pass', 'new-pass-1', 'new-pass-1')
    await card('password').trigger('submit')
    await flushPromises()
    expect(api.changePassword).toHaveBeenCalledWith('old-pass', 'new-pass-1', { silent: true })
    expect(localStorage.getItem('authToken')).toBe('h.e30.new')
    expect((input('[data-password="current"]').element as HTMLInputElement).value).toBe('')
    expect(api.toast.success).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/profile')
  })

  it('короткий новый и несовпадение: ошибки на месте, запроса нет', async () => {
    await open()
    await fill('old-pass', '1234567', '')
    await card('password').trigger('submit')
    await flushPromises()
    expect(card('password').text()).toContain('не короче 8 знаков')
    await fill('old-pass', '12345678', '1234567')
    await card('password').trigger('submit')
    await flushPromises()
    expect(card('password').text()).toContain('Пароли не совпадают')
    expect(api.changePassword).not.toHaveBeenCalled()
  })

  it('отказ сервера — под полем текущего пароля, токен не тронут', async () => {
    api.changePassword.mockRejectedValueOnce({ response: { data: { error: 'Текущий пароль неверный' } } })
    localStorage.setItem('authToken', 'h.e30.old')
    await open()
    await fill('wrong', 'new-pass-1', 'new-pass-1')
    await card('password').trigger('submit')
    await flushPromises()
    expect(card('password').text()).toContain('Текущий пароль неверный')
    expect(localStorage.getItem('authToken')).toBe('h.e30.old')
  })
})

describe('ProfilePage: вынужденная смена временного пароля', () => {
  it('плашка, пароль первым, остальные закрыты, профиль декларанта не грузится', async () => {
    as('importer', ['import40.declarant'], { mustChange: true })
    await open('/profile?tab=password')
    expect(w.get('[data-must-change]').text()).toContain('Вам выдан временный пароль')
    expect(cards()).toEqual(['password', 'personal', 'declarant', 'language'])
    expect(card('personal').attributes('data-locked')).toBeDefined()
    expect(card('declarant').attributes('data-locked')).toBeDefined()
    expect(card('personal').find('input').exists()).toBe(false)
    expect(api.declGet).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(w.get('[data-password="current"]').element)
  })

  it('после смены: новый токен, флаг снят, переход на Главную', async () => {
    as('importer', [], { mustChange: true })
    await open('/profile?tab=password')
    await input('[data-password="current"]').setValue('temp')
    await input('[data-password="next"]').setValue('new-pass-1')
    await input('[data-password="repeat"]').setValue('new-pass-1')
    await card('password').trigger('submit')
    await flushPromises()
    const auth = useAuthStore()
    expect(auth.mustChangePassword).toBe(false)
    expect(localStorage.getItem('mustChangePassword')).toBeNull()
    expect(localStorage.getItem('authToken')).toBe('h.e30.new')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('профиль не загрузился — пароль всё равно можно сменить', async () => {
    as('importer', [], { mustChange: true })
    api.profileGet.mockRejectedValue(new Error('boom'))
    await open('/profile?tab=password')
    expect(w.find('[data-profile-error]').exists()).toBe(true)
    expect(cards()).toEqual(['password'])
    expect(useProfileStore().profile).toBeNull()
  })

  it('?tab=password без временного пароля: пароль первым, ничего не закрыто, плашки нет', async () => {
    await open('/profile?tab=password')
    expect(cards()).toEqual(['password', 'personal', 'language'])
    expect(w.find('[data-must-change]').exists()).toBe(false)
    expect(card('personal').attributes('data-locked')).toBeUndefined()
  })
})
