import { describe, expect, it } from 'vitest'
import { invoiceForm, type CarrierInvoice } from '@/api/carriers'
import {
  carrierErrors, emptyCarrier, emptyInsurance, emptyInvoice, hasInsurance, insuranceErrors, invoiceErrors, invoiceTotals,
} from '../carriers'
import { contractHint } from '../contractHint'

const t = (key: string, p?: Record<string, unknown>) => (p ? `${key}:${JSON.stringify(p)}` : key)
const inv = (p: Partial<CarrierInvoice>): CarrierInvoice => ({
  id: 'i', carrierId: 'k', carrierName: 'K', caseId: null, caseNumber: null, number: '1', invoiceDate: '2026-09-12', amount: 1, currency: 'USD',
  isPaid: false, paidOn: null, note: null, file: null, rate: null, amountKzt: null, rateOfficial: false, createdAtUtc: '', addedByClient: true, ...p,
})

describe('carriers: проверки формы', () => {
  it('перевозчик: название и страна обязательны; БИН/ИИН — 12 цифр только для Казахстана; почта', () => {
    expect(carrierErrors(emptyCarrier())).toEqual({ name: 'carriers.form.required', countryCode: 'carriers.form.required' })
    const kz = { ...emptyCarrier(), name: 'A', countryCode: '398', regNumber: '12345' }
    expect(carrierErrors(kz).regNumber).toBe('carriers.form.binFormat')
    expect(carrierErrors({ ...kz, regNumber: '123456789012' })).toEqual({})
    expect(carrierErrors({ ...kz, countryCode: '156', regNumber: '91650100MA7' })).toEqual({})
    expect(carrierErrors({ ...kz, regNumber: '', email: 'bad' }).email).toBe('carriers.form.emailFormat')
  })

  it('счёт: номер, дата не позже сегодня, сумма > 0, валюта; дата оплаты не в будущем', () => {
    expect(invoiceErrors(emptyInvoice(), '2026-10-21')).toEqual({
      number: 'carriers.form.required', invoiceDate: 'carriers.form.required', amount: 'carriers.form.amountPositive', currency: 'carriers.form.required',
    })
    const ok = { ...emptyInvoice('c1'), number: 'FR-1', invoiceDate: '2026-10-20', amount: 10, currency: 'USD' }
    expect(invoiceErrors(ok, '2026-10-21')).toEqual({})
    expect(invoiceErrors({ ...ok, invoiceDate: '2026-10-22' }, '2026-10-21').invoiceDate).toBe('carriers.form.notFuture')
    expect(invoiceErrors({ ...ok, isPaid: true, paidOn: '2026-10-25' }, '2026-10-21').paidOn).toBe('carriers.form.notFuture')
  })

  it('страховка: сумма без валюты — ошибка; hasInsurance', () => {
    expect(insuranceErrors(emptyInsurance())).toEqual({})
    expect(insuranceErrors({ ...emptyInsurance(), insuredAmount: 100 }).insuredCurrency).toBe('carriers.form.required')
    expect(insuranceErrors({ ...emptyInsurance(), premiumAmount: 5 }).premiumCurrency).toBe('carriers.form.required')
    expect(hasInsurance(null)).toBe(false)
    expect(hasInsurance({ caseId: 'c', insurer: null, policyNumber: 'P', insuredAmount: null, insuredCurrency: null, premiumAmount: null, premiumCurrency: null, file: null, updatedAtUtc: null, canEdit: true })).toBe(true)
  })
})

describe('carriers: итоги и подписи', () => {
  it('итог счетов в тенге без счетов без курса, неоплаченные отдельно', () => {
    expect(invoiceTotals([
      inv({ amountKzt: 500000.005, isPaid: false }), inv({ amountKzt: 100, isPaid: true }), inv({ amountKzt: null }),
    ])).toEqual({ totalKzt: 500100.01, unpaidKzt: 500000.01, noRate: 1 })
  })

  it('срок договора перевозки', () => {
    const ref = { id: 'd', number: 'D', title: null, issuedOn: null, isArchived: false, fileCount: 1 }
    expect(contractHint({ ...ref, validUntil: null, status: 'unlimited', daysLeft: null }, t)).toBe('carriers.contract.unlimited')
    expect(contractHint({ ...ref, validUntil: '2026-10-31', status: 'expiring', daysLeft: 10 }, t)).toBe('carriers.contract.expiring:{"n":10}')
    expect(contractHint({ ...ref, validUntil: '2026-10-21', status: 'expiring', daysLeft: 0 }, t)).toBe('carriers.contract.today')
    expect(contractHint({ ...ref, validUntil: '2026-01-01', status: 'expired', daysLeft: -293 }, t)).toBe('carriers.contract.expired:{"date":"01.01.2026"}')
    expect(contractHint({ ...ref, validUntil: '2027-01-01', status: 'active', daysLeft: 72 }, t)).toBe('carriers.contract.until:{"date":"01.01.2027"}')
  })

  it('форма нового счёта: поля как у сервера, дата оплаты только у оплаченного, файл', () => {
    const file = new File(['x'], 'fr.pdf', { type: 'application/pdf' })
    const f = invoiceForm({ ...emptyInvoice('c1'), number: ' FR-1 ', invoiceDate: '2026-09-12', amount: 1000.5, currency: 'USD', paidOn: '2026-09-13' }, file)
    expect(f.get('number')).toBe('FR-1')
    expect(f.get('amount')).toBe('1000.5')
    expect(f.get('isPaid')).toBe('false')
    expect(f.get('paidOn')).toBeNull()
    expect(f.get('caseId')).toBe('c1')
    expect((f.get('file') as File).name).toBe('fr.pdf')
  })
})
