import { describe, expect, it } from 'vitest'
import type { BrokerInvoice } from '@/api/billing'
import {
  billingExcelRows, billingStats, docTitle, filterBilling, isOverdue, menuActions, overdueDays, pdfFileName,
  primaryAction, statusCounts, statusTone,
} from '../billing'

const inv = (o: Partial<BrokerInvoice>): BrokerInvoice => ({
  id: 'i', clientId: 'c', clientName: 'ТОО «Альфа»', caseId: null, caseNumber: null, kind: 'invoice', status: 1,
  number: '0214', year: 2026, issuedAtUtc: '2026-10-06T05:00:00Z', dueDateUtc: null, paidAtUtc: null,
  vatRate: 12, subtotal: 0, vatAmount: 0, total: 1000, note: '', createdAtUtc: '2026-10-05T05:00:00Z', lines: [], paymentChecks: [],
  ...o,
})
const check = { id: 'f', fileName: 'chek.pdf', sizeBytes: 10, createdAtUtc: '2026-10-07T05:00:00Z' }
const NOW = new Date(2026, 9, 15, 12, 0) // 15.10.2026, местное время
const tr = (k: string, p?: Record<string, unknown>) => (p ? `${k}${JSON.stringify(p)}` : k)

describe('billing: главная кнопка и меню', () => {
  it('черновик — «Выставить»; меню: PDF и удаление', () => {
    const r = inv({ status: 0, number: '', issuedAtUtc: null })
    expect(primaryAction(r)).toBe('issue')
    expect(menuActions(r, true)).toEqual(['pdf', 'delete'])
  })
  it('выставленный счёт с чеком — «Отметить оплату»; в меню «Напомнить» и «Аннулировать»', () => {
    const r = inv({ paymentChecks: [check] })
    expect(primaryAction(r)).toBe('markPaid')
    expect(menuActions(r, true)).toEqual(['pdf', 'remind', 'cancel'])
  })
  it('выставленный счёт без чека — «Напомнить»; в меню «Отметить оплату»', () => {
    const r = inv({})
    expect(primaryAction(r)).toBe('remind')
    expect(menuActions(r, true)).toEqual(['pdf', 'markPaid', 'cancel'])
  })
  it('выставленный акт — «Отметить оплату», напоминания нет', () => {
    const r = inv({ kind: 'act' })
    expect(primaryAction(r)).toBe('markPaid')
    expect(menuActions(r, true)).toEqual(['pdf', 'cancel'])
  })
  it('оплаченный — без главной, меню: PDF и «Аннулировать»; аннулированный — только PDF', () => {
    expect(primaryAction(inv({ status: 2 }))).toBeNull()
    expect(menuActions(inv({ status: 2 }), true)).toEqual(['pdf', 'cancel'])
    expect(primaryAction(inv({ status: 3 }))).toBeNull()
    expect(menuActions(inv({ status: 3 }), true)).toEqual(['pdf'])
  })
  it('без права записи — только PDF', () => {
    for (const r of [inv({ status: 0 }), inv({}), inv({ paymentChecks: [check] }), inv({ status: 2 })]) {
      expect(menuActions(r, false)).toEqual(['pdf'])
    }
  })
})

describe('billing: просрочка', () => {
  it('выставлен, срок вчера — просрочен на 1 день; сегодня — ещё нет', () => {
    expect(isOverdue(inv({ dueDateUtc: '2026-10-14T00:00:00Z' }), NOW)).toBe(true)
    expect(overdueDays(inv({ dueDateUtc: '2026-10-14T00:00:00Z' }), NOW)).toBe(1)
    expect(overdueDays(inv({ dueDateUtc: '2026-10-05T00:00:00Z' }), NOW)).toBe(10)
    expect(isOverdue(inv({ dueDateUtc: '2026-10-15T00:00:00Z' }), NOW)).toBe(false)
    expect(overdueDays(inv({ dueDateUtc: '2026-10-15T00:00:00Z' }), NOW)).toBe(0)
  })
  it('оплаченный, черновик, без срока — не просрочен', () => {
    expect(isOverdue(inv({ status: 2, dueDateUtc: '2026-10-01T00:00:00Z' }), NOW)).toBe(false)
    expect(isOverdue(inv({ status: 0, dueDateUtc: '2026-10-01T00:00:00Z' }), NOW)).toBe(false)
    expect(isOverdue(inv({ dueDateUtc: null }), NOW)).toBe(false)
  })
})

describe('billing: фильтры и счётчики', () => {
  const rows = [
    inv({ id: '1', number: '0214', clientName: 'ТОО «Altyn Med»', caseNumber: 'ИМ-2026-0170' }),
    inv({ id: '2', status: 0, number: '', clientName: 'ТОО «Steppe»', note: 'за ДТ' }),
    inv({ id: '3', kind: 'act', status: 2, number: '0098', clientName: 'ТОО «Altyn Med»' }),
    inv({ id: '4', status: 3, number: '0205', clientName: 'ИП «Елубаев»' }),
  ]
  const ids = (l: BrokerInvoice[]) => l.map((r) => r.id)
  it('поиск: клиент, «N/ГГГГ», заявка, заметка', () => {
    expect(ids(filterBilling(rows, 'altyn', 'all', 'all'))).toEqual(['1', '3'])
    expect(ids(filterBilling(rows, '0214/2026', 'all', 'all'))).toEqual(['1'])
    expect(ids(filterBilling(rows, '0170', 'all', 'all'))).toEqual(['1'])
    expect(ids(filterBilling(rows, 'за дт', 'all', 'all'))).toEqual(['2'])
  })
  it('вид и статус, включая аннулированные', () => {
    expect(ids(filterBilling(rows, '', 'act', 'all'))).toEqual(['3'])
    expect(ids(filterBilling(rows, '', 'invoice', 'all'))).toEqual(['1', '2', '4'])
    expect(ids(filterBilling(rows, '', 'all', 'cancelled'))).toEqual(['4'])
    expect(ids(filterBilling(rows, '', 'all', 'draft'))).toEqual(['2'])
  })
  it('счётчики статусов — по поиску и виду', () => {
    expect(statusCounts(rows, '', 'all')).toEqual({ all: 4, draft: 1, issued: 1, paid: 1, cancelled: 1 })
    expect(statusCounts(rows, '', 'invoice')).toEqual({ all: 3, draft: 1, issued: 1, paid: 0, cancelled: 1 })
    expect(statusCounts(rows, 'altyn', 'all')).toEqual({ all: 2, draft: 0, issued: 1, paid: 1, cancelled: 0 })
  })
})

describe('billing: показатели', () => {
  it('суммы только по счетам (акты не входят); черновики — все; просроченные', () => {
    const s = billingStats([
      inv({ total: 96000, paymentChecks: [check] }),
      inv({ total: 72000, dueDateUtc: '2026-10-13T00:00:00Z' }),
      inv({ status: 2, total: 50000 }),
      inv({ kind: 'act', status: 2, total: 86400 }),
      inv({ kind: 'act', status: 1, total: 10000 }),
      inv({ status: 0, total: 118500 }),
      inv({ kind: 'act', status: 0, total: 1 }),
      inv({ status: 3, total: 30000 }),
    ], NOW)
    expect(s).toEqual({
      issuedSum: 218000, issuedCount: 3, paidSum: 50000, paidCount: 1,
      awaitingSum: 168000, awaitingCount: 2, overdueCount: 1, drafts: 2,
    })
  })
})

describe('billing: подписи, тон, файлы, Excel', () => {
  it('документ: «Счёт № N/ГГГГ», «Акт № …», черновик', () => {
    expect(docTitle(inv({}), tr)).toBe('broker.billing.doc.invoice{"no":"0214/2026"}')
    expect(docTitle(inv({ kind: 'act', number: '0098' }), tr)).toBe('broker.billing.doc.act{"no":"0098/2026"}')
    expect(docTitle(inv({ number: '' }), tr)).toBe('broker.billing.doc.draft')
    expect(docTitle(inv({ kind: 'act', number: '' }), tr)).toBe('broker.billing.doc.draftAct')
  })
  it('тон статуса: 0 neutral, 1 info, 2 done, 3 danger', () => {
    expect([0, 1, 2, 3].map(statusTone)).toEqual(['neutral', 'info', 'done', 'danger'])
  })
  it('имя PDF — как раньше', () => {
    expect(pdfFileName(inv({}), tr)).toBe('broker.billing.file.invoice-0214.pdf')
    expect(pdfFileName(inv({ kind: 'act', number: '' }), tr)).toBe('broker.billing.file.act-broker.billing.file.draft.pdf')
  })
  it('Excel: колонки и порядок как раньше', () => {
    const [row] = billingExcelRows([inv({ caseNumber: 'ИМ-1', vatAmount: 107, paidAtUtc: '2026-10-07T05:00:00Z' })], tr, (s) => `st${s}`)
    expect(Object.keys(row)).toEqual([
      'billing.colDoc', 'broker.billing.xls.number', 'billing.colClient', 'billing.case', 'billing.colStatus',
      'billing.colTotal', 'billing.vat', 'billing.issuedAtCol', 'billing.paidAtCol',
    ])
    expect(Object.values(row)).toEqual(['billing.invoice', '0214/2026', 'ТОО «Альфа»', 'ИМ-1', 'st1', 1000, 107, '06.10.2026', '07.10.2026'])
  })
})
