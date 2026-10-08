import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ClientCompanyProfileDto, Import40DocumentDto } from '@/api/import40Contract'

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
const imp = vi.hoisted(() => ({ listClients: vi.fn() }))
const refs = vi.hoisted(() => ({ listCountries: vi.fn() }))
const reg = vi.hoisted(() => ({ refresh: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/import40Contract', async (orig) => ({ ...(await orig<object>()), import40ContractApi: api }))
vi.mock('@/api/import40', () => ({ import40Api: imp }))
vi.mock('@/api/references', () => ({ referencesApi: refs }))
vi.mock('@/composables/useClientRegistration', () => ({ useClientRegistration: () => reg }))
vi.mock('@/ui/message', () => ({ message: msg }))

import ClientCompanyView from '../ClientCompanyView.vue'

const PROFILE: ClientCompanyProfileDto = {
  clientId: 'cl1', companyName: 'ТОО «Казахмыс Трейд»', bin: '123456789012', directorName: 'Иванов И.И.', directorBasis: 'устава',
  legalAddress: 'г. Алматы, ул. Абая, 1', bank: 'Халык', iik: 'KZ123', bik: 'HSBKKZKX', phone: '', email: '',
  legalCountryCode: '398', legalRegion: '', legalCity: 'Алматы', legalStreet: '', kbe: '17', okpo: '', ownershipType: '',
  contactPersonName: '', contactPersonPosition: '', contactPhone: '', contactEmail: '', isComplete: true, updatedAtUtc: null,
}
const doc = (o: Partial<Import40DocumentDto>): Import40DocumentDto => ({
  id: 'd1', clientId: 'cl1', kind: 'contract', number: '12', year: 2026, generatedAtUtc: '2026-10-08T06:00:00Z',
  status: 1, clientSigned: false, clientSignedAtUtc: null, providerSigned: false, providerSignedAtUtc: null,
  clientSignMethod: null, providerSignMethod: null, isSingleUse: false, validUntilUtc: '2027-10-08T06:00:00Z',
  consumedByCaseId: null, files: [],
  ...o,
})
const ACTIVE_CONTRACT = doc({ id: 'c0', status: 2, clientSigned: true, providerSigned: true, clientSignedAtUtc: '2026-10-01T06:00:00Z', providerSignedAtUtc: '2026-10-02T06:00:00Z', clientSignMethod: 'egov' })
const ACTIVE_POA = doc({ id: 'p0', kind: 'poa', status: 2, clientSigned: true, clientSignedAtUtc: '2026-10-03T06:00:00Z', clientSignMethod: 'upload' })

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
const selectedStep = () => w.find('[aria-current="step"]').attributes('data-company-step')
const stepState = (s: string) => w.get(`[data-company-step="${s}"] [data-step-state]`).text()
const body = () => document.body

beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/import-40/company', component: stub }, { path: '/:p(.*)*', component: stub }],
  })
  imp.listClients.mockResolvedValue([{ id: 'cl1', username: 'kt' }])
  api.getProfile.mockResolvedValue(PROFILE)
  refs.listCountries.mockResolvedValue([{ id: 'r1', code: '398', name: 'Казахстан', alpha2: 'KZ', isActive: true }])
  reg.refresh.mockResolvedValue(undefined)
  setDocs([doc({})], [])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('ClientCompanyView', () => {
  it('клиент — первый из listClients; данные запрошены тихо; шаг по умолчанию — первый незавершённый', async () => {
    await mountAt()
    expect(imp.listClients).toHaveBeenCalledWith({ silent: true })
    expect(api.getProfile).toHaveBeenCalledWith('cl1', { silent: true })
    expect(api.listDocuments).toHaveBeenCalledWith('cl1', 'contract', { silent: true })
    expect(api.listDocuments).toHaveBeenCalledWith('cl1', 'poa', { silent: true })
    expect(w.get('h1').text()).toBe('Моя компания')
    // Реквизиты готовы, договор ждёт подписи — открыт договор.
    expect(selectedStep()).toBe('contract')
    expect(stepState('profile')).toBe('Заполнены')
    expect(stepState('contract')).toBe('Ждёт вашей подписи')
    expect(stepState('poa')).toBe('После договора')
    expect(w.get('[data-company-subtitle]').text()).toBe(
      'Три шага, после которых можно оформлять поставки. Осталось подписать договор и сформировать доверенность.',
    )
    expect(w.get('[data-doc-title]').text()).toBe('Договор № 12/2026 на таможенное оформление')
    expect(w.get('[data-doc-meta]').text()).toBe('Многоразовый · действует до 08.10.2027 · сформирован 08.10')
    // Под договором — сводка реквизитов.
    expect(w.get('[data-req-row="bin"]').text()).toContain('123456789012')
  })

  it('незаполненные реквизиты: по умолчанию «Реквизиты», форма открыта сразу, без «Отмены»', async () => {
    api.getProfile.mockResolvedValue({ ...PROFILE, isComplete: false, bin: '' })
    setDocs([], [])
    await mountAt()
    expect(selectedStep()).toBe('profile')
    expect(stepState('contract')).toBe('После реквизитов')
    expect(w.find('[data-requisites-form]').exists()).toBe(true)
    expect(w.find('[data-requisites-cancel]').exists()).toBe(false)
    expect(w.find('[data-company-doc]').exists()).toBe(false)
    expect(refs.listCountries).toHaveBeenCalledWith({ silent: true })
  })

  it('реквизиты сохранены впервые → переход к договору, перечитывание и registration.refresh', async () => {
    api.getProfile.mockResolvedValue({ ...PROFILE, isComplete: false })
    setDocs([], [])
    api.saveProfile.mockResolvedValue(PROFILE)
    await mountAt()
    expect(selectedStep()).toBe('profile')
    api.getProfile.mockResolvedValue(PROFILE)
    await w.get('[data-requisites-form]').trigger('submit')
    await flushPromises()
    expect(api.saveProfile).toHaveBeenCalledWith('cl1', expect.objectContaining({ bin: '123456789012' }), { silent: true })
    expect(router.currentRoute.value.query.step).toBe('contract')
    expect(selectedStep()).toBe('contract')
    expect(reg.refresh).toHaveBeenCalled()
    expect(w.find('[data-requisites-form]').exists()).toBe(false)
    expect(w.get('[data-doc-empty] h2').text()).toBe('Договор ещё не сформирован')
  })

  it('договор подписан AQNIET-ом не до конца — шаг по умолчанию переходит к доверенности', async () => {
    setDocs([doc({ clientSigned: true, clientSignedAtUtc: '2026-10-08T07:00:00Z', clientSignMethod: 'egov' })], [])
    await mountAt()
    expect(stepState('contract')).toBe('Ждёт подписи AQNIET')
    expect(selectedStep()).toBe('poa')
  })

  it('всё готово: «Компания зарегистрирована», галочки; карточка шага меняет ?step= через replace', async () => {
    setDocs([ACTIVE_CONTRACT], [ACTIVE_POA])
    await mountAt()
    expect(w.get('[data-company-subtitle]').text()).toBe('Компания зарегистрирована — можно оформлять поставки')
    expect(stepState('contract')).toBe('Действует до 08.10.2027')
    expect(w.findAll('[data-step-tone="done"]')).toHaveLength(3)
    const replace = vi.spyOn(router, 'replace')
    await w.get('[data-company-step="poa"]').trigger('click')
    await flushPromises()
    expect(replace).toHaveBeenCalledWith({ query: { step: 'poa' } })
    expect(router.currentRoute.value.query.step).toBe('poa')
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

  it('нет договора → «Сформировать» = generateDocument многоразового; затем перечитывание и registration.refresh', async () => {
    setDocs([], [])
    await mountAt('/import-40/company?step=contract')
    expect(w.get('[data-doc-empty] h2').text()).toBe('Договор ещё не сформирован')
    api.generateDocument.mockResolvedValue(doc({}))
    setDocs([doc({})], [])
    await w.get('[data-doc-generate]').trigger('click')
    await flushPromises()
    expect(api.generateDocument).toHaveBeenCalledWith('cl1', { kind: 'contract', isSingleUse: false, validUntilUtc: null }, { silent: true })
    expect(reg.refresh).toHaveBeenCalled()
    expect(api.getProfile).toHaveBeenCalledTimes(2)
    expect(w.get('[data-doc-title]').text()).toBe('Договор № 12/2026 на таможенное оформление')
  })

  it('неподписанный договор → «Подписать через eGov» открывает окно; успех → перечитывание и registration.refresh', async () => {
    api.sigexStartSigningDocument.mockResolvedValue({ qrCode: 'QQ', eGovMobileLaunchLink: 'egov://m', eGovBusinessLaunchLink: 'egov://b', dataUrl: '', qrId: 'q1', expireAt: 0 })
    api.sigexPollDocument.mockResolvedValue({ pending: false, sign: 'x' })
    api.sigexCompleteDocument.mockResolvedValue(doc({ clientSigned: true }))
    await mountAt()
    await w.get('[data-sign-egov]').trigger('click')
    await flushPromises()
    expect(api.sigexStartSigningDocument).toHaveBeenCalledWith('cl1', 'd1')
    expect(body().querySelector('[data-sigex-qr]')).not.toBeNull()

    setDocs([doc({ clientSigned: true, clientSignedAtUtc: '2026-10-08T07:00:00Z', clientSignMethod: 'egov' })], [])
    ;(body().querySelector('[data-sigex-check]') as HTMLButtonElement).click()
    await flushPromises()
    expect(api.sigexCompleteDocument).toHaveBeenCalledWith('cl1', 'd1', 'q1', 'client')
    ;(body().querySelector('[data-sigex-finish]') as HTMLButtonElement).click()
    await flushPromises()
    expect(msg.success).toHaveBeenCalledWith('Документ подписан через eGov')
    expect(reg.refresh).toHaveBeenCalled()
    expect(api.getProfile).toHaveBeenCalledTimes(2)
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
    await input.trigger('change')
    await flushPromises()
    expect(api.signDocument).toHaveBeenCalledWith('cl1', 'd1', 'client', file, { silent: true })
    expect(reg.refresh).toHaveBeenCalled()
  })

  it('доверенность — без плашки «Подпись AQNIET»; у договора она есть', async () => {
    setDocs([ACTIVE_CONTRACT], [doc({ id: 'p1', kind: 'poa' })])
    await mountAt('/import-40/company?step=poa')
    expect(w.find('[data-plate="client"]').exists()).toBe(true)
    expect(w.find('[data-plate="provider"]').exists()).toBe(false)
    await w.get('[data-company-step="contract"]').trigger('click')
    await flushPromises()
    expect(w.get('[data-plate="provider"]').text()).toContain('Подписано 02.10')
  })

  it('ошибка загрузки — на месте, «Повторить» перечитывает', async () => {
    api.getProfile.mockRejectedValueOnce(new Error('boom'))
    await mountAt()
    expect(w.find('[data-company-error]').exists()).toBe(true)
    await w.get('[data-company-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-company-error]').exists()).toBe(false)
    expect(selectedStep()).toBe('contract')
  })

  it('пока грузится — скелетон', async () => {
    api.getProfile.mockReturnValue(new Promise(() => {}))
    await mountAt()
    expect(w.find('[data-company-skeleton]').exists()).toBe(true)
    expect(w.find('[data-company-steps]').exists()).toBe(false)
  })
})
