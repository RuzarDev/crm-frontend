import { describe, expect, it } from 'vitest'
import type { Import40CaseDto } from '@/api/import40'
import type { BrokerInvoice } from '@/api/billing'
import {
  activeShipments, clientAskFor, clientAsks, clientGreetingName, dayMonth, shipmentTone, unpaidInvoices,
} from '../clientHome'

const kase = (o: Partial<Import40CaseDto>): Import40CaseDto => ({
  id: 'c', number: 'И40-1', cargo: 'Ноутбуки', post: '', status: 2, isProblem: false,
  problemClientMessage: '', returnReason: '', updatedAtUtc: '2026-10-01T10:00:00Z', ...o,
}) as Import40CaseDto

const invoice = (o: Partial<BrokerInvoice>): BrokerInvoice => ({
  id: 'i', clientId: 'c', clientName: 'К', caseId: null, caseNumber: null, kind: 'invoice', status: 1,
  number: '1', year: 2026, issuedAtUtc: '2026-10-01T08:00:00Z', dueDateUtc: null, paidAtUtc: null, vatRate: 0,
  subtotal: 0, vatAmount: 0, total: 100, note: '', createdAtUtc: '2026-10-01T08:00:00Z', lines: [], ...o,
})

describe('clientAskFor', () => {
  it('проблема — сообщение клиенту', () => {
    expect(clientAskFor(kase({ id: 'p', number: 'И40-7', isProblem: true, status: 3, problemClientMessage: 'Нужен сертификат' })))
      .toEqual({ kind: 'problem', caseId: 'p', number: 'И40-7', cargo: 'Ноутбуки', message: 'Нужен сертификат' })
  })
  it('черновик — причина возврата', () => {
    expect(clientAskFor(kase({ status: 0, returnReason: 'Нет инвойса' }))).toMatchObject({ kind: 'draft', message: 'Нет инвойса' })
  })
  it('счёт СВХ выставлен — ждём чек', () => {
    expect(clientAskFor(kase({ status: 6 }))).toMatchObject({ kind: 'payCheck', message: '' })
  })
  it('ДТ подана — ход не за клиентом', () => {
    expect(clientAskFor(kase({ status: 3 }))).toBeNull()
  })
  it('отменённая и выполненная — без вопросов, даже с отметкой проблемы', () => {
    expect(clientAskFor(kase({ status: 9, isProblem: true }))).toBeNull()
    expect(clientAskFor(kase({ status: 8, isProblem: true }))).toBeNull()
  })
})

describe('clientAsks', () => {
  it('проблемы, затем оплата склада, затем черновики; свежие сверху', () => {
    const list = clientAsks([
      kase({ id: 'd', status: 0, updatedAtUtc: '2026-10-05T00:00:00Z' }),
      kase({ id: 'pay', status: 6 }),
      kase({ id: 'p1', isProblem: true, updatedAtUtc: '2026-10-01T00:00:00Z' }),
      kase({ id: 'p2', isProblem: true, updatedAtUtc: '2026-10-03T00:00:00Z' }),
      kase({ id: 'x', status: 2 }),
    ])
    expect(list.map((a) => a.caseId)).toEqual(['p2', 'p1', 'pay', 'd'])
  })
})

describe('activeShipments', () => {
  it('без выполненных и отменённых, по дате изменения убыв.', () => {
    const list = activeShipments([
      kase({ id: 'old', updatedAtUtc: '2026-09-01T00:00:00Z' }),
      kase({ id: 'done', status: 8 }),
      kase({ id: 'cancel', status: 9 }),
      kase({ id: 'new', status: 0, updatedAtUtc: '2026-10-07T00:00:00Z' }),
    ])
    expect(list.map((c) => c.id)).toEqual(['new', 'old'])
  })
})

describe('shipmentTone', () => {
  it.each([
    [{ isProblem: true, status: 6 }, 'danger'],
    [{ status: 0 }, 'wait'],
    [{ status: 6 }, 'pay'],
    [{ status: 7 }, 'pay'],
    [{ status: 4 }, 'done'],
    [{ status: 5 }, 'done'],
    [{ status: 1 }, 'info'],
    [{ status: 3 }, 'info'],
  ] as const)('%o → %s', (o, tone) => {
    expect(shipmentTone(kase(o))).toBe(tone)
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
