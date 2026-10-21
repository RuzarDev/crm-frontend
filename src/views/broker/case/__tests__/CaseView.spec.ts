import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { Import40CaseDto, Import40FileDto } from '@/api/import40'
import { useAuthStore } from '@/stores/auth'
import { GUID_EMPTY, type CaseAuth } from '../casePermissions'
import { USERS, caseDto, fileDto } from './caseFixture'

const api = vi.hoisted(() => ({
  get: vi.fn(), listFiles: vi.fn(), listBrokerInvoices: vi.fn(), kedenReadinessSummary: vi.fn(), action: vi.fn(), update: vi.fn(), downloadFile: vi.fn(),
}))
const manage = vi.hoisted(() => ({ staff: vi.fn() }))
const refs = vi.hoisted(() => ({ listCountries: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/import40', () => ({ import40Api: api }))
vi.mock('@/api/manage', () => ({ manageApi: manage }))
const stagesMock = vi.hoisted(() => ({ caseStages: vi.fn() }))
vi.mock('@/api/stages', () => ({ stagesApi: stagesMock }))
vi.mock('@/api/references', () => ({ referencesApi: refs }))
vi.mock('@/api/carriers', () => ({
  carriersApi: {
    caseFreight: vi.fn().mockResolvedValue([]),
    insurance: vi.fn().mockResolvedValue({ caseId: 'x', insurer: null, policyNumber: null, insuredAmount: null, insuredCurrency: null, premiumAmount: null, premiumCurrency: null, file: null, updatedAtUtc: null, canEdit: false }),
  },
}))
vi.mock('@/ui/message', () => ({ message: msg }))
const reworkApiMock = vi.hoisted(() => ({ list: vi.fn(async () => ({ comment: null, items: [] })), suggestions: vi.fn(async () => ({ codes: [], items: [] })) }))
vi.mock('@/api/import40Rework', async (orig) => ({ ...(await orig<typeof import('@/api/import40Rework')>()), reworkApi: reworkApiMock }))
const customs = vi.hoisted(() => ({ list: vi.fn(async () => [] as unknown[]), create: vi.fn(), answer: vi.fn(), close: vi.fn(), remindClient: vi.fn() }))
vi.mock('@/api/customsRequests', () => ({ customsRequestsApi: customs }))
const preBorder = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/preBorder', async (orig) => ({
  ...(await orig<typeof import('@/api/preBorder')>()),
  preBorderApi: preBorder,
  translationApi: { list: vi.fn(async () => [] as unknown[]), get: vi.fn(), translate: vi.fn() },
}))
vi.mock('@/api/documentChecks', () => ({ documentChecksApi: { list: vi.fn().mockResolvedValue([]), link: vi.fn(), recheck: vi.fn() } }))

import CaseView from '../CaseView.vue'

// Reka-окна и меню — заглушки: проверяются состав карточки и запросы, а не механика всплывающих окон.
const DropdownStub = {
  props: ['items'], emits: ['select'],
  template: '<div data-dropdown><slot /><button v-for="it in items" :key="it.key" type="button" :data-menu-item="it.key" @click="$emit(\'select\', it.key)">{{ it.label }}</button></div>',
}
const PopoverStub = {
  props: ['open', 'title'], emits: ['update:open'],
  template: '<div><span data-popover-trigger @click="$emit(\'update:open\', true)"><slot name="trigger" /></span><div v-if="open" data-popover><slot /></div></div>',
}
const SelectStub = {
  props: ['value', 'options'], emits: ['update:value'],
  template: '<div data-select-stub><button v-for="o in options" :key="o.value" type="button" :data-option="o.value" @click="$emit(\'update:value\', o.value)">{{ o.label }}</button><button type="button" data-option-clear @click="$emit(\'update:value\', null)" /></div>',
}
const ModalStub = {
  props: ['open', 'okButtonProps', 'title'], emits: ['ok', 'update:open'],
  template: '<div v-if="open" data-modal><div data-modal-title>{{ title }}</div><slot /><button data-ok type="button" :disabled="okButtonProps?.disabled" @click="$emit(\'ok\')" /></div>',
}
const DrawerStub = { props: ['open', 'title'], template: '<div v-if="open" data-drawer><slot /></div>' }
const stubs = { ZDropdown: DropdownStub, ZPopover: PopoverStub, ZSelect: SelectStub, ZModal: ModalStub, ZDrawer: DrawerStub }

let w: VueWrapper
let router: Router
let server: { kase: Import40CaseDto; files: Import40FileDto[] }

const as = (u: CaseAuth) => {
  const auth = useAuthStore()
  auth.role = u.role
  auth.businessRole = u.businessRole
  auth.businessRoles = u.businessRoles
  auth.permissions = u.permissions
  auth.userId = u.userId
}
const mountCard = async (user: CaseAuth, kase: Partial<Import40CaseDto> = {}, files: Import40FileDto[] = []) => {
  as(user)
  server = { kase: caseDto(kase), files }
  await router.push('/import-40/c1')
  await router.isReady()
  w = mountWithI18n(CaseView, { attachTo: document.body, global: { plugins: [router], stubs } })
  await flushPromises()
}
const menuKeys = () => w.findAll('[data-menu-item]').map((b) => b.attributes('data-menu-item'))

beforeEach(() => {
  setActivePinia(createPinia())
  const stub = { template: '<div/>' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/import-40', component: stub },
      { path: '/import-40/:id', component: stub },
      { path: '/clients/:id', component: stub },
      { path: '/billing', component: stub },
    ],
  })
  api.get.mockImplementation(async () => server.kase)
  stagesMock.caseStages.mockRejectedValue(new Error('no stages'))
  api.listFiles.mockImplementation(async () => server.files)
  api.listBrokerInvoices.mockResolvedValue([])
  api.kedenReadinessSummary.mockResolvedValue([])
  api.action.mockImplementation(async () => server.kase)
  api.update.mockImplementation(async () => server.kase)
  refs.listCountries.mockResolvedValue([])
  // Поставка до границы: по умолчанию не начата.
  preBorder.get.mockImplementation(async () => ({
    caseId: 'c1', started: false, canEdit: true, status: server.kase.status, transportMode: 1, supplierPaymentDeferred: false, payments: [],
    availablePayments: [], loadingDate: null, loadingCity: null, loadingWarehouse: null, sealNumbers: null, photos: [], serialCount: 0, imeiCount: 0,
    carrierId: null, carrierName: null, carrierArchived: false, vehicleNumber: '', trailerNumber: '', containerNumber: null, wagonNumber: '',
    expectedBorderDate: null, marks: [], borderArrivedAtUtc: null, borderArrivalPost: null, missing: [], updatedAtUtc: null,
  }))
  manage.staff.mockResolvedValue([
    { id: 's1', username: 'aigerim', displayName: 'Айгерим К.', roles: ['declarant'] },
    { id: 's2', username: 'daulet', displayName: 'Даулет С.', roles: ['declarant', 'kpp'] },
    { id: 'k1', username: 'erlan', displayName: 'Ерлан Б.', roles: ['kpp'] },
  ])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('CaseView: загрузка', () => {
  it('404 — «Заявка не найдена» со ссылкой к списку', async () => {
    api.get.mockRejectedValueOnce(Object.assign(new Error('404'), { response: { status: 404 } }))
    await mountCard(USERS.declarant)
    expect(w.find('[data-case-not-found]').text()).toContain('Заявка не найдена')
    expect(w.find('[data-case-not-found] a').attributes('href')).toBe('/import-40')
  })

  it('ошибка — «Не удалось открыть заявку» и «Повторить»', async () => {
    api.get.mockRejectedValueOnce(Object.assign(new Error('500'), { response: { status: 500 } }))
    await mountCard(USERS.declarant)
    expect(w.find('[data-case-error]').text()).toContain('Не удалось открыть заявку')
    await w.get('[data-case-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-case-header]').exists()).toBe(true)
  })
})

describe('CaseView: поставка до границы', () => {
  it('блок под текущим шагом и подшаги под «Границей»; у заявки после границы без данных — нет', async () => {
    preBorder.get.mockImplementation(async () => ({
      caseId: 'c1', started: true, canEdit: true, status: 1, transportMode: 1, supplierPaymentDeferred: true, payments: [], availablePayments: [],
      loadingDate: '2026-10-10', loadingCity: 'Урумчи', loadingWarehouse: null, sealNumbers: null, photos: [], serialCount: 0, imeiCount: 0,
      carrierId: null, carrierName: null, carrierArchived: false, vehicleNumber: '123', trailerNumber: '', containerNumber: null, wagonNumber: '',
      expectedBorderDate: '2026-10-20', marks: [{ id: 'm', atUtc: '2026-10-15T05:00:00Z', place: 'Хоргос', comment: null, byClient: true, canDelete: true }],
      borderArrivedAtUtc: null, borderArrivalPost: null, missing: [], updatedAtUtc: null,
    }))
    await mountCard(USERS.declarant, { status: 1 })
    expect(w.find('[data-case-main] [data-pre-border]').exists()).toBe(true)
    expect(w.get('[data-pb-mark]').text()).toContain('Хоргос')
    const subs = w.get('[data-stage-substeps]')
    expect(subs.attributes('data-substeps-step')).toBe('2')
    expect(subs.get('[data-sub="transit"]').text()).toContain('Хоргос')
    expect(w.get('[data-step="2"] [data-step-note]').text()).toContain('20.10')
    w.unmount()

    preBorder.get.mockImplementation(async () => ({
      caseId: 'c1', started: false, canEdit: true, status: 3, transportMode: 1, supplierPaymentDeferred: false, payments: [], availablePayments: [],
      loadingDate: null, loadingCity: null, loadingWarehouse: null, sealNumbers: null, photos: [], serialCount: 0, imeiCount: 0, carrierId: null,
      carrierName: null, carrierArchived: false, vehicleNumber: '', trailerNumber: '', containerNumber: null, wagonNumber: '', expectedBorderDate: null,
      marks: [], borderArrivedAtUtc: null, borderArrivalPost: null, missing: [], updatedAtUtc: null,
    }))
    await mountCard(USERS.declarant, { status: 3 })
    expect(w.find('[data-pre-border]').exists()).toBe(false)
  })
})

describe('CaseView: шапка и шаги', () => {
  it('крошки, груз, номер, клиент (ссылка по clients.read), пост, транспорт с прицепом, «Счета и акты»', async () => {
    await mountCard(USERS.rop)
    expect(w.get('[data-case-title]').text()).toBe('Ноутбуки и комплектующие')
    expect(w.get('[data-case-number]').text()).toBe('ИМ-2026-0182')
    expect(w.get('a[data-case-client]').attributes('href')).toBe('/clients/cl1')
    expect(w.get('[data-case-post]').text()).toContain('Хоргос — ЦТО')
    expect(w.get('[data-case-transport]').text()).toContain('Авто · 777 KTA 02 / прицеп 12 KZ 3456')
    expect(w.get('[data-case-billing]').attributes('href')).toBe('/billing?caseId=c1')
  })

  it('без clients.read клиент — текстом; без finance.read — нет «Счетов и актов»', async () => {
    await mountCard(USERS.declarant)
    expect(w.find('a[data-case-client]').exists()).toBe(false)
    expect(w.get('[data-case-client]').text()).toBe('ТОО «Казахмыс Трейд»')
    expect(w.find('[data-case-billing]').exists()).toBe(false)
  })

  it('статус 3: шаги 1–2 пройдены со сводкой, 3 — текущий, панель шага и «Пройденные шаги» с раскрытием', async () => {
    await mountCard(USERS.declarant, { status: 3 }, [fileDto(), fileDto({ id: 'f2' })])
    const states = w.findAll('[data-case-stepper] li[data-step]').map((li) => li.attributes('data-state'))
    expect(states).toEqual(['done', 'done', 'current', 'future', 'future', 'future'])
    // Итоги по макету 17.10: без хронометража (запрос этапов не удался) — по статусу и файлам.
    expect(w.get('[data-case-stepper] li[data-step="1"] [data-step-sub]').text()).toBe('Документы приняты')
    expect(w.get('[data-case-stepper] li[data-step="1"] [data-step-note]').text()).toBe('2 файла')
    expect(w.get('[data-case-stepper] li[data-step="3"] [data-step-sub]').text()).toBe('ДТ подана')
    expect(w.get('[data-case-stepper] li[data-step="4"] [data-step-sub]').text()).toBe('Ждёт выпуска')
    expect(w.get('[data-case-stepper] li[data-step="4"] [data-step-who]').text()).toBe('КПП')
    expect(w.get('[data-case-stepper] li[data-step="5"] [data-stage-parallel]').text()).toBe('Параллельно')
    expect(w.get('[data-case-step-panel="3"]').text()).toContain('Декларирование и выпуск')
    expect(w.get('[data-case-stepper] [data-stage-aside]').text()).toBe('Шаг 3 из 6')

    const passed = w.findAll('[data-passed-step]')
    expect(passed.map((p) => p.attributes('data-passed-step'))).toEqual(['1', '2'])
    const toggle = passed[1].get('[data-passed-toggle]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(passed[1].get('[data-passed-body]').text()).toContain('Авто · 777 KTA 02')
  })

  it('хронометраж: «на шаге · норма» с полосой, просрочка, ответственный; нажатие на шаг — история с ФИО', async () => {
    const ev = (kind: string, atUtc: string, step: number, userName: string | null = null, note = '') =>
      ({ id: `${kind}-${atUtc}`, kind, atUtc, step, declarationId: null, userName, note })
    const st = (n: number, o: Record<string, unknown> = {}) => ({
      step: n, state: 'future', responsibleRole: 'kpp', responsibleId: null, responsibleName: null, startedAtUtc: null, endedAtUtc: null,
      elapsedMinutes: null, spentMinutes: null, normMinutes: null, overdue: false, inRework: false, history: [], ...o,
    })
    stagesMock.caseStages.mockResolvedValue({
      status: 2, currentStep: 3, nowUtc: '2026-10-16T12:00:00Z',
      steps: [
        st(1, { state: 'done', history: [ev('submitted', '2026-10-14T06:05:00Z', 1)] }),
        st(2, { state: 'done', responsibleName: 'Ерлан Б.', spentMinutes: 70, history: [ev('taken', '2026-10-14T07:00:00Z', 2, 'Ерлан Б.'), ev('borderPassed', '2026-10-15T09:20:00Z', 2, 'Ерлан Б.')] }),
        st(3, { state: 'current', responsibleName: 'Айгерим К.', elapsedMinutes: 300, normMinutes: 240, overdue: true }),
        st(4, { normMinutes: 1440 }), st(5), st(6),
      ],
    })
    await mountCard(USERS.declarant, { status: 2 })
    expect(stagesMock.caseStages).toHaveBeenCalledWith('c1', { silent: true })
    const s3 = w.get('[data-case-stepper] li[data-step="3"]')
    expect(s3.get('[data-step-timing]').text()).toContain('5 ч · просрочено')
    expect(s3.get('[data-step-timing]').text()).toContain('норма 4 ч')
    expect(s3.get('[data-step-who]').text()).toContain('Айгерим К.')
    expect(w.get('[data-case-stepper] li[data-step="2"] [data-step-who]').text()).toContain('Ерлан Б. · 1 ч 10 мин')
    expect(w.get('[data-case-stepper] li[data-step="4"] [data-step-meta], [data-case-stepper] li[data-step="4"] [data-step-who]').text()).toContain('норма 1 д')
    // По умолчанию открыта история текущего шага; нажатие на шаг 2 — его события с ФИО.
    expect(w.get('[data-stage-detail]').attributes('data-detail-step')).toBe('3')
    await w.get('[data-case-stepper] li[data-step="2"] button[data-stage-card]').trigger('click')
    const detail = w.get('[data-stage-detail]')
    expect(detail.attributes('data-detail-step')).toBe('2')
    const rows = detail.findAll('[data-history-event]')
    expect(rows.map((r) => r.attributes('data-kind'))).toEqual(['borderPassed', 'taken'])
    expect(rows[0]!.text()).toContain('Граница пройдена')
    expect(rows[0]!.text()).toContain('Ерлан Б.')
  })

  it('отменённая: все шаги будущие, тег «Отменена», причина, без панели шага', async () => {
    await mountCard(USERS.admin, { status: 9, cancelReason: 'Клиент передумал' })
    expect(w.findAll('[data-case-stepper] li[data-step]').every((li) => li.attributes('data-state') === 'future')).toBe(true)
    expect(w.get('[data-case-stepper-tag]').text()).toBe('Отменена')
    expect(w.get('[data-case-banner="cancelled"]').text()).toContain('Клиент передумал')
    expect(w.find('[data-case-step-panel]').exists()).toBe(false)
    expect(w.find('[data-case-passed]').exists()).toBe(false)
  })

  it('выполненная: все шесть пройдены, тег «Выполнено»', async () => {
    await mountCard(USERS.admin, { status: 8 })
    expect(w.findAll('[data-case-stepper] li[data-step]').every((li) => li.attributes('data-state') === 'done')).toBe(true)
    expect(w.get('[data-case-stepper-tag]').text()).toBe('Выполнено')
    expect(w.findAll('[data-passed-step]')).toHaveLength(6)
  })

  it('возвращена клиенту — причина в статусе 0', async () => {
    await mountCard(USERS.declarant, { status: 0, returnReason: 'Нет инвойса' })
    expect(w.get('[data-case-banner="returned"]').text()).toContain('Нет инвойса')
  })
})

describe('CaseView: меню «⋯» по правам', () => {
  it('администратор — проблема, шаг назад, отмена', async () => {
    await mountCard(USERS.admin, { status: 2 })
    expect(menuKeys()).toEqual(['problem', 'stepBack', 'cancel'])
  })
  it('декларант — только проблема', async () => {
    await mountCard(USERS.declarant, { status: 2 })
    expect(menuKeys()).toEqual(['problem'])
  })
  it('право import40.problem — проблема', async () => {
    await mountCard(USERS.problemOnly, { status: 2 })
    expect(menuKeys()).toEqual(['problem'])
  })
  it('бухгалтер — меню нет', async () => {
    await mountCard(USERS.accountant, { status: 2 })
    expect(w.find('[data-case-more]').exists()).toBe(false)
  })
  it('в проблеме — без пункта проблемы; черновик — без шага назад', async () => {
    await mountCard(USERS.rop, { status: 0, isProblem: true })
    expect(menuKeys()).toEqual(['cancel'])
  })
})

describe('CaseView: действия', () => {
  it('«Снять проблему» → clear-problem, тост, перечитывание', async () => {
    await mountCard(USERS.kpp, { status: 4, isProblem: true, problemNote: 'Нужен сертификат', problemClientMessage: 'Пришлите сертификат' })
    const banner = w.get('[data-case-banner="problem"]')
    expect(banner.get('[data-problem-note]').text()).toBe('Нужен сертификат')
    expect(banner.get('[data-problem-client]').text()).toBe('Клиенту отправлено: «Пришлите сертификат»')
    await banner.get('[data-clear-problem]').trigger('click')
    await flushPromises()
    expect(api.action).toHaveBeenCalledWith('c1', 'clear-problem', undefined, undefined)
    expect(msg.success).toHaveBeenCalledWith('Проблема снята')
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('без права на проблему кнопки «Снять проблему» нет', async () => {
    await mountCard(USERS.accountant, { status: 4, isProblem: true })
    expect(w.find('[data-clear-problem]').exists()).toBe(false)
  })

  it('«Запрос таможни / проблема»: заметка обязательна, сообщение клиенту — без пробелов или null', async () => {
    await mountCard(USERS.declarant, { status: 2 })
    await w.get('[data-menu-item="problem"]').trigger('click')
    const modal = w.get('[data-modal]')
    expect(modal.get('[data-modal-title]').text()).toBe('Запрос таможни / проблема')
    expect(modal.get('[data-ok]').attributes('disabled')).toBeDefined()
    await modal.get('[data-reason-input]').setValue('Пост запросил сертификат')
    await modal.get('[data-reason-client]').setValue('  Нужен сертификат  ')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.action).toHaveBeenCalledWith('c1', 'set-problem', 'Пост запросил сертификат', { clientMessage: 'Нужен сертификат' })
    expect(w.find('[data-modal]').exists()).toBe(false)

    await w.get('[data-menu-item="problem"]').trigger('click')
    await w.get('[data-reason-input]').setValue('Ещё')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.action).toHaveBeenLastCalledWith('c1', 'set-problem', 'Ещё', { clientMessage: null })
  })

  it('отмена и шаг назад — причина без пробелов по краям', async () => {
    await mountCard(USERS.admin, { status: 3 })
    await w.get('[data-menu-item="cancel"]').trigger('click')
    expect(w.get('[data-modal-title]').text()).toBe('Отменить заявку')
    await w.get('[data-reason-input]').setValue('  дубль  ')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.action).toHaveBeenCalledWith('c1', 'cancel', 'дубль', undefined)

    await w.get('[data-menu-item="stepBack"]').trigger('click')
    await w.get('[data-reason-input]').setValue(' ошибка ')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.action).toHaveBeenLastCalledWith('c1', 'step-back', 'ошибка', undefined)
  })

  it('смена заявки (назад/вперёд) закрывает окно причины — отмена не уйдёт на другую заявку', async () => {
    await mountCard(USERS.admin, { status: 3 })
    await w.get('[data-menu-item="cancel"]').trigger('click')
    expect(w.find('[data-modal]').exists()).toBe(true)
    server.kase = caseDto({ id: 'c2', status: 3 })
    await router.push('/import-40/c2')
    await flushPromises()
    expect(w.find('[data-case-header]').exists()).toBe(true)
    expect(w.find('[data-modal]').exists()).toBe(false)
    expect(api.action).not.toHaveBeenCalled()
  })

  it('ошибка действия — окно остаётся, тоста успеха нет', async () => {
    await mountCard(USERS.admin, { status: 3 })
    api.action.mockRejectedValueOnce(Object.assign(new Error('409'), { response: { status: 409 } }))
    await w.get('[data-menu-item="cancel"]').trigger('click')
    await w.get('[data-reason-input]').setValue('дубль')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(w.find('[data-modal]').exists()).toBe(true)
    expect(msg.success).not.toHaveBeenCalled()
  })

  it('назначение: оба поля, как раньше (второе — текущее или Guid.Empty)', async () => {
    await mountCard(USERS.admin, { status: 2, assignedKppId: 'k1', assignedKppName: 'Ерлан Б.' })
    const decl = w.get('[data-team-row="declarant"]')
    expect(decl.get('[data-team-name]').text()).toBe('не назначен')
    expect(decl.get('[data-team-assign]').text()).toBe('Назначить')
    expect(w.get('[data-team-row="kpp"] [data-team-assign]').text()).toBe('Сменить')

    await decl.get('[data-popover-trigger]').trigger('click')
    await flushPromises()
    expect(manage.staff).toHaveBeenCalledTimes(1)
    const pop = w.get('[data-team-popover="declarant"]')
    expect(pop.findAll('[data-option]').map((b) => b.attributes('data-option'))).toEqual(['s1', 's2'])
    await pop.get('[data-option="s2"]').trigger('click')
    await pop.get('[data-team-save]').trigger('click')
    await flushPromises()
    expect(api.update).toHaveBeenCalledWith('c1', { assignedDeclarantId: 's2', assignedKppId: 'k1' })
    expect(msg.success).toHaveBeenCalledWith('Назначения сохранены')

    await w.get('[data-team-row="kpp"] [data-popover-trigger]').trigger('click')
    await flushPromises()
    await w.get('[data-team-popover="kpp"] [data-option-clear]').trigger('click')
    await w.get('[data-team-popover="kpp"] [data-team-save]').trigger('click')
    await flushPromises()
    expect(api.update).toHaveBeenLastCalledWith('c1', { assignedDeclarantId: GUID_EMPTY, assignedKppId: GUID_EMPTY })
  })

  it('РОП видит «Сменить» у декларанта, назначенного другим (баг 14.10); у самого декларанта кнопки нет', async () => {
    await mountCard(USERS.rop, { status: 3, assignedDeclarantId: 'u2', assignedDeclarantName: 'Айгерим К.' })
    expect(w.get('[data-team-row="declarant"] [data-team-assign]').text()).toBe('Сменить')
    w.unmount()
    // РОП без права import40.assign в матрице — кнопка всё равно есть (сервер пускает РОП)
    await mountCard({ ...USERS.rop, permissions: ['import40.read'] }, { status: 3, assignedDeclarantId: 'u2', assignedDeclarantName: 'Айгерим К.' })
    expect(w.get('[data-team-row="declarant"] [data-team-assign]').text()).toBe('Сменить')
    w.unmount()
    await mountCard(USERS.declarant, { status: 3, assignedDeclarantId: 'me', assignedDeclarantName: 'Я' })
    expect(w.find('[data-team-assign]').exists()).toBe(false)
  })

  it.each([8, 9])('статус %i (выполнена/отменена) — «Назначить»/«Сменить» нет', async (status) => {
    await mountCard(USERS.admin, { status, assignedKppId: 'k1', assignedKppName: 'Ерлан Б.' })
    expect(w.find('[data-team-row="declarant"]').exists()).toBe(true)
    expect(w.find('[data-team-assign]').exists()).toBe(false)
  })

  it('«Взять в работу» — claim на строке роли текущего шага; у руководителя — нет', async () => {
    await mountCard(USERS.declarant, { status: 2 })
    expect(w.find('[data-team-row="kpp"] [data-team-claim]').exists()).toBe(false)
    await w.get('[data-team-row="declarant"] [data-team-claim]').trigger('click')
    await flushPromises()
    expect(api.action).toHaveBeenCalledWith('c1', 'claim', undefined, undefined)
    expect(msg.success).toHaveBeenCalledWith('Заявка взята в работу')
    w.unmount()

    await mountCard(USERS.rop, { status: 2 })
    expect(w.find('[data-team-claim]').exists()).toBe(false)
  })

  it('шаг ведёт коллега — «занято коллегой»; себя — «вы»', async () => {
    await mountCard(USERS.declarant, { status: 2, assignedDeclarantId: 'u2', assignedDeclarantName: 'Айгерим К.', assignedKppId: 'me', assignedKppName: 'Ерлан Б.' })
    expect(w.get('[data-team-row="declarant"] [data-team-person] [data-team-busy]').text()).toBe('занято коллегой')
    expect(w.get('[data-team-row="declarant"] [data-team-name]').classes()).toContain('break-words')
    expect(w.get('[data-team-row="kpp"] [data-team-name]').text()).toBe('Ерлан Б. · вы')
    expect(w.find('[data-team-claim]').exists()).toBe(false)
  })
})

describe('CaseView: правая колонка', () => {
  it('данные заявки, файлы по разделам, три записи истории; «Все» открывает панели', async () => {
    const logs = [1, 2, 3, 4].map((i) => ({ id: `l${i}`, createdAtUtc: '2026-10-01T10:00:00Z', text: `Запись ${i}`, changedByBusinessRole: 'declarant', changedByName: 'Айгерим К.' }))
    await mountCard(USERS.declarant, { status: 3, logs, containers: [{ id: 'k', containerNumber: 'MRSU4885849' }] as never }, [
      fileDto(), fileDto({ id: 'e1', section: 'extraction-batch' as never }), fileDto({ id: 'p1', section: 'payment-check' }),
    ])
    expect(w.get('[data-info="containers"]').text()).toContain('MRSU4885849')
    expect(w.get('[data-info="receiver"]').text()).toContain('ТОО «Казахмыс Трейд» · БИН 160440012345')
    expect(w.get('[data-info="value"]').text()).toContain('25')
    expect(w.get('[data-info="created"]').text()).toContain('02.10.2026')
    expect(w.find('[data-case-edit]').exists()).toBe(false)
    expect(w.get('[data-file-count="documents"]').text()).toContain('1')
    expect(w.get('[data-file-count="extraction-batch"]').text()).toContain('1')
    expect(w.get('[data-file-count="svh-invoice"]').text()).toContain('—')
    expect(w.get('[data-case-files-all]').text()).toBe('Все · 3')

    const side = w.get('[data-case-history]')
    expect(side.findAll('[data-history-row]').map((r) => r.text())).toHaveLength(3)
    expect(side.get('[data-history-row]').text()).toContain('Айгерим К. · декларант')

    await w.get('[data-case-files-all]').trigger('click')
    expect(w.findAll('[data-drawer] [data-file-row]')).toHaveLength(3)
    await w.get('[data-case-history-all]').trigger('click')
    expect(w.findAll('[data-drawer] [data-history-row]')).toHaveLength(4)
  })

  it('черновик: «Изменить» для тех, кто ведёт черновик', async () => {
    await mountCard(USERS.declarant, { status: 0 })
    expect(w.find('[data-case-edit]').exists()).toBe(true)
  })

  it('запрос таможни без ответа: красная метка на шаге 3 и плашка с «Ответить таможне» / «Напомнить клиенту»', async () => {
    customs.list.mockResolvedValueOnce([{
      id: 'r1', declarationId: null, declarationNumber: null, corridor: null, text: 'Нужен сертификат', docKinds: [], dueAtUtc: null,
      createdAtUtc: new Date(Date.now() - 3 * 3600_000).toISOString(), createdByName: null, status: 'open', answeredAtUtc: null,
      answerText: '', answerFiles: [], closedAtUtc: null, closedByName: null, closeNote: '', lastReminderAtUtc: null, reminderCount: 0,
    }])
    await mountCard(USERS.declarant, { status: 3 })
    expect(customs.list).toHaveBeenCalledWith('c1', { silent: true })
    expect(w.get('[data-step="3"] [data-step-alert]').text()).toBe('Запрос таможни · 3 ч без ответа')
    const card = w.get('[data-customs-request="open"]')
    expect(card.find('[data-customs-close]').exists()).toBe(true)
    expect(card.find('[data-customs-remind]').exists()).toBe(true)
  })

  it('шаг 3 без запросов: кнопка «Запрос таможни» у декларанта, у КПП — нет', async () => {
    await mountCard(USERS.declarant, { status: 2 })
    expect(w.find('[data-customs-create]').exists()).toBe(true)
    expect(w.find('[data-step-alert]').exists()).toBe(false)
    w.unmount()
    await mountCard(USERS.kpp, { status: 2 })
    expect(w.find('[data-customs-create]').exists()).toBe(false)
  })
})
