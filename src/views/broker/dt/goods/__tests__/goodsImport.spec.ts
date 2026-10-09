import { describe, expect, it } from 'vitest'
import type { ClassifierItem, ReestrGoodsItemInput } from '@/types/api'
import { goodsFromSheetRows } from '@/utils/goodsExcel'
import { dtGoodsFromExcel, excelPreview } from '../goodsImport'

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
  it('строк, с кодом / без кода, распознано по полям', () => {
    const p = excelPreview(parsed([
      ['7318150000', 'Болты', 12.5, 100, 'CT', 3],
      [null, 'Гайки', 4, null, null, null],
    ]), KINDS)
    expect(p).toEqual({
      rows: 2, withCode: 1, withoutCode: 1, recognized: { description: 2, gross: 2, quantity: 1, packaging: 1, places: 1 }, unknownPackaging: [],
    })
  })
})
