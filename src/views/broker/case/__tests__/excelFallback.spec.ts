import { describe, expect, it } from 'vitest'
import { goodsFromSheetRows } from '@/utils/goodsExcel'
import { applyExcelFallback, docHeaderFrom, mergeExcelGoods, transportDocCode, type ExcelDoc } from '../steps/excelFallback'

// Инвойс и упаковочный лист поставщика (19.10.2026, UR0910 — обезличенные выдержки): Zircon AI их не всегда понимает —
// дочитывает наш разбор. Пакет импорта 21.10: товары по правилу «числа у Zircon AI — база», гр. 20 только пункт,
// продавец с адресом, покупатель с БИН, гр. 44 инвойса / упаковочного / транспортного документа, «АВТО:» под таблицей.
const HEAD_ROWS = [
  ['INVOICE / ИНВОЙС / 形式发票'],
  ['№ UR0910     Дата / 日期: 10.09.2026'],
  ['卖方 / Продавец (Seller):\nYiwu Test Trading Firm\nAddress: Room 7, Block B, Jiang Street, Yiwu City, Zhejiang Province, China\nTel: +86 000', null,
    '买方 / Покупатель (Buyer):\nКомпания ТОО "Test Distribution"\nАдрес: Алматы\nБИН(ИИН): 220940001302'],
  ['Условия поставки / 交货条件: CIF ALMATY, KAZAKHSTAN (Incoterms® 2020)   Транспорт: CMR'],
]
const INV_HEAD = ['№', 'HS Code / ТН ВЭД', '货号 Артикул', '品名 Наименование', 'pcs/ctn', '件数 Cartons', '总数量 Кол-во', '单价 USD Цена', '金额 USD Сумма', 'G.W/ctn (kg)', '总毛重 TTL G.W(kg)']
const PL_HEAD = ['№', 'HS Code / ТН ВЭД', '货号 Артикул', '品名 Наименование', 'pcs/ctn', '件数 Кол-во мест (ctn)', '总数量 Кол-во (pcs)', 'G.W/ctn (kg)', '总毛重 TTL G.W (kg)', 'N.W/ctn (kg)', '总净重 TTL N.W (kg)']

const doc = (fileName: string, head: unknown[], rows: unknown[][], footer: unknown[][] = []): ExcelDoc => {
  const all = [...HEAD_ROWS, head, ...rows, [null, null, null, '合计 / TOTAL', null, 94, 940], ...footer]
  return { fileName, goods: goodsFromSheetRows(all, { details: true }), header: docHeaderFrom(fileName, HEAD_ROWS, head), rows: all, placesHeader: String(head[5]) }
}
const invoice = doc('invoice_UR0910.xlsx', INV_HEAD, [
  [1, 7323990000, 'URS07', 'Сушилка для белья 18 м', 10, 47, 470, 3.41, 1602.7, 25.5, 1198.5],
  [2, 3924900009, '24001-1', 'КОРЗИНА', 10, 47, 470, 3.19, 1499.3, 12.3, 578.1],
], [['АВТО:184AFR19/48AEU19']])
const packing = doc('PACKING_LIST_UR0910.xlsx', PL_HEAD, [
  [1, 7323990000, 'URS07', 'Сушилка для белья 18 м', 10, 47, 470, 25.5, 1198.5, 24, 1128],
  [2, 3924900009, '24001-1', 'КОРЗИНА', 10, 47, 470, 12.3, 578.1, 11.2, 526.4],
], [['Упаковка / 包装: картонные коробки / 纸箱']])

describe('excelFallback: инвойс и упаковочный лист поставщика', () => {
  it('шапка: вид, номер и дата, Инкотермс и только пункт (№6), продавец с адресом (№7), покупатель с БИН, валюта', () => {
    expect(invoice.header).toEqual({
      kind: 'invoice', number: 'UR0910', date: '2026-09-10', incoterms: 'CIF', incotermsPlace: 'АЛМАТЫ',
      sellerName: 'Yiwu Test Trading Firm', sellerAddress: 'Room 7, Block B, Jiang Street, Yiwu City, Zhejiang Province, China',
      buyerName: 'ТОО "Test Distribution"', buyerBin: '220940001302', currency: 'USD',
    })
    expect(packing.header.kind).toBe('packing')
  })

  it('таблица: веса — итоги «TTL», а не «на коробку»; строка «TOTAL» не товар; единица из шапки «(pcs)»', () => {
    expect(invoice.goods).toHaveLength(2)
    expect(invoice.goods[0]).toMatchObject({ grossWeightKg: 1198.5, quantity: 470, packagesCount: 47, customsValue: 1602.7 })
    expect(packing.goods[0]).toMatchObject({ grossWeightKg: 1198.5, netWeightKg: 1128 })
    expect(packing.goods[0].details?.measureUnit).toBe('PCS')
    expect(invoice.goods[0].details?.measureUnit).toBeNull()
  })

  it('слияние: стоимость из инвойса, нетто и единица из упаковочного листа, порядок — как в инвойсе', () => {
    const merged = mergeExcelGoods([packing, invoice])
    expect(merged.map((g) => [g.tnvedCode, g.value, g.netWeightKg, g.productArticle, g.unitText])).toEqual([
      ['7323990000', 1602.7, 1128, 'URS07', 'PCS'],
      ['3924900009', 1499.3, 526.4, '24001-1', 'PCS'],
    ])
    // вид упаковки: строка «Упаковка / 包装: …» упаковочного листа и подпись мест «Cartons» инвойса
    expect(merged[0].packagingHint).toMatch(/картонные|Cartons/)
  })

  it('товары-подсказки Zircon AI без чисел — берутся товары Excel; шапка, гр. 44, «АВТО:» → гр. 18 с ролями', () => {
    const r = applyExcelFallback(
      { receiver: { name: null } as never, goodsItems: [{ tnvedCode: '4115959789' }], incotermsPlace: '/ 交货条件: CIF ALMATY, KAZAKHSTAN (Incoterms® 2020)' },
      [invoice, packing],
      { extras: { transportDocument: 'CMR-77', contractNumber: 'AKBT1', contractDate: '2025-05-13' }, transportMode: 1, hasCaseContract: false },
    )
    expect(r.usedExcelGoods).toBe(true)
    expect(r.rows).toHaveLength(2)
    expect(r.preview).toMatchObject({
      currency: 'USD', incoterms: 'CIF', incotermsPlace: 'АЛМАТЫ', totalInvoiceValue: 3102, declarationNumber: null,
      sender: { name: 'Yiwu Test Trading Firm' }, receiver: { name: 'ТОО "Test Distribution"' },
    })
    expect(r.receiverBin).toBe('220940001302')
    expect(r.senderAddress).toContain('Room 7')
    expect(r.preview.arrivalTransportNumbers).toEqual([
      { number: '184AFR19', typeCode: null, isTrailer: false, headNumber: null },
      { number: '48AEU19', typeCode: null, isTrailer: true, headNumber: '184AFR19' },
    ])
    expect(r.doc44Items.map((d) => [d.docTypeCode, d.docNumber, d.docDate, d.appliesToAll])).toEqual([
      ['04021', 'UR0910', '2026-09-10', true], ['04131', 'UR0910', '2026-09-10', true],
      ['02015', 'CMR-77', null, true], ['03011', 'AKBT1', '2025-05-13', true],
    ])
  })

  it('контракт заявки есть — 03011 из документов не пишется (его поставит сервер); код транспортного документа по виду', () => {
    const r = applyExcelFallback({}, [invoice], { extras: { contractNumber: 'AKBT1' }, hasCaseContract: true })
    expect(r.doc44Items.map((d) => d.docTypeCode)).toEqual(['04021'])
    expect([0, 1, 2, 3].map(transportDocCode)).toEqual(['02013', '02015', '02017', '02011'])
  })

  it('товары Zircon AI с числами — база, Excel дозаполняет пустое (нетто); без Excel — товары Zircon AI как есть', () => {
    const preview = { goodsItems: [
      { tnvedCode: '7323990000', description: 'Сушилка для белья 18 м', productArticle: 'URS07', grossWeightKg: 1198.5, invoiceValue: 1602.7 },
      { tnvedCode: '3924900009', description: 'КОРЗИНА', productArticle: '24001-1', grossWeightKg: 578.1, invoiceValue: 1499.3 },
    ] }
    const r = applyExcelFallback(preview, [packing])
    expect(r.usedExcelGoods).toBe(false)
    expect(r.rows.map((x) => [x.source, x.netWeightKg])).toEqual([['Zircon AI', 1128], ['Zircon AI', 526.4]])
    const alone = applyExcelFallback(preview, [])
    expect(alone.rows).toHaveLength(2)
    expect(alone.doc44Items).toEqual([])
  })

  it('ревью 22.10: столбец «Марка ↵ Brand» — марка; прочитан Zircon AI по-другому — LONGJU не попадает в обе графы', () => {
    const withMark = doc('invoice_UR0910.xlsx', [...INV_HEAD, 'Марка\nBrand'], [
      [1, 7323990000, 'URS07', 'Сушилка для белья 18 м', 10, 47, 470, 3.41, 1602.7, 25.5, 1198.5, 'LONGJU'],
    ])
    expect(withMark.goods[0].details).toMatchObject({ productMarkName: 'LONGJU', tradeMarkName: null })
    const item = { tnvedCode: '7323990000', description: 'Сушилка для белья 18 м', productArticle: 'URS07', grossWeightKg: 1198.5, invoiceValue: 1602.7 }
    // Zircon AI с тем же правилом (марка) — одна графа, без расхождений
    const same = applyExcelFallback({ goodsItems: [{ ...item, productMarkName: 'LONGJU' }] }, [withMark])
    expect(same.rows[0]).toMatchObject({ productMarkName: 'LONGJU', tradeMarkName: null })
    expect(same.conflicts).toEqual([])
    // старый образ Zircon AI (товарный знак) — остаётся его графа, расхождение видно
    const old = applyExcelFallback({ goodsItems: [{ ...item, tradeMarkName: 'LONGJU' }] }, [withMark])
    expect(old.rows[0]).toMatchObject({ tradeMarkName: 'LONGJU', productMarkName: null })
    expect(old.conflicts).toMatchObject([{ rowIndex: 0, field: 'tradeMarkName', crossField: 'productMarkName' }])
  })
})
