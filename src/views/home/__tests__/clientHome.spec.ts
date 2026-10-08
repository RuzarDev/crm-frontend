import { describe, expect, it } from 'vitest'
import type { ClientShipment } from '@/api/clientShipments'
import type { BrokerInvoice } from '@/api/billing'
import { activeShipments, clientAsks, clientGreetingName, dayMonth, unpaidInvoices } from '../clientHome'

const ship = (o: Partial<ClientShipment>): ClientShipment => ({
  id: 'c', number: 'И40-1', cargo: 'Ноутбуки', post: '', status: 2, step: 3, isProblem: false,
  problemClientMessage: '', returnReason: '', paymentCheckUploaded: false, svhInvoiceAmount: null,
  updatedAtUtc: '2026-10-01T10:00:00Z', ...o,
}) as ClientShipment

const invoice = (o: Partial<BrokerInvoice>): BrokerInvoice => ({
  id: 'i', clientId: 'c', clientName: 'К', caseId: null, caseNumber: null, kind: 'invoice', status: 1,
  number: '1', year: 2026, issuedAtUtc: '2026-10-01T08:00:00Z', dueDateUtc: null, paidAtUtc: null, vatRate: 0,
  subtotal: 0, vatAmount: 0, total: 100, note: '', createdAtUtc: '2026-10-01T08:00:00Z', lines: [], ...o,
})

describe('clientAsks', () => {
  it('проблемы, возвраты, оплата склада, черновики; свежие сверху; без чужого хода', () => {
    const list = clientAsks([
      ship({ id: 'd', status: 0, updatedAtUtc: '2026-10-05T00:00:00Z' }),
      ship({ id: 'pay', status: 6 }),
      ship({ id: 'paid', status: 6, paymentCheckUploaded: true }),
      ship({ id: 'ret', status: 0, returnReason: 'Нет инвойса' }),
      ship({ id: 'p1', isProblem: true, updatedAtUtc: '2026-10-01T00:00:00Z' }),
      ship({ id: 'p2', isProblem: true, updatedAtUtc: '2026-10-03T00:00:00Z' }),
      ship({ id: 'x', status: 2 }),
      ship({ id: 'done', status: 8, isProblem: true }),
    ])
    expect(list.map((a) => a.id)).toEqual(['p2', 'p1', 'ret', 'pay', 'd'])
  })
})

describe('activeShipments', () => {
  it('без выполненных и отменённых, по дате изменения убыв.', () => {
    const list = activeShipments([
      ship({ id: 'old', updatedAtUtc: '2026-09-01T00:00:00Z' }),
      ship({ id: 'done', status: 8 }),
      ship({ id: 'cancel', status: 9 }),
      ship({ id: 'new', status: 0, updatedAtUtc: '2026-10-07T00:00:00Z' }),
    ])
    expect(list.map((c) => c.id)).toEqual(['new', 'old'])
  })
})

describe('unpaidInvoices', () => {
  it('только выставленные счета, самый ранний первым', () => {
    const list = unpaidInvoices([
      invoice({ id: 'late', issuedAtUtc: '2026-10-05T00:00:00Z' }),
      invoice({ id: 'paid', status: 2 }),
      invoice({ id: 'act', kind: 'act' }),
      invoice({ id: 'early', issuedAtUtc: '2026-09-20T00:00:00Z' }),
    ])
    expect(list.map((i) => i.id)).toEqual(['early', 'late'])
  })
})

describe('dayMonth', () => {
  it('ДД.ММ по местному времени, пусто для пустой даты', () => {
    expect(dayMonth(new Date(2026, 9, 1, 12).toISOString())).toBe('01.10')
    expect(dayMonth(null)).toBe('')
    expect(dayMonth('мусор')).toBe('')
  })
})

describe('clientGreetingName', () => {
  it('имя человека — первое слово', () => expect(clientGreetingName('Айгерим Касымова', 'ТОО «Казахмыс Трейд»')).toBe('Айгерим'))
  it('название компании вместо имени — без имени', () => {
    expect(clientGreetingName('ТОО «Казахмыс Трейд»', 'ТОО «Казахмыс Трейд»')).toBe('')
    expect(clientGreetingName('ТОО «Другое»', null)).toBe('')
    expect(clientGreetingName('«Астана Фудс»', null)).toBe('')
    expect(clientGreetingName(null, 'ТОО')).toBe('')
  })
})
