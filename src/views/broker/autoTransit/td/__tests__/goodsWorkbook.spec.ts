import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { currencyFromText, readGoodsWorkbook } from '../goodsWorkbook'
import { kedenGoodsCheck } from '../kedenGoods'
import { readGoodsExcel } from '@/utils/goodsExcel'

const book = (sheets: [string, unknown[][]][]): Blob => {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const blob = new Blob([out])
  if (!('arrayBuffer' in blob)) Object.assign(blob, { arrayBuffer: async () => out })
  return blob
}

const INVOICE: unknown[][] = [
  ['TEST TRADING CO., LTD'],
  ['INVOICE No. TEST-1'],
  [],
  ['N/M', 'HS CODE', 'DESCRIPTION', 'CTNS', 'PRICE $', 'TOTAL $'],
  [1, '8516600000', 'Test oven A', 8, 10, 1200],
  [2, '8516710000', 'Test kettle B', 201, 5, 4665],
  [3, '8509400000', 'Test mixer C', 3, 20, 3000],
  ['TOTAL', null, null, 212, null, 8865],
]
const PACKING: unknown[][] = [
  ['PACKING LIST'],
  ['DESCRIPTION', 'CTNS', 'PIECES', 'N.KGS', 'G.KGS'],
  ['Test oven A', 8, 120, 120, 134],
  ['Test kettle B', 201, 933, 4800, 4930],
  ['Test mixer C', 3, 150, 40, 44],
  ['TOTAL', 212, 1203, 4960, 5108],
]

describe('readGoodsWorkbook', () => {
  it('инвойс + упаковочный → брутто, нетто, количество, места и валюта USD', async () => {
    const r = await readGoodsWorkbook(book([['INVOICE', INVOICE], ['PACKING LIST', PACKING]]))
    if ('problem' in r) throw new Error(r.problem)
    expect(r.goods).toHaveLength(3)
    expect(r.goods.map((g) => g.grossWeightKg)).toEqual([134, 4930, 44])
    expect(r.goods.map((g) => g.netWeightKg)).toEqual([120, 4800, 40])
    expect(r.goods.map((g) => g.quantity)).toEqual([120, 933, 150])
    expect(r.goods.map((g) => g.packagesCount)).toEqual([8, 201, 3])
    expect(r.goods.map((g) => g.currency)).toEqual(['USD', 'USD', 'USD'])
    expect(r.goods.map((g) => g.customsValue)).toEqual([1200, 4665, 3000])
    expect(r.report).toMatchObject({ packingSheet: 'PACKING LIST', gross: 3, net: 3, quantity: 3, unmatched: [] })
  })

  it('число строк разное — по описанию, без пары — в unmatched; пустые поля только', async () => {
    const packing = [...PACKING.slice(0, 3), ['test   MIXER c', 3, 150, 40, 44], ['Unknown thing', 1, 1, 1, 1], ['Other thing', 1, 1, 1, 1], PACKING[5]!]
    const r = await readGoodsWorkbook(book([['INVOICE', INVOICE], ['PACKING LIST', packing as unknown[][]]]))
    if ('problem' in r) throw new Error(r.problem)
    expect(r.goods.map((g) => g.grossWeightKg)).toEqual([134, null, 44])
    expect(r.report.unmatched).toEqual(['Unknown thing', 'Other thing', 'Test kettle B'])
  })

  it('уже заполненное не перетирается; валюта из шапки «Currency: CNY»', async () => {
    const inv: unknown[][] = [['Currency: CNY'], ['HS CODE', 'DESCRIPTION', 'G.W', 'AMOUNT'], ['8516600000', 'Test oven A', 99, 100]]
    const pack: unknown[][] = [['DESCRIPTION', 'PIECES', 'N.KGS', 'G.KGS'], ['Test oven A', 5, 7, 8]]
    const r = await readGoodsWorkbook(book([['INVOICE', inv], ['PL', pack]]))
    if ('problem' in r) throw new Error(r.problem)
    expect(r.goods[0]).toMatchObject({ grossWeightKg: 99, netWeightKg: 7, quantity: 5, currency: 'CNY' })
  })

  it('одна книга без упаковочного и без проблем: noGoods', async () => {
    const r = await readGoodsWorkbook(book([['INVOICE', INVOICE]]))
    if ('problem' in r) throw new Error(r.problem)
    expect(r.report.packingSheet).toBeNull()
    expect(await readGoodsWorkbook(book([['X', [['hello']]]]))).toEqual({ problem: 'noGoods' })
  })

  it('прежний разбор (без режима книги) читает один лист: без брутто и валюты', async () => {
    const r = await readGoodsExcel(book([['INVOICE', INVOICE], ['PACKING LIST', PACKING]]))
    if ('problem' in r) throw new Error(r.problem)
    expect(r.goods.every((g) => g.currency == null)).toBe(true)
  })
})

describe('readGoodsWorkbook: раскладка настоящих книг брокеров (выдуманные товары)', () => {
  const N = null
  // Шапка с адресами, пустые столбцы между данными, смещённый на столбец D лист упаковочного, пустая строка под заголовком, TOTAL.
  const invoice: unknown[][] = [
    [N], ['TEST SELLER CO., LTD'], ['INVOICE'], ['TO:', 'TEST BUYER MMC', N, N, N, '合同号码'],
    [N, 'TAX ID:0000000000', N, N, N, 'Invoice no: ', 'TST-1'], [N, 'TEST CITY'], [N, N, N, N, N, 'Date:', 'AUG.29.2026'],
    [N, N, N, N, N, 'Contract no:', 'C-1 from 01.07.2026'], [], ['Seller:', 'TEST SELLER CO., LTD'], ['The buyer agrees to buy and sell'],
    [], [], [], [],
    ['N/M', 'HS CODE', 'DESCRIPTION', 'CTNS', N, 'PRICE $', N, 'TOTAL $'],
    [],
    [N, 950300, 'TEST MAT', 8, N, 35.1, N, 280.8],
    [N, 392210, 'TEST TUB', 201, N, 50, N, 10050],
    [N, 940490, 'TEST PILLOW', 3, N, 41.5, N, 124.5],
    [],
    [N, N, N, 212, N, N, 'USD', 10455.3],
  ]
  const packing: unknown[][] = [
    [N], [N], [N, 'TEST SELLER CO., LTD'], [N, 'PACKING LIST'], [N, 'TO:', 'TEST BUYER MMC'], [N, N, 'Invoice no:'],
    [N, N, N, N, N, N, 'Date:AUG.29.2026'], [], [],
    [N, N, N, 'DESCRIPTION', 'CTNS', N, 'PIECES', N, 'N.KGS', N, 'G.KGS'],
    [],
    [N, N, N, 'TEST MAT', 8, N, 120, N, 121.94, N, 134],
    [N, N, N, 'TEST TUB', 201, N, 933, N, 4634.2, N, 4930],
    [N, N, N, 'TEST PILLOW', 3, N, 150, N, 40.04, N, 44],
    [],
    [N, N, 'TOTAL', N, 212, N, N, N, 4796.18, N, 5108],
  ]

  it('шапка, пустые столбцы, смещение, TOTAL: 3 товара, итог не товар, брутто/нетто/количество, места из инвойса, USD', async () => {
    const r = await readGoodsWorkbook(book([['INVOICE', invoice], ['PACKING LIST', packing]]))
    if ('problem' in r) throw new Error(r.problem)
    expect(r.goods).toHaveLength(3)
    expect(r.goods.map((g) => g.grossWeightKg)).toEqual([134, 4930, 44])
    expect(r.goods.map((g) => g.netWeightKg)).toEqual([121.94, 4634.2, 40.04])
    expect(r.goods.map((g) => g.quantity)).toEqual([120, 933, 150])
    expect(r.goods.map((g) => g.packagesCount)).toEqual([8, 201, 3])
    expect(r.goods.map((g) => g.currency)).toEqual(['USD', 'USD', 'USD'])
    expect(r.goods.reduce((a, g) => a + (g.customsValue ?? 0), 0)).toBeCloseTo(10455.3, 4)
    expect(r.report.unmatched).toEqual([])
    const check = kedenGoodsCheck({ goods: r.goods, packages: [{ packagingInfoKindCode: null, packageTypeCode: 'PK', packageCount: null, description: null }], containers: [] })
    expect(check.errors).toEqual([])
  })
})

describe('currencyFromText', () => {
  it('знаки и коды', () => {
    expect(['PRICE $', 'Цена, ¥', 'TOTAL EUR', '₽', 'RMB', 'abc'].map(currencyFromText)).toEqual(['USD', 'CNY', 'EUR', 'RUB', 'CNY', null])
  })
})
