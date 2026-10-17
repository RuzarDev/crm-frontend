import { describe, expect, it } from 'vitest'
import ru from '@/i18n/locales/ru'
import kk from '@/i18n/locales/kk'
import en from '@/i18n/locales/en'
import {
  applyContractToDoc44, checkText, deadlineHint, deliveredPercent, emptyFields, fieldErrors, fieldsOf, filterContracts, money,
  paymentErrors, urgentDeadline,
} from '../contracts'
import { contract } from './contractFixture'

const t = (key: string, p?: Record<string, unknown>) => `${key}${p ? JSON.stringify(p) : ''}`

describe('contracts: логика', () => {
  it('суммы — 2 знака и код валюты', () => {
    expect(money('ru', 1234.5, 'USD')).toMatch(/^1\s234,50 USD$/)
    expect(money('en', 1234.5, 'EUR')).toBe('1,234.50 EUR')
    expect(money('ru', null, 'USD')).toBe('—')
  })

  it('срочный срок — ближайший из «скоро / сегодня / просрочен»', () => {
    const c = contract({ deadlines: [
      { kind: 'end', date: '2026-12-31', daysLeft: 75, state: 'ok' },
      { kind: 'unkRemoval', date: '2026-10-20', daysLeft: 3, state: 'soon' },
      { kind: 'repatriation', date: '2026-10-10', daysLeft: -7, state: 'overdue' },
    ] })
    expect(urgentDeadline(c)?.kind).toBe('repatriation')
    expect(urgentDeadline(contract({ deadlines: [{ kind: 'end', date: '2027-01-01', daysLeft: 90, state: 'ok' }] }))).toBeNull()
    expect(urgentDeadline(contract({ deadlines: [{ kind: 'repatriation', date: '2026-10-10', daysLeft: -7, state: 'done' }] }))).toBeNull()
  })

  it('подпись срока', () => {
    expect(deadlineHint({ kind: 'end', date: '', daysLeft: 5, state: 'soon' }, t)).toBe('foreignContracts.hint.left{"n":5}')
    expect(deadlineHint({ kind: 'end', date: '', daysLeft: 0, state: 'today' }, t)).toBe('foreignContracts.hint.today')
    expect(deadlineHint({ kind: 'end', date: '', daysLeft: -2, state: 'overdue' }, t)).toBe('foreignContracts.hint.overdue{"n":2}')
    expect(deadlineHint({ kind: 'unkRemoval', date: '', daysLeft: -2, state: 'done' }, t)).toBe('foreignContracts.deadlineDone.unkRemoval')
  })

  it('доля поставленного — 0…100', () => {
    expect(deliveredPercent(contract())).toBe(11)
    expect(deliveredPercent(contract({ balance: { ...contract().balance, delivered: 250000 } }))).toBe(100)
  })

  it('поиск по номеру, поставщику, УНК', () => {
    const list = [contract(), contract({ id: 'k2', number: 'X-9', supplierName: 'Acme', unkNumber: null })]
    expect(filterContracts(list, 'acme').map((c) => c.id)).toEqual(['k2'])
    expect(filterContracts(list, '26010001').map((c) => c.id)).toEqual(['k1'])
    expect(filterContracts(list, ' ')).toHaveLength(2)
  })

  it('проверка формы — те же правила, что на сервере', () => {
    expect(Object.keys(fieldErrors(emptyFields())).sort()).toEqual(['amount', 'contractDate', 'currency', 'number', 'supplierCountryCode', 'supplierName'])
    const f = fieldsOf(contract())
    expect(fieldErrors(f)).toEqual({})
    expect(fieldErrors({ ...f, validUntil: '2025-01-01', repatriationDeadline: '2025-01-01' })).toEqual({
      validUntil: 'foreignContracts.form.beforeContract', repatriationDeadline: 'foreignContracts.form.beforeContract',
    })
    expect(fieldErrors({ ...f, unkNumber: ' ', unkRemovedOn: '2026-05-01' }).unkRemovedOn).toBe('foreignContracts.form.unkFirst')
    expect(paymentErrors({ paidOn: '2026-10-18', amount: 0, currency: 'USD', note: '' }, '2026-10-17')).toEqual({
      paidOn: 'foreignContracts.payment.notFuture', amount: 'foreignContracts.form.amountPositive',
    })
  })

  it('тексты сверки — по коду, со своими числами', () => {
    const c = contract()
    const base = { declarationId: 'd1', declarationNumber: '123', text: 'srv', value: 10, currency: 'EUR', valueInContractCurrency: 11, remaining: -5 }
    expect(checkText({ ...base, code: 'currencyDiffers' }, c, t, 'en')).toContain('"cur":"EUR"')
    expect(checkText({ ...base, code: 'exceedsRemaining' }, c, t, 'en')).toContain('"remaining":"0.00 USD"')
    expect(checkText({ ...base, code: 'afterContractEnd', declarationId: null }, c, t, 'en')).toContain('"who":"foreignContracts.check.case"')
  })

  it('гр.44 из контракта: дописывает 03011 и 03031, существующие — переписывает', () => {
    const items: { docTypeCode: string | null; docTypeName?: string | null; docNumber: string | null; docDate: string | null; appliesToAll?: boolean | null; presentKindCode?: string }[] = [
      { docTypeCode: '03011', docNumber: 'OLD', docDate: '2025-01-01T00:00:00Z' },
    ]
    const row = () => ({ docTypeCode: null, docNumber: null, docDate: null, presentKindCode: '0' })
    expect(applyContractToDoc44(items, contract(), () => 'УЧЕТНЫЙ НОМЕР', row)).toBe(2)
    expect(items[0]).toMatchObject({ docTypeCode: '03011', docNumber: 'FC-1', docDate: '2026-01-15' })
    expect(items[1]).toMatchObject({ docTypeCode: '03031', docTypeName: 'УЧЕТНЫЙ НОМЕР', docNumber: '26010001/0001/1/1', appliesToAll: true, presentKindCode: '0' })
    expect(applyContractToDoc44(items, contract(), () => null, row)).toBe(0)
    const noUnk: typeof items = []
    expect(applyContractToDoc44(noUnk, contract({ unkNumber: null }), () => null, row)).toBe(1)
    expect(noUnk[0].docTypeName).toBe('ДОГОВОР (КОНТРАКТ)')
  })

  it('тексты на трёх языках — одни и те же ключи', () => {
    const keys = (o: unknown, p = ''): string[] => (o && typeof o === 'object'
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, `${p}${k}.`))
      : [p])
    const of = (loc: unknown) => (loc as { foreignContracts: unknown }).foreignContracts
    const ruKeys = keys(of(ru)).sort()
    expect(keys(of(kk)).sort()).toEqual(ruKeys)
    expect(keys(of(en)).sort()).toEqual(ruKeys)
    for (const loc of [ru, kk, en]) {
      expect((loc as unknown as { shell: { client: { contracts: string } } }).shell.client.contracts).toBeTruthy()
    }
  })
})
