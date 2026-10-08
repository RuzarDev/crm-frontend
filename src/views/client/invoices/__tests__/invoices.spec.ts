import { describe, expect, it } from 'vitest'
import type { BrokerInvoice } from '@/api/billing'
import { defaultInvoiceId, dueDayMonth, groupInvoices, invoiceState, isOverdue, requisiteRows } from '../invoices'

const inv = (o: Partial<BrokerInvoice>): BrokerInvoice => ({
  id: 'i', clientId: 'c', clientName: '', caseId: null, caseNumber: null, kind: 'invoice', status: 1, number: '1', year: 2026,
  issuedAtUtc: '2026-10-01T06:00:00Z', dueDateUtc: null, paidAtUtc: null, vatRate: 16, subtotal: 0, vatAmount: 0, total: 0,
  note: '', createdAtUtc: '2026-10-01T06:00:00Z', lines: [], paymentChecks: [], ...o,
})
const NOW = new Date(2026, 9, 10, 12)

describe('invoices helpers', () => {
  it('срок — дата из строки без сдвига пояса; просрочен со следующего дня', () => {
    expect(dueDayMonth('2026-10-15T00:00:00Z')).toBe('15.10')
    expect(dueDayMonth(null)).toBe('')
    expect(isOverdue('2026-10-10T00:00:00Z', NOW)).toBe(false)
    expect(isOverdue('2026-10-09T00:00:00Z', NOW)).toBe(true)
  })

  it('состояние: чек главнее срока, аннулирован, оплачен, просрочен, акт', () => {
    const check = { id: 'f', fileName: 'c.pdf', sizeBytes: 1, createdAtUtc: '2026-10-08T00:00:00Z' }
    expect(invoiceState(inv({ dueDateUtc: '2026-10-01T00:00:00Z', paymentChecks: [check] }), NOW).key).toBe('checkReview')
    expect(invoiceState(inv({ dueDateUtc: '2026-10-01T00:00:00Z' }), NOW)).toEqual({ key: 'overdue', date: '01.10', tone: 'danger' })
    expect(invoiceState(inv({ dueDateUtc: '2026-10-20T00:00:00Z' }), NOW)).toEqual({ key: 'due', date: '20.10', tone: 'wait' })
    expect(invoiceState(inv({}), NOW).key).toBe('awaiting')
    expect(invoiceState(inv({ status: 2, paidAtUtc: null }), NOW)).toEqual({ key: 'paid', date: '', tone: 'done' })
    expect(invoiceState(inv({ status: 3 }), NOW).key).toBe('cancelled')
    expect(invoiceState(inv({ kind: 'act', status: 3 }), NOW).key).toBe('cancelled')
    expect(invoiceState(inv({ kind: 'act' }), NOW).key).toBe('act')
  })

  it('группы: аннулированные счета — в конце, черновики отсечены; по умолчанию — первый к оплате или первый в списке', () => {
    const g = groupInvoices([
      inv({ id: 'x', status: 3 }), inv({ id: 'p', status: 2 }), inv({ id: 'd', status: 0 }), inv({ id: 'a', kind: 'act', status: 3 }),
    ])
    expect(g.map((x) => [x.key, x.items.map((i) => i.id)])).toEqual([['paid', ['p']], ['acts', ['a']], ['cancelled', ['x']]])
    expect(defaultInvoiceId(g)).toBe('p')
    expect(defaultInvoiceId([])).toBeNull()
  })

  it('реквизиты: без БИН или ИИК — null; пустые прочие поля не показываются; получатель — краткое имя или полное', () => {
    const r = { companyName: 'ТОО «A»', shortName: '', bin: '1', bank: '', iik: 'KZ1', bik: 'B', kbe: '' }
    expect(requisiteRows(r)).toEqual([
      { key: 'recipient', value: 'ТОО «A»' }, { key: 'bin', value: '1' }, { key: 'iik', value: 'KZ1' }, { key: 'bik', value: 'B' },
    ])
    expect(requisiteRows({ ...r, iik: '  ' })).toBeNull()
    expect(requisiteRows(null)).toBeNull()
  })
})
