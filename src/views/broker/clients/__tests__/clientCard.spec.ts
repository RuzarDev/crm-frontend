import { describe, expect, it } from 'vitest'
import type { ClientCardCase, ClientCardDoc } from '@/api/clientCard'
import type { BrokerInvoice } from '@/api/billing'
import type { ReestrEntry } from '@/types/api'
import {
  availableTabs, awaitingAqniet, canRenewPoa, caseTone, contactRows, currentDocs, directorBasisOf, docTag, invoicesOf, matchesCase,
  recentCases, resolveTab, transitQuery, unpaidOf,
} from '../clientCard'

const doc = (o: Partial<ClientCardDoc>): ClientCardDoc => ({
  id: 'd', kind: 'contract', number: '1', year: 2026, status: 2, clientSigned: true, clientSignedAtUtc: null, clientSignMethod: null, providerSigned: true,
  providerSignedAtUtc: null, providerSignMethod: null, isSingleUse: false, validUntilUtc: null, daysLeft: null, expiringSoon: false, consumedByCaseId: null,
  filesCount: 0, generatedAtUtc: '2026-01-01T00:00:00Z', ...o,
})
const kase = (o: Partial<ClientCardCase>): ClientCardCase => ({
  id: 'k', number: 'ИМ-1', cargo: 'груз', post: 'Хоргос', status: 2, isProblem: false, createdAtUtc: '2026-10-01T00:00:00Z', updatedAtUtc: '2026-10-01T00:00:00Z',
  svhInvoiceAmount: null, paymentConfirmed: false, declarationsCount: 0, ...o,
})
const invoice = (o: Partial<BrokerInvoice>): BrokerInvoice => ({
  id: 'i', clientId: 'c', clientName: 'К', caseId: null, caseNumber: null, kind: 'invoice', status: 1, number: '1', year: 2026, issuedAtUtc: null,
  dueDateUtc: '2099-01-01T00:00:00Z', paidAtUtc: null, vatRate: 12, subtotal: 0, vatAmount: 0, total: 100, note: '', createdAtUtc: '2026-01-01T00:00:00Z',
  lines: [], paymentChecks: [], ...o,
})

describe('directorBasisOf', () => {
  it('профиля нет (updatedAtUtc == null): основание по умолчанию с сервера не показываем', () => {
    expect(directorBasisOf({ directorBasis: 'устава', updatedAtUtc: null })).toBe('—')
  })
  it('профиль есть: основание как заполнено, пустое — «—»', () => {
    expect(directorBasisOf({ directorBasis: 'устава', updatedAtUtc: '2026-09-01T04:00:00Z' })).toBe('устава')
    expect(directorBasisOf({ directorBasis: '', updatedAtUtc: '2026-09-01T04:00:00Z' })).toBe('—')
  })
})

describe('вкладки', () => {
  it('«Транзит» — по reestr.read, «Счета» — по finance.read', () => {
    expect(availableTabs({ reestr: true, finance: true })).toEqual(['overview', 'cases', 'transit', 'docs', 'invoices'])
    expect(availableTabs({ reestr: false, finance: true })).toEqual(['overview', 'cases', 'docs', 'invoices'])
    expect(availableTabs({ reestr: true, finance: false })).toEqual(['overview', 'cases', 'transit', 'docs'])
    expect(availableTabs({ reestr: false, finance: false })).toEqual(['overview', 'cases', 'docs'])
  })
  it('?tab=: известная и доступная вкладка; иначе «Обзор»', () => {
    const tabs = availableTabs({ reestr: false, finance: false })
    expect(resolveTab('docs', tabs)).toBe('docs')
    expect(resolveTab(['cases', 'docs'], tabs)).toBe('cases')
    expect(resolveTab('transit', tabs)).toBe('overview')
    expect(resolveTab('nope', tabs)).toBe('overview')
    expect(resolveTab(undefined, tabs)).toBe('overview')
  })
})

describe('заявки', () => {
  it('тон: проблема — красный, иначе по этапу', () => {
    expect(caseTone(kase({ status: 4, isProblem: true }))).toBe('danger')
    expect(caseTone(kase({ status: 8 }))).toBe('done')
    expect(caseTone(kase({ status: 9 }))).toBe('neutral')
  })
  it('поиск: номер, груз, пост; без учёта пробелов и регистра', () => {
    const c = kase({ number: 'ИМ-2026-0182', cargo: 'Ноутбуки и комплектующие', post: 'Хоргос' })
    expect(matchesCase('0182', c)).toBe(true)
    expect(matchesCase('ноутбуки', c)).toBe(true)
    expect(matchesCase('хорг', c)).toBe(true)
    expect(matchesCase('мониторы', c)).toBe(false)
    expect(matchesCase('', c)).toBe(true)
  })
  it('последние: новые сверху, не больше n', () => {
    const cs = [kase({ id: 'a', createdAtUtc: '2026-01-01T00:00:00Z' }), kase({ id: 'c', createdAtUtc: '2026-03-01T00:00:00Z' }), kase({ id: 'b', createdAtUtc: '2026-02-01T00:00:00Z' })]
    expect(recentCases(cs, 2).map((c) => c.id)).toEqual(['c', 'b'])
  })
})

describe('документы', () => {
  it('«ждёт AQNIET»: договор, клиент подписал, AQNIET нет', () => {
    expect(awaitingAqniet(doc({ status: 1, providerSigned: false }))).toBe(true)
    expect(awaitingAqniet(doc({ status: 1, providerSigned: false, clientSigned: false }))).toBe(false)
    expect(awaitingAqniet(doc({ status: 1, providerSigned: false, kind: 'poa' }))).toBe(false)
    expect(awaitingAqniet(doc({ status: 2 }))).toBe(false)
  })
  it('тег: Истекает / Истёк у действующего, иначе как в «Клиентах»', () => {
    expect(docTag(doc({ status: 2, daysLeft: 10, expiringSoon: true }))).toEqual({ tone: 'wait', labelKey: 'broker.clientCard.doc.expiring' })
    expect(docTag(doc({ status: 2, daysLeft: -3 }))).toEqual({ tone: 'danger', labelKey: 'admin.istek' })
    expect(docTag(doc({ status: 2, daysLeft: 300 }))).toEqual({ tone: 'done', labelKey: 'admin.deystvuet' })
    expect(docTag(doc({ status: 1 }))).toEqual({ tone: 'wait', labelKey: 'admin.zhdetPodpisi' })
  })
  it('«Выпустить новую»: доверенность, срок истекает или вышел', () => {
    expect(canRenewPoa(doc({ kind: 'poa', status: 2, expiringSoon: true, daysLeft: 5 }))).toBe(true)
    expect(canRenewPoa(doc({ kind: 'poa', status: 3, daysLeft: -5 }))).toBe(true)
    expect(canRenewPoa(doc({ kind: 'poa', status: 2, daysLeft: 200 }))).toBe(false)
    expect(canRenewPoa(doc({ kind: 'contract', status: 2, expiringSoon: true, daysLeft: 5 }))).toBe(false)
    expect(canRenewPoa(doc({ kind: 'poa', status: 2, daysLeft: -1 }))).toBe(true)
  })
  it('«Выпустить новую» — только действующей (2) и истёкшей (3): отозванной, черновику и ждущей подписи — нет', () => {
    expect(canRenewPoa(doc({ kind: 'poa', status: 4, daysLeft: -30 }))).toBe(false)
    expect(canRenewPoa(doc({ kind: 'poa', status: 4, expiringSoon: true, daysLeft: 3 }))).toBe(false)
    expect(canRenewPoa(doc({ kind: 'poa', status: 0, daysLeft: -1 }))).toBe(false)
    expect(canRenewPoa(doc({ kind: 'poa', status: 1, daysLeft: -1 }))).toBe(false)
  })
  it('в обзоре — по одному «текущему»: действующий, иначе ждущий подписи, иначе свежий', () => {
    const docs = [
      doc({ id: 'c-old', kind: 'contract', status: 3, daysLeft: -10 }),
      doc({ id: 'c-act', kind: 'contract', status: 2 }),
      doc({ id: 'p-wait', kind: 'poa', status: 1 }),
      doc({ id: 'p-old', kind: 'poa', status: 3 }),
    ]
    expect(currentDocs(docs).map((d) => d.id)).toEqual(['c-act', 'p-wait'])
    expect(currentDocs([doc({ id: 'x', kind: 'poa', status: 3 })]).map((d) => d.id)).toEqual(['x'])
    expect(currentDocs([])).toEqual([])
  })
  it('просроченный по дате «действующий» уступает ждущему подписи', () => {
    const docs = [doc({ id: 'late', status: 2, daysLeft: -1 }), doc({ id: 'wait', status: 1 })]
    expect(currentDocs(docs).map((d) => d.id)).toEqual(['wait'])
  })
})

describe('счета', () => {
  it('только этого клиента', () => {
    expect(invoicesOf('c', [invoice({ id: 'a' }), invoice({ id: 'b', clientId: 'x' })]).map((r) => r.id)).toEqual(['a'])
  })
  it('«Не оплачено»: выставленные счета, акты и оплаченные не считаются; просроченные отдельно', () => {
    const u = unpaidOf([
      invoice({ total: 100 }),
      invoice({ total: 200, dueDateUtc: '2020-01-01T00:00:00Z' }),
      invoice({ total: 400, status: 2 }),
      invoice({ total: 800, kind: 'act' }),
      invoice({ total: 1600, status: 0 }),
    ], new Date(2026, 9, 9))
    expect(u).toEqual({ sum: 300, count: 2, overdue: 1 })
  })
})

describe('контакт и транзит', () => {
  it('контакт: только заполненные строки', () => {
    expect(contactRows({ contactPersonName: ' Динара М. ', contactPersonPosition: '', contactPhone: '+7 701', contactEmail: '  ' })).toEqual([
      { key: 'name', value: 'Динара М.' },
      { key: 'phone', value: '+7 701' },
    ])
  })
  it('что искать в транзите: контейнер, иначе №, иначе ничего', () => {
    const e = (data: Record<string, string>) => ({ data }) as unknown as ReestrEntry
    expect(transitQuery(e({ 'Контейнер': 'MRSU4885849', '№': '12' }))).toBe('MRSU4885849')
    expect(transitQuery(e({ '№': '12' }))).toBe('12')
    expect(transitQuery(e({ 'Контейнер': ' ' }))).toBeNull()
  })
})
