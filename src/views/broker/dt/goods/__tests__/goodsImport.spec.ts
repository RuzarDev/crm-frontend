import { describe, expect, it } from 'vitest'
import type { ClassifierItem } from '@/types/api'
import { goodsFromSheetRows, type GoodsExcelRow } from '@/utils/goodsExcel'
import { dtDocsFromExcel, excelPreview, packageKindFrom } from '../goodsImport'
import { buildGoods } from '../importBuild'
import { fromExcelRow } from '../importRows'

const HEAD = ['Код ТН ВЭД', 'Коммерческое описание', 'Вес брутто', 'Количество товара', 'Вид упаковки товара', 'Количество грузовых мест']
const parsed = (rows: unknown[][]) => goodsFromSheetRows([HEAD, ...rows], { details: true })
const kind = (code: string, nameRu: string): ClassifierItem => ({ id: code, classifierCode: '2013', code, nameRu, sortOrder: 0, isActive: true })
const KINDS = [kind('CT', 'КАРТОННАЯ КОРОБКА'), kind('PK', 'УПАКОВКА'), kind('BG', 'МЕШОК')]
const rowsOf = (rows: GoodsExcelRow[]) => rows.map((r) => fromExcelRow(r, 'goods.xlsx'))
const build = (rows: GoodsExcelRow[]) => buildGoods(rowsOf(rows), { currency: 'USD', packageKinds: KINDS, resolved: { byCode: new Map(), rejected: [], failed: true } })

describe('goodsImport: «Вид упаковки товара» (X1)', () => {
  it('по коду (без регистра), названию или «код — название»; не распознан — null; классификатор не загружен — код как есть', () => {
    expect(['ct', 'Мешок', 'PK — упаковка', 'шт'].map((v) => packageKindFrom(v, KINDS))).toEqual(['CT', 'BG', 'PK', null])
    expect(['ct', 'коробка'].map((v) => packageKindFrom(v, []))).toEqual(['CT', null])
  })

  it('общий разбор с транзитом не меняется: там столбец по-прежнему в unit', () => {
    expect(goodsFromSheetRows([HEAD, ['1', 'A', 1, 1, 'CT', 1]])[0].unit).toBe('CT')
  })
})

describe('goodsImport: предпросмотр', () => {
  it('строки, где нетто больше брутто (goodsStatus.netOverGross), считаются отдельно', () => {
    const rows = [
      { ...parsed([['7323990000', 'Сушилка', 719.1, 47, 'CT', 47]])[0], netWeightKg: 1128 },
      { ...parsed([['9403208009', 'Полка', 1438.2, 47, 'CT', 47]])[0], netWeightKg: 1363 },
    ]
    expect(excelPreview(rowsOf(rows), build(rows)).netOverGross).toBe(1)
  })

  it('строк, с кодом / без кода, распознано по полям; нераспознанный вид упаковки — списком', () => {
    const rows = parsed([
      ['7318150000', 'Болты', 12.5, 100, 'CT', 3],
      [null, 'Гайки', 4, null, 'шт', null],
    ])
    const p = excelPreview(rowsOf(rows), build(rows))
    expect(p).toMatchObject({
      rows: 2, withCode: 1, withoutCode: 1,
      recognized: { description: 2, gross: 2, net: 0, quantity: 1, packaging: 1, places: 1, value: 0, country: 0, unit: 0, rowName: 0 },
      documents: 0, unknownPackaging: ['шт'], netOverGross: 0,
    })
  })
})

describe('goodsImport: документы гр. 44 шаблона декларанта', () => {
  const details = (over: Partial<NonNullable<GoodsExcelRow['details']>> = {}): NonNullable<GoodsExcelRow['details']> => ({
    manufacturerName: 'YIWU', tradeMarkName: null, productMarkName: null, productModelName: null, productArticle: 'URS07',
    serialNumbers: null, standardName: null, productSortName: null, measureUnit: null, cargoPartQuantity: null,
    individualPackages: null, packageAvailabilityCode: '1', docTypeCode: null, docNumber: null, docDate: null,
    invoiceNumber: 'UR0910', invoiceDate: '2026-09-10', rowName: null, packageQuantity: null, lineNo: null, originText: null, ...over,
  })
  const row = (over: Partial<NonNullable<GoodsExcelRow['details']>> = {}): GoodsExcelRow =>
    ({ ...parsed([['7323990000', 'Сушилка', null, 47, null, 47]])[0], details: details(over) })

  it('одинаковые — одна строка со всеми товарами, позиции считаются от первого нового товара', () => {
    const docs = dtDocsFromExcel([
      row(), row(), row({ invoiceDate: '2026-10-10', docTypeCode: '01401', docNumber: 'KZ.1', docDate: null }),
    ], 5)
    expect(docs.map((d) => [d.docTypeCode, d.docNumber, d.docDate, d.goodsItemIndexes])).toEqual([
      ['04021', 'UR0910', '2026-09-10', '5,6'],
      ['01401', 'KZ.1', null, '7'],
      ['04021', 'UR0910', '2026-10-10', '7'],
    ])
    expect(docs[0]).toMatchObject({ appliesToAll: false, presentKindCode: '0' })
  })
})
