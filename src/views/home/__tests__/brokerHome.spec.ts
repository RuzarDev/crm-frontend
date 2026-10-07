import { describe, expect, it } from 'vitest'
import type { Import40DashboardDto } from '@/api/dashboard'
import type { ManageOverview } from '@/api/manage'
import type { BrokerInvoice } from '@/api/billing'
import type { Import40CaseDto } from '@/api/import40'
import { buildAttention, monthCaption, moneyForMonth, shortWhen, stageRows, stepTone, taskRows } from '../brokerHome'

const dash = (o: Partial<Import40DashboardDto> = {}): Import40DashboardDto => ({
  totalCases: 0, casesThisMonth: 0, activeCases: 0, doneCases: 0, problemCases: 0, awaitingMe: 0, bySteps: [],
  totalDeclarations: 0, declarationsWithNumber: 0, paymentsTotalKzt: 0, avgDaysToDone: null, topClients: [],
  unassignedCases: 0, isManagerView: false, ...o,
})
const manage = (o: Partial<ManageOverview> = {}): ManageOverview => ({
  cases: [], staff: [], unassigned: 0, problems: 0, stale: 0, clientDrafts: 0, ...o,
})
const inv = (o: Partial<BrokerInvoice> = {}): BrokerInvoice => ({
  id: 'i', clientId: 'c', clientName: 'Клиент', caseId: null, caseNumber: null, kind: 'invoice', status: 0,
  number: '1', year: 2026, issuedAtUtc: null, dueDateUtc: null, paidAtUtc: null, vatRate: 0, subtotal: 0,
  vatAmount: 0, total: 0, note: '', createdAtUtc: '2026-10-01T00:00:00Z', lines: [], ...o,
})
const kase = (o: Partial<Import40CaseDto> = {}): Import40CaseDto =>
  ({ id: 'x', number: 'ИМ-1', clientName: 'К', cargo: 'Груз', status: 0, updatedAtUtc: '2026-10-01T00:00:00Z', ...o }) as Import40CaseDto

const NOW = new Date(Date.UTC(2026, 9, 15, 12, 0)) // 15.10.2026 12:00 UTC

describe('buildAttention', () => {
  it('без данных — пусто', () => {
    expect(buildAttention({ import40: null, manage: null, invoices: null, now: NOW })).toEqual([])
  })
  it('awaitingMe: gold, ссылка на «мои»', () => {
    expect(buildAttention({ import40: dash({ awaitingMe: 3 }), manage: null, invoices: null, now: NOW })).toEqual([
      { key: 'awaitingMe', tone: 'gold', count: 3, to: '/import-40?tab=my' },
    ])
  })
  it('isManagerView не даёт awaitingMe', () => {
    expect(buildAttention({ import40: dash({ awaitingMe: 3, isManagerView: true }), manage: null, invoices: null, now: NOW })).toEqual([])
  })
  it('awaitingMe = 0 не даёт карточку', () => {
    expect(buildAttention({ import40: dash({ awaitingMe: 0 }), manage: null, invoices: null, now: NOW })).toEqual([])
  })
  it('unassigned: gold, на управление', () => {
    expect(buildAttention({ import40: null, manage: manage({ unassigned: 2 }), invoices: null, now: NOW })).toEqual([
      { key: 'unassigned', tone: 'gold', count: 2, to: '/import-40/manage' },
    ])
  })
  it('problems без manage берёт problemCases и ведёт в список', () => {
    expect(buildAttention({ import40: dash({ problemCases: 4 }), manage: null, invoices: null, now: NOW })).toEqual([
      { key: 'problems', tone: 'danger', count: 4, to: '/import-40' },
    ])
  })
  it('problems с manage берёт manage.problems и ведёт на управление', () => {
    expect(buildAttention({ import40: dash({ problemCases: 4 }), manage: manage({ problems: 1 }), invoices: null, now: NOW })).toEqual([
      { key: 'problems', tone: 'danger', count: 1, to: '/import-40/manage' },
    ])
  })
  it('stale: neutral', () => {
    expect(buildAttention({ import40: null, manage: manage({ stale: 5 }), invoices: null, now: NOW })).toEqual([
      { key: 'stale', tone: 'neutral', count: 5, to: '/import-40/manage' },
    ])
  })
  it('overdue: только выставленные счета с просроченным сроком, сумма и счёт', () => {
    const invoices = [
      inv({ id: '1', status: 1, dueDateUtc: '2026-10-10T00:00:00Z', total: 100 }),
      inv({ id: '2', status: 1, dueDateUtc: '2026-10-01T00:00:00Z', total: 250 }),
      inv({ id: '3', status: 1, dueDateUtc: '2026-10-20T00:00:00Z', total: 999 }), // не просрочен
      inv({ id: '4', status: 2, dueDateUtc: '2026-10-01T00:00:00Z', total: 999 }), // оплачен
      inv({ id: '5', status: 1, kind: 'act', dueDateUtc: '2026-10-01T00:00:00Z', total: 999 }), // акт
      inv({ id: '6', status: 1, dueDateUtc: null, total: 999 }), // без срока
    ]
    expect(buildAttention({ import40: null, manage: null, invoices, now: NOW })).toEqual([
      { key: 'overdue', tone: 'neutral', count: 2, amount: 350, to: '/billing' },
    ])
  })
  it('порядок фиксирован и не более 4 карточек', () => {
    const cards = buildAttention({
      import40: dash({ awaitingMe: 1 }),
      manage: manage({ unassigned: 2, problems: 3, stale: 4 }),
      invoices: [inv({ status: 1, dueDateUtc: '2026-10-01T00:00:00Z', total: 10 })],
      now: NOW,
    })
    expect(cards.map((c) => c.key)).toEqual(['awaitingMe', 'unassigned', 'problems', 'stale'])
  })
  it('без awaitingMe в четвёрку попадает overdue', () => {
    const cards = buildAttention({
      import40: dash({ isManagerView: true }),
      manage: manage({ unassigned: 2, problems: 3, stale: 4 }),
      invoices: [inv({ status: 1, dueDateUtc: '2026-10-01T00:00:00Z', total: 10 })],
      now: NOW,
    })
    expect(cards.map((c) => c.key)).toEqual(['unassigned', 'problems', 'stale', 'overdue'])
  })
})

describe('stageRows', () => {
  it('6 строк по порядку, нет данных — 0, цвета по шагам', () => {
    const rows = stageRows([{ step: 3, count: 8 }])
    expect(rows.map((r) => r.step)).toEqual([1, 2, 3, 4, 5, 6])
    expect(rows.map((r) => r.count)).toEqual([0, 0, 8, 0, 0, 0])
    expect(rows.map((r) => r.color)).toEqual([
      'var(--color-faint)', 'var(--color-gold)', 'var(--color-zircon)',
      'var(--color-tone-submitted-fg)', 'var(--color-tone-pay-fg)', 'var(--color-tone-done-fg)',
    ])
  })
})

describe('stepTone', () => {
  it.each([[1, 'neutral'], [2, 'wait'], [3, 'info'], [4, 'submitted'], [5, 'pay'], [6, 'pay'], [7, 'done'], [9, 'done']])(
    'шаг %i → %s', (step, tone) => { expect(stepTone(step)).toBe(tone) },
  )
})

describe('moneyForMonth', () => {
  it('считает только счета, по месяцу now (UTC)', () => {
    const invoices = [
      inv({ id: 'draft', status: 0, total: 1000, issuedAtUtc: '2026-10-05T00:00:00Z' }),
      inv({ id: 'issued-now', status: 1, total: 200, issuedAtUtc: '2026-10-03T10:00:00Z' }),
      inv({ id: 'issued-prev', status: 1, total: 30, issuedAtUtc: '2026-09-28T10:00:00Z' }),
      inv({ id: 'paid-now', status: 2, total: 4000, issuedAtUtc: '2026-10-02T10:00:00Z', paidAtUtc: '2026-10-09T10:00:00Z' }),
      inv({ id: 'act', kind: 'act', status: 2, total: 50000, issuedAtUtc: '2026-10-02T10:00:00Z', paidAtUtc: '2026-10-09T10:00:00Z' }),
    ]
    // issued: 200 + 4000 (оплаченный тоже был выставлен); paid: 4000; awaiting: 200 + 30
    expect(moneyForMonth(invoices, NOW)).toEqual({ issued: 4200, paid: 4000, awaiting: 230 })
  })
  it('оплата в этом месяце счёта, выставленного в прошлом', () => {
    const invoices = [inv({ status: 2, total: 700, issuedAtUtc: '2026-09-20T10:00:00Z', paidAtUtc: '2026-10-04T10:00:00Z' })]
    expect(moneyForMonth(invoices, NOW)).toEqual({ issued: 0, paid: 700, awaiting: 0 })
  })
  it('пустой список — нули', () => {
    expect(moneyForMonth([], NOW)).toEqual({ issued: 0, paid: 0, awaiting: 0 })
  })
})

describe('shortWhen', () => {
  const now = new Date(2026, 9, 8, 15, 0)
  it('сегодня — HH:mm', () => {
    expect(shortWhen(new Date(2026, 9, 8, 9, 5).toISOString(), now, 'вчера')).toBe('09:05')
  })
  it('вчера — подпись', () => {
    expect(shortWhen(new Date(2026, 9, 7, 23, 50).toISOString(), now, 'вчера')).toBe('вчера')
  })
  it('старая дата — DD.MM', () => {
    expect(shortWhen(new Date(2026, 8, 3, 12, 0).toISOString(), now, 'вчера')).toBe('03.09')
  })
})

describe('taskRows', () => {
  it('сортирует по updatedAtUtc убыв., отбрасывает status >= 8, считает шаг', () => {
    const cases = [
      kase({ id: 'a', status: 0, updatedAtUtc: '2026-10-01T00:00:00Z' }),
      kase({ id: 'b', status: 8, updatedAtUtc: '2026-10-09T00:00:00Z' }),
      kase({ id: 'c', status: 3, updatedAtUtc: '2026-10-05T00:00:00Z' }),
      kase({ id: 'd', status: 9, updatedAtUtc: '2026-10-08T00:00:00Z' }),
      kase({ id: 'e', status: 7, updatedAtUtc: '2026-10-03T00:00:00Z' }),
    ]
    const rows = taskRows(cases)
    expect(rows.map((r) => r.id)).toEqual(['c', 'e', 'a'])
    expect(rows.map((r) => r.step)).toEqual([3, 6, 1])
    expect(Object.keys(rows[0]).sort()).toEqual(['cargo', 'clientName', 'id', 'number', 'step', 'updatedAtUtc'])
  })
  it('ограничивает limit', () => {
    const cases = Array.from({ length: 10 }, (_, i) => kase({ id: String(i), updatedAtUtc: `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00Z` }))
    expect(taskRows(cases)).toHaveLength(6)
    expect(taskRows(cases, 2).map((r) => r.id)).toEqual(['9', '8'])
  })
})

describe('monthCaption', () => {
  it('ru: «Октябрь 2026» без « г.»', () => {
    expect(monthCaption(NOW, 'ru')).toBe('Октябрь 2026')
  })
  it('en: «October 2026»', () => {
    expect(monthCaption(NOW, 'en')).toBe('October 2026')
  })
  it('месяц по UTC: 31.10 22:00 UTC — ещё октябрь', () => {
    expect(monthCaption(new Date(Date.UTC(2026, 9, 31, 22, 0)), 'ru')).toBe('Октябрь 2026')
  })
})
