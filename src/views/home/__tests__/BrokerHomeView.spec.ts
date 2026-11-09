import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { StaffHomeDto, StaffHomeTask, StaffHomeUrgent } from '@/api/dashboard'
import type { ManageOverview } from '@/api/manage'
import type { BrokerInvoice } from '@/api/billing'
import type { DashboardDto } from '@/types/api'

const api = vi.hoisted(() => ({
  home: vi.fn(),
  transit: vi.fn(),
  overview: vi.fn(),
  invoices: vi.fn(),
  expeditor40: vi.fn(),
  health: vi.fn(),
}))
vi.mock('@/api/system', () => ({ systemApi: { serviceHealth: api.health } }))
vi.mock('@/api/expeditorImport40', () => ({ expeditorImport40Api: { overview: api.expeditor40 } }))
vi.mock('@/api/dashboard', () => ({ dashboardApi: { home: api.home, homeBadge: vi.fn(), get: api.transit, client: vi.fn() } }))
vi.mock('@/api/manage', () => ({ manageApi: { overview: api.overview } }))
vi.mock('@/api/billing', () => ({ billingApi: { list: api.invoices } }))

import BrokerHomeView from '../BrokerHomeView.vue'
import { useAuthStore } from '@/stores/auth'
import { useProfileStore } from '@/stores/profile'
import { homeAttention, homeAttentionTone } from '@/shell/attention'
import { formatMoney } from '@/ui/number'

// ---- Фикстуры: администратор видит всё (пакет G, 02.11.2026) ----
const now = new Date()
const urgentRow = (o: Partial<StaffHomeUrgent>): StaffHomeUrgent => ({
  kind: 'customsRequest', caseId: 'c1', caseNumber: 'ИМ-2026-0001', invoiceId: null, invoiceNumber: null, clientName: 'ТОО ТЕСТ',
  amount: null, dueDate: '2026-11-02', dueTime: null, overdueDays: 0, past: false, ...o,
})
const task = (o: Partial<StaffHomeTask>): StaffHomeTask => ({
  id: 't1', number: 'ИМ-2026-0101', clientName: 'ТОО «Казахмыс Трейд»', cargo: 'Медь', status: 2, step: 3, isProblem: false,
  updatedAtUtc: now.toISOString(), next: 'stage', filled: null, total: null, ...o,
})
const homeDto = (o: Partial<StaffHomeDto> = {}): StaffHomeDto => ({
  activeCases: 7,
  owners: { declarants: 5, kpp: 1, clients: 1 },
  urgent: [
    urgentRow({ caseId: 'u1', caseNumber: 'ИМ-1', overdueDays: 3, past: true }),
    urgentRow({ kind: 'invoice', caseId: null, caseNumber: null, invoiceId: 'inv', invoiceNumber: '14/2026', amount: 120000, overdueDays: 3, past: true }),
    urgentRow({ kind: 'conditionalRelease', caseId: 'u3', caseNumber: 'ИМ-3', overdueDays: 1, past: true }),
    urgentRow({ caseId: 'u4', caseNumber: 'ИМ-4', dueTime: '18:00' }),
    urgentRow({ caseId: 'u5', caseNumber: 'ИМ-5' }),
    urgentRow({ caseId: 'u6', caseNumber: 'ИМ-6' }),
  ],
  urgentTotal: 6,
  attention: { awaitingMe: null, awaitingClient: 2, stuck: 3, stuckMine: false, expiringDocs: 1 },
  tasks: [
    task({ id: 'a', next: 'customsRequest' }),
    task({ id: 'b', next: 'fill', filled: 40, total: 54 }),
    task({ id: 'c', next: 'ready' }),
    task({ id: 'd', next: 'createDt' }),
    task({ id: 'e', status: 1, step: 2 }),
    task({ id: 'f', next: 'customsAnswered' }),
  ],
  tasksTotal: 8,
  bySteps: [{ step: 1, count: 4 }, { step: 2, count: 6 }, { step: 3, count: 0 }],
  ...o,
})
const overview: ManageOverview = { cases: [], staff: [], unassigned: 2, problems: 1, stale: 4, clientDrafts: 5 }
const past = new Date(now.getTime() - 3 * 86400_000).toISOString()
const invoice = (o: Partial<BrokerInvoice>): BrokerInvoice => ({
  id: 'i', clientId: 'c', clientName: 'Клиент', caseId: null, caseNumber: null, kind: 'invoice', status: 1,
  number: '214', year: 2026, issuedAtUtc: now.toISOString(), dueDateUtc: past, paidAtUtc: null, vatRate: 0,
  subtotal: 0, vatAmount: 0, total: 185000, note: '', createdAtUtc: now.toISOString(), lines: [], ...o,
})
const transit: DashboardDto = {
  totalEntries: 120, entriesThisMonth: 14, totalWeightKg: 0, totalGrandTotal: 0, topClients: [], topCodes: [],
  byStatus: [{ status: 'Released', count: 80 }, { status: 'Rejected', count: 0 }],
}

let w: VueWrapper
let pinia: Pinia
let router: Router

const setRole = (role: string, permissions: string[] = []) => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = permissions
}
const mountIt = async () => {
  w = mountWithI18n(BrokerHomeView, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
}
const panel = (title: string) => w.findAll('section').find((s) => s.find('h2').text().startsWith(title))
const button = (text: string) => w.findAll('button').find((b) => b.text().includes(text))
const cardTitles = () => w.findAll('[data-home-attention]').map((c) => c.find('.font-semibold').text())

beforeEach(async () => {
  pinia = createPinia()
  setActivePinia(pinia)
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  await router.push('/home')
  await router.isReady()
  homeAttention.value = null
  homeAttentionTone.value = 'gold'
  api.home.mockResolvedValue(homeDto())
  api.transit.mockResolvedValue({ data: transit })
  api.overview.mockResolvedValue(overview)
  api.invoices.mockResolvedValue([invoice({})])
  api.health.mockResolvedValue({ checks: [], alertEmailsConfigured: true })
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
  localStorage.clear()
})

describe('BrokerHomeView', () => {
  it('администратор: шапка с тем, чей ход, «Срочно», «Требует внимания», задачи и этапы — в этом порядке', async () => {
    setRole('Administrator')
    useProfileStore().profile = { userId: 'u', username: 'a', displayName: 'Айгерим Касымова', phone: null, companyName: null, innBin: null, role: 'Administrator' }
    await mountIt()

    expect(w.get('h1').text()).toMatch(/, Айгерим$/)
    expect(w.get('[data-home-summary]').text()).toBe('В работе заявок: 7 · у декларантов 5 · у КПП 1 · у клиентов 1')

    // Порядок блоков: «Срочно» → «Требует внимания» → «Мои задачи» → «Заявки по этапам».
    const order = ['Срочно', 'Требует внимания', 'Мои задачи', 'Заявки по этапам']
      .map((title) => w.findAll('section').findIndex((s) => s.find('h2').text().startsWith(title)))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((x, y) => x - y)).toEqual(order)

    const urgent = w.get('[data-home-urgent]')
    expect(urgent.get('h2').text()).toBe('Срочно — 6')
    const rows = urgent.findAll('[data-home-urgent-row]')
    expect(rows).toHaveLength(5)
    expect(rows[0].text()).toContain('Запрос таможни · ИМ-1')
    expect(rows[0].get('[data-home-urgent-when]').text()).toBe('просрочено 3 дн.')
    expect(rows[0].attributes('href')).toBe('/import-40/u1')
    expect(rows[1].text()).toContain('Счёт № 14/2026')
    expect(rows[1].text()).toContain(formatMoney(120000))
    expect(rows[1].get('[data-home-urgent-when]').text()).toBe('оплата просрочена 3 дн.')
    expect(rows[1].attributes('href')).toBe('/billing?q=14%2F2026')
    expect(rows[2].text()).toContain('Условный выпуск · ИМ-3')
    expect(rows[3].get('[data-home-urgent-when]').text()).toBe('ответить до 18:00')
    expect(rows[4].get('[data-home-urgent-when]').text()).toBe('срок сегодня')
    await urgent.get('[data-home-urgent-more]').trigger('click')
    expect(w.findAll('[data-home-urgent-row]')).toHaveLength(6)
    expect(w.get('[data-home-urgent-more]').text()).toBe('Свернуть')

    // У админа «Ждут вас» нет (null) — разбивка в шапке.
    expect(cardTitles()).toEqual(['Ждут клиента', 'Застряли', 'Истекают документы'])
    const hrefs = w.findAll('[data-home-attention]').map((c) => c.attributes('href'))
    expect(hrefs).toEqual(['/import-40?tab=waiting', '/import-40?tab=active&stuck=1', '/client-documents?state=expiring&within=14'])

    const tasks = panel('Мои задачи')!
    expect(tasks.get('[data-home-tasks-count]').text()).toContain('8')
    expect(tasks.findAll('[data-home-task]')).toHaveLength(6)
    const next = tasks.findAll('[data-home-task-next]').map((n) => n.text())
    expect(next).toEqual([
      'Открыт запрос таможни — ждём ответа клиента',
      'Заполнено 40 из 54 граф',
      'ДТ готова — можно подавать',
      'Создать ДТ',
      'Размещение в ЗТК',
      'Клиент ответил на запрос таможни — передайте в таможню',
    ])
    // Строк меньше, чем задач, — внизу «все 8 →».
    const all = tasks.get('[data-home-tasks-all]')
    expect(all.text()).toContain('все 8')
    expect(all.attributes('href')).toBe('/import-40?tab=my')

    // Ненулевые строки этапов — ссылки со своим фильтром; нулевые — нет.
    const stages = panel('Заявки по этапам')!
    expect(stages.get('[data-home-stage="1"]').attributes('href')).toBe('/import-40?tab=drafts')
    expect(stages.get('[data-home-stage="2"]').attributes('href')).toBe('/import-40?tab=active&step=2')
    expect(stages.get('[data-home-stage="3"]').element.tagName).toBe('DIV')

    // «Распределение» — без «Без движения» (оно в «Застряли»).
    const manage = panel('Распределение')!
    expect(manage.text()).toContain('Черновики у клиентов')
    expect(manage.text()).not.toContain('Без движения')
    expect(panel('Деньги за месяц')!.text()).toContain(formatMoney(185000))
    const tr = panel('Транзит')!
    expect(tr.text()).toContain('Записей за месяц14')
    expect(tr.text()).toContain('Выпущено80')

    // Значок меню: есть срочное — его число, красным.
    expect(homeAttention.value).toBe(6)
    expect(homeAttentionTone.value).toBe('danger')
  })

  it('пустые блоки скрыты: нет срочного и карточек — ни «Срочно», ни «Требует внимания», значка нет', async () => {
    setRole('Administrator')
    api.home.mockResolvedValue(homeDto({
      urgent: [], urgentTotal: 0, attention: { awaitingMe: null, awaitingClient: 0, stuck: 0, stuckMine: false, expiringDocs: 0 },
    }))
    api.transit.mockResolvedValue({ data: { ...transit, byStatus: [] } })
    await mountIt()
    expect(w.find('[data-home-urgent]').exists()).toBe(false)
    expect(panel('Требует внимания')).toBeUndefined()
    expect(homeAttention.value).toBe(0)
  })

  it('декларант: «Ждут вас» и «Застряли» по своим, значок — жёлтый «Ждут вас»; строк столько же, сколько задач', async () => {
    setRole('User', ['import40.read', 'import40.declarant', 'clients.read'])
    api.home.mockResolvedValue(homeDto({
      owners: null, urgent: [], urgentTotal: 0,
      attention: { awaitingMe: 2, awaitingClient: 0, stuck: 1, stuckMine: true, expiringDocs: 0 },
      tasks: [task({ id: 'a' }), task({ id: 'b' })], tasksTotal: 2,
    }))
    await mountIt()
    expect(w.get('[data-home-summary]').text()).toBe('В работе заявок: 7')
    expect(cardTitles()).toEqual(['Ждут вас', 'Застряли'])
    expect(w.findAll('[data-home-attention]').map((c) => c.attributes('href'))).toEqual(['/import-40?tab=my', '/import-40?tab=my&stuck=1'])
    const tasks = panel('Мои задачи')!
    expect(tasks.findAll('[data-home-task]')).toHaveLength(2)
    expect(tasks.get('[data-home-tasks-count]').text()).toContain('2')
    expect(tasks.find('[data-home-tasks-all]').exists()).toBe(false)
    expect(homeAttention.value).toBe(2)
    expect(homeAttentionTone.value).toBe('gold')
    expect(api.overview).not.toHaveBeenCalled()
    expect(panel('Деньги за месяц')).toBeUndefined()
  })

  it('бухгалтер: «Срочно» со счетами и «Деньги за месяц»; заявочных блоков нет', async () => {
    // Настоящий набор прав бухгалтера: import40.read и reestr.read есть, но isFinanceOnly их гасит.
    setRole('User', ['import40.read', 'reestr.read', 'finance.read', 'finance.write', 'clients.read'])
    expect(useAuthStore().isFinanceOnly).toBe(true)
    api.home.mockResolvedValue({
      activeCases: null, owners: null, tasks: null, tasksTotal: 0, bySteps: null,
      urgent: [urgentRow({ kind: 'invoice', caseId: null, caseNumber: null, invoiceId: 'inv', invoiceNumber: '9/2026', amount: 5000, overdueDays: 0, past: true })],
      urgentTotal: 1,
      attention: { awaitingMe: null, awaitingClient: null, stuck: null, stuckMine: false, expiringDocs: null },
    } satisfies StaffHomeDto)
    await mountIt()

    expect(w.get('[data-home-urgent-row]').text()).toContain('Счёт № 9/2026')
    expect(w.get('[data-home-urgent-when]').text()).toBe('срок оплаты сегодня')
    expect(panel('Деньги за месяц')).toBeTruthy()
    for (const title of ['Мои задачи', 'Заявки по этапам', 'Распределение', 'Транзит', 'Требует внимания']) expect(panel(title)).toBeUndefined()
    expect(api.overview).not.toHaveBeenCalled()
    expect(api.transit).not.toHaveBeenCalled()
    expect(button('Новая заявка')).toBeUndefined()
    expect(homeAttention.value).toBe(1)
    expect(homeAttentionTone.value).toBe('danger')
  })

  it('ошибка распределения: блок показывает ошибку, «Повторить» перезапрашивает только его', async () => {
    setRole('Administrator')
    api.overview.mockRejectedValueOnce(new Error('500'))
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    await mountIt()
    expect(logged).toHaveBeenCalledTimes(1)
    logged.mockRestore()

    const manage = panel('Распределение')!
    expect(manage.text()).toContain('Не удалось загрузить')
    expect(panel('Мои задачи')!.findAll('[data-home-task]')).toHaveLength(6)
    expect(panel('Транзит')!.get('[data-home-transit-status]').attributes('href')).toBe('/reestr?status=2')

    await manage.findAll('button').find((b) => b.text() === 'Повторить')!.trigger('click')
    await flushPromises()
    expect(api.overview).toHaveBeenCalledTimes(2)
    expect(api.home).toHaveBeenCalledTimes(1)
    expect(panel('Распределение')!.text()).not.toContain('Не удалось загрузить')
  })

  it('ошибка Главной: задачи и этапы с «Повторить», остальные блоки на месте', async () => {
    setRole('Administrator')
    api.home.mockRejectedValueOnce(new Error('500'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await mountIt()
    const tasks = panel('Мои задачи')!
    expect(tasks.text()).toContain('Не удалось загрузить')
    expect(panel('Деньги за месяц')!.text()).toContain(formatMoney(185000))
    await tasks.findAll('button').find((b) => b.text() === 'Повторить')!.trigger('click')
    await flushPromises()
    expect(api.home).toHaveBeenCalledTimes(2)
    expect(panel('Мои задачи')!.findAll('[data-home-task]')).toHaveLength(6)
  })

  it('пустые задачи — «Задач на вашем шаге нет» и ссылка на все заявки «В работе» (S-19)', async () => {
    setRole('Administrator')
    api.home.mockResolvedValue(homeDto({ tasks: [], tasksTotal: 0 }))
    await mountIt()
    const tasks = panel('Мои задачи')!
    expect(tasks.text()).toContain('Задач на вашем шаге нет')
    expect(tasks.find('a[href="/import-40?tab=active"]').text()).toBe('Открыть все заявки')
    expect(tasks.find('[data-home-tasks-all]').exists()).toBe(false)
  })

  it('роль без блоков (только продажи) — ссылки на разделы вместо блоков, запросов нет', async () => {
    setRole('User', ['sales.read'])
    await mountIt()
    expect(w.find('[data-home-attention]').exists()).toBe(false)
    expect(panel('Мои задачи')).toBeUndefined()
    const go = panel('Перейти')!
    expect(go.findAll('a').find((a) => a.text() === 'Продажи')!.attributes('href')).toBe('/sales')
    expect(go.findAll('a').some((a) => a.text() === 'Главная')).toBe(false)
    expect(Object.values(api).every((f) => f.mock.calls.length === 0)).toBe(true)
  })

  it('экспедитор (C-35): как раньше — транзит и «Импорт 40 ваших клиентов», без dashboard/home', async () => {
    setRole('Expeditor', ['reestr.read', 'clients.read'])
    const ship = (id: string, status: number, customsRequestOpen = false) => ({
      id, number: id, clientId: 'k', clientName: 'ТОО ТЕСТ', cargo: '', post: '', status, step: 1, declarationNumbers: [],
      releasedAtUtc: null, customsRequestOpen, createdAtUtc: now.toISOString(), updatedAtUtc: now.toISOString(),
    })
    api.expeditor40.mockResolvedValue({
      clients: [{ clientId: 'k', name: 'ТОО ТЕСТ', innBin: '000000000000', contract: null, poa: null }],
      shipments: [ship('a', 1), ship('b', 3, true), ship('c', 8)],
    })
    await mountIt()
    expect(panel('Транзит')).toBeDefined()
    const p = w.get('[data-home-expeditor40]')
    expect(p.get('a').attributes('href')).toBe('/expeditor/import-40')
    expect(p.get('[data-home-expeditor40-active]').text()).toBe('2')
    expect(api.home).not.toHaveBeenCalled()
  })

  it('«Новая заявка» ведёт на /import-40?new=1', async () => {
    setRole('Administrator')
    await mountIt()
    await button('Новая заявка')!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/import-40?new=1')
  })

  it('КПП: «Новой заявки» нет — список заявок не откроет ему создание', async () => {
    setRole('User', ['import40.read', 'import40.kpp'])
    await mountIt()
    expect(panel('Мои задачи')).toBeTruthy()
    expect(button('Новая заявка')).toBeUndefined()
  })

  it('декларант: «Новая заявка» есть', async () => {
    setRole('User', ['import40.read', 'import40.declarant'])
    await mountIt()
    expect(button('Новая заявка')).toBeTruthy()
  })

  it('загрузка: скелетоны в задачах, этапах и «Требует внимания», значок не трогаем', async () => {
    setRole('Administrator')
    api.home.mockReturnValue(new Promise(() => {}))
    api.overview.mockReturnValue(new Promise(() => {}))
    await mountIt()
    expect(panel('Мои задачи')!.find('[data-home-skeleton]').exists()).toBe(true)
    expect(panel('Заявки по этапам')!.find('[data-home-skeleton]').exists()).toBe(true)
    expect(panel('Распределение')!.find('[data-home-skeleton]').exists()).toBe(true)
    const att = panel('Требует внимания')!
    expect(att.find('[data-home-skeleton]').element.children).toHaveLength(2)
    expect(w.find('[data-home-urgent]').exists()).toBe(false)
    expect(homeAttention.value).toBeNull()
  })

  it('счётчик задач озвучивается с контекстом', async () => {
    setRole('Administrator')
    await mountIt()
    expect(panel('Мои задачи')!.get('[data-home-tasks-count] .sr-only').text()).toBe('задач: 8')
  })

  it('без имени в профиле — приветствие без имени', async () => {
    setRole('Administrator')
    await mountIt()
    expect(w.get('h1').text()).toMatch(/^(Доброе утро|Добрый день|Добрый вечер|Доброй ночи)$/)
  })
})
