// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Import40DeclarationDto } from '@/api/import40'
import { dtoToForm, emptyDtForm, formToPayload, prefillFromClientCase, toIsoDate } from '../dtPayload'
import { caseDto, fullDto, fullGoodsDto } from './dtFixture'

// Поля DTO, которые форма не редактирует и в PUT не уходят (считает или ведёт сервер).
const SERVER_ONLY = new Set([
  'id', 'caseId', 'splitRole', 'splitSourceDeclarationId', 'isSplitReplaced', 'updatedAtUtc', 'svhCost', 'releasedAtUtc',
  'totalGoodsCount', 'totalPackagesCount', 'totalCustomsValue',
])
const LISTS = new Set(['goodsItems', 'doc44Items', 'prevDocItems', 'expenses', 'factPayments', 'borderTransportNumbers', 'arrivalTransportNumbers'])

describe('dtPayload — туда и обратно', () => {
  it('каждая графа шапки полного образца DTO доходит до тела PUT без изменений', () => {
    const dto = fullDto()
    const payload = formToPayload(dtoToForm(dto), dto.updatedAtUtc ?? null) as Record<string, unknown>
    const headerKeys = Object.keys(dto).filter((k) => !SERVER_ONLY.has(k) && !LISTS.has(k))
    expect(headerKeys.length).toBeGreaterThan(100)
    for (const k of headerKeys) {
      const expected = k === 'submissionDate' ? '2026-10-05' : (dto as unknown as Record<string, unknown>)[k]
      expect(payload[k], k).toEqual(expected)
    }
    expect(payload.expectedUpdatedAtUtc).toBe('2026-10-09T10:11:12.123456Z')
  })

  it('списки целиком: гр.44, гр.40, расходы, гр.B, транспорт', () => {
    const dto = fullDto()
    const p = formToPayload(dtoToForm(dto), null)
    const { id: _d, sortOrder: _s, ...doc44 } = dto.doc44Items[0]
    expect(p.doc44Items).toEqual([doc44])
    expect(p.prevDocItems).toEqual(dto.prevDocItems)
    expect(p.expenses).toEqual([{ expenseTypeCode: '17', amount: 300, currencyCode: 'USD' }])
    expect(p.factPayments).toEqual(dto.factPayments)
    expect(p.borderTransportNumbers).toEqual(dto.borderTransportNumbers)
    expect(p.arrivalTransportNumbers).toEqual(dto.arrivalTransportNumbers)
  })

  it('товар: invoiceValue ↔ customsValue, места packagesCount = cargoPlacesQuantity, остальное как есть', () => {
    const dto = fullDto()
    const form = dtoToForm(dto)
    const g = form.goodsItems[0]
    expect(g.customsValue).toBe(1500.5)
    expect('invoiceValue' in g).toBe(false)
    // места: приоритетное значение бэка — cargoPlacesQuantity (3), а не packagesCount (4)
    expect(g.packagesCount).toBe(3)
    expect(g.cargoPlacesQuantity).toBe(3)

    const sent = formToPayload(form, null).goodsItems![0] as Record<string, unknown>
    expect(sent.invoiceValue).toBe(1500.5)
    expect('customsValue' in sent).toBe(false)
    expect(sent.packagesCount).toBe(3)
    expect(sent.cargoPlacesQuantity).toBe(3)
    const { id: _i, sortOrder: _o, invoiceValue: _v, packagesCount: _p, cargoPlacesQuantity: _c, ...rest } = fullGoodsDto()
    for (const [k, v] of Object.entries(rest)) expect(sent[k], k).toEqual(v)
  })

  it('видимое поле мест в форме — источник для обоих полей товара', () => {
    const form = dtoToForm(fullDto())
    form.goodsItems[0].packagesCount = 9
    const sent = formToPayload(form, null).goodsItems![0]
    expect(sent.packagesCount).toBe(9)
    expect(sent.cargoPlacesQuantity).toBe(9)
  })

  it('загрузка не делит объекты с DTO (правка формы не трогает ответ сервера)', () => {
    const dto = fullDto()
    const form = dtoToForm(dto)
    form.sender!.name = 'X'
    form.goodsItems[0].payments![0].amountKzt = 999
    form.borderTransportNumbers![0].number = 'Z'
    expect(dto.sender!.name).toBe('SENDER CO')
    expect(dto.goodsItems[0].payments![0].amountKzt).toBe(3)
    expect(dto.borderTransportNumbers![0].number).toBe('A123BC')
  })
})

describe('dtPayload — пустые значения', () => {
  it("'' → null во всех строковых графах; ключи шапки не пропадают (явный null очищает графу)", () => {
    const form = emptyDtForm()
    form.id = 'dt1'
    for (const [k, v] of Object.entries(form)) {
      if (typeof v === 'string' && k !== 'id') (form as unknown as Record<string, unknown>)[k] = ''
    }
    const payload = formToPayload(form, null) as Record<string, unknown>
    const json = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>
    for (const k of Object.keys(form)) {
      if (k === 'id') continue
      expect(k in json, `ключ ${k} должен уйти в PUT`).toBe(true)
      const v = (form as unknown as Record<string, unknown>)[k]
      if (v === '') expect(json[k], k).toBeNull()
    }
    expect(json.declarationNumber).toBeNull()
    expect(json.submissionDate).toBeNull()
  })

  it('0 в числовых графах остаётся 0', () => {
    const form = dtoToForm(fullDto({ exchangeRate: 0, totalInvoiceValue: 0, sheetNumber: 0, shippingSpecSheets: 0 }))
    const p = formToPayload(form, null)
    expect(p.exchangeRate).toBe(0)
    expect(p.totalInvoiceValue).toBe(0)
    expect(p.sheetNumber).toBe(0)
    expect(p.shippingSpecSheets).toBe(0)
  })

  it('пустая ДТ с сервера → значения по умолчанию формы, дата гр.А — сегодня', () => {
    const bare = { id: 'dt2', caseId: 'c', declarationNumber: null, corridor: null, procedureCode: null } as unknown as Import40DeclarationDto
    const form = dtoToForm(bare, '2026-10-09')
    expect(form.id).toBe('dt2')
    expect(form.declarationNumber).toBe('')
    expect(form.corridor).toBe('green')
    expect(form.declarationTypeCode).toBe('ИМ')
    expect(form.rateType).toBe('ETT')
    expect(form.goodsLocationCountryCode).toBe('KZ')
    expect(form.borderTransportNationality).toBe('KZ')
    expect(form.arrivalTransportNationality).toBe('KZ')
    expect(form.submissionDate).toBe('2026-10-09')
    expect(form.sender).toEqual({ name: null, countryCode: null, region: null, city: null, street: null })
    expect(form.goodsItems).toEqual([])
    expect(form.dtsFreeOfCharge).toBe(false)
  })

  it('дата гр.А — префикс ISO без сдвига часового пояса', () => {
    expect(toIsoDate('2026-09-23T00:00:00Z')).toBe('2026-09-23')
    expect(toIsoDate('2026-09-23')).toBe('2026-09-23')
    expect(toIsoDate(null)).toBeNull()
    expect(toIsoDate('')).toBeNull()
  })
})

describe('prefillFromClientCase — только пустые графы', () => {
  const bare = () => dtoToForm({
    id: 'dt2', caseId: 'c', declarationNumber: '', corridor: 'green', procedureCode: '',
  } as unknown as Import40DeclarationDto, '2026-10-09')
  const kase = caseDto({
    clientSenderName: 'SENDER FROM CLIENT', clientSenderCountryCode: 'CN', clientReceiverName: 'RECEIVER',
    clientReceiverBin: '999', clientReceiverCountryCode: 'KZ', clientCurrencyCode: 'EUR', clientEstimatedValue: 777,
  } as never)

  it('заполняет пустые гр.2, гр.8 и гр.22', () => {
    const form = bare()
    prefillFromClientCase(form, kase)
    expect(form.sender).toMatchObject({ name: 'SENDER FROM CLIENT', countryCode: 'CN' })
    expect(form.receiver).toMatchObject({ name: 'RECEIVER', countryCode: 'KZ' })
    expect(form.receiverBin).toBe('999')
    expect(form.currency).toBe('EUR')
    expect(form.totalInvoiceValue).toBe(777)
  })

  it('заполненное не трогает; гр.8 не трогает при «получатель = декларант»', () => {
    const form = dtoToForm(fullDto())
    prefillFromClientCase(form, kase)
    expect(form.sender!.name).toBe('SENDER CO')
    expect(form.currency).toBe('USD')
    const f2 = bare()
    f2.consigneeEqualsDeclarant = true
    prefillFromClientCase(f2, kase)
    expect(f2.receiver!.name).toBeNull()
    expect(f2.receiverBin).toBeNull()
  })
})
