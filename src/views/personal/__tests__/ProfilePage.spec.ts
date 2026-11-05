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
  declGet: vi.fn(), declUpdate: vi.fn(), myList: vi.fn(), myDownload: vi.fn(), saveBlob: vi.fn(),
  changePassword: vi.fn(), listClassifiers: vi.fn(), setLocale: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/profile', () => ({ profileApi: { get: api.profileGet, update: api.profileUpdate } }))
vi.mock('@/api/declarantProfile', () => ({
  declarantProfileApi: { get: api.declGet, update: api.declUpdate },
  myPoasApi: { list: api.myList, download: api.myDownload },
}))
vi.mock('@/ui/download', () => ({ saveBlob: api.saveBlob }))
vi.mock('@/api/auth', () => ({ authApi: { changePassword: api.changePassword } }))
vi.mock('@/api/telegram', () => ({ telegramApi: { status: vi.fn(async () => ({ botConfigured: false, botUsername: null, linked: false, username: null, firstName: null, linkedAtUtc: null, notificationsEnabled: true })), createLink: vi.fn(), unlink: vi.fn(), setNotifications: vi.fn() } }))
vi.mock('@/api/references', () => ({ referencesApi: { listClassifiers: api.listClassifiers, listCountries: vi.fn(async () => [{ alpha2: 'KZ', name: 'Казахстан' }]) } }))
vi.mock('@/ui/message', () => ({ message: api.toast }))
vi.mock('@/i18n', async (orig) => ({ ...(await orig<typeof import('@/i18n')>()), setLocale: api.setLocale }))

import ProfilePage from '../ProfilePage.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import type { MyPoaRow } from '@/api/declarantProfile'
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
const issuerSelect = () => w.findAllComponents(ZSelect).find((c) => c.attributes('data-declarant') === 'idDocIssuer' || c.vm.$attrs['data-declarant'] === 'idDocIssuer')!

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
  api.myList.mockResolvedValue({ iinMissing: false, items: [] })
  api.myDownload.mockResolvedValue({ blob: new Blob(['x']), fileName: 'Доверенность-ЭЦП.cms' })
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
    expect(cards()).toEqual(['declarant', 'mypoas', 'language', 'password'])
    expect(api.declGet).toHaveBeenCalledTimes(1)
  })

  it('КПП без права декларанта: карточка «Данные для доверенности» (30.10.2026)', async () => {
    as('importer', ['import40.kpp'], { businessRoles: ['kpp'] })
    await open()
    expect(cards()).toEqual(['declarant', 'mypoas', 'language', 'password'])
    expect(card('declarant').text()).toContain('Данные для доверенности')
    expect(card('declarant').text()).not.toContain('графа 54')
  })

  it('02.11.2026: ФИО и телефон по одному разу — у декларанта и КПП только в карточке доверенности, у бухгалтера как было', async () => {
    for (const perms of [['import40.declarant'], ['import40.kpp']]) {
      as('importer', perms)
      await open()
      expect(w.findAll('[data-declarant="fullName"]')).toHaveLength(1)
      expect(w.findAll('[data-declarant="phone"]')).toHaveLength(1)
      expect(w.find('[data-profile="displayName"]').exists()).toBe(false)
      expect(w.find('[data-profile="phone"]').exists()).toBe(false)
      w.unmount()
      setActivePinia(createPinia())
    }
    as('importer', ['finance.read', 'finance.write'], { businessRoles: ['accountant'] })
    await open()
    expect(cards()).toEqual(['personal', 'language', 'password'])
    expect(w.find('[data-profile="displayName"]').exists()).toBe(true)
    expect(w.find('[data-profile="phone"]').exists()).toBe(true)
  })

  it('клиент Импорта 40: «Компания» со ссылкой в /import-40/company, формы имени нет', async () => {
    as('client', [], { modules: ['import40'] })
    await open()
    expect(cards()).toEqual(['company', 'telegram', 'language', 'password'])
    await w.get('[data-open-company]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/import-40/company')
  })

  it('ссылка на политику конфиденциальности — клиенту, в новой вкладке', async () => {
    as('client', [], { modules: ['import40'] })
    await open()
    const link = w.get('[data-profile-privacy]')
    expect(link.attributes('href')).toBe('/privacy')
    expect(link.attributes('target')).toBe('_blank')
    w.unmount()
    as('broker')
    await open()
    expect(w.find('[data-profile-privacy]').exists()).toBe(false)
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
    for (const k of ['fullName', 'position', 'iin', 'idDocNumber', 'idDocIssuer', 'phone', 'powerOfAttorneyNumber', 'idDocIssueDate', 'powerOfAttorneyDate', 'powerOfAttorneyValidUntil', 'idDocTypeCode', 'idDocCountryCode']) {
      expect(w.find(`[data-declarant="${k}"]`).exists(), k).toBe(true)
    }
    expect(f('position').value).toBe('Декларант')
    expect(issuerSelect().props('value')).toBe('mvd')
    expect(w.find('[data-declarant="idDocIssuedBy"]').exists()).toBe(false)
    expect(f('phone').value).toBe('+7 701 555 12 40')
    // правим каждое текстовое поле
    await input('[data-declarant="fullName"]').setValue('Иванов Иван')
    await input('[data-declarant="position"]').setValue('Старший декларант')
    await input('[data-declarant="iin"]').setValue('900412450124')
    await input('[data-declarant="idDocNumber"]').setValue('045612999')
    issuerSelect().vm.$emit('update:value', 'other')
    await flushPromises()
    await input('[data-declarant="idDocIssuedBy"]').setValue('ЦОН г. Алматы')
    await input('[data-declarant="phone"]').setValue('+7 700 111 22 33')
    await input('[data-declarant="powerOfAttorneyNumber"]').setValue('15')
    await card('declarant').trigger('submit')
    await flushPromises()
    expect(api.declUpdate).toHaveBeenCalledTimes(1)
    // даты, документ и страна, которых не трогали, уходят как загружены
    expect(api.declUpdate.mock.calls[0][0]).toEqual(decl({
      fullName: 'Иванов Иван', position: 'Старший декларант', iin: '900412450124', idDocNumber: '045612999',
      idDocIssuedBy: 'ЦОН г. Алматы', phone: '+7 700 111 22 33', powerOfAttorneyNumber: '15',
    }))
    expect(api.toast.success).toHaveBeenCalled()
    expect(saveOf('declarant').attributes('disabled')).toBeDefined()
  })

  it('02.11.2026 (F1): после сохранения ФИО и телефон из карточки — имя в шапке профиля', async () => {
    asDeclarant()
    await open()
    await input('[data-declarant="fullName"]').setValue('Тестов Тест Тестович')
    await card('declarant').trigger('submit')
    await flushPromises()
    expect(w.get('[data-profile-name]').text()).toBe('Тестов Тест Тестович')
    expect(useProfileStore().profile?.phone).toBe('+7 701 555 12 40')
  })

  it('02.11.2026 (F4): «Кем выдан» — список МВД РК / МЮ РК / Другой орган; уходит русский текст', async () => {
    asDeclarant()
    await open()
    expect(issuerSelect().props('options')).toEqual([
      { value: 'mvd', label: 'МВД РК' }, { value: 'mj', label: 'МЮ РК' }, { value: 'other', label: 'Другой орган' },
    ])
    issuerSelect().vm.$emit('update:value', 'mj')
    await flushPromises()
    await card('declarant').trigger('submit')
    await flushPromises()
    expect(api.declUpdate.mock.calls[0][0].idDocIssuedBy).toBe('МЮ РК')
  })

  it('02.11.2026 (F4): старая запись не из списка — «Другой орган» с этим текстом; пустой у документа РК — МВД РК', async () => {
    asDeclarant()
    api.declGet.mockResolvedValueOnce(decl({ idDocIssuedBy: 'ЦОН г. Астана' }))
    await open()
    expect(issuerSelect().props('value')).toBe('other')
    expect((input('[data-declarant="idDocIssuedBy"]').element as HTMLInputElement).value).toBe('ЦОН г. Астана')
    w.unmount()
    setActivePinia(createPinia())
    asDeclarant()
    api.declGet.mockResolvedValueOnce(decl({ idDocIssuedBy: null }))
    await open()
    expect(issuerSelect().props('value')).toBe('mvd')
    expect(saveOf('declarant').attributes('disabled')).toBeDefined()
  })

  it('02.11.2026 (F3): у декларанта — «Моя доверенность от {организация} (для графы 54)», у КПП трёх полей нет', async () => {
    asDeclarant()
    api.declGet.mockResolvedValueOnce({ ...decl(), organizationName: 'ТОО ТЕСТ' })
    await open()
    expect(card('declarant').get('[data-declarant-own-poa]').text()).toBe('Моя доверенность от ТОО ТЕСТ (для графы 54)')
    w.unmount()
    setActivePinia(createPinia())
    as('importer', ['import40.kpp'], { businessRoles: ['kpp'] })
    await open()
    expect(card('declarant').find('[data-declarant-own-poa]').exists()).toBe(false)
    for (const k of ['powerOfAttorneyNumber', 'powerOfAttorneyDate', 'powerOfAttorneyValidUntil']) {
      expect(w.find(`[data-declarant="${k}"]`).exists(), k).toBe(false)
    }
    // сохранённые значения своей доверенности уходят как были — не стираются
    await input('[data-declarant="position"]').setValue('Менеджер КПП')
    await card('declarant').trigger('submit')
    await flushPromises()
    expect(api.declUpdate.mock.calls[0][0]).toMatchObject({ powerOfAttorneyNumber: '14', powerOfAttorneyDate: '2026-01-02', powerOfAttorneyValidUntil: '2026-12-31' })
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

describe('ProfilePage: мои доверенности (02.11.2026)', () => {
  const row = (over: Partial<MyPoaRow> = {}): MyPoaRow => ({
    id: 'p1', clientId: 'c1', clientName: 'ТОО ТЕСТ', number: '0007', year: 2026, status: 2, isSingleUse: false,
    generatedAtUtc: '2026-01-05T00:00:00Z', validUntilUtc: '2026-12-31T00:00:00Z', daysLeft: 59, expiringSoon: false,
    revokedAtUtc: null, hasSignedFile: true, ...over,
  })
  const asKpp = () => as('importer', ['import40.kpp'], { businessRoles: ['kpp'] })

  it('список: сначала действующие, истекшие и отозванные свёрнуты; «Скачать» — по id', async () => {
    asKpp()
    api.myList.mockResolvedValue({ iinMissing: false, items: [
      row({ id: 'old', clientName: 'ТОО ТЕСТ СТАРЫЙ', status: 3, daysLeft: -30 }),
      row(),
      row({ id: 'soon', clientName: 'ТОО ТЕСТ ДВА', expiringSoon: true, daysLeft: 10, hasSignedFile: false }),
      row({ id: 'rev', clientName: 'ТОО ТЕСТ ОТОЗВАН', status: 4, daysLeft: null, validUntilUtc: null }),
    ] })
    await open()
    const current = card('mypoas').get('[data-mypoas-current]')
    expect(current.findAll('[data-mypoa]').map((r) => r.attributes('data-mypoa'))).toEqual(['p1', 'soon'])
    expect(current.get('[data-mypoa="p1"]').text()).toContain('ТОО ТЕСТ')
    expect(current.get('[data-mypoa="p1"]').text()).toContain('0007/2026')
    expect(current.get('[data-mypoa="p1"]').text()).toContain('31.12.2026')
    expect(current.get('[data-mypoa="p1"] [data-mypoa-status]').text()).toBe('Действует')
    expect(current.get('[data-mypoa="soon"] [data-mypoa-status]').text()).toBe('Истекает')
    expect(current.find('[data-mypoa="soon"] [data-mypoa-cms]').exists()).toBe(false)
    expect(card('mypoas').find('[data-mypoas-past]').exists()).toBe(false)

    await card('mypoas').get('[data-mypoas-past-toggle]').trigger('click')
    const past = card('mypoas').get('[data-mypoas-past]')
    expect(past.findAll('[data-mypoa]').map((r) => r.attributes('data-mypoa'))).toEqual(['old', 'rev'])
    expect(past.get('[data-mypoa="old"] [data-mypoa-status]').text()).toBe('Истёк')
    expect(past.get('[data-mypoa="rev"] [data-mypoa-status]').text()).toBe('Отозван')

    await current.get('[data-mypoa="p1"] [data-mypoa-download]').trigger('click')
    await flushPromises()
    // «Скачать» — .docx для печати (ревью 02.11.2026), подписанный .cms — отдельной кнопкой.
    expect(api.myDownload).toHaveBeenCalledWith('p1', true)
    await current.get('[data-mypoa="p1"] [data-mypoa-cms]').trigger('click')
    await flushPromises()
    expect(api.myDownload).toHaveBeenLastCalledWith('p1', false)
    expect(api.saveBlob).toHaveBeenLastCalledWith(expect.any(Blob), 'Доверенность-ЭЦП.cms')
  })

  it('пусто и нет ИИН — свои тексты', async () => {
    asKpp()
    await open()
    expect(card('mypoas').get('[data-mypoas-empty]').text()).toContain('пока нет')
    w.unmount()
    setActivePinia(createPinia())
    asKpp()
    api.myList.mockResolvedValue({ iinMissing: true, items: [] })
    await open()
    expect(card('mypoas').get('[data-mypoas-no-iin]').text()).toBe('Укажите ИИН, чтобы увидеть свои доверенности.')
  })

  it('после сохранения профиля (мог появиться ИИН) список перечитывается', async () => {
    asKpp()
    await open()
    expect(api.myList).toHaveBeenCalledTimes(1)
    await input('[data-declarant="iin"]').setValue('000000000000')
    await card('declarant').trigger('submit')
    await flushPromises()
    expect(api.myList).toHaveBeenCalledTimes(2)
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
    expect(cards()).toEqual(['password', 'declarant', 'mypoas', 'language'])
    expect(card('declarant').attributes('data-locked')).toBeDefined()
    expect(card('mypoas').attributes('data-locked')).toBeDefined()
    expect(card('declarant').find('input').exists()).toBe(false)
    expect(api.declGet).not.toHaveBeenCalled()
    expect(api.myList).not.toHaveBeenCalled()
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
