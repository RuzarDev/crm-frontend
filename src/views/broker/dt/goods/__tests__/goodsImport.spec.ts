import { describe, expect, it } from 'vitest'
import type { ClassifierItem, ReestrGoodsItemInput } from '@/types/api'
import { goodsFromSheetRows, type GoodsExcelRow } from '@/utils/goodsExcel'
import { dtDocsFromExcel, dtGoodsFromExcel, excelPreview } from '../goodsImport'

const HEAD = ['Код ТН ВЭД', 'Коммерческое описание', 'Вес брутто', 'Количество товара', 'Вид упаковки товара', 'Количество грузовых мест']
const parsed = (rows: unknown[][]): ReestrGoodsItemInput[] => goodsFromSheetRows([HEAD, ...rows])
const kind = (code: string, nameRu: string): ClassifierItem => ({ id: code, classifierCode: '2013', code, nameRu, sortOrder: 0, isActive: true })
const KINDS = [kind('CT', 'КАРТОННАЯ КОРОБКА'), kind('PK', 'УПАКОВКА'), kind('BG', 'МЕШОК')]

describe('goodsImport: строки Excel → товары ДТ', () => {
  it('пустой товар ДТ + распознанные поля; места — и в «места груза»; валюта — гр. 22', () => {
    const [g] = dtGoodsFromExcel(parsed([['7318150000', 'Болты', 12.5, 100, null, 3]]), { currency: 'EUR', packageKinds: KINDS })
    expect(g).toMatchObject({
      tnvedCode: '7318150000', description: 'Болты', tnvedDescription: 'Болты', grossWeightKg: 12.5, quantity: 100,
      packagesCount: 3, cargoPlacesQuantity: 3, currency: 'EUR', unitCode: null, payments: [], markings: [], needsTpinRecalc: false,
    })
  })

  it('без гр. 22 — без валюты (как прежде: страница подставит гр. 22, когда её зададут)', () => {
    const [g] = dtGoodsFromExcel(parsed([['7318150000', 'Болты', 1, 1, null, 1]]), { currency: '', packageKinds: KINDS })
    expect(g.currency).toBeNull()
  })

  it('каждая строка — свой объект (не общий с разбором)', () => {
    const rows = parsed([['1', 'A', 1, 1, null, 1], ['2', 'B', 1, 1, null, 1]])
    const out = dtGoodsFromExcel(rows, { currency: 'USD', packageKinds: KINDS })
    expect(out).toHaveLength(2)
    expect(out[0]).not.toBe(rows[0])
    expect(out[0].payments).not.toBe(out[1].payments)
  })
})

describe('goodsImport: «Вид упаковки товара» (X1)', () => {
  it('пишется в вид упаковки товара (гр. 31, классификатор 2013), а не в наименование ДЕИ', () => {
    const out = dtGoodsFromExcel(parsed([
      ['1', 'A', 1, 1, 'ct', 1], // код без учёта регистра
      ['2', 'B', 1, 1, 'Мешок', 1], // название
      ['3', 'C', 1, 1, 'PK — упаковка', 1], // «код — название»
    ]), { currency: 'USD', packageKinds: KINDS })
    expect(out.map((g) => g.packageKindCode)).toEqual(['CT', 'BG', 'PK'])
    expect(out.map((g) => g.unit)).toEqual([null, null, null])
    expect(out.map((g) => g.unitCode)).toEqual([null, null, null])
  })

  it('не распознан по классификатору — ни в упаковку, ни в ДЕИ (в предпросмотре — список нераспознанных)', () => {
    const rows = parsed([['1', 'A', 1, 1, 'шт', 1], ['2', 'B', 1, 1, 'шт', 1], ['3', 'C', 1, 1, 'CT', 1]])
    const out = dtGoodsFromExcel(rows, { currency: 'USD', packageKinds: KINDS })
    expect(out.map((g) => [g.packageKindCode, g.unit])).toEqual([[null, null], [null, null], ['CT', null]])
    expect(excelPreview(rows, KINDS)).toMatchObject({ recognized: { packaging: 1 }, unknownPackaging: ['шт'] })
  })

  it('классификатор не загрузился — двухзначный код берётся как есть (заглавными), остальное не пишется', () => {
    const out = dtGoodsFromExcel(parsed([['1', 'A', 1, 1, 'ct', 1], ['2', 'B', 1, 1, 'коробка', 1]]), { currency: 'USD', packageKinds: [] })
    expect(out.map((g) => [g.packageKindCode, g.unit])).toEqual([['CT', null], [null, null]])
  })

  it('общий разбор с транзитом не меняется: там столбец по-прежнему в unit', () => {
    expect(parsed([['1', 'A', 1, 1, 'CT', 1]])[0].unit).toBe('CT')
  })
})

describe('goodsImport: предпросмотр', () => {
  it('строки, где нетто больше брутто, считаются отдельно', () => {
    const rows = [
      { ...parsed([['7323990000', 'Сушилка', 719.1, 47, 'CT', 47]])[0], netWeightKg: 1128 },
      { ...parsed([['9403208009', 'Полка', 1438.2, 47, 'CT', 47]])[0], netWeightKg: 1363 },
    ]
    expect(excelPreview(rows, KINDS).netOverGross).toBe(1)
  })

  it('строк, с кодом / без кода, распознано по полям', () => {
    const p = excelPreview(parsed([
      ['7318150000', 'Болты', 12.5, 100, 'CT', 3],
      [null, 'Гайки', 4, null, null, null],
    ]), KINDS)
    expect(p).toEqual({
      rows: 2, withCode: 1, withoutCode: 1, recognized: { description: 2, gross: 2, net: 0, quantity: 1, packaging: 1, places: 1, value: 0, country: 0, tradeCodes: 0, characteristics: 0, cargoPart: 0, individualPackages: 0 }, documents: 0, unknownPackaging: [], netOverGross: 0,
    })
  })
})

describe('goodsImport: сведения шаблона декларанта', () => {
  const details = (over: Partial<NonNullable<GoodsExcelRow['details']>> = {}): NonNullable<GoodsExcelRow['details']> => ({
    manufacturerName: 'YIWU', tradeMarkName: null, productMarkName: null, productModelName: null, productArticle: 'URS07',
    serialNumbers: null, standardName: null, productSortName: null, measureUnit: null, cargoPartQuantity: null,
    individualPackages: null, packageAvailabilityCode: '1', docTypeCode: null, docNumber: null, docDate: null,
    invoiceNumber: 'UR0910', invoiceDate: '2026-09-10', ...over,
  })
  const row = (over: Partial<NonNullable<GoodsExcelRow['details']>> = {}): GoodsExcelRow =>
    ({ ...parsed([['7323990000', 'Сушилка', null, 47, null, 47]])[0], details: details(over) })

  it('строка характеристик, наличие упаковки, часть места и индивидуальные упаковки', () => {
    const [g] = dtGoodsFromExcel([row({ cargoPartQuantity: 1, individualPackages: 47 })], { currency: 'USD', packageKinds: KINDS })
    expect(g.characteristics?.[0]).toMatchObject({ manufacturerName: 'YIWU', productArticle: 'URS07', tradeMarkName: null })
    expect(g.packageAvailabilityCode).toBe('1')
    expect(g.extras).toMatchObject({ cargoPartQuantity: 1, packages: [{ kind: '1', packageKindCode: null, quantity: 47 }] })
  })

  it('документы гр. 44: одинаковые — одна строка со всеми товарами, позиции считаются от первого нового товара', () => {
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
