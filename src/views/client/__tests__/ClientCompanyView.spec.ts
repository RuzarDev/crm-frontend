import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ClientCompanyProfileDto, Import40DocumentDto } from '@/api/import40Contract'
import type { Import40CanCreateDto } from '@/api/import40'

const api = vi.hoisted(() => ({
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
  listDocuments: vi.fn(),
  generateDocument: vi.fn(),
  downloadDocument: vi.fn(),
  signDocument: vi.fn(),
  sigexStartSigningDocument: vi.fn(),
  sigexPollDocument: vi.fn(),
  sigexCompleteDocument: vi.fn(),
}))
const imp = vi.hoisted(() => ({ canCreate: vi.fn(), listClients: vi.fn() }))
const refs = vi.hoisted(() => ({ listCountries: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/import40Contract', async (orig) => ({ ...(await orig<object>()), import40ContractApi: api }))
vi.mock('@/api/import40', async (orig) => ({ ...(await orig<object>()), import40Api: imp }))
vi.mock('@/api/references', () => ({ referencesApi: refs }))
vi.mock('@/ui/message', () => ({ message: msg }))

// useClientRegistration — настоящий: «готово» у шагов берётся из GET can-create (как у плашки и мастера).
import { resetClientRegistration } from '@/composables/useClientRegistration'
import { useAuthStore } from '@/stores/auth'
import ClientCompanyView from '../ClientCompanyView.vue'

const PROFILE: ClientCompanyProfileDto = {
  clientId: 'cl1', companyName: 'ТОО «Казахмыс Трейд»', bin: '123456789012', directorName: 'Иванов И.И.', directorBasis: 'устава',
  legalAddress: 'г. Алматы, ул. Абая, 1', bank: 'Халык', iik: 'KZ123', bik: 'HSBKKZKX', phone: '', email: '',
  legalCountryCode: '398', legalRegion: '', legalCity: 'Алматы', legalStreet: '', kbe: '17', okpo: '', ownershipType: '',
  contactPersonName: '', contactPersonPosition: '', contactPhone: '', contactEmail: '', isComplete: true, updatedAtUtc: null,
}
// Сроки действия — конец дня UTC (как ставит сервер) и показываются по UTC.
// Моменты (сформирован, подписан) показываются по местному времени — строим их местным полднем:
// дата одна и та же в любом часовом поясе машины.
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString()
const doc = (o: Partial<Import40DocumentDto>): Import40DocumentDto => ({
  id: 'd1', clientId: 'cl1', kind: 'contract', number: '12', year: 2026, generatedAtUtc: at(2026, 10, 8),
  status: 1, clientSigned: false, clientSignedAtUtc: null, providerSigned: false, providerSignedAtUtc: null,
  clientSignMethod: null, providerSignMethod: null, isSingleUse: false, validUntilUtc: '2027-10-08T23:59:59Z',
  consumedByCaseId: null, files: [],
  ...o,
})
const ACTIVE_CONTRACT = doc({ id: 'c0', status: 2, clientSigned: true, providerSigned: true, clientSignedAtUtc: at(2026, 10, 1), providerSignedAtUtc: at(2026, 10, 2), clientSignMethod: 'egov' })
const ACTIVE_POA = doc({ id: 'p0', kind: 'poa', status: 2, clientSigned: true, clientSignedAtUtc: at(2026, 10, 3), clientSignMethod: 'upload', validUntilUtc: '2026-12-31T23:59:59Z' })

const can = (o: Partial<Import40CanCreateDto>): Import40CanCreateDto => ({
  canCreate: false, reason: 'Нужен действующий договор и доверенность — сформируйте и подпишите их в «Моей компании».',
  needNew: 'contract', profileComplete: true, contractOk: false, poaOk: false, ...o,
})
const DONE = can({ canCreate: true, reason: null, needNew: null, contractOk: true, poaOk: true })

let w: VueWrapper
let router: Router
const stub = { template: '<div/>' }

const setDocs = (contracts: Import40DocumentDto[], poas: Import40DocumentDto[]) => {
  api.listDocuments.mockImplementation((_id: string, kind: string) => Promise.resolve(kind === 'contract' ? contracts : poas))
}
const mountAt = async (path = '/import-40/company') => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(ClientCompanyView, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
}
const selectedStep = () => w.find('[aria-current="true"]').attributes('data-company-step')
const stepState = (s: string) => w.get(`[data-company-step="${s}"] [data-step-state]`).text()
const stepTone = (s: string) => w.get(`[data-company-step="${s}"]`).attributes('data-step-tone')
const subtitle = () => w.get('[data-company-subtitle]').text()
const body = () => document.body

beforeEach(() => {
  setActivePinia(createPinia())
  resetClientRegistration()
  const auth = useAuthStore()
  auth.role = 'Client'
  auth.userId = 'cl1'
  auth.modules = ['import40']
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/import-40/company', component: stub }, { path: '/:p(.*)*', component: stub }],
  })
  api.getProfile.mockResolvedValue(PROFILE)
  refs.listCountries.mockResolvedValue([{ id: 'r1', code: '398', name: 'Казахстан', alpha2: 'KZ', isActive: true }])
  imp.canCreate.mockResolvedValue(can({}))
  setDocs([doc({})], [])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('ClientCompanyView', () => {
  it('регистрация читается тихо (без тоста перехватчика), список договоров — один запрос на загрузку', async () => {
    await mountAt()
    expect(imp.canCreate).toHaveBeenCalledWith({ silent: true })
    expect(imp.canCreate.mock.calls.every(([o]) => o?.silent === true)).toBe(true)
    expect(api.listDocuments.mock.calls.filter(([, kind]) => kind === 'contract')).toEqual([['cl1', 'contract', { silent: true }]])
  })

  it('клиент — userId; данные тихо + can-create; шаг по умолчанию — следующий шаг по серверу', async () => {
    await mountAt()
    expect(imp.listClients).not.toHaveBeenCalled()
    expect(imp.canCreate).toHaveBeenCalled()
    expect(api.getProfile).toHaveBeenCalledWith('cl1', { silent: true })
    expect(api.listDocuments).toHaveBeenCalledWith('cl1', 'contract', { silent: true })
    expect(api.listDocuments).toHaveBeenCalledWith('cl1', 'poa', { silent: true })
    expect(w.get('h1').text()).toBe('Моя компания')
    expect(selectedStep()).toBe('contract')
    expect(stepState('profile')).toBe('Заполнены')
    expect(stepState('contract')).toBe('Ждёт вашей подписи')
    // Доверенность можно оформлять параллельно с договором — шаг активный, не «после договора».
    expect(stepState('poa')).toBe('Нужно сформировать')
    expect(stepTone('poa')).toBe('action')
    expect(subtitle()).toBe('Три шага, после которых можно оформлять поставки. Осталось подписать договор и сформировать доверенность.')
    expect(w.get('[data-doc-title]').text()).toBe('Договор № 12/2026 на таможенное оформление')
    expect(w.get('[data-doc-meta]').text()).toBe('Многоразовый · действует до 08.10.2027 · сформирован 08.10')
    expect(w.get('[data-req-row="bin"]').text()).toContain('123456789012')
  })

  it('шаги — в nav; выбранный aria-current="true", все управляют панелью разделов', async () => {
    await mountAt()
    const nav = w.get('nav')
    expect(nav.attributes('aria-label')).toBe('Шаги регистрации')
    const panelId = w.get('[data-company-panel]').attributes('id')
    expect(w.findAll('[data-company-step]').map((b) => b.attributes('aria-controls'))).toEqual([panelId, panelId, panelId])
    expect(w.findAll('[aria-current]')).toHaveLength(1)
  })

  it('незаполненные реквизиты: по умолчанию «Реквизиты», форма открыта сразу, без «Отмены»', async () => {
    imp.canCreate.mockResolvedValue(can({ profileComplete: false, needNew: null, reason: 'Заполните данные о компании, чтобы продолжить регистрацию.' }))
    api.getProfile.mockResolvedValue({ ...PROFILE, isComplete: false, bin: '' })
    setDocs([], [])
    await mountAt()
    expect(selectedStep()).toBe('profile')
    expect(stepState('contract')).toBe('После реквизитов')
    expect(stepState('poa')).toBe('После реквизитов')
    expect(w.find('[data-requisites-form]').exists()).toBe(true)
    expect(w.find('[data-requisites-cancel]').exists()).toBe(false)
    expect(w.find('[data-company-doc]').exists()).toBe(false)
    expect(refs.listCountries).toHaveBeenCalledWith({ silent: true })
  })

  it('договор ждёт только AQNIET → по умолчанию доверенность, и её карточка предлагает «Сформировать»', async () => {
    setDocs([doc({ clientSigned: true, clientSignedAtUtc: at(2026, 10, 8), clientSignMethod: 'egov' })], [])
    imp.canCreate.mockResolvedValue(can({ needNew: 'contract' }))
    await mountAt()
    expect(stepState('contract')).toBe('Ждёт подписи AQNIET')
    expect(stepTone('contract')).toBe('waiting')
    expect(stepState('poa')).toBe('Нужно сформировать')
    expect(selectedStep()).toBe('poa')
    expect(w.get('[data-doc-empty] h2').text()).toBe('Доверенность ещё не сформирована')
    expect(w.find('[data-doc-generate]').exists()).toBe(true)
    expect(subtitle()).toContain('дождаться подписи AQNIET на договоре')
  })

  it('разовый договор занят открытой поставкой (needNew=contract) — шаг «Нужен новый документ», не «зарегистрирована»', async () => {
    const busy = doc({ id: 'c1', status: 2, isSingleUse: true, validUntilUtc: null, clientSigned: true, providerSigned: true, clientSignedAtUtc: at(2026, 10, 1), providerSignedAtUtc: at(2026, 10, 2) })
    setDocs([busy], [ACTIVE_POA])
    imp.canCreate.mockResolvedValue(can({
      poaOk: true, needNew: 'contract',
      reason: 'Для новой заявки нужен новый документ: разовый договор или доверенность уже используются в открытой заявке.',
    }))
    await mountAt()
    expect(selectedStep()).toBe('contract')
    expect(stepState('contract')).toBe('Нужен новый документ')
    expect(stepTone('contract')).toBe('action')
    expect(stepTone('poa')).toBe('done')
    expect(subtitle()).not.toBe('Компания зарегистрирована — можно оформлять поставки')
    expect(subtitle()).toBe('Три шага, после которых можно оформлять поставки. Осталось сформировать новый договор.')
    // Карточка показывает настоящий статус документа и объяснение от сервера.
    expect(w.get('[data-doc-title]').text()).toBe('Договор № 12/2026 на таможенное оформление')
    expect(w.text()).toContain('Действует')
    expect(w.get('[data-need-new]').text()).toContain('уже используются в открытой заявке')
    expect(w.get('[data-doc-generate-new]').text()).toBe('Сформировать')
  })

  it('всё готово по can-create: «Компания зарегистрирована», галочки; карточка шага меняет ?step= через replace', async () => {
    setDocs([ACTIVE_CONTRACT], [ACTIVE_POA])
    imp.canCreate.mockResolvedValue(DONE)
    await mountAt()
    expect(subtitle()).toBe('Компания зарегистрирована — можно оформлять поставки')
    expect(stepState('contract')).toBe('Действует до 08.10.2027')
    // Срок 31.12 23:59:59Z — 31.12 в любом часовом поясе.
    expect(stepState('poa')).toBe('Действует до 31.12.2026')
    expect(w.findAll('[data-step-tone="done"]')).toHaveLength(3)
    const replace = vi.spyOn(router, 'replace')
    await w.get('[data-company-step="poa"]').trigger('click')
    await flushPromises()
    expect(replace).toHaveBeenCalledWith({ query: { step: 'poa' } })
    expect(selectedStep()).toBe('poa')
    expect(w.get('[data-doc-title]').text()).toBe('Доверенность № 12/2026')
  })

  it('?step=profile из адреса — сводка реквизитов, «Изменить» раскрывает форму, «Отмена» закрывает', async () => {
    await mountAt('/import-40/company?step=profile')
    expect(selectedStep()).toBe('profile')
    expect(w.find('[data-company-doc]').exists()).toBe(false)
    expect(w.find('[data-req-summary]').exists()).toBe(true)
    await w.get('[data-req-edit]').trigger('click')
    expect(w.find('[data-requisites-form]').exists()).toBe(true)
    await w.get('[data-requisites-cancel]').trigger('click')
    expect(w.find('[data-requisites-form]').exists()).toBe(false)
  })

  it('реквизиты сохранены впервые → переход к договору, перечитывание и can-create', async () => {
    imp.canCreate.mockResolvedValue(can({ profileComplete: false, needNew: null }))
    api.getProfile.mockResolvedValue({ ...PROFILE, isComplete: false })
    setDocs([], [])
    api.saveProfile.mockResolvedValue(PROFILE)
    await mountAt()
    expect(selectedStep()).toBe('profile')
    api.getProfile.mockResolvedValue(PROFILE)
    imp.canCreate.mockResolvedValue(can({}))
    imp.canCreate.mockClear()
    await w.get('[data-requisites-form]').trigger('submit')
    await flushPromises()
    expect(api.saveProfile).toHaveBeenCalledWith('cl1', expect.objectContaining({ bin: '123456789012' }), { silent: true })
    expect(router.currentRoute.value.query.step).toBe('contract')
    expect(imp.canCreate).toHaveBeenCalledTimes(1)
    expect(stepState('profile')).toBe('Заполнены')
    expect(w.find('[data-requisites-form]').exists()).toBe(false)
    expect(w.get('[data-doc-empty] h2').text()).toBe('Договор ещё не сформирован')
  })

  it('нет договора → «Сформировать» = generateDocument многоразового; кнопка занята до конца перечитывания', async () => {
    setDocs([], [])
    await mountAt('/import-40/company?step=contract')
    expect(w.get('[data-doc-empty] h2').text()).toBe('Договор ещё не сформирован')
    api.generateDocument.mockResolvedValue(doc({}))
    let release!: (v: unknown) => void
    api.getProfile.mockReturnValueOnce(new Promise((r) => { release = r }))
    setDocs([doc({})], [])
    imp.canCreate.mockClear()
    await w.get('[data-doc-generate]').trigger('click')
    await flushPromises()
    expect(api.generateDocument).toHaveBeenCalledWith('cl1', { kind: 'contract', isSingleUse: false, validUntilUtc: null }, { silent: true })
    // Перечитывание ещё идёт — кнопка занята, повторный клик не формирует второй документ.
    expect(w.get('[data-doc-generate]').attributes('aria-busy')).toBe('true')
    await w.get('[data-doc-generate]').trigger('click')
    expect(api.generateDocument).toHaveBeenCalledTimes(1)
    release(PROFILE)
    await flushPromises()
    expect(imp.canCreate).toHaveBeenCalledTimes(1)
    expect(w.get('[data-doc-title]').text()).toBe('Договор № 12/2026 на таможенное оформление')
  })

  it('неподписанный договор → «Подписать через eGov» открывает окно; успех → перечитывание и can-create', async () => {
    api.sigexStartSigningDocument.mockResolvedValue({ qrCode: 'QQ', eGovMobileLaunchLink: 'egov://m', eGovBusinessLaunchLink: 'egov://b', dataUrl: '', qrId: 'q1', expireAt: 0 })
    api.sigexPollDocument.mockResolvedValue({ pending: false, sign: 'x' })
    api.sigexCompleteDocument.mockResolvedValue(doc({ clientSigned: true }))
    await mountAt()
    await w.get('[data-sign-egov]').trigger('click')
    await flushPromises()
    expect(api.sigexStartSigningDocument).toHaveBeenCalledWith('cl1', 'd1')
    expect(body().querySelector('[data-sigex-qr]')).not.toBeNull()

    setDocs([doc({ clientSigned: true, clientSignedAtUtc: at(2026, 10, 8), clientSignMethod: 'egov' })], [])
    imp.canCreate.mockClear()
    ;(body().querySelector('[data-sigex-check]') as HTMLButtonElement).click()
    await flushPromises()
    expect(api.sigexCompleteDocument).toHaveBeenCalledWith('cl1', 'd1', 'q1', 'client')
    ;(body().querySelector('[data-sigex-finish]') as HTMLButtonElement).click()
    await flushPromises()
    expect(msg.success).toHaveBeenCalledWith('Документ подписан через eGov')
    expect(imp.canCreate).toHaveBeenCalledTimes(1)
    expect(api.getProfile).toHaveBeenCalledTimes(2)
    // Шаг не «уезжает»: остаёмся на договоре, плашка — «подписано».
    expect(selectedStep()).toBe('contract')
    expect(stepState('contract')).toBe('Ждёт подписи AQNIET')
    expect(w.get('[data-plate="client"]').attributes('data-plate-state')).toBe('done')
    expect(w.get('[data-plate="client"]').text()).toContain('Подписано 08.10 через eGov')
  })

  it('«Загрузить .cms» → signDocument(..., "client", file)', async () => {
    api.signDocument.mockResolvedValue(doc({ clientSigned: true }))
    await mountAt()
    const input = w.get('[data-sign-file]')
    expect(input.attributes('accept')).toBe('.cms,.p7s,.sig')
    const click = vi.spyOn(input.element as HTMLInputElement, 'click').mockImplementation(() => {})
    await w.get('[data-sign-upload]').trigger('click')
    expect(click).toHaveBeenCalled()
    const file = new File(['x'], 'contract.cms')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    imp.canCreate.mockClear()
    await input.trigger('change')
    await flushPromises()
    expect(api.signDocument).toHaveBeenCalledWith('cl1', 'd1', 'client', file, { silent: true })
    expect(imp.canCreate).toHaveBeenCalledTimes(1)
  })

  it('доверенность — без плашки «Подпись AQNIET»; у договора она есть', async () => {
    setDocs([ACTIVE_CONTRACT], [doc({ id: 'p1', kind: 'poa' })])
    imp.canCreate.mockResolvedValue(can({ contractOk: true, needNew: 'poa' }))
    await mountAt('/import-40/company?step=poa')
    expect(w.find('[data-plate="client"]').exists()).toBe(true)
    expect(w.find('[data-plate="provider"]').exists()).toBe(false)
    await w.get('[data-company-step="contract"]').trigger('click')
    await flushPromises()
    expect(w.get('[data-plate="provider"]').text()).toContain('Подписано 02.10')
  })

  it('перечитывание после действия не удалось — плашка «Не удалось обновить» с «Повторить»', async () => {
    api.signDocument.mockResolvedValue(doc({ clientSigned: true }))
    await mountAt()
    api.getProfile.mockRejectedValueOnce(new Error('offline'))
    const input = w.get('[data-sign-file]')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'a.cms')], configurable: true })
    await input.trigger('change')
    await flushPromises()
    expect(w.get('[data-company-reload-error]').text()).toContain('Не удалось обновить данные')
    // Прежние данные на месте.
    expect(w.find('[data-company-doc="contract"]').exists()).toBe(true)
    setDocs([doc({ clientSigned: true, clientSignedAtUtc: at(2026, 10, 8), clientSignMethod: 'upload' })], [])
    await w.get('[data-company-reload-error] button').trigger('click')
    await flushPromises()
    expect(w.find('[data-company-reload-error]').exists()).toBe(false)
    expect(w.get('[data-plate="client"]').text()).toContain('Подписано 08.10 файлом')
  })

  it('can-create упал при перечитывании — шаги держат прежнее состояние, а не «Нужно заполнить»', async () => {
    api.signDocument.mockResolvedValue(doc({ clientSigned: true }))
    imp.canCreate.mockResolvedValue(can({ poaOk: true, needNew: 'contract' }))
    setDocs([doc({})], [ACTIVE_POA])
    await mountAt()
    expect(stepState('profile')).toBe('Заполнены')
    expect(stepState('contract')).toBe('Ждёт вашей подписи')
    imp.canCreate.mockRejectedValueOnce(new Error('offline'))
    const input = w.get('[data-sign-file]')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'a.cms')], configurable: true })
    await input.trigger('change')
    await flushPromises()
    expect(w.find('[data-company-reload-error]').exists()).toBe(true)
    expect(stepState('profile')).toBe('Заполнены')
    expect(stepTone('profile')).toBe('done')
    expect(stepState('contract')).toBe('Ждёт вашей подписи')
    expect(stepTone('poa')).toBe('done')
    expect(w.find('[data-requisites-form]').exists()).toBe(false)
    expect(subtitle()).toBe('Три шага, после которых можно оформлять поставки. Осталось подписать договор.')
  })

  it('can-create недоступен — ошибка на месте (шаги без источника истины не показываем), «Повторить»', async () => {
    imp.canCreate.mockRejectedValueOnce(new Error('boom'))
    await mountAt()
    expect(w.find('[data-company-error]').exists()).toBe(true)
    expect(w.find('[data-company-steps]').exists()).toBe(false)
    await w.get('[data-company-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-company-error]').exists()).toBe(false)
    expect(selectedStep()).toBe('contract')
  })

  it('ошибка загрузки профиля — на месте, «Повторить» перечитывает', async () => {
    api.getProfile.mockRejectedValueOnce(new Error('boom'))
    await mountAt()
    expect(w.find('[data-company-error]').exists()).toBe(true)
    await w.get('[data-company-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-company-error]').exists()).toBe(false)
  })

  it('пока грузится — скелетон', async () => {
    api.getProfile.mockReturnValue(new Promise(() => {}))
    await mountAt()
    expect(w.find('[data-company-skeleton]').exists()).toBe(true)
    expect(w.find('[data-company-steps]').exists()).toBe(false)
  })
})
