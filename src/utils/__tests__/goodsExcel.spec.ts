import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as realXlsx from 'xlsx'

// read подменяется в отдельных тестах (лист без листов, битый файл); по умолчанию — настоящий.
const xlsxRead = vi.hoisted(() => ({ impl: null as null | ((...a: unknown[]) => unknown) }))
vi.mock('@/utils/xlsx', async () => {
  const real = await import('xlsx')
  return { loadXlsx: async () => ({ ...real, read: (...a: unknown[]) => (xlsxRead.impl ?? (real.read as (...x: unknown[]) => unknown))(...a) }) }
})

import { GOODS_EXCEL_MESSAGES, goodsFromSheetRows, isExcelFileName, readGoodsExcel } from '../goodsExcel'

const HEADER = ['№', 'Код ТН ВЭД', 'Коммерческое описание товара', 'Вес брутто, кг', 'Количество товара', 'Вид упаковки товара', 'Количество грузовых мест', 'Прочее']

const empty = {
  countryOfOrigin: null, unitCode: null, netWeightKg: null, quantityTypeCode: null, customsValue: null, currency: null,
}

const workbookFile = (rows: unknown[][]): Blob => {
  const wb = realXlsx.utils.book_new()
  realXlsx.utils.book_append_sheet(wb, realXlsx.utils.aoa_to_sheet(rows), 'КЕДЕН ШАПКА')
  const out = realXlsx.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const blob = new Blob([out])
  // jsdom: у Blob может не быть arrayBuffer — разбор зовёт именно его.
  if (!('arrayBuffer' in blob)) Object.assign(blob, { arrayBuffer: async () => out })
  return blob
}

beforeEach(() => { xlsxRead.impl = null })

describe('isExcelFileName', () => {
  it('только .xlsx и .xls, без учёта регистра', () => {
    expect(isExcelFileName('goods.xlsx')).toBe(true)
    expect(isExcelFileName('GOODS.XLS')).toBe(true)
    expect(isExcelFileName('goods.csv')).toBe(false)
    expect(isExcelFileName('invoice.pdf')).toBe(false)
    expect(isExcelFileName('xlsx')).toBe(false)
  })
})

describe('goodsFromSheetRows', () => {
  it('столбцы — по нормализованной подстроке заголовка; описание идёт и в «описание из ТН ВЭД»', () => {
    const goods = goodsFromSheetRows([
      HEADER,
      [1, 8471300000, 'Ноутбуки Lenovo', 420.5, 120, 'шт', 12, 'x'],
      [2, ' 8473302008 ', 'Блоки питания', '96,0', '120', 'шт', '4', null],
    ])
    expect(goods).toEqual([
      { ...empty, tnvedCode: '8471300000', description: 'Ноутбуки Lenovo', tnvedDescription: 'Ноутбуки Lenovo', grossWeightKg: 420.5, quantity: 120, unit: 'шт', packagesCount: 12 },
      { ...empty, tnvedCode: '8473302008', description: 'Блоки питания', tnvedDescription: 'Блоки питания', grossWeightKg: 96, quantity: 120, unit: 'шт', packagesCount: 4 },
    ])
  })

  it('заголовки с другим регистром, пробелами и знаками тоже находятся; нет столбца — null', () => {
    const goods = goodsFromSheetRows([
      ['КОД  ТН-ВЭД (10 знаков)', 'Брутто'],
      ['8471300000', 'abc'],
    ])
    expect(goods).toEqual([
      { ...empty, tnvedCode: '8471300000', description: null, tnvedDescription: null, grossWeightKg: null, quantity: null, unit: null, packagesCount: null },
    ])
  })

  it('пустые строки пропускаются; без узнаваемых столбцов товаров нет', () => {
    expect(goodsFromSheetRows([HEADER, [null, null, '', null], [], [3, '', '   ', null, null, null, null, 'только прочее']])).toEqual([])
    expect(goodsFromSheetRows([['Наименование', 'Цена'], ['Ноутбук', 100]])).toEqual([])
    expect(goodsFromSheetRows([])).toEqual([])
  })
})

describe('readGoodsExcel', () => {
  it('читает первый лист файла', async () => {
    const r = await readGoodsExcel(workbookFile([HEADER, [1, '4202121900', 'Сумки', 54, 120, 'шт', 20]]))
    expect(r).toEqual({ goods: [{ ...empty, tnvedCode: '4202121900', description: 'Сумки', tnvedDescription: 'Сумки', grossWeightKg: 54, quantity: 120, unit: 'шт', packagesCount: 20 }] })
  })

  it('пустой лист — «Файл пуст»; лист без товаров — «Не найдено товаров»', async () => {
    expect(await readGoodsExcel(workbookFile([]))).toEqual({ problem: 'empty' })
    expect(await readGoodsExcel(workbookFile([HEADER]))).toEqual({ problem: 'noGoods' })
  })

  it('в книге нет листов — «В файле нет листов»', async () => {
    xlsxRead.impl = () => ({ SheetNames: [], Sheets: {} })
    expect(await readGoodsExcel(workbookFile([HEADER]))).toEqual({ problem: 'noSheets' })
  })

  it('файл не читается — ошибка наружу (экран показывает «Не удалось прочитать файл Excel»)', async () => {
    xlsxRead.impl = () => { throw new Error('Unsupported file') }
    await expect(readGoodsExcel(workbookFile([HEADER]))).rejects.toThrow('Unsupported file')
  })

  it('тексты проблем — прежние ключи dt.*', () => {
    expect(GOODS_EXCEL_MESSAGES).toEqual({ noSheets: 'dt.vFayleNetListov', empty: 'dt.faylPust', noGoods: 'dt.neNaydenoTovarovDlya' })
  })
})
