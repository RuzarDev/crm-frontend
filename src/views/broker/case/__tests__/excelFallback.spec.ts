import { describe, expect, it } from 'vitest'
import { goodsFromSheetRows } from '@/utils/goodsExcel'
import { applyExcelFallback, docHeaderFrom, mergeExcelGoods, type ExcelDoc } from '../steps/excelFallback'

// Инвойс и упаковочный лист поставщика (19.10.2026, UR0910): Zircon AI их не понимает — дочитывает наш разбор.
const HEAD_ROWS = [
  ['INVOICE / ИНВОЙС / 形式发票'],
  ['№ UR0910     Дата / 日期: 10.09.2026'],
  ['卖方 / Продавец (Seller):\nYiwu Longju Trading Firm\nAddress: Yiwu City'],
  ['Условия поставки / 交货条件: CIF ALMATY, KAZAKHSTAN (Incoterms® 2020)   Транспорт: CMR'],
]
const INV_HEAD = ['№', 'HS Code / ТН ВЭД', '货号 Артикул', '品名 Наименование', 'pcs/ctn', '件数 Cartons', '总数量 Кол-во', '单价 USD Цена', '金额 USD Сумма', 'G.W/ctn (kg)', '总毛重 TTL G.W(kg)']
const PL_HEAD = ['№', 'HS Code / ТН ВЭД', '货号 Артикул', '品名 Наименование', 'pcs/ctn', '件数 Кол-во мест (ctn)', '总数量 Кол-во (pcs)', 'G.W/ctn (kg)', '总毛重 TTL G.W (kg)', 'N.W/ctn (kg)', '总净重 TTL N.W (kg)']

const doc = (fileName: string, head: unknown[], rows: unknown[][]): ExcelDoc => {
  const all = [...HEAD_ROWS, head, ...rows, [null, null, null, '合计 / TOTAL', null, 94, 940]]
  return { fileName, goods: goodsFromSheetRows(all, { details: true }), header: docHeaderFrom(fileName, HEAD_ROWS, head) }
}
const invoice = doc('invoice_UR0910.xlsx', INV_HEAD, [
  [1, 7323990000, 'URS07', 'Сушилка для белья 18 м', 10, 47, 470, 3.41, 1602.7, 25.5, 1198.5],
  [2, 3924900009, '24001-1', 'КОРЗИНА', 10, 47, 470, 3.19, 1499.3, 12.3, 578.1],
])
const packing = doc('PACKING_LIST_UR0910.xlsx', PL_HEAD, [
  [1, 7323990000, 'URS07', 'Сушилка для белья 18 м', 10, 47, 470, 25.5, 1198.5, 24, 1128],
  [2, 3924900009, '24001-1', 'КОРЗИНА', 10, 47, 470, 12.3, 578.1, 11.2, 526.4],
])

describe('excelFallback: инвойс и упаковочный лист поставщика', () => {
  it('шапка: вид документа, номер и дата, условия поставки, продавец, валюта столбцов', () => {
    expect(invoice.header).toEqual({ kind: 'invoice', number: 'UR0910', date: '2026-09-10', incoterms: 'CIF', incotermsPlace: 'ALMATY', sellerName: 'Yiwu Longju Trading Firm', currency: 'USD' })
    expect(packing.header.kind).toBe('packing')
  })

  it('таблица: веса — итоги «TTL», а не «на коробку»; строка «TOTAL» не товар', () => {
    expect(invoice.goods).toHaveLength(2)
    expect(invoice.goods[0]).toMatchObject({ grossWeightKg: 1198.5, quantity: 470, packagesCount: 47, customsValue: 1602.7 })
    expect(packing.goods[0]).toMatchObject({ grossWeightKg: 1198.5, netWeightKg: 1128 })
  })

  it('слияние: стоимость из инвойса, нетто из упаковочного листа, порядок — как в инвойсе', () => {
    const merged = mergeExcelGoods([packing, invoice])
    expect(merged.map((g) => [g.tnvedCode, g.customsValue, g.netWeightKg, g.details?.productArticle])).toEqual([
      ['7323990000', 1602.7, 1128, 'URS07'],
      ['3924900009', 1499.3, 526.4, '24001-1'],
    ])
  })

  it('предпросмотр: товары из Excel вместо почти пустого ответа Zircon AI, шапка и документы гр. 44', () => {
    const r = applyExcelFallback({ receiver: { name: null, bin: '220940001302' } as never, goodsItems: [{ tnvedCode: '4115959789' }] }, [invoice, packing])
    expect(r.usedExcelGoods).toBe(true)
    expect(r.preview.goodsItems).toHaveLength(2)
    expect(r.preview).toMatchObject({ currency: 'USD', incoterms: 'CIF', incotermsPlace: 'ALMATY', totalInvoiceValue: 3102, sender: { name: 'Yiwu Longju Trading Firm' }, receiver: { bin: '220940001302' } })
    expect(r.doc44Items.map((d) => [d.docTypeCode, d.docNumber, d.docDate, d.appliesToAll])).toEqual([
      ['04021', 'UR0910', '2026-09-10', true], ['04131', 'UR0910', '2026-09-10', true],
    ])
  })

  it('Zircon AI нашёл не меньше товаров — его товары остаются; без Excel — ничего не меняется', () => {
    const preview = { goodsItems: [{ tnvedCode: '1' }, { tnvedCode: '2' }, { tnvedCode: '3' }] }
    expect(applyExcelFallback(preview, [invoice]).preview.goodsItems).toBe(preview.goodsItems)
    expect(applyExcelFallback(preview, [])).toEqual({ preview, doc44Items: [], usedExcelGoods: false })
  })
})
