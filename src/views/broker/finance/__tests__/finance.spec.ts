import { describe, expect, it } from 'vitest'
import type { FinanceRow } from '@/api/manage'
import ru from '@/i18n/locales/ru'
import {
  FINANCE_FILTERS, filterCounts, filterFinance, financeExcelRows, hasInvoice, isAwaitingAqniet, matchesFinance,
  paymentLabel, paymentState, paymentTone, stageTone,
} from '../finance'

const row = (o: Partial<FinanceRow>): FinanceRow => ({
  caseId: 'c', number: 'ИМ-2026-0001', clientName: 'ТОО «Клиент»', cargo: 'товар', status: 3, isProblem: false,
  svhInvoiceNote: '', svhInvoiceAmount: null, svhInvoiceNumber: '', invoicedAtUtc: null,
  paymentConfirmed: false, paidAtUtc: null, hasPaymentCheck: false,
  customsPaymentsKzt: 0, declarationsCount: 0, createdAtUtc: '2026-10-01T05:00:00Z', updatedAtUtc: '2026-10-01T05:00:00Z', files: [],
  ...o,
})
const ROWS = [
  row({ caseId: 'a', number: 'ИМ-2026-0170', clientName: 'ТОО «Altyn Med»', cargo: 'медицинские перчатки', status: 6, invoicedAtUtc: '2026-10-03T05:00:00Z', svhInvoiceAmount: 312400, hasPaymentCheck: true }),
  row({ caseId: 'b', number: 'ИМ-2026-0173', clientName: 'ТОО «Steppe Agro»', cargo: 'запчасти к тракторам', status: 6, invoicedAtUtc: '2026-10-02T05:00:00Z' }),
  row({ caseId: 'c', number: 'ИМ-2026-0161', clientName: 'ТОО «Казахмыс Трейд»', cargo: 'мониторы', status: 8, invoicedAtUtc: '2026-09-24T05:00:00Z', paymentConfirmed: true, paidAtUtc: '2026-09-27T05:00:00Z' }),
  row({ caseId: 'd', number: 'ИМ-2026-0158', clientName: 'ТОО «Алатау Строй»', cargo: 'станки токарные', status: 7, invoicedAtUtc: '2026-09-22T05:00:00Z', paymentConfirmed: true, paidAtUtc: '2026-09-25T05:00:00Z' }),
  row({ caseId: 'e', number: 'ИМ-2026-0149', clientName: 'ТОО «Отмена»', cargo: 'ткань', status: 9 }),
  row({ caseId: 'f', number: 'ИМ-2026-0150', clientName: 'ТОО «Новая»', cargo: 'ткань', status: 6, paymentConfirmed: false }),
]
const ids = (rs: FinanceRow[]) => rs.map((r) => r.caseId)

describe('фильтры оплаты', () => {
  it('порядок сегментов', () => {
    expect(FINANCE_FILTERS).toEqual(['all', 'awaiting', 'paid', 'invoiced'])
  })
  it('ждут оплаты — статус 6 без подтверждённой оплаты; оплачено — подтверждена; счёт выставлен — дата или статус от 6', () => {
    expect(ids(filterFinance(ROWS, '', 'awaiting'))).toEqual(['a', 'b', 'f'])
    expect(ids(filterFinance(ROWS, '', 'paid'))).toEqual(['c', 'd'])
    expect(ids(filterFinance(ROWS, '', 'invoiced'))).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(filterFinance(ROWS, '', 'all')).toHaveLength(6)
  })
  it('счёт выставлен: статус ниже 6 с датой выставления тоже подходит, без даты — нет', () => {
    expect(filterFinance([row({ caseId: 'x', status: 3, invoicedAtUtc: '2026-10-01T00:00:00Z' })], '', 'invoiced')).toHaveLength(1)
    expect(filterFinance([row({ caseId: 'y', status: 3 })], '', 'invoiced')).toHaveLength(0)
  })
  it('поиск: номер, клиент, груз; без учёта регистра и пробелов', () => {
    expect(matchesFinance('altyn', ROWS[0])).toBe(true)
    expect(matchesFinance('ИМ-2026-0173', ROWS[1])).toBe(true)
    expect(matchesFinance('ПЕРЧАТКИ', ROWS[0])).toBe(true)
    expect(matchesFinance('им-2026- 0173', ROWS[1])).toBe(true)
    expect(matchesFinance('нет', ROWS[0])).toBe(false)
    expect(ids(filterFinance(ROWS, 'ткань', 'all'))).toEqual(['e', 'f'])
    expect(ids(filterFinance(ROWS, 'ткань', 'awaiting'))).toEqual(['f'])
  })
  it('счётчики учитывают поиск, но не сегмент', () => {
    expect(filterCounts(ROWS, '')).toEqual({ all: 6, awaiting: 3, paid: 2, invoiced: 6 })
    expect(filterCounts(ROWS, 'ткань')).toEqual({ all: 2, awaiting: 1, paid: 0, invoiced: 2 })
  })
  it('заявка ждёт счёта AQNIET — статус 7', () => {
    expect(ids(ROWS.filter(isAwaitingAqniet))).toEqual(['d'])
  })
})

describe('тон этапа', () => {
  it('проблема — danger; 6 и 7 — wait; 8 — done; 9 — neutral (не зелёный); прочее — info', () => {
    expect(stageTone({ status: 3, isProblem: true })).toBe('danger')
    expect(stageTone({ status: 8, isProblem: true })).toBe('danger')
    expect(stageTone({ status: 6, isProblem: false })).toBe('wait')
    expect(stageTone({ status: 7, isProblem: false })).toBe('wait')
    expect(stageTone({ status: 8, isProblem: false })).toBe('done')
    expect(stageTone({ status: 9, isProblem: false })).toBe('neutral')
    expect(stageTone({ status: 2, isProblem: false })).toBe('info')
    expect(stageTone({ status: 0, isProblem: false })).toBe('info')
  })
})

const t = (k: string, p?: Record<string, unknown>): string => {
  const parts = k.split('.')
  let v: unknown = ru
  for (const part of parts) v = (v as Record<string, unknown>)[part]
  return String(v).replace(/\{(\w+)\}/g, (_, n) => String(p?.[n] ?? ''))
}

describe('оплата', () => {
  it('оплачено → чек на проверке → ждёт оплаты (статус 6) → нет', () => {
    expect(paymentState(ROWS[2])).toEqual({ kind: 'paid', date: '2026-09-27T05:00:00Z' })
    expect(paymentState(ROWS[0])).toEqual({ kind: 'check' })
    expect(paymentState(ROWS[1])).toEqual({ kind: 'wait' })
    expect(paymentState(ROWS[4])).toEqual({ kind: 'none' })
    // оплата подтверждена главнее чека
    expect(paymentState(row({ paymentConfirmed: true, hasPaymentCheck: true })).kind).toBe('paid')
  })
  it('тон и подпись', () => {
    expect(paymentTone(paymentState(ROWS[2]))).toBe('done')
    expect(paymentTone(paymentState(ROWS[0]))).toBe('pay')
    expect(paymentTone(paymentState(ROWS[1]))).toBe('wait')
    expect(paymentTone(paymentState(ROWS[4]))).toBeNull()
    expect(paymentLabel(paymentState(ROWS[2]), t)).toBe('Оплачено 27.09.2026')
    expect(paymentLabel({ kind: 'paid', date: null }, t)).toBe('Оплачено')
    expect(paymentLabel(paymentState(ROWS[0]), t)).toBe('Чек на проверке')
    expect(paymentLabel(paymentState(ROWS[1]), t)).toBe('Ждёт оплаты')
    expect(paymentLabel(paymentState(ROWS[4]), t)).toBe('')
  })
  it('счёт есть, если есть дата выставления или заметка', () => {
    expect(hasInvoice(row({ invoicedAtUtc: '2026-10-01T00:00:00Z' }))).toBe(true)
    expect(hasInvoice(row({ svhInvoiceNote: 'счёт №5' }))).toBe(true)
    expect(hasInvoice(row({}))).toBe(false)
  })
})

describe('Excel', () => {
  it('13 колонок в прежнем порядке, значения по строке', () => {
    const [x] = financeExcelRows([ROWS[0]], (k) => t(k), (s) => `s${s}`)
    expect(Object.keys(x)).toEqual([
      'Номер', 'Клиент', 'Груз', 'Статус', 'Счёт СВХ, ₸', '№ счёта', 'Заметка по счёту', 'Счёт выставлен',
      'Оплата', 'Оплачено', 'Тамож. платежи гр.В, ₸', 'ДТ', 'Создана',
    ])
    expect(x['Номер']).toBe('ИМ-2026-0170')
    expect(x['Статус']).toBe('s6')
    expect(x['Счёт СВХ, ₸']).toBe(312400)
    expect(x['Счёт выставлен']).toBe('03.10.2026')
    expect(x['Оплата']).toBe('чек на проверке')
    expect(x['Оплачено']).toBe('')
  })
  it('оплата: оплачено / чек / ждёт оплаты / пусто; пустая сумма — пустая ячейка', () => {
    const rowsOut = financeExcelRows([ROWS[2], ROWS[0], ROWS[1], ROWS[4]], (k) => t(k), String)
    expect(rowsOut.map((r) => r['Оплата'])).toEqual(['оплачено', 'чек на проверке', 'ждёт оплаты', ''])
    expect(rowsOut[2]['Счёт СВХ, ₸']).toBe('')
    expect(rowsOut[0]['Оплачено']).toBe('27.09.2026')
  })
})
