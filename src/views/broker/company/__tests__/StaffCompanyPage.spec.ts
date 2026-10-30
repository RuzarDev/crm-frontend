import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ClientCompanyProfileDto, Import40DocumentDto } from '@/api/import40Contract'

// «Компания клиента» сотрудника на Z (волна 7). Проверки — те же, что закрепили прежнее поведение
// Import40CompanyView перед переводом: выбор клиента и ?client=, шаги и ?step=, формирование (разовый,
// «действует до»), отзыв — только администратор, подпись AQNIET — администратор или РОП, eGov по стороне,
// тексты отказов сервера.

const api = vi.hoisted(() => ({
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
  listDocuments: vi.fn(),
  generateDocument: vi.fn(),
  revokeDocument: vi.fn(),
  renewDocument: vi.fn(),
  downloadDocument: vi.fn(),
  signDocument: vi.fn(),
  sigexStartSigningDocument: vi.fn(),
  sigexPollDocument: vi.fn(),
  sigexCompleteDocument: vi.fn(),
}))
const imp = vi.hoisted(() => ({ listClients: vi.fn() }))
const refs = vi.hoisted(() => ({ listCountries: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
const confirm = vi.hoisted(() => vi.fn())
const save = vi.hoisted(() => vi.fn())
vi.mock('@/api/import40Contract', async (orig) => ({ ...(await orig<object>()), import40ContractApi: api }))
vi.mock('@/api/import40', async (orig) => ({ ...(await orig<object>()), import40Api: imp }))
vi.mock('@/api/references', () => ({ referencesApi: refs }))
vi.mock('@/ui/message', () => ({ message: msg }))
vi.mock('@/ui/confirm', () => ({ useConfirm: () => ({ confirm }) }))
vi.mock('@/ui/download', () => ({ saveBlob: save }))

import { useAuthStore } from '@/stores/auth'
import ZSelect from '@/components/z/ZSelect.vue'
import StaffCompanyPage from '../StaffCompanyPage.vue'

const PROFILE: ClientCompanyProfileDto = {
  clientId: 'c1', companyName: 'ТОО «Альфа»', bin: '123456789012', directorName: 'Иванов И.И.', directorBasis: 'устава',
  legalAddress: 'г. Алматы', bank: 'Халык', iik: 'KZ1', bik: 'HSBK', phone: '', email: '',
  legalCountryCode: '398', legalRegion: '', legalCity: '', legalStreet: '', kbe: '', okpo: '', ownershipType: '',
  contactPersonName: '', contactPersonPosition: '', contactPhone: '', contactEmail: '', isComplete: true, updatedAtUtc: null,
}
// Момент формирования — местный полдень: дата одна в любом часовом поясе машины.
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString()
const doc = (o: Partial<Import40DocumentDto>): Import40DocumentDto => ({
  id: 'd1', clientId: 'c1', kind: 'contract', number: '12', year: 2026, generatedAtUtc: at(2026, 10, 8),
  status: 1, clientSigned: false, clientSignedAtUtc: null, providerSigned: false, providerSignedAtUtc: null,
  clientSignMethod: null, providerSignMethod: null, isSingleUse: false, validUntilUtc: null, consumedByCaseId: null, files: [],
  ...o,
})
const ACTIVE_CONTRACT = doc({ id: 'c0', status: 2, clientSigned: true, providerSigned: true })
const ACTIVE_POA = doc({ id: 'p0', kind: 'poa', status: 2, clientSigned: true })
const START = { qrCode: 'QQ', eGovMobileLaunchLink: 'egov://m', eGovBusinessLaunchLink: 'egov://b', dataUrl: '', qrId: 'q1', expireAt: 0 }

let w: VueWrapper
let router: Router
const docs: Record<string, { contract: Import40DocumentDto[]; poa: Import40DocumentDto[] }> = {}
const setDocs = (clientId: string, contract: Import40DocumentDto[], poa: Import40DocumentDto[]) => { docs[clientId] = { contract, poa } }

const as = (role: string, businessRoles: string[] = []) => {
  const auth = useAuthStore()
  auth.role = role
  auth.businessRole = businessRoles[0] ?? null
  auth.businessRoles = businessRoles
}
const mountAt = async (path = '/import-40/company') => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(StaffCompanyPage, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
}
const step = () => w.get('[aria-current="step"]').attributes('data-company-step')
const picker = () => w.findComponent(ZSelect)
const q = () => router.currentRoute.value.query
const $ = (sel: string) => document.body.querySelector(sel) as HTMLElement | null

beforeEach(() => {
  setActivePinia(createPinia())
  as('Administrator')
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  imp.listClients.mockResolvedValue([
    { id: 'c1', username: 'alpha', companyName: 'ТОО «Альфа»' },
    { id: 'c2', username: 'beta', companyName: null },
  ])
  refs.listCountries.mockResolvedValue([{ id: 'r1', code: '398', name: 'Казахстан', alpha2: 'KZ', isActive: true }])
  api.getProfile.mockImplementation((id: string) => Promise.resolve({ ...PROFILE, clientId: id }))
  api.listDocuments.mockImplementation((id: string, kind: 'contract' | 'poa') => Promise.resolve(docs[id]?.[kind] ?? []))
  confirm.mockResolvedValue(true)
  setDocs('c1', [], [])
  setDocs('c2', [], [])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('StaffCompanyPage', () => {
  it('выбор клиента: подписи «Компания (логин)» / логин; без ?client= — первый клиент', async () => {
    await mountAt()
    expect((picker().props('options') as { label: string }[]).map((o) => o.label)).toEqual(['ТОО «Альфа» (alpha)', 'beta'])
    expect(picker().props('value')).toBe('c1')
    // Ошибку списка клиентов страница показывает сама — без тоста перехватчика.
    expect(imp.listClients).toHaveBeenCalledWith({ silent: true })
    expect(api.getProfile).toHaveBeenCalledWith('c1', { silent: true })
    expect(api.listDocuments).toHaveBeenCalledWith('c1', 'contract', { silent: true })
    expect(api.listDocuments).toHaveBeenCalledWith('c1', 'poa', { silent: true })
  })

  it('?client= — сразу нужный клиент; неизвестный — первый', async () => {
    await mountAt('/import-40/company?client=c2')
    expect(api.getProfile).toHaveBeenCalledWith('c2', { silent: true })
    expect(api.getProfile).not.toHaveBeenCalledWith('c1', expect.anything())
    w.unmount()
    vi.clearAllMocks()
    await mountAt('/import-40/company?client=zzz')
    expect(api.getProfile).toHaveBeenCalledWith('c1', { silent: true })
  })

  it('без ?step= — первый незавершённый шаг', async () => {
    api.getProfile.mockResolvedValueOnce({ ...PROFILE, isComplete: false })
    await mountAt()
    expect(step()).toBe('requisites')
    w.unmount()
    await mountAt()
    expect(step()).toBe('contract') // реквизиты есть, действующего договора нет
    w.unmount()
    setDocs('c1', [ACTIVE_CONTRACT], [])
    await mountAt()
    expect(step()).toBe('poa')
    w.unmount()
    setDocs('c1', [ACTIVE_CONTRACT], [ACTIVE_POA])
    await mountAt()
    expect(step()).toBe('poa')
  })

  it('?step=contract / poa / requisites (и profile) открывают шаг даже при незаполненных реквизитах', async () => {
    api.getProfile.mockResolvedValue({ ...PROFILE, isComplete: false })
    await mountAt('/import-40/company?client=c1&step=contract')
    expect(step()).toBe('contract')
    w.unmount()
    await mountAt('/import-40/company?client=c1&step=poa')
    expect(step()).toBe('poa')
    w.unmount()
    api.getProfile.mockResolvedValue(PROFILE)
    await mountAt('/import-40/company?client=c1&step=requisites')
    expect(step()).toBe('requisites')
    w.unmount()
    await mountAt('/import-40/company?client=c1&step=profile')
    expect(step()).toBe('requisites')
  })

  it('шаги переключаются карточками и «Назад»/«Далее» — в адресе ?step=', async () => {
    await mountAt('/import-40/company?client=c1')
    await w.get('[data-company-step="requisites"]').trigger('click')
    await flushPromises()
    expect(q()).toEqual({ client: 'c1', step: 'requisites' })
    expect(w.find('[data-requisites-form]').exists()).toBe(true)
    await w.get('[data-step-next]').trigger('click')
    await flushPromises()
    expect(step()).toBe('contract')
    await w.get('[data-step-next]').trigger('click')
    await flushPromises()
    expect(step()).toBe('poa')
    expect(w.find('[data-step-next]').exists()).toBe(false)
    await w.get('[data-step-back]').trigger('click')
    await flushPromises()
    expect(q().step).toBe('contract')
  })

  it('смена клиента — профиль и документы нового клиента, шаг — первый незавершённый', async () => {
    setDocs('c2', [ACTIVE_CONTRACT], [])
    await mountAt('/import-40/company?step=contract')
    expect(step()).toBe('contract')
    picker().vm.$emit('update:value', 'c2')
    await flushPromises()
    expect(q()).toEqual({ client: 'c2' })
    expect(api.getProfile).toHaveBeenLastCalledWith('c2', { silent: true })
    expect(api.listDocuments).toHaveBeenCalledWith('c2', 'contract', { silent: true })
    expect(step()).toBe('poa')
  })

  it('метка регистрации: готово — действующий договор и доверенность; иначе — чего не хватает', async () => {
    await mountAt()
    expect(w.get('[data-onboarding="pending"]').attributes('aria-label')).toBe('Не хватает: действующий договор, действующая доверенность')
    expect(w.text()).toContain('Регистрация не завершена')
    w.unmount()
    setDocs('c1', [ACTIVE_CONTRACT], [ACTIVE_POA])
    await mountAt()
    expect(w.get('[data-onboarding="done"]').text()).toBe('Регистрация завершена')
    expect(w.find('[data-onboarding="pending"]').exists()).toBe(false)
  })

  it('шаги: доверенность израсходована разовой заявкой — «Использована — для новой заявки нужна новая»', async () => {
    setDocs('c1', [ACTIVE_CONTRACT], [doc({ id: 'p1', kind: 'poa', status: 2, clientSigned: true, isSingleUse: true, consumedByCaseId: 'k1' })])
    await mountAt()
    expect(w.get('[data-company-step="requisites"]').attributes('data-step-done')).toBeDefined()
    expect(w.get('[data-company-step="contract"]').attributes('data-step-done')).toBeDefined()
    expect(w.get('[data-company-step="poa"] [data-step-state]').text()).toBe('Использована — для новой заявки нужна новая')
    // Онбординг при этом пройден (расход разовой его не отменяет).
    expect(w.find('[data-onboarding="done"]').exists()).toBe(true)
  })

  it('реквизиты: форма кабинета клиента, сохранение — по выбранному клиенту', async () => {
    api.saveProfile.mockResolvedValue({ ...PROFILE, clientId: 'c2' })
    await mountAt('/import-40/company?client=c2&step=requisites')
    expect((w.get('[data-f="companyName"] input, input[data-f="companyName"]').element as HTMLInputElement).value).toBe('ТОО «Альфа»')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(api.saveProfile).toHaveBeenCalledWith('c2', expect.objectContaining({ companyName: 'ТОО «Альфа»', bin: '123456789012' }), { silent: true })
    expect(msg.success).toHaveBeenCalledWith('Реквизиты сохранены')
  })

  it('сформировать: разовый + «действует до» уходят в generateDocument, затем документы перечитываются', async () => {
    api.generateDocument.mockResolvedValue(doc({}))
    await mountAt('/import-40/company?step=poa')
    await vi.waitFor(() => w.get('[data-opt-until]'))
    await w.get('[data-opt-single]').trigger('click')
    const date = w.get('[data-opt-until]')
    await date.setValue('31.12.2027')
    await date.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(w.get('[data-doc-generate]').text()).toBe('Сформировать разовый')
    api.listDocuments.mockClear()
    await w.get('[data-doc-generate]').trigger('click')
    await flushPromises()
    const [clientId, req, opts] = api.generateDocument.mock.calls[0]
    expect(clientId).toBe('c1')
    expect(req.kind).toBe('poa')
    expect(req.isSingleUse).toBe(true)
    // Конец выбранного дня по UTC — как сервер ставит сроки по умолчанию и как их показывает кабинет клиента.
    expect(req.validUntilUtc).toBe('2027-12-31T23:59:59.000Z')
    expect(opts).toEqual({ silent: true })
    expect(api.listDocuments).toHaveBeenCalledWith('c1', 'poa', { silent: true })
    expect(msg.success).toHaveBeenCalledWith('Доверенность сформирована')
  })

  it('сформировать недоступно без реквизитов — подсказка «Сначала заполните реквизиты»', async () => {
    api.getProfile.mockResolvedValue({ ...PROFILE, isComplete: false })
    await mountAt('/import-40/company?step=contract')
    expect(w.get('[data-doc-generate]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-fill-first]').text()).toContain('Сначала заполните реквизиты компании')
  })

  it('отказ сервера при формировании — его текст на месте; без ответа — общий текст', async () => {
    api.generateDocument.mockRejectedValueOnce({ response: { status: 409, data: { error: 'У клиента уже есть действующий договор' } } })
    await mountAt('/import-40/company?step=contract')
    await w.get('[data-doc-generate]').trigger('click')
    await flushPromises()
    expect(w.get('[data-generate-error]').text()).toContain('У клиента уже есть действующий договор')
    api.generateDocument.mockRejectedValueOnce(new Error('network'))
    await w.get('[data-doc-generate]').trigger('click')
    await flushPromises()
    expect(w.get('[data-generate-error]').text()).toContain('Не удалось сформировать документ')
    expect(msg.error).not.toHaveBeenCalled()
  })

  it('действует многоразовый договор: плашка и «разовый» включён и закреплён', async () => {
    setDocs('c1', [ACTIVE_CONTRACT], [])
    await mountAt('/import-40/company?step=contract')
    expect(w.get('[data-already-active]').text()).toContain('Действует многоразовый договор')
    expect(w.get('[data-already-active]').text()).toContain('отзовите текущий')
    expect(w.get('[data-opt-single]').attributes('aria-checked')).toBe('true')
    expect(w.get('[data-opt-single]').attributes('disabled')).toBeDefined()
    w.unmount()
    as('Declarant', ['rop'])
    await mountAt('/import-40/company?step=contract')
    expect(w.get('[data-already-active]').text()).toContain('Отозвать текущий может администратор')
  })

  it('(баг) многоразовый договор ждёт подписей — сервер второй не выпустит (409): тоже только разовый', async () => {
    setDocs('c1', [doc({ id: 'd1', status: 1, clientSigned: true })], [])
    await mountAt('/import-40/company?step=contract')
    expect(w.get('[data-already-active]').text()).toContain('Многоразовый договор ждёт подписей')
    expect(w.get('[data-opt-single]').attributes('aria-checked')).toBe('true')
    expect(w.get('[data-opt-single]').attributes('disabled')).toBeDefined()
    w.unmount()
    // Ждёт подписей разовый — ограничения нет; у доверенности его нет вовсе.
    setDocs('c1', [doc({ id: 'd1', status: 1, isSingleUse: true })], [doc({ id: 'p1', kind: 'poa', status: 2, clientSigned: true })])
    await mountAt('/import-40/company?step=contract')
    expect(w.find('[data-already-active]').exists()).toBe(false)
    expect(w.get('[data-opt-single]').attributes('aria-checked')).toBe('false')
  })

  it('отозвать — только администратор и не для отозванного; подтверждение → revokeDocument и перечитывание', async () => {
    api.revokeDocument.mockResolvedValue(doc({ status: 4 }))
    setDocs('c1', [doc({ id: 'd1' }), doc({ id: 'd2', number: '13', status: 4 })], [])
    await mountAt('/import-40/company?step=contract')
    expect(w.findAll('[data-doc-revoke]')).toHaveLength(1)
    expect(w.get('[data-doc="d2"]').find('[data-doc-revoke]').exists()).toBe(false)
    api.listDocuments.mockClear()
    await w.get('[data-doc="d1"] [data-doc-revoke]').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Отозвать документ № 12/2026?', danger: true }))
    expect(api.revokeDocument).toHaveBeenCalledWith('c1', 'd1', { silent: true })
    expect(api.listDocuments).toHaveBeenCalledWith('c1', 'contract', { silent: true })
    expect(msg.success).toHaveBeenCalledWith('Документ отозван')
    w.unmount()
    as('Declarant', ['rop'])
    await mountAt('/import-40/company?step=contract')
    expect(w.find('[data-doc-revoke]').exists()).toBe(false)
  })

  it('пока документы перечитываются после действия, «Сформировать» в состоянии загрузки, а не молча игнорирует клик', async () => {
    api.revokeDocument.mockResolvedValue(doc({ status: 4 }))
    setDocs('c1', [doc({ id: 'd1' })], [])
    await mountAt('/import-40/company?step=contract')
    expect(w.get('[data-doc-generate]').attributes('aria-busy')).toBeUndefined()
    let release!: (v: unknown[]) => void
    api.listDocuments.mockReturnValueOnce(new Promise((r) => { release = r }))
    await w.get('[data-doc="d1"] [data-doc-revoke]').trigger('click')
    await flushPromises()
    expect(w.get('[data-doc-generate]').attributes('aria-busy')).toBe('true')
    release([])
    await flushPromises()
    expect(w.get('[data-doc-generate]').attributes('aria-busy')).toBeUndefined()
  })

  it('отзыв: отказ в подтверждении — запроса нет; отказ сервера — его текст у документа', async () => {
    setDocs('c1', [doc({ id: 'd1' })], [])
    await mountAt('/import-40/company?step=contract')
    confirm.mockResolvedValueOnce(false)
    await w.get('[data-doc-revoke]').trigger('click')
    await flushPromises()
    expect(api.revokeDocument).not.toHaveBeenCalled()
    api.revokeDocument.mockRejectedValueOnce({ response: { status: 404, data: { error: 'Документ не найден' } } })
    await w.get('[data-doc-revoke]').trigger('click')
    await flushPromises()
    expect(w.get('[data-doc="d1"] [data-doc-error]').text()).toBe('Документ не найден')
  })

  it('подпись AQNIET (только договор): администратор или РОП; декларанту — нет', async () => {
    setDocs('c1', [doc({ id: 'd1', clientSigned: true })], [doc({ id: 'p1', kind: 'poa' })])
    await mountAt('/import-40/company?step=contract')
    expect(w.get('[data-plate="provider"]').text()).toContain('Подпись AQNIET')
    expect(w.findAll('[data-sign-egov]')).toHaveLength(1) // клиент уже подписал — кнопки только у AQNIET
    expect(w.get('[data-plate="provider"]').find('[data-sign-egov]').exists()).toBe(true)
    w.unmount()
    as('Declarant', ['rop'])
    await mountAt('/import-40/company?step=contract')
    expect(w.get('[data-plate="provider"]').find('[data-sign-egov]').exists()).toBe(true)
    w.unmount()
    as('Declarant', ['declarant'])
    await mountAt('/import-40/company?step=contract')
    expect(w.get('[data-plate="provider"]').text()).toContain('Ожидается')
    expect(w.get('[data-plate="provider"]').find('[data-sign-egov]').exists()).toBe(false)
    w.unmount()
    as('Administrator')
    await mountAt('/import-40/company?step=poa')
    expect(w.find('[data-plate="provider"]').exists()).toBe(false) // доверенность — односторонний документ клиента
  })

  it('(баг) подпись за клиента с экрана сотрудника — только администратор (иначе сервер 403 уже после eGov)', async () => {
    setDocs('c1', [doc({ id: 'd1' })], [doc({ id: 'p1', kind: 'poa' })])
    as('Declarant', ['rop'])
    await mountAt('/import-40/company?step=contract')
    expect(w.get('[data-plate="client"]').text()).toContain('Ожидается')
    expect(w.get('[data-plate="client"]').find('[data-sign-egov]').exists()).toBe(false)
    expect(w.get('[data-plate="client"]').find('[data-sign-upload]').exists()).toBe(false)
    expect(w.get('[data-plate="provider"]').find('[data-sign-egov]').exists()).toBe(true) // РОП подписывает за AQNIET
    w.unmount()
    await mountAt('/import-40/company?step=poa')
    expect(w.find('[data-sign-egov]').exists()).toBe(false)
  })

  // 30.10.2026: «Продлить» многоразовый договор — администратор или РОП, за 60 дней до конца срока и 30 после.
  it('«Продлить»: видна администратору и РОП в окне 60/30 дней; декларанту, разовому, доверенности, вне окна — нет', async () => {
    const DAY = 24 * 60 * 60 * 1000
    const untilIn = (days: number) => new Date(Date.now() + days * DAY).toISOString()
    const active = (o: Partial<Import40DocumentDto>) => doc({ status: 2, clientSigned: true, providerSigned: true, ...o })
    setDocs('c1', [
      active({ id: 'soon', validUntilUtc: untilIn(30) }),
      active({ id: 'late', number: '13', validUntilUtc: untilIn(-29) }),
      active({ id: 'far', number: '14', validUntilUtc: untilIn(61) }),
      active({ id: 'gone', number: '15', validUntilUtc: untilIn(-31) }),
      active({ id: 'single', number: '16', isSingleUse: true, validUntilUtc: untilIn(10) }),
    ], [active({ id: 'p1', kind: 'poa', validUntilUtc: untilIn(10) })])
    await mountAt('/import-40/company?step=contract')
    const renewable = () => w.findAll('[data-doc-renew]').map((b) => b.element.closest('[data-doc]')!.getAttribute('data-doc'))
    expect(renewable()).toEqual(['soon', 'late'])
    expect(w.get('[data-doc="soon"] [data-renew-hint]').text()).toContain('продлите его на следующий год')
    w.unmount()
    as('Declarant', ['rop'])
    await mountAt('/import-40/company?step=contract')
    expect(renewable()).toEqual(['soon', 'late'])
    w.unmount()
    as('Declarant', ['declarant'])
    await mountAt('/import-40/company?step=contract')
    expect(renewable()).toEqual([])
    w.unmount()
    as('Administrator')
    await mountAt('/import-40/company?step=poa')
    expect(renewable()).toEqual([])
  })

  it('«Продлить»: подтверждение со сроком 31.12 следующего года → renewDocument, тост, перечитывание; отказ — текст сервера', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-01T08:00:00Z'))
    try {
      setDocs('c1', [doc({ id: 'd1', status: 2, clientSigned: true, providerSigned: true, validUntilUtc: '2026-12-31T23:59:59Z' })], [])
      api.renewDocument.mockResolvedValue(doc({ id: 'd1', status: 2, validUntilUtc: '2027-12-31T23:59:59Z' }))
      await mountAt('/import-40/company?step=contract')
      api.listDocuments.mockClear()
      await w.get('[data-doc-renew]').trigger('click')
      await flushPromises()
      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Продлить договор № 12/2026?', content: expect.stringContaining('до 31.12.2027'),
      }))
      expect(api.renewDocument).toHaveBeenCalledWith('c1', 'd1', { silent: true })
      expect(msg.success).toHaveBeenCalledWith('Договор продлён до 31.12.2027')
      expect(api.listDocuments).toHaveBeenCalledWith('c1', 'contract', { silent: true })
      api.renewDocument.mockRejectedValueOnce({ response: { status: 409, data: { error: 'Договор изменился' } } })
      await w.get('[data-doc-renew]').trigger('click')
      await flushPromises()
      expect(w.get('[data-doc="d1"] [data-doc-error]').text()).toBe('Договор изменился')
    } finally {
      vi.useRealTimers()
    }
  })

  it('реквизиты неполные — рядом со статусом названо, чего не хватает', async () => {
    api.getProfile.mockImplementation((id: string) => Promise.resolve({ ...PROFILE, clientId: id, kbe: '', isComplete: false, missingFields: ['kbe'] }))
    await mountAt('/import-40/company?step=requisites')
    expect(w.get('[data-req-missing]').text()).toBe('Не хватает: КБе')
  })

  // Раунд 1 ревью (M-7): доверенность на следующий год уже выпущена — вторую многоразовую не сформировать, только разовую.
  it('доверенность на следующий год уже есть: в декабре — плашка и только разовая; в октябре — без ограничений', async () => {
    const auto = doc({ id: 'auto', kind: 'poa', number: '40', status: 1, validUntilUtc: '2027-12-31T23:59:59Z' })
    const current = doc({ id: 'cur', kind: 'poa', number: '7', status: 2, clientSigned: true, validUntilUtc: '2026-12-31T23:59:59Z' })
    setDocs('c1', [], [auto, current])
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-12-02T08:00:00Z'))
      await mountAt('/import-40/company?step=poa')
      expect(w.get('[data-next-year-poa]').text()).toContain('Доверенность на 2027 год уже выпущена — № 40/2026')
      expect(w.get('[data-opt-single]').attributes('aria-checked')).toBe('true')
      expect(w.get('[data-opt-single]').attributes('disabled')).toBeDefined()
      w.unmount()
      vi.setSystemTime(new Date('2026-10-30T08:00:00Z'))
      await mountAt('/import-40/company?step=poa')
      expect(w.find('[data-next-year-poa]').exists()).toBe(false)
      expect(w.get('[data-opt-single]').attributes('aria-checked')).toBe('false')
    } finally {
      vi.useRealTimers()
    }
  })

  it('подписано обеими сторонами — кнопок подписи нет', async () => {
    setDocs('c1', [ACTIVE_CONTRACT], [])
    await mountAt('/import-40/company?step=contract')
    expect(w.find('[data-sign-egov]').exists()).toBe(false)
    expect(w.find('[data-sign-upload]').exists()).toBe(false)
    expect(w.findAll('[data-sign-state]').map((s) => s.text())).toEqual(['Подписано', 'Подписано'])
  })

  it('eGov: окно подписи по стороне — AQNIET завершает со стороной provider, клиент — client', async () => {
    api.sigexStartSigningDocument.mockResolvedValue(START)
    api.sigexPollDocument.mockResolvedValue({ pending: false, sign: 's' })
    api.sigexCompleteDocument.mockResolvedValue({})
    setDocs('c1', [doc({ id: 'd1' })], [])
    await mountAt('/import-40/company?step=contract')
    expect(w.findAll('[data-sign-egov]')).toHaveLength(2) // подпись клиента и подпись AQNIET
    await w.get('[data-plate="provider"] [data-sign-egov]').trigger('click')
    await flushPromises()
    expect(api.sigexStartSigningDocument).toHaveBeenCalledWith('c1', 'd1')
    $('[data-sigex-check]')!.click()
    await flushPromises()
    expect(api.sigexCompleteDocument).toHaveBeenLastCalledWith('c1', 'd1', 'q1', 'provider')
    api.listDocuments.mockClear()
    $('[data-sigex-finish]')!.click()
    await flushPromises()
    expect(msg.success).toHaveBeenCalledWith('Документ подписан через eGov')
    expect(api.listDocuments).toHaveBeenCalledWith('c1', 'contract', { silent: true })

    await w.get('[data-plate="client"] [data-sign-egov]').trigger('click')
    await flushPromises()
    $('[data-sigex-check]')!.click()
    await flushPromises()
    expect(api.sigexCompleteDocument).toHaveBeenLastCalledWith('c1', 'd1', 'q1', 'client')
  })

  it('загрузка подписанного файла: signDocument со стороной, затем перечитывание и тост; отказ — текст сервера', async () => {
    api.signDocument.mockResolvedValueOnce(doc({}))
    setDocs('c1', [doc({ id: 'd1' })], [])
    await mountAt('/import-40/company?step=contract')
    const input = w.get('[data-sign-file]')
    const click = vi.spyOn(input.element as HTMLInputElement, 'click').mockImplementation(() => {})
    const pick = async (side: string, file: File) => {
      await w.get(`[data-plate="${side}"] [data-sign-upload]`).trigger('click')
      Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
      await input.trigger('change')
      await flushPromises()
    }
    const file = new File(['x'], 'sig.cms')
    await pick('provider', file)
    expect(click).toHaveBeenCalled()
    expect(api.signDocument).toHaveBeenCalledWith('c1', 'd1', 'provider', file, { silent: true })
    expect(msg.success).toHaveBeenCalledWith('Подписанный файл загружен')
    api.signDocument.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Подпись не прошла проверку' } } })
    await pick('client', file)
    expect(api.signDocument).toHaveBeenLastCalledWith('c1', 'd1', 'client', file, { silent: true })
    expect(w.get('[data-doc="d1"] [data-doc-error]').text()).toBe('Подпись не прошла проверку')
  })

  it('теги документа: действует + статус, разовый · использован, срок', async () => {
    setDocs('c1', [], [doc({ id: 'p1', kind: 'poa', status: 2, clientSigned: true, isSingleUse: true, consumedByCaseId: 'k1', validUntilUtc: '2099-12-31T12:00:00Z' })])
    await mountAt('/import-40/company?step=poa')
    const tags = w.findAll('[data-doc-tags] [data-tag]').map((t) => t.text())
    expect(tags).toEqual(['Активен', 'разовый · использован', 'до 31.12.2099'])
    expect(tags).not.toContain('Действует') // использованная разовая уже не «действует»
  })

  it('(баг) срок «до» — календарная дата по UTC: конец года сервера не «переезжает» на 01.01', async () => {
    // Часовой пояс восточнее UTC (как у пользователей): на машине с UTC тест иначе прошёл бы и на старом коде.
    const tz = process.env.TZ
    process.env.TZ = 'Asia/Almaty'
    try {
      expect(new Date('2026-12-31T23:59:59Z').getDate()).toBe(1) // пояс действительно применился
      setDocs('c1', [], [doc({ id: 'p1', kind: 'poa', status: 1, validUntilUtc: '2026-12-31T23:59:59Z' })])
      await mountAt('/import-40/company?step=poa')
      expect(w.get('[data-tag="until"]').text()).toBe('до 31.12.2026')
    } finally {
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
  })

  it('(баг) отозванный и истёкший документ подписать нельзя — сервер сделал бы его снова действующим', async () => {
    setDocs('c1', [
      doc({ id: 'd4', status: 4 }),
      doc({ id: 'd3', number: '13', status: 3, clientSigned: true }),
      doc({ id: 'd0', number: '14', status: 0 }),
    ], [doc({ id: 'p4', kind: 'poa', status: 4 })])
    await mountAt('/import-40/company?step=contract')
    for (const id of ['d4', 'd3']) {
      expect(w.get(`[data-doc="${id}"]`).find('[data-sign-egov]').exists()).toBe(false)
      expect(w.get(`[data-doc="${id}"]`).find('[data-sign-upload]').exists()).toBe(false)
    }
    expect(w.get('[data-doc="d4"] [data-plate="provider"]').text()).toContain('Ожидается')
    // Черновик (0) ждёт подписей — подписать можно.
    expect(w.findAll('[data-doc="d0"] [data-sign-egov]')).toHaveLength(2)
    w.unmount()
    await mountAt('/import-40/company?step=poa')
    expect(w.find('[data-sign-egov]').exists()).toBe(false)
  })

  it('скачать .docx — имя файла по виду, номеру и году', async () => {
    api.downloadDocument.mockResolvedValue(new Blob(['x']))
    setDocs('c1', [doc({ id: 'd1' })], [])
    await mountAt('/import-40/company?step=contract')
    await w.get('[data-doc-download]').trigger('click')
    await flushPromises()
    expect(api.downloadDocument).toHaveBeenCalledWith('c1', 'd1')
    expect(save).toHaveBeenCalledWith(expect.any(Blob), 'Договор-12-2026.docx')
  })

  it('клиентов нет — пустое состояние; ошибка загрузки — «Повторить»', async () => {
    imp.listClients.mockResolvedValueOnce([])
    await mountAt()
    expect(w.find('[data-company-empty]').exists()).toBe(true)
    expect(api.getProfile).not.toHaveBeenCalled()
    w.unmount()
    api.getProfile.mockRejectedValueOnce({ response: { status: 500 } })
    await mountAt()
    expect(w.find('[data-company-error]').exists()).toBe(true)
    await w.get('[data-company-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-company-steps]').exists()).toBe(true)
  })
})
