import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { Import40DashboardDto } from '@/api/dashboard'
import type { ManageOverview } from '@/api/manage'
import type { BrokerInvoice } from '@/api/billing'
import type { Import40CaseDto } from '@/api/import40'
import type { DashboardDto } from '@/types/api'

const api = vi.hoisted(() => ({
  import40: vi.fn(),
  transit: vi.fn(),
  overview: vi.fn(),
  invoices: vi.fn(),
  myTasks: vi.fn(),
}))
vi.mock('@/api/dashboard', () => ({ dashboardApi: { import40: api.import40, get: api.transit, client: vi.fn() } }))
vi.mock('@/api/manage', () => ({ manageApi: { overview: api.overview } }))
vi.mock('@/api/billing', () => ({ billingApi: { list: api.invoices } }))
vi.mock('@/api/import40', async (orig) => ({
  ...(await orig<typeof import('@/api/import40')>()),
  import40Api: { myTasks: api.myTasks },
}))

import BrokerHomeView from '../BrokerHomeView.vue'
import { useAuthStore } from '@/stores/auth'
import { useProfileStore } from '@/stores/profile'
import { homeAttention } from '@/shell/attention'
import { formatMoney } from '@/ui/number'

// ---- Фикстуры: администратор видит всё ----
const dash: Import40DashboardDto = {
  totalCases: 30, casesThisMonth: 8, activeCases: 24, doneCases: 6, problemCases: 1, awaitingMe: 3,
  bySteps: [{ step: 1, count: 4 }, { step: 2, count: 6 }, { step: 3, count: 8 }],
  totalDeclarations: 0, declarationsWithNumber: 0, paymentsTotalKzt: 0, avgDaysToDone: null, topClients: [],
  unassignedCases: 2, isManagerView: false,
}
const overview: ManageOverview = { cases: [], staff: [], unassigned: 2, problems: 1, stale: 0, clientDrafts: 5 }
const now = new Date()
const past = new Date(now.getTime() - 3 * 86400_000).toISOString()
const invoice = (o: Partial<BrokerInvoice>): BrokerInvoice => ({
  id: 'i', clientId: 'c', clientName: 'Клиент', caseId: null, caseNumber: null, kind: 'invoice', status: 1,
  number: '214', year: 2026, issuedAtUtc: now.toISOString(), dueDateUtc: past, paidAtUtc: null, vatRate: 0,
  subtotal: 0, vatAmount: 0, total: 185000, note: '', createdAtUtc: now.toISOString(), lines: [], ...o,
})
const kase = (o: Partial<Import40CaseDto>): Import40CaseDto =>
  ({ id: 'c1', number: 'И40-182', clientName: 'ТОО «Казахмыс Трейд»', cargo: 'Медь', status: 2, updatedAtUtc: now.toISOString(), ...o }) as Import40CaseDto
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
const panel = (title: string) => w.findAll('section').find((s) => s.find('h2').text() === title)
const button = (text: string) => w.findAll('button').find((b) => b.text().includes(text))

beforeEach(async () => {
  pinia = createPinia()
  setActivePinia(pinia)
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  await router.push('/home')
  await router.isReady()
  homeAttention.value = null
  api.import40.mockResolvedValue({ data: dash })
  api.transit.mockResolvedValue({ data: transit })
  api.overview.mockResolvedValue(overview)
  api.invoices.mockResolvedValue([invoice({})])
  api.myTasks.mockResolvedValue([kase({}), kase({ id: 'c2', number: 'И40-181', clientName: 'ТОО «Astana Foods»', status: 1 })])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
  localStorage.clear()
})

describe('BrokerHomeView', () => {
  it('администратор: все блоки, карточки внимания и бейдж Главной', async () => {
    setRole('Administrator')
    useProfileStore().profile = { userId: 'u', username: 'a', displayName: 'Айгерим Касымова', phone: null, companyName: null, innBin: null, role: 'Administrator' }
    await mountIt()

    expect(w.get('h1').text()).toMatch(/, Айгерим$/)
    expect(w.text()).toContain('В работе заявок: 24')

    const att = panel('Требует внимания')!
    const cards = att.findAll('[data-home-attention]')
    // awaitingMe, unassigned, problems, overdue (stale = 0)
    expect(cards.map((c) => c.find('.font-semibold').text())).toEqual([
      'Ждут вашего шага', 'Без исполнителя', 'Проблемные заявки', 'Просроченные счета',
    ])
    expect(cards[3].text()).toContain(`1 на ${formatMoney(185000)}`)
    expect(cards[3].attributes('href')).toBe('/billing')
    expect(homeAttention.value).toBe(4)

    const tasks = panel('Мои задачи')!
    expect(tasks.text()).toContain('И40-182')
    expect(tasks.findAll('[data-home-task]')).toHaveLength(2)
    expect(tasks.find('[data-home-task]').attributes('href')).toBe('/import-40/c1')

    expect(panel('Заявки по этапам')!.text()).toContain('Граница')
    const manage = panel('Распределение')!
    expect(manage.text()).toContain('Черновики у клиентов')
    expect(manage.text()).toContain('5')
    const money = panel('Деньги за месяц')!
    expect(money.text()).toContain('Выставлено счетов')
    expect(money.text()).toContain(formatMoney(185000))
    const tr = panel('Транзит')!
    expect(tr.text()).toContain('Записей за месяц14')
    expect(tr.text()).toContain('Выпущено80')
    expect(tr.text()).not.toContain('Отказ')
  })

  it('бухгалтер: только деньги и карточка просроченных; задачи не запрашиваются', async () => {
    setRole('User', ['finance.read'])
    await mountIt()

    expect(panel('Деньги за месяц')).toBeTruthy()
    for (const title of ['Мои задачи', 'Заявки по этапам', 'Распределение', 'Транзит']) expect(panel(title)).toBeUndefined()
    expect(w.findAll('[data-home-attention]').map((c) => c.find('.font-semibold').text())).toEqual(['Просроченные счета'])
    expect(api.myTasks).not.toHaveBeenCalled()
    expect(api.import40).not.toHaveBeenCalled()
    expect(api.overview).not.toHaveBeenCalled()
    expect(api.transit).not.toHaveBeenCalled()
    expect(button('Новая заявка')).toBeUndefined()
    expect(homeAttention.value).toBe(1)
  })

  it('ошибка распределения: блок показывает ошибку, «Повторить» перезапрашивает только его', async () => {
    setRole('Administrator')
    api.overview.mockRejectedValueOnce(new Error('500'))
    await mountIt()

    const manage = panel('Распределение')!
    expect(manage.text()).toContain('Не удалось загрузить')
    expect(panel('Мои задачи')!.text()).toContain('И40-182')
    expect(panel('Деньги за месяц')!.text()).toContain(formatMoney(185000))
    expect(panel('Транзит')!.text()).toContain('Всего записей')
    expect(api.overview).toHaveBeenCalledTimes(1)
    expect(api.import40).toHaveBeenCalledTimes(1)

    await manage.findAll('button').find((b) => b.text() === 'Повторить')!.trigger('click')
    await flushPromises()
    expect(api.overview).toHaveBeenCalledTimes(2)
    expect(api.import40).toHaveBeenCalledTimes(1)
    expect(api.myTasks).toHaveBeenCalledTimes(1)
    expect(panel('Распределение')!.text()).toContain('Без движения 5+ дней')
    expect(panel('Распределение')!.text()).not.toContain('Не удалось загрузить')
  })

  it('пустые задачи — «Задач на вашем шаге нет» и ссылка на все заявки', async () => {
    setRole('Administrator')
    api.myTasks.mockResolvedValue([])
    await mountIt()
    const tasks = panel('Мои задачи')!
    expect(tasks.text()).toContain('Задач на вашем шаге нет')
    expect(tasks.find('a[href="/import-40"]').text()).toBe('Открыть все заявки')
  })

  it('роль без блоков (только продажи) — ссылки на разделы вместо блоков', async () => {
    setRole('User', ['sales.read'])
    await mountIt()
    expect(w.find('[data-home-attention]').exists()).toBe(false)
    expect(panel('Мои задачи')).toBeUndefined()
    expect(panel('Деньги за месяц')).toBeUndefined()
    const go = panel('Перейти')!
    const sales = go.findAll('a').find((a) => a.text() === 'Продажи')!
    expect(sales.attributes('href')).toBe('/sales')
    expect(go.findAll('a').some((a) => a.text() === 'Главная')).toBe(false)
    expect(Object.values(api).every((f) => f.mock.calls.length === 0)).toBe(true)
  })

  it('«Новая заявка» ведёт на /import-40?new=1', async () => {
    setRole('Administrator')
    await mountIt()
    await button('Новая заявка')!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/import-40?new=1')
  })

  it('загрузка: скелетоны в задачах и панелях, пока ответы не пришли', async () => {
    setRole('Administrator')
    api.myTasks.mockReturnValue(new Promise(() => {}))
    api.overview.mockReturnValue(new Promise(() => {}))
    await mountIt()
    expect(panel('Мои задачи')!.find('[data-home-skeleton]').exists()).toBe(true)
    expect(panel('Распределение')!.find('[data-home-skeleton]').exists()).toBe(true)
    expect(panel('Транзит')!.find('[data-home-skeleton]').exists()).toBe(false)
    // Бейдж ждёт распределение: пока оно грузится, число не пишем.
    expect(homeAttention.value).toBeNull()
  })

  it('без имени в профиле — приветствие без имени', async () => {
    setRole('Administrator')
    await mountIt()
    expect(w.get('h1').text()).toMatch(/^(Доброе утро|Добрый день|Добрый вечер|Доброй ночи)$/)
  })
})
