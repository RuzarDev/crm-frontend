import { afterEach, describe, expect, it } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { AnalyticsMonth } from '@/api/analytics'
import MonthsChart from '../MonthsChart.vue'

let w: VueWrapper
afterEach(() => w?.unmount())

const m = (month: string, cases: number, declarations: number, transitEntries: number, paymentsKzt = 0): AnalyticsMonth =>
  ({ month, cases, declarations, transitEntries, paymentsKzt })
const MONTHS = [
  m('2026-05', 18, 22, 9, 9_800_000), m('2026-06', 24, 29, 11, 12_400_000), m('2026-07', 21, 27, 14, 11_100_000),
  m('2026-08', 29, 36, 12, 15_900_000), m('2026-09', 33, 41, 16, 18_200_000), m('2026-10', 9, 11, 4, 0),
]
const nb = (s: string) => s.replace(/ /g, ' ')

describe('MonthsChart', () => {
  it('график — одно изображение с описанием; у каждого столбика свой aria-label', () => {
    w = mountWithI18n(MonthsChart, { props: { months: MONTHS } })
    const root = w.get('[data-months-chart]')
    expect(root.attributes('role')).toBe('img')
    expect(root.attributes('aria-label')).toContain('сен: заявки 33, ДТ 41, транзит 16')
    const first = w.findAll('[data-month]')[0]
    expect(first.findAll('[data-bar]').map((b) => b.attributes('aria-label'))).toEqual(['Заявки: 18', 'ДТ: 22', 'Транзит: 9'])
    expect(w.findAll('[data-bar]')).toHaveLength(18)
  })

  it('каждый ряд масштабируется по своему максимуму, не ниже 4%', () => {
    w = mountWithI18n(MonthsChart, { props: { months: [m('2026-09', 100, 10, 0), m('2026-10', 50, 5, 0)] } })
    const h = (i: number, s: string) => (w.findAll('[data-month]')[i].get(`[data-bar="${s}"]`).element as HTMLElement).style.height
    expect(h(0, 'cases')).toBe('100%')
    expect(h(1, 'cases')).toBe('50%')
    expect(h(0, 'declarations')).toBe('100%')
    expect(h(1, 'declarations')).toBe('50%')
    expect(h(0, 'transit')).toBe('4%')
  })

  it('цвета столбцов — токены; текущий (последний) месяц приглушён', () => {
    w = mountWithI18n(MonthsChart, { props: { months: MONTHS } })
    const cols = w.findAll('[data-month]')
    expect(cols[0].get('[data-bar="cases"]').classes()).toContain('bg-navy')
    expect(cols[0].get('[data-bar="declarations"]').classes()).toContain('bg-zircon')
    expect(cols[0].get('[data-bar="transit"]').classes()).toContain('bg-line-strong')
    expect(cols[0].get('[data-bar="cases"]').classes()).not.toContain('opacity-45')
    for (const s of ['cases', 'declarations', 'transit']) expect(cols[5].get(`[data-bar="${s}"]`).classes()).toContain('opacity-45')
  })

  it('под столбиками: месяц, числа «з · д · т» и платежи; без платежей строки нет', () => {
    w = mountWithI18n(MonthsChart, { props: { months: MONTHS } })
    const cols = w.findAll('[data-month]')
    expect(cols.map((c) => c.get('[data-month-label]').text())).toEqual(['май', 'июн', 'июл', 'авг', 'сен', 'окт'])
    expect(cols[4].get('[data-month-nums]').text()).toBe('33 · 41 · 16')
    expect(nb(cols[4].get('[data-month-pay]').text())).toBe('18,2 млн ₸')
    expect(cols[5].find('[data-month-pay]').exists()).toBe(false)
  })
})
