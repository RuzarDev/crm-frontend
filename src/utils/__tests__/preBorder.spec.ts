import { describe, expect, it } from 'vitest'
import type { PreBorder } from '@/api/preBorder'
import {
  checkSerial, checkSerialList, luhnValid, missingText, preBorderErrors, preBorderSubstages, serialsFromSheet, serialsFromText, showPreBorder,
  emptyPreBorderFields,
} from '@/utils/preBorder'
import { askFor, shipmentTag, tabOf } from '@/views/client/shipment'
import type { ClientShipment } from '@/api/clientShipments'

const t = (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k)

const pb = (p: Partial<PreBorder> = {}): PreBorder => ({
  caseId: 'c1', started: true, canEdit: true, status: 1, transportMode: 1, supplierPaymentDeferred: false, payments: [], availablePayments: [],
  loadingDate: null, loadingCity: null, loadingWarehouse: null, sealNumbers: null, photos: [], serialCount: 0, imeiCount: 0,
  carrierId: null, carrierName: null, carrierArchived: false, vehicleNumber: '', trailerNumber: '', containerNumber: null, wagonNumber: '',
  expectedBorderDate: null, marks: [], borderArrivedAtUtc: null, borderArrivalPost: null, missing: [], updatedAtUtc: null, ...p,
})

describe('IMEI и серийные номера', () => {
  it('Луна: верная и неверная контрольная цифра', () => {
    expect(luhnValid('490154203237518')).toBe(true)
    expect(luhnValid('352099001761481')).toBe(true)
    expect(luhnValid('490154203237519')).toBe(false)
    expect(luhnValid('49015420323751x')).toBe(false)
  })

  it('auto: 15 цифр — IMEI с проверкой, иное — серийный номер', () => {
    expect(checkSerial(' 49 0154 203237518 ', 'auto')).toEqual({ value: '490154203237518', kind: 'imei', error: null })
    expect(checkSerial('490154203237519', 'auto').error).toBe('imeiChecksum')
    expect(checkSerial('sn-ab12/7', 'auto')).toEqual({ value: 'SN-AB12/7', kind: 'serial', error: null })
    expect(checkSerial('ab#1', 'auto').error).toBe('format')
    expect(checkSerial('SN1', 'imei').error).toBe('imeiLength')
    expect(checkSerial('490154203237519', 'serial').error).toBeNull()
  })

  it('список: повтор указывает на первую строку, пустые пропускаются', () => {
    const rows = checkSerialList([{ line: 2, raw: 'A1' }, { line: 3, raw: '' }, { line: 4, raw: 'a1' }, { line: 5, raw: '490154203237519' }], 'auto')
    expect(rows.map((r) => [r.line, r.error, r.firstLine])).toEqual([[2, null, undefined], [4, 'duplicate', 2], [5, 'imeiChecksum', undefined]])
  })

  it('Excel: столбец по заголовку IMEI, номер строки — как в файле; число без экспоненты', () => {
    const sheet = [['Инвойс 12'], [], ['№', 'Модель', 'IMEI'], [1, 'X1', 490154203237518], [2, 'X1', '352099001761481'], [3, 'X1', null]]
    const r = serialsFromSheet(sheet)
    expect(r.header).toBe('IMEI')
    expect(r.items).toEqual([{ line: 4, raw: '490154203237518' }, { line: 5, raw: '352099001761481' }])
  })

  it('Excel без заголовка — первый непустой столбец; текст — по строкам и запятым', () => {
    expect(serialsFromSheet([[null, 'A1'], [null, 'A2']]).items).toEqual([{ line: 1, raw: 'A1' }, { line: 2, raw: 'A2' }])
    expect(serialsFromText('A1, A2\nA3').map((x) => [x.line, x.raw.trim()])).toEqual([[1, 'A1'], [1, 'A2'], [2, 'A3']])
  })
})

describe('подшаги до границы', () => {
  const now = new Date(2026, 9, 21, 12, 0)

  it('показываются у начатой или ещё не прошедшей границу, не у отменённой', () => {
    expect(showPreBorder(pb({ started: false, status: 1 }))).toBe(true)
    expect(showPreBorder(pb({ started: false, status: 3 }))).toBe(false)
    expect(showPreBorder(pb({ started: true, status: 3 }))).toBe(true)
    expect(showPreBorder(pb({ status: 9 }))).toBe(false)
  })

  it('недостающее до прибытия — ход клиента (золото)', () => {
    const s = preBorderSubstages(pb({ missing: ['payment', 'loading', 'transport', 'eta'] }), t, now)
    expect(s.map((x) => [x.key, x.state, x.tone])).toEqual([
      ['pay', 'current', 'ask'], ['load', 'current', 'ask'], ['transit', 'current', 'ask'], ['arrival', 'todo', 'future'],
    ])
  })

  it('заполнено и прибыла: всё пройдено, у прибытия — пост', () => {
    const s = preBorderSubstages(pb({
      payments: [{ id: 'p', contractId: 'k', contractNumber: 'FC-1', supplierName: 'S', paidOn: '2026-10-01', amount: 1, currency: 'USD', note: null, contractArchived: false }],
      loadingDate: '2026-10-10', loadingCity: 'Урумчи', vehicleNumber: '123', expectedBorderDate: '2026-10-20',
      marks: [{ id: 'm', atUtc: '2026-10-15T05:00:00Z', place: 'Хоргос', comment: null, byClient: true, canDelete: true }],
      borderArrivedAtUtc: '2026-10-20T05:00:00Z', borderArrivalPost: 'Нур Жолы',
    }), t, now)
    expect(s.every((x) => x.state === 'done')).toBe(true)
    expect(s[1]!.caption).toContain('Урумчи')
    expect(s[3]!.caption).toContain('Нур Жолы')
  })

  it('погрузка в будущем — идёт, в пути — с ожидаемой датой', () => {
    const s = preBorderSubstages(pb({ supplierPaymentDeferred: true, loadingDate: '2026-10-25', vehicleNumber: '1', expectedBorderDate: '2026-10-30' }), t, now)
    expect(s[0]!.caption).toBe('preBorder.sub.payDeferred')
    expect(s[1]!.state).toBe('current')
    expect(s[2]!.state).toBe('todo')
    expect(s[2]!.caption).toContain('30.10')
  })

  it('форма: прибытие раньше погрузки — ошибка', () => {
    expect(preBorderErrors({ ...emptyPreBorderFields(), loadingDate: '2026-10-10', expectedBorderDate: '2026-10-01' }).expectedBorderDate).toBeTruthy()
    expect(missingText(['payment', 'eta'], t)).toBe('preBorder.missing.payment, preBorder.missing.eta')
  })
})

describe('«Нужно от вас» по поставке до границы', () => {
  const ship = (p: Partial<ClientShipment> = {}): ClientShipment => ({
    id: 's', number: 'N', cargo: '', post: '', status: 1, step: 2, isProblem: false, problemClientMessage: '', returnReason: '',
    senderCountryCode: '', estimatedValue: null, currencyCode: '', svhInvoiceAmount: null, svhInvoiceNumber: '', paymentCheckUploaded: false,
    paymentConfirmed: false, declarationsCount: 0, assignedDeclarantName: null, createdAtUtc: '', updatedAtUtc: '', ...p,
  } as ClientShipment)

  it('только на границе с недостающим; самое слабое', () => {
    expect(askFor(ship())).toBeNull()
    expect(askFor(ship({ preBorderMissing: ['eta'] }))).toBe('preBorder')
    expect(tabOf(ship({ preBorderMissing: ['eta'] }))).toBe('waiting')
    expect(shipmentTag(ship({ preBorderMissing: ['eta'] })).key).toBe('preBorder')
    expect(askFor(ship({ preBorderMissing: ['eta'], isProblem: true }))).toBe('problem')
    expect(askFor(ship({ status: 2, preBorderMissing: ['eta'] }))).toBeNull()
  })
})
