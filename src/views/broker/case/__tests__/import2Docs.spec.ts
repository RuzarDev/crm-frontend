// Пакет «Импорт 2.0» (22.10.2026): шапка инвойса-упаковочного с графами ①…⑫ (образец «39th», обезличен) — стороны по
// полям, номер и дата инвойса, контракт с датой, условия поставки и «MADE IN …» под таблицей, гр. 44 из шапок, сверка
// мест с итогом документа; «2Consignee» старого разбора Zircon AI — не имя (правка 2.1); гр. 22 — сумма товаров (e2e-3).
import { describe, expect, it } from 'vitest'
import { goodsFromSheetRows, goodsSheetTotals } from '@/utils/goodsExcel'
import { receiverAddressReplaced, withoutBankTail } from '../steps/documentsImport'
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

// Ревью 22.10 (волна правок 2): «№» контракта над инвойсом, номер на кириллице, договорная дата, «Attn» не адрес,
// своя нераспознанная страна строки, страна разбора не в товары, реквизиты банка не в адрес гр. 8.
describe('ревью 22.10: номер и дата инвойса, контракт', () => {
  const head: unknown[][] = [
    ['INVOICE'],
    ['Контракт № 36/СМ-П/2026 от 26.01.2026'],
    ['Invoice No: INV-5', 'Date: 05.02.2026'],
  ]

  it('«№» строки контракта — не номер инвойса; подпись инвойса главнее, дата — из соседней ячейки', () => {
    const h = docHeaderFrom('inv.xlsx', head, ['№', 'Description'])
    expect(h).toMatchObject({ kind: 'invoice', number: 'INV-5', date: '2026-02-05', numberLabeled: true, contractNumber: '36/СМ-П/2026', contractDate: '2026-01-26' })
    const docs = headerDocs({ headers: [h, { ...h, kind: 'packing', number: null, date: null }], extras: { invoiceNumber: 'INV-5', invoiceDate: '2026-02-05' } as never })
    expect(docs.map((d) => [d.docTypeCode, d.docNumber, d.docDate])).toEqual([
      ['04021', 'INV-5', '2026-02-05'], ['04131', 'INV-5', '2026-02-05'], ['03011', '36/СМ-П/2026', '2026-01-26'],
    ])
  })

  it('номер с кириллицей — целиком; первый «№» шапки без подписи и не как у Zircon AI — Zircon AI первым, как до пакета', () => {
    const h = docHeaderFrom('inv.xlsx', [['СЧЁТ'], ['№ АБ-12/С от 01.02.2026']], ['№', 'Description'])
    expect([h.number, h.date, h.numberLabeled]).toEqual(['АБ-12/С', '2026-02-01', false])
    const docs = headerDocs({ headers: [{ ...h, kind: 'invoice' }], extras: { invoiceNumber: 'INV-9', invoiceDate: '2026-02-03' } as never })
    expect(docs.map((d) => [d.docTypeCode, d.docNumber, d.docDate])).toEqual([['04021', 'INV-9', '2026-02-03']])
    // тот же номер у Zircon AI — шапка Excel
    expect(headerDocs({ headers: [{ ...h, kind: 'invoice' }], extras: { invoiceNumber: 'аб-12/с', invoiceDate: null } as never })[0])
      .toMatchObject({ docNumber: 'АБ-12/С', docDate: '2026-02-01' })
  })

  it('договорная форма даты: «№ 5 от «26» января 2026 г.»', () => {
    expect(contractFrom('№ 5 от «26» января 2026 г.')).toEqual({ number: '5', date: '2026-01-26' })
    expect(contractFrom('C-12 от "05" марта 2025')).toEqual({ number: 'C-12', date: '2025-03-05' })
    expect(dateInText('«1» мая 2025 г.')).toBe('2025-05-01')
    const h = docHeaderFrom('inv.xlsx', [['Contract No.', 'C-12 от «26» января 2026 г.']], ['№'])
    expect([h.contractNumber, h.contractDate]).toEqual(['C-12', '2026-01-26'])
  })
})

describe('ревью 22.10: стороны и страна', () => {
  it('строка без «Address:» — адрес, только если похожа на адрес («Attn», «USCC» — нет)', () => {
    const h = docHeaderFrom('inv.xlsx', [['Seller:\nACME TEST LTD\nAttn: Mr. Test\nUSCC 913300000000000000']], ['№'])
    expect([h.sellerName, h.sellerAddress]).toEqual(['ACME TEST LTD', null])
    const h2 = docHeaderFrom('inv.xlsx', [['Seller:\nACME TEST LTD\nNo.1 Test Rd, Ningbo city, Zhejiang Province, China']], ['№'])
    expect(h2.sellerAddress).toBe('No.1 Test Rd, Ningbo city, Zhejiang Province, China')
  })

  it('«MADE IN CHINA» не перезаписывает свою нераспознанную страну строки; страна разбора Zircon AI в товары не идёт', () => {
    const rows: unknown[][] = [
      ['Commercial Invoice'],
      ['№', 'HS Code', 'Description', 'Country of origin', 'Amount'],
      [1, 8425110000, 'Таль', 'VIET NAM', 100],
      [2, 8425110000, 'Таль ручная', null, 50],
      ['MADE IN CHINA'],
    ]
    const doc: ExcelDoc = {
      fileName: 'inv.xlsx', goods: goodsFromSheetRows(rows, { details: true, countryResolver: () => null }),
      header: docHeaderFrom('inv.xlsx', rows.slice(0, 1), rows[1], rows), rows,
    }
    const r = applyExcelFallback({ goodsItems: [] }, [doc], {})
    expect(r.rows.map((x) => [x.countryCode, x.originText])).toEqual([[null, 'VIET NAM'], ['156', null]])
    // без «MADE IN» в файле: страна разбора — только гр. 16
    const noMade = { ...doc, rows: rows.slice(0, 4), header: docHeaderFrom('inv.xlsx', rows.slice(0, 1), rows[1], rows.slice(0, 4)) }
    const r2 = applyExcelFallback({ goodsItems: [], originCountryCode: '156' }, [noMade], {})
    expect(r2.rows.map((x) => x.countryCode)).toEqual([null, null])
    expect(r2.preview.originCountryCode).toBe('156')
  })

  it('адрес получателя из документа — без банковских реквизитов', () => {
    expect(withoutBankTail('ТУЗДЫБАСТАУ, УЛИЦА САРЫ-АРҚА, ИИК (ШОТТЫҢ НӨМІРІ): KZ00000A000000000000 БАНКТІҢ БСК (БИК): TESTKZKX'))
      .toBe('ТУЗДЫБАСТАУ, УЛИЦА САРЫ-АРҚА')
    expect(withoutBankTail('г. Алматы, ул. Банковская, 5, тел. +7 700')).toBe('г. Алматы, ул. Банковская, 5')
    expect(withoutBankTail('г. Атырау, ул. Примерная, 12')).toBe('г. Атырау, ул. Примерная, 12')
  })

  it('адрес получателя заменил сервер (профиль клиента) — видно по созданной ДТ', () => {
    const sent = { receiver: { name: 'ТОО «Х»', countryCode: '398', region: 'АТЫРАУСКАЯ ОБЛАСТЬ', city: 'АТЫРАУ', street: 'УЛ. ПРИМЕРНАЯ' } }
    expect(receiverAddressReplaced(sent, { receiver: { ...sent.receiver } })).toBe(false)
    expect(receiverAddressReplaced(sent, { receiver: { ...sent.receiver, city: 'АЛМАТЫ', street: 'АБАЯ 1' } })).toBe(true)
  })
})
