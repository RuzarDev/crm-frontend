import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { AnalyticsDto } from '@/api/analytics'

const api = vi.hoisted(() => ({ get: vi.fn(), overview: vi.fn(), toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/api/analytics', () => ({ analyticsApi: { get: api.get } }))
vi.mock('@/api/manage', () => ({ manageApi: { overview: api.overview } }))
vi.mock('@/ui/message', () => ({ message: api.toast }))

import AnalyticsView from '../AnalyticsView.vue'
import { useAuthStore } from '@/stores/auth'

const ev = (i: number, o: Partial<AnalyticsDto['recentActivity'][number]> = {}) => ({
  caseId: `case-${i}`, cargo: `груз ${i}`, clientName: `ТОО «Клиент ${i}»`, text: `Операция ${i}`, role: 'declarant',
  atUtc: '2026-10-08T05:40:00Z', ...o,
})
const DATA = (): AnalyticsDto => ({
  cases30d: 33, casesPrev30d: 29, declarations30d: 41, declarationsPrev30d: 38, payments30dKzt: 18_240_000, paymentsPrev30dKzt: 20_000_000,
  avgDaysToDone: 4.6, activeCases: 36, problemCases: 2,
  months: [
    { month: '2026-05', cases: 18, declarations: 22, paymentsKzt: 9_800_000, transitEntries: 9 },
    { month: '2026-06', cases: 24, declarations: 29, paymentsKzt: 12_400_000, transitEntries: 11 },
    { month: '2026-07', cases: 21, declarations: 27, paymentsKzt: 11_100_000, transitEntries: 14 },
    { month: '2026-08', cases: 29, declarations: 36, paymentsKzt: 15_900_000, transitEntries: 12 },
    { month: '2026-09', cases: 33, declarations: 41, paymentsKzt: 18_200_000, transitEntries: 16 },
    { month: '2026-10', cases: 9, declarations: 11, paymentsKzt: 0, transitEntries: 4 },
  ],
  stages: [
    { key: 'draft', count: 4 }, { key: 'border', count: 7 }, { key: 'declaring', count: 14 },
    { key: 'svh', count: 6 }, { key: 'payment', count: 5 }, { key: 'done', count: 31 },
  ],
  topClients: [
    { clientId: 'c1', clientName: 'ТОО «Казахмыс Трейд»', cases: 9, paymentsKzt: 6_412_000 },
    { clientId: 'c2', clientName: 'ТОО «Алатау Строй»', cases: 2, paymentsKzt: 3_206_000 },
  ],
  staff: [
    { userId: 'u1', username: 'aigerim', role: 'declarant', activeCases: 8, doneCases: 40 },
    { userId: 'u2', username: 'erlan', role: 'kpp', activeCases: 3, doneCases: 12 },
    { userId: 'u3', username: '—', role: '', activeCases: 1, doneCases: 0 },
  ],
  recentActivity: [ev(1), ev(2, { role: 'rop' }), ev(3, { atUtc: '2026-10-08T05:40:00Z' })],
})

let w: VueWrapper
let router: Router
const as = (role: string, perms: string[]) => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = perms
}
const mountView = async () => {
  w = mountWithI18n(AnalyticsView, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
}
const has = (sel: string) => w.find(sel).exists()
const nb = (x: string) => x.replace(/ /g, ' ')

beforeEach(async () => {
  setActivePinia(createPinia())
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  await router.push('/analytics')
  api.get.mockResolvedValue(DATA())
  api.overview.mockResolvedValue({ cases: [], staff: [{ id: 'u1', username: 'aigerim', displayName: 'Айгерим Касымова', roles: ['declarant'] }], unassigned: 0, problems: 0, stale: 0, clientDrafts: 0 })
  as('manager', ['analytics.read', 'import40.read'])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('«Аналитика»', () => {
  it('аналитика грузится без тоста перехватчика; заголовок, подзаголовок, «Обновить»', async () => {
    await mountView()
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith({ silent: true })
    expect(w.get('h1').text()).toBe('Аналитика')
    expect(w.text()).toContain('Последние 30 дней по данным системы · сравнение с предыдущими 30 днями')
    expect(w.get('[data-analytics-refresh]').text()).toContain('Обновить')
  })

  it('показатели: значения и дельта с цветом; срок оформления с подсказкой', async () => {
    await mountView()
    const cells = w.findAll('[data-stat-cell]')
    const parts = (i: number) => [...cells[i].element.querySelectorAll(':scope > div')].map((d) => nb(d.textContent ?? '').trim())
    expect(parts(0)).toEqual(['Новых заявок', '33', '+14% к прошлым 30 дням'])
    expect(parts(1)).toEqual(['Подано ДТ', '41', '+8%'])
    expect(parts(2)).toEqual(['Платежи гр. B', '18,2 млн ₸', '−9%'])
    expect(nb(cells[2].get('[data-stat-value]').attributes('title')!)).toMatch(/^18 \d{3} \d{3} ₸$/)
    expect(cells[0].get('[data-stat-value]').attributes('title')).toBeUndefined()
    expect(parts(3)).toEqual(['Срок оформления', '4,6 дн.', 'в работе 36 · с проблемой 2'])
    const hint = (i: number) => cells[i].get('[data-stat-hint]').classes()
    expect(hint(0)).toContain('text-tone-done-fg')
    expect(hint(2)).toContain('text-tone-danger-fg')
    expect(hint(3)).toContain('text-muted')
  })

  it('«новое», «без изменений» и срок «—» без выполненных', async () => {
    api.get.mockResolvedValue({ ...DATA(), cases30d: 5, casesPrev30d: 0, declarations30d: 0, declarationsPrev30d: 0, avgDaysToDone: null })
    await mountView()
    const cells = w.findAll('[data-stat-cell]')
    expect(cells[0].get('[data-stat-hint]').text()).toBe('новое')
    expect(cells[1].get('[data-stat-hint]').text()).toBe('без изменений')
    expect(cells[3].text()).toContain('—')
  })

  it('шесть месяцев: график и легенда', async () => {
    await mountView()
    const panel = w.get('[data-analytics-months]')
    expect(panel.get('h2').text()).toBe('Шесть месяцев')
    expect(panel.findAll('[data-analytics-legend] li').map((l) => l.text())).toEqual(['Заявки', 'ДТ', 'Транзит'])
    expect(panel.findAll('[data-month]')).toHaveLength(6)
  })

  it('стадии: шесть строк, подписи, числа, цвета-токены', async () => {
    await mountView()
    const rows = w.findAll('[data-analytics-stage]')
    expect(rows.map((r) => r.get('span').text())).toEqual(['Заявка и документы', 'На границе', 'Декларирование', 'СВХ и счёт', 'Оплата', 'Выполнено'])
    expect(w.findAll('[data-analytics-stage-count]').map((c) => c.text())).toEqual(['4', '7', '14', '6', '5', '31'])
    const fill = (i: number) => rows[i].get('[aria-hidden="true"] > span')
    expect(['bg-faint', 'bg-gold', 'bg-zircon', 'bg-tone-pay-fg', 'bg-tone-submitted-fg', 'bg-tone-done-fg'].map((c, i) => fill(i).classes().includes(c)))
      .toEqual([true, true, true, true, true, true])
    expect((fill(5).element as HTMLElement).style.width).toBe('100%')
    expect((fill(2).element as HTMLElement).style.width).toBe('45%')
  })

  it('клиенты по платежам: имя, сумма, полоса, число заявок со склонением', async () => {
    await mountView()
    const rows = w.findAll('[data-analytics-client]')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('ТОО «Казахмыс Трейд»')
    expect(nb(rows[0].get('[data-analytics-client-sum]').text())).toBe('6 412 000 ₸')
    expect(rows[0].get('[data-analytics-client-cases]').text()).toBe('9 заявок')
    expect(rows[1].get('[data-analytics-client-cases]').text()).toBe('2 заявки')
    expect((rows[1].get('.bg-zircon').element as HTMLElement).style.width).toBe('50%')
  })

  it('клиентов нет — «Пока нет платежей»; событий нет — «Операций пока нет»; сотрудников нет — «Назначений пока нет»', async () => {
    api.get.mockResolvedValue({ ...DATA(), topClients: [], recentActivity: [], staff: [] })
    await mountView()
    expect(w.get('[data-analytics-clients]').text()).toContain('Пока нет платежей')
    expect(w.get('[data-analytics-events]').text()).toContain('Операций пока нет')
    expect(w.get('[data-analytics-staff]').text()).toContain('Назначений пока нет')
  })
})

describe('«Аналитика»: последние события', () => {
  it('кликабельны при import40.read: ссылка на заявку', async () => {
    await mountView()
    const links = w.findAll('[data-analytics-event-link]')
    expect(links).toHaveLength(3)
    expect(links[0].element.tagName).toBe('A')
    expect(links[0].attributes('href')).toBe('/import-40/case-1')
    expect(links[0].text()).toBe('ТОО «Клиент 1»')
    const first = w.findAll('[data-analytics-event]')[0]
    expect(first.get('[data-analytics-event-text]').text()).toBe('Операция 1 · декларант')
    expect(w.findAll('[data-analytics-event]')[1].get('[data-analytics-event-text]').text()).toBe('Операция 2 · Руководитель отдела')
    expect(first.text()).toContain('груз 1')
  })

  it('без import40.read ссылок нет — только текст', async () => {
    as('manager', ['analytics.read'])
    await mountView()
    expect(has('[data-analytics-event-link]')).toBe(false)
    expect(w.findAll('[data-analytics-event-name]').map((n) => n.text())).toEqual(['ТОО «Клиент 1»', 'ТОО «Клиент 2»', 'ТОО «Клиент 3»'])
  })

  it('время: сегодня — часы и минуты, не сегодня — дата', async () => {
    api.get.mockResolvedValue({ ...DATA(), recentActivity: [ev(1, { atUtc: '2020-01-05T05:40:00Z' })] })
    await mountView()
    expect(w.get('[data-analytics-event-time]').text()).toMatch(/^05\.01\.2020$/)
  })

  it('«Журнал» — только администратору', async () => {
    await mountView()
    expect(has('[data-analytics-journal]')).toBe(false)
    w.unmount()
    as('Administrator', [])
    await mountView()
    const link = w.get('[data-analytics-journal]')
    expect(link.attributes('href')).toBe('/system/audit')
    expect(link.text()).toBe('Журнал')
    expect(w.findAll('[data-analytics-event-link]')).toHaveLength(3)
  })

  it('повторяющиеся события с одним временем не ломают список', async () => {
    api.get.mockResolvedValue({ ...DATA(), recentActivity: [ev(1), ev(1), ev(1)] })
    await mountView()
    expect(w.findAll('[data-analytics-event]')).toHaveLength(3)
  })
})

describe('«Аналитика»: сотрудники и справочник имён', () => {
  it('справочник читается тихо; имя из справочника, иначе логин; роль короткая; «—» без роли', async () => {
    as('manager', ['analytics.read', 'import40.read', 'import40.assign'])
    await mountView()
    expect(api.overview).toHaveBeenCalledTimes(1)
    expect(api.overview).toHaveBeenCalledWith({ silent: true })
    expect(w.findAll('[data-analytics-staff-name]').map((n) => n.text())).toEqual(['Айгерим Касымова', 'erlan', '—'])
    expect(w.findAll('[data-analytics-staff-role]').map((n) => n.text())).toEqual(['декларант', 'КПП', '—'])
    const rows = w.findAll('[data-analytics-staff-table] tbody tr')
    expect(rows[0].text()).toContain('8')
    expect(rows[0].text()).toContain('40')
    expect(w.findAll('[data-analytics-staff-table] thead th').map((th) => th.text())).toEqual(['Сотрудник', 'Роль', 'В работе', 'Выполнено'])
  })

  it('без import40.assign справочник не запрашивается: логины, без запроса и тоста', async () => {
    await mountView()
    expect(api.overview).not.toHaveBeenCalled()
    expect(w.findAll('[data-analytics-staff-name]').map((n) => n.text())).toEqual(['aigerim', 'erlan', '—'])
    expect(api.toast.error).not.toHaveBeenCalled()
  })

  it('ошибка справочника не ломает экран: логины, без тоста и без блока ошибки', async () => {
    as('manager', ['analytics.read', 'import40.read', 'import40.assign'])
    api.overview.mockRejectedValue({ response: { status: 403 } })
    await mountView()
    expect(w.findAll('[data-analytics-staff-name]').map((n) => n.text())).toEqual(['aigerim', 'erlan', '—'])
    expect(has('[data-analytics-error]')).toBe(false)
    expect(api.toast.error).not.toHaveBeenCalled()
    expect(w.findAll('[data-stat-cell]')[0].text()).toContain('33')
  })
})

describe('«Аналитика»: состояния', () => {
  it('ошибка первой загрузки — блок «Повторить»; повтор грузит заново и показывает данные', async () => {
    api.get.mockRejectedValueOnce(new Error('boom'))
    await mountView()
    expect(w.get('[data-analytics-error]').text()).toContain('Не удалось загрузить список')
    expect(has('[data-stat-cell]')).toBe(false)
    await w.get('[data-analytics-retry]').trigger('click')
    await flushPromises()
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(has('[data-analytics-error]')).toBe(false)
    expect(w.findAll('[data-stat-cell]')[0].text()).toContain('33')
  })

  it('ошибка при обновлении: данные остаются, над ними полоса с «Повторить»', async () => {
    await mountView()
    api.get.mockRejectedValueOnce(new Error('boom'))
    await w.get('[data-analytics-refresh]').trigger('click')
    await flushPromises()
    expect(w.get('[data-analytics-error]').exists()).toBe(true)
    expect(w.findAll('[data-stat-cell]')[0].text()).toContain('33')
    expect(w.findAll('[data-analytics-stage]')).toHaveLength(6)
  })

  it('первая загрузка — скелетоны вместо блоков, без данных', async () => {
    let resolve!: (d: AnalyticsDto) => void
    api.get.mockReturnValue(new Promise<AnalyticsDto>((r) => { resolve = r }))
    w = mountWithI18n(AnalyticsView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()
    expect(w.get('[data-analytics-stats]').attributes('aria-busy')).toBe('true')
    expect(w.findAll('[data-z-line]').length).toBeGreaterThan(5)
    expect(has('[data-analytics-stage]')).toBe(false)
    resolve(DATA())
    await flushPromises()
    expect(has('[data-analytics-stage]')).toBe(true)
  })

  it('«Обновить»: запрашивает заново и справочник имён тоже', async () => {
    as('manager', ['analytics.read', 'import40.read', 'import40.assign'])
    await mountView()
    await w.get('[data-analytics-refresh]').trigger('click')
    await flushPromises()
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(api.overview).toHaveBeenCalledTimes(2)
  })
})
