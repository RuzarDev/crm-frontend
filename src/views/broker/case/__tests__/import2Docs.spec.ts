// Пакет «Импорт 2.0» (22.10.2026): шапка инвойса-упаковочного с графами ①…⑫ (образец «39th», обезличен) — стороны по
// полям, номер и дата инвойса, контракт с датой, условия поставки и «MADE IN …» под таблицей, гр. 44 из шапок, сверка
// мест с итогом документа; «2Consignee» старого разбора Zircon AI — не имя (правка 2.1); гр. 22 — сумма товаров (e2e-3).
import { describe, expect, it } from 'vitest'
import { goodsFromSheetRows, goodsSheetTotals } from '@/utils/goodsExcel'
import { applyExcelFallback, contractFrom, dateInText, docHeaderFrom, headerDocs, looksLikeLabel, placesCheckOf, type ExcelDoc } from '../steps/excelFallback'

const INVOICE_ROWS: unknown[][] = [
  ['Commercial Invoice'],
  ['①Shipper/Exporter', null, null, '②Consignee'],
  ['Example Machinery Import &Export Co; Ltd.\nRoom 1, Test Center，No.16 Test Rd，Hangzhou city, Zhejiang Province, P.R. China.', null, null,
    'ТОО «Пример Трейдинг»\nБИН 123456789012\nAddress: Kазаxстан, Aтырауская область г.Атырау, ул.Примерная, 12, почтовый индекс 060000'],
  ['③Notify Party', null, 'same as Consignee', null, null, 'CONTRACT NO: TEST-GL-2026020201 date 02.02.2026'],
  ['⑧Invoice NO.&Date', null, 'TEST-CI-092101     September,21, 2026'],
  ['№', 'HSCODE', 'Product Name', 'Unit', 'Q\'ty', 'Unit price (CNY)', 'Total(CNY)', 'Manufactured'],
  [1, 8456110000, 'Аппарат. Model "RC1001"', '台\nшт', 2, 11930, 23860, 'Example Laser Co'],
  [2, 8425110000, 'Тележка', '台\nшт', 50, 370, 18500, 'Example Hoist Co'],
  ['TOTAL ', null, null, null, null, null, 42360],
  ['MADE IN CHINA'],
  [null, null, null, null, null, '⑫Work Term ：  FCA  新疆霍尔果斯，Метод доставки "Хоргос КНР"'],
]
const PACKING_ROWS: unknown[][] = [
  ['Packing List'],
  ['①Shipper/Exporter', null, '⑧Invoice No& Date'],
  ['Example Machinery Import &Export Co; Ltd.\nRoom 1, Test Center', null, 'TEST-CI-092101     September,21, 2026'],
  ['②Consignee'],
  ['ТОО «Пример Трейдинг»\nБИН 123456789012'],
  ['№', 'Description of Goods', 'Quantity/Unit', null, 'Net Weight (Kg)', 'Gross Weight (Kg)', 'number of seats / number of places'],
  [1, 'Аппарат. Model "RC1001"', 2, '台\nшт', 57, 85, 'Два деревянных ящика № 3 и № 4'],
  [2, 'Тележка', 50, '台\nшт', 680, 700, '50箱，1托.   50 коробок, 1 палета'],
  ['Total', null, null, null, 737, 785, '共计4件. 4 мест'],
]

const sheet = (fileName: string, sheetName: string, rows: unknown[][], headerAt: number): ExcelDoc => ({
  fileName, sheet: sheetName, goods: goodsFromSheetRows(rows, { details: true }),
  header: docHeaderFrom(`${fileName} ${sheetName}`, rows.slice(0, headerAt), rows[headerAt], rows),
  rows, totals: goodsSheetTotals(rows, { details: true }),
})
const invoice = sheet('39th.xlsx', 'Invoice', INVOICE_ROWS, 5)
const packing = sheet('39th.xlsx', 'Packinglist', PACKING_ROWS, 5)

describe('шапка двуязычного инвойса-упаковочного (правки 2.1, 2.8)', () => {
  it('стороны по графам ниже подписи, номер и дата, контракт, условия поставки и страна под таблицей', () => {
    expect(invoice.header).toMatchObject({
      kind: 'invoice', number: 'TEST-CI-092101', date: '2026-09-21', incoterms: 'FCA', incotermsPlace: 'ХОРГОС',
      sellerName: 'Example Machinery Import &Export Co; Ltd.',
      sellerAddress: 'Room 1, Test Center,No.16 Test Rd,Hangzhou city, Zhejiang Province, P.R. China.',
      buyerName: 'ТОО «Пример Трейдинг»', buyerBin: '123456789012', currency: 'CNY',
      contractNumber: 'TEST-GL-2026020201', contractDate: '2026-02-02', originText: 'CHINA',
    })
    expect(invoice.header.buyerAddress).toContain('Aтырауская')
    expect(packing.header).toMatchObject({
      kind: 'packing', number: 'TEST-CI-092101', date: '2026-09-21', sellerName: 'Example Machinery Import &Export Co; Ltd.',
      buyerName: 'ТОО «Пример Трейдинг»', buyerBin: '123456789012',
    })
  })

  it('даты и контракт словами', () => {
    expect(dateInText('INV-1     September,21, 2026')).toBe('2026-09-21')
    expect(dateInText('21 Sep 2026')).toBe('2026-09-21')
    expect(contractFrom('CTR-1 date 02.02.2026')).toEqual({ number: 'CTR-1', date: '2026-02-02' })
    expect(contractFrom('№ 36/СМ от 26.01.2026')).toEqual({ number: '36/СМ', date: '2026-01-26' })
    expect(looksLikeLabel('2Consignee')).toBe(true)
    expect(looksLikeLabel('ТОО «Пример Трейдинг»')).toBe(false)
  })

  it('гр. 44 из шапок: инвойс, упаковочный (номер инвойса), контракт с датой; CMR — при авто', () => {
    const names = new Map([['04021', 'ИНВОЙС'], ['04131', 'УПАКОВОЧНЫЙ'], ['03011', 'КОНТРАКТ'], ['02015', 'CMR']])
    const docs = headerDocs({ headers: [invoice.header, packing.header], docKindNames: names, road: true, cmrInBatch: true })
    expect(docs.map((d) => [d.docTypeCode, d.docNumber, d.docDate, d.docTypeName])).toEqual([
      ['04021', 'TEST-CI-092101', '2026-09-21', 'ИНВОЙС'],
      ['04131', 'TEST-CI-092101', '2026-09-21', 'УПАКОВОЧНЫЙ'],
      ['02015', null, null, 'CMR'],
      ['03011', 'TEST-GL-2026020201', '2026-02-02', 'КОНТРАКТ'],
    ])
    // упаковочный без номера и без инвойса — «Б/Н»; контракт заявки есть — 03011 из документов не пишется
    expect(headerDocs({ headers: [{ ...packing.header, number: null }], hasCaseContract: true }).map((d) => [d.docTypeCode, d.docNumber]))
      .toEqual([['04131', 'Б/Н']])
  })
})

describe('«Из документов» на этом наборе', () => {
  it('«2Consignee» разбора — не отправитель; страна «MADE IN»; гр. 22 — сумма товаров; места против итога', () => {
    const r = applyExcelFallback(
      { sender: { name: '2Consignee' } as never, totalInvoiceValue: 24000, goodsItems: [] },
      [invoice, packing],
      { transportMode: 3 },
    )
    expect(r.preview.sender?.name).toBe('Example Machinery Import &Export Co; Ltd.')
    expect(r.preview.receiver?.name).toBe('ТОО «Пример Трейдинг»')
    expect(r.preview.totalInvoiceValue).toBe(42360)
    expect(r.preview.originCountryCode).toBe('156')
    expect(r.rows.map((x) => [x.countryCode, x.places, x.placesNote])).toEqual([['156', 2, null], ['156', null, '50箱，1托. 50 коробок, 1 палета']])
    expect(r.placesCheck).toEqual({ total: 4, sum: 2, unknown: 1 })
    expect(placesCheckOf(r.rows.map((x) => ({ ...x, places: 2, placesNote: null })), [invoice, packing])).toBeNull()
    expect(r.receiverAddress).toContain('Aтырауская')
    // «Море» в заявке без номеров машины и CMR — транспортный документ не добавляется из документов (номера нет)
    expect(r.doc44Items.map((d) => d.docTypeCode)).toEqual(['04021', '04131', '03011'])
  })
})
