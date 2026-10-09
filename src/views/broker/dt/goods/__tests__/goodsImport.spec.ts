import { describe, expect, it } from 'vitest'
import type { ReestrGoodsItemInput } from '@/types/api'
import { goodsFromSheetRows } from '@/utils/goodsExcel'
import { dtGoodsFromExcel, excelPreview } from '../goodsImport'

const HEAD = ['Код ТН ВЭД', 'Коммерческое описание', 'Вес брутто', 'Количество товара', 'Вид упаковки товара', 'Количество грузовых мест']
const parsed = (rows: unknown[][]): ReestrGoodsItemInput[] => goodsFromSheetRows([HEAD, ...rows])

describe('goodsImport: строки Excel → товары ДТ', () => {
  it('пустой товар ДТ + распознанные поля; места — и в «места груза»; валюта — гр. 22', () => {
    const [g] = dtGoodsFromExcel(parsed([['7318150000', 'Болты', 12.5, 100, null, 3]]), { currency: 'EUR' })
    expect(g).toMatchObject({
      tnvedCode: '7318150000', description: 'Болты', tnvedDescription: 'Болты', grossWeightKg: 12.5, quantity: 100,
      packagesCount: 3, cargoPlacesQuantity: 3, currency: 'EUR', unitCode: null, payments: [], markings: [], needsTpinRecalc: false,
    })
  })

  it('без гр. 22 — без валюты (как прежде: страница подставит гр. 22, когда её зададут)', () => {
    const [g] = dtGoodsFromExcel(parsed([['7318150000', 'Болты', 1, 1, null, 1]]), { currency: '' })
    expect(g.currency).toBeNull()
  })

  it('каждая строка — свой объект (не общий с разбором)', () => {
    const rows = parsed([['1', 'A', 1, 1, null, 1], ['2', 'B', 1, 1, null, 1]])
    const out = dtGoodsFromExcel(rows, { currency: 'USD' })
    expect(out).toHaveLength(2)
    expect(out[0]).not.toBe(rows[0])
    expect(out[0].payments).not.toBe(out[1].payments)
  })
})

describe('goodsImport: предпросмотр', () => {
  it('строк, с кодом / без кода, распознано по полям', () => {
    const p = excelPreview(parsed([
      ['7318150000', 'Болты', 12.5, 100, 'CT', 3],
      [null, 'Гайки', 4, null, null, null],
    ]))
    expect(p).toEqual({ rows: 2, withCode: 1, withoutCode: 1, recognized: { description: 2, gross: 2, quantity: 1, packaging: 1, places: 1 } })
  })
})
