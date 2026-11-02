import { describe, expect, it } from 'vitest'
import type { StaffHomeAttention, StaffHomeDto } from '@/api/dashboard'
import type { BrokerInvoice } from '@/api/billing'
import type { DashboardDto } from '@/types/api'
import {
  buildAttention, monthCaption, moneyForMonth, ownerParts, shortWhen, stageHref, stageRows, stepTone, taskNext, transitStatusHref,
  urgentHref, urgentWhen,
} from '../brokerHome'

const home = (a: Partial<StaffHomeAttention> = {}): StaffHomeDto => ({
  activeCases: 0, owners: null, urgent: [], urgentTotal: 0, tasks: [], tasksTotal: 0, bySteps: [],
  attention: { awaitingMe: null, awaitingClient: null, stuck: null, stuckMine: false, expiringDocs: null, ...a },
})
const inv = (o: Partial<BrokerInvoice> = {}): BrokerInvoice => ({
  id: 'i', clientId: 'c', clientName: 'Клиент', caseId: null, caseNumber: null, kind: 'invoice', status: 0,
  number: '1', year: 2026, issuedAtUtc: null, dueDateUtc: null, paidAtUtc: null, vatRate: 0, subtotal: 0,
  vatAmount: 0, total: 0, note: '', createdAtUtc: '2026-10-01T00:00:00Z', lines: [], ...o,
})

const NOW = new Date(Date.UTC(2026, 9, 15, 12, 0)) // 15.10.2026 12:00 UTC

// Пакет G (02.11.2026): карточки — «Ждут вас», «Ждут клиента», «Застряли», «Истекают документы» (+ транзит).
describe('buildAttention', () => {
  it('без данных — пусто', () => {
    expect(buildAttention({ home: null })).toEqual([])
  })
  it('null и 0 — карточек нет (null — не положена: админ без «Ждут вас», бухгалтер)', () => {
    expect(buildAttention({ home: home({ awaitingMe: 0, awaitingClient: 0, stuck: 0, expiringDocs: 0 }) })).toEqual([])
    expect(buildAttention({ home: home() })).toEqual([])
  })
  it('порядок и ссылки: «Ждут вас» → «Мои», «Ждут клиента» → вкладка, «Застряли» → фильтр, документы → реестр (14 дн.)', () => {
    expect(buildAttention({ home: home({ awaitingMe: 3, awaitingClient: 2, stuck: 1, expiringDocs: 4 }) })).toEqual([
      { key: 'awaitingMe', tone: 'gold', count: 3, to: '/import-40?tab=my' },
      { key: 'awaitingClient', tone: 'neutral', count: 2, to: '/import-40?tab=waiting' },
      { key: 'stuck', tone: 'danger', count: 1, to: '/import-40?tab=active&stuck=1' },
      { key: 'expiringDocs', tone: 'neutral', count: 4, to: '/client-documents?state=expiring&within=14' },
    ])
  })
  it('«Застряли» по своим (декларант, КПП) — во вкладке «Мои»', () => {
    expect(buildAttention({ home: home({ stuck: 2, stuckMine: true }) })[0].to).toBe('/import-40?tab=my&stuck=1')
  })
  it('не более 4 карточек: транзит после заявочных', () => {
    const transit = { totalEntries: 0, entriesThisMonth: 0, totalWeightKg: 0, totalGrandTotal: 0, topClients: [], topCodes: [], byStatus: [{ status: 'Problematic', count: 1 }] }
    expect(buildAttention({ home: home({ awaitingMe: 1, awaitingClient: 1, stuck: 1, expiringDocs: 1 }), transit }).map((c) => c.key))
      .toEqual(['awaitingMe', 'awaitingClient', 'stuck', 'expiringDocs'])
    expect(buildAttention({ home: home({ awaitingClient: 1 }), transit }).map((c) => c.key)).toEqual(['awaitingClient', 'transitProblems'])
  })
  it('транзит: «Проблемные записи» (danger) и «поданы, ждут выпуска»; нули не показываются', () => {
    const transit = (byStatus: DashboardDto['byStatus']): DashboardDto =>
      ({ totalEntries: 0, entriesThisMonth: 0, totalWeightKg: 0, totalGrandTotal: 0, topClients: [], topCodes: [], byStatus })
    expect(buildAttention({ home: null, transit: transit([{ status: 'Problematic', count: 2 }, { status: 'Submitted', count: 5 }]) })).toEqual([
      { key: 'transitProblems', tone: 'danger', count: 2, to: '/reestr?status=4' },
      { key: 'transitSubmitted', tone: 'neutral', count: 5, to: '/reestr?status=1' },
    ])
    expect(buildAttention({ home: null, transit: transit([{ status: 'Problematic', count: 0 }, { status: 'Released', count: 9 }]) })).toEqual([])
  })
})

describe('urgentWhen / urgentHref', () => {
  const u = { dueTime: null, overdueDays: 0, past: false }
  it('запрос таможни: до времени сегодня, срок сегодня, истёк сегодня, просрочено N дн.', () => {
    expect(urgentWhen({ ...u, kind: 'customsRequest', dueTime: '18:00' })).toEqual({ key: 'answerBy', params: { time: '18:00' } })
    expect(urgentWhen({ ...u, kind: 'customsRequest' })).toEqual({ key: 'dueToday', params: {} })
    expect(urgentWhen({ ...u, kind: 'customsRequest', dueTime: '09:00', past: true })).toEqual({ key: 'expiredAt', params: { time: '09:00' } })
    expect(urgentWhen({ ...u, kind: 'customsRequest', overdueDays: 2, past: true })).toEqual({ key: 'overdue', params: { n: 2 } })
  })
  it('условный выпуск и счёт', () => {
    expect(urgentWhen({ ...u, kind: 'conditionalRelease', overdueDays: 1, past: true })).toEqual({ key: 'overdue', params: { n: 1 } })
    expect(urgentWhen({ ...u, kind: 'invoice', overdueDays: 3, past: true })).toEqual({ key: 'payOverdue', params: { n: 3 } })
    expect(urgentWhen({ ...u, kind: 'invoice', past: true })).toEqual({ key: 'payToday', params: {} })
  })
  it('ссылка: заявка или счета с номером в поиске', () => {
    expect(urgentHref({ kind: 'customsRequest', caseId: 'c1', invoiceNumber: null })).toBe('/import-40/c1')
    expect(urgentHref({ kind: 'invoice', caseId: 'c1', invoiceNumber: '14/2026' })).toBe('/billing?q=14%2F2026')
  })
})

describe('ownerParts / taskNext / stageHref', () => {
  it('чей ход — только ненулевые, по порядку', () => {
    expect(ownerParts({ declarants: 5, kpp: 0, clients: 1 })).toEqual([{ key: 'declarants', n: 5 }, { key: 'clients', n: 1 }])
    expect(ownerParts(null)).toEqual([])
  })
  it('что дальше: заполнение с числами, этап — подпись шага', () => {
    expect(taskNext({ next: 'fill', step: 3, filled: 40, total: 54 })).toEqual({ key: 'home.tasks.next.fill', params: { filled: 40, total: 54 } })
    expect(taskNext({ next: 'ready', step: 3, filled: null, total: null }).key).toBe('home.tasks.next.ready')
    expect(taskNext({ next: 'stage', step: 2, filled: null, total: null }).key).toBe('enum.step.s2')
  })
  it('строка этапа: шаг 1 — «Черновики», остальные — «В работе» с ?step=', () => {
    expect(stageHref(1)).toBe('/import-40?tab=drafts')
    expect(stageHref(4)).toBe('/import-40?tab=active&step=4')
  })
})

describe('transitStatusHref', () => {
  it('имя статуса → /reestr?status=N; неизвестное — null', () => {
    expect(transitStatusHref('InProgress')).toBe('/reestr?status=0')
    expect(transitStatusHref('Archived')).toBe('/reestr?status=7')
    expect(transitStatusHref('Нечто')).toBeNull()
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

describe('monthCaption', () => {
  it('ru: «Октябрь 2026» без « г.»', () => {
    expect(monthCaption(NOW, 'ru')).toBe('Октябрь 2026')
  })
  it('kk: «Қазан 2026» — месяц впереди, без « ж.»', () => {
    expect(monthCaption(NOW, 'kk')).toBe('Қазан 2026')
  })
  it('en: «October 2026»', () => {
    expect(monthCaption(NOW, 'en')).toBe('October 2026')
  })
  it('месяц по UTC: 31.10 22:00 UTC — ещё октябрь', () => {
    expect(monthCaption(new Date(Date.UTC(2026, 9, 31, 22, 0)), 'ru')).toBe('Октябрь 2026')
  })
})
