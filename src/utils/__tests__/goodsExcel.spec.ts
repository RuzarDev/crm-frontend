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

// 19.10.2026: инвойс поставщика не загружался — шапка таблицы не в первой строке, «Наименование» вместо
// «Коммерческое описание», «ТН ВЭД» без «Код».
describe('goodsFromSheetRows: инвойсы и спецификации', () => {
  it('шапка ниже реквизитов, русские синонимы, нетто/стоимость/страна, итоговая строка пропускается', () => {
    const goods = goodsFromSheetRows([
      ['ИНВОЙС № 45 от 01.10.2026'],
      ['Продавец: Ningbo Trading Co.', null, null, 'Покупатель: ТОО «Space logistics Kz»'],
      [],
      ['№', 'Наименование товара', 'ТН ВЭД', 'Кол-во, шт', 'Кол-во мест', 'Вес брутто, кг', 'Вес нетто, кг', 'Страна происхождения', 'Цена', 'Сумма, USD'],
      [1, 'Сушилка для белья 18 м', '7323 99 000 0', '1 200', 40, '719,1', '680,5', 'cn', '1,34', '1 602,70'],
      [2, 'Полка для туалета', 9403208009, 300, 12, 1438.2, 1363, 'Китай', 5.5, 1649.7],
      [null, 'Итого', null, 1500, 52, 2157.3, 2043.5, null, null, 3252.4],
    ])
    expect(goods).toEqual([
      { ...empty, tnvedCode: '7323990000', description: 'Сушилка для белья 18 м', tnvedDescription: 'Сушилка для белья 18 м', quantity: 1200, unit: null, packagesCount: 40, grossWeightKg: 719.1, netWeightKg: 680.5, countryOfOrigin: 'CN', customsValue: 1602.7 },
      // «Китай» — не код страны: не угадываем, страну выберет декларант.
      { ...empty, tnvedCode: '9403208009', description: 'Полка для туалета', tnvedDescription: 'Полка для туалета', quantity: 300, unit: null, packagesCount: 12, grossWeightKg: 1438.2, netWeightKg: 1363, countryOfOrigin: null, customsValue: 1649.7 },
    ])
  })

  it('английские заголовки; код числом теряет ведущий ноль — возвращаем; «1,234.50», «1,234,567»', () => {
    const goods = goodsFromSheetRows([
      ['Description', 'HS Code', 'Qty', 'Ctns', 'G.W.', 'N.W.', 'Amount'],
      ['Live horses', 101210000, '1,234,567', 3, '1,234.50', '1 200', 'USD 10,000.00'],
      ['Ponies', '0101 29 900 0', '1,5', 1, 10, 9, 100],
    ])
    expect(goods[0]).toMatchObject({ tnvedCode: '0101210000', description: 'Live horses', quantity: 1234567, packagesCount: 3, grossWeightKg: 1234.5, netWeightKg: 1200, customsValue: 10000 })
    // Одна запятая — десятичная.
    expect(goods[1]).toMatchObject({ tnvedCode: '0101299000', quantity: 1.5 })
  })

  // Шаблон декларанта «ХОЗКА» (19.10.2026): «НЕТТО» — вес штуки, «Вес нетто итого» — итог, рядом пустой дубль;
  // «ХС (ВИД УПАКОВКИ)» пустой, «СТ (ВИД УПАКОВКИ)» заполнен; «ЦЕНА ЗА ЕДИНИЦУ» и «Стоимость итого USD».
  it('из похожих столбцов — с данными, для весов и стоимости — «итого»; дробный шум Excel убирается', () => {
    const goods = goodsFromSheetRows([
      [],
      ['Наименование', 'Количество', 'ЦЕНА ЗА ЕДИНИЦУ', 'Стоимость итого USD', 'Код ТНВЭД', 'НЕТТО', 'Вес нетто итого', 'Вес нетто итого', 'КОЛ-ВО МЕСТ', 'ХС (ВИД УПАКОВКИ)', 'СТ (ВИД УПАКОВКИ)'],
      ['Сушилка для белья 18 м', 47, 3.41, 160.27, 7323990000, 24, 1128, null, 47, null, 'CT'],
      ['Шторы для ванной', 30, 1.03, 30.900000000000002, 3924900009, 27.3, 819, null, 30, null, 'CT'],
    ])
    expect(goods[0]).toMatchObject({ description: 'Сушилка для белья 18 м', quantity: 47, customsValue: 160.27, netWeightKg: 1128, grossWeightKg: null, packagesCount: 47, unit: 'CT' })
    expect(goods[1]).toMatchObject({ netWeightKg: 819, customsValue: 30.9 })
  })

  it('«Количество грузовых мест» — местам, а не количеству; «Код ТН ВЭД» — коду, а не описанию', () => {
    const goods = goodsFromSheetRows([
      ['Количество грузовых мест', 'Количество товара', 'Код ТН ВЭД', 'Коммерческое описание товара'],
      [4, 120, '8473302008', 'Блоки питания'],
    ])
    expect(goods[0]).toMatchObject({ packagesCount: 4, quantity: 120, tnvedCode: '8473302008', description: 'Блоки питания' })
  })
})

describe('goodsFromSheetRows: сведения шаблона декларанта (details, только ДТ)', () => {
  const HEAD = ['№ ИНВОЙСА', 'ДАТА ИНВОЙСА', 'ПРОИЗВОДИТЕЛЬ', 'МАРКА', 'ТОВАРНЫЙ ЗНАК', 'Артикул', 'СЕРИЙНЫЙ НОМЕР', 'Наименование',
    'ЕД.ИЗМЕРЕНИЯ (ШТ.,ПАРА)', 'Количество', 'Код ТНВЭД', 'КОЛ-ВО МЕСТ', 'ЧАСТЬ МЕСТА', 'МОДЕЛЬ', 'ГОСТ', 'СОРТ', 'НОМЕР ДОКУМЕНТА',
    'ДАТА ДОКУМЕНТА', 'КОД ДОКУМЕНТА', 'КОЛ-ВО ИНДИВ. УПАК.', 'С УПАКОВКОЙ']
  const ROW = ['UR0910 ', 46275, 'Yiwu Longju Trading Firm', 'Отсутствует', 'ОТСУТСТВУЕТ', 'URS07', '-', 'Сушилка', 'шт', 47, 7323990000, 0, 1,
    'X-200', 'ГОСТ 123', 'ОТСУТСТВУЕТ', 'KZ.123', '05.09.2026', 1401, 47, 'С УПАКОВКОЙ']

  it('читает сведения: «Отсутствует» — пусто, текст заглавными, даты и код документа нормализуются', () => {
    const [g] = goodsFromSheetRows([HEAD, ROW], { details: true })
    expect(g.details).toEqual({
      manufacturerName: 'YIWU LONGJU TRADING FIRM', tradeMarkName: null, productMarkName: null, productModelName: 'X-200',
      productArticle: 'URS07', serialNumbers: null, standardName: 'ГОСТ 123', productSortName: null, measureUnit: 'ШТ',
      cargoPartQuantity: 1, individualPackages: 47, packageAvailabilityCode: '1',
      docTypeCode: '01401', docNumber: 'KZ.123', docDate: '2026-09-05', invoiceNumber: 'UR0910', invoiceDate: '2026-09-10',
      rowName: null, packageQuantity: null, lineNo: null, originText: null,
    })
    // «ЧАСТЬ МЕСТА» и «КОЛ-ВО ИНДИВ. УПАК.» не перехватывают места и количество
    expect(g).toMatchObject({ quantity: 47, packagesCount: 0, tnvedCode: '7323990000' })
  })

  it('без опции details (транзит) сведений нет', () => {
    const [g] = goodsFromSheetRows([HEAD, ROW])
    expect(g.details).toBeUndefined()
  })
})

describe('readGoodsExcel', () => {
  it('читает первый лист файла', async () => {
    const r = await readGoodsExcel(workbookFile([HEADER, [1, '4202121900', 'Сумки', 54, 120, 'шт', 20]]))
    expect(r).toEqual({ goods: [{ ...empty, tnvedCode: '4202121900', description: 'Сумки', tnvedDescription: 'Сумки', grossWeightKg: 54, quantity: 120, unit: 'шт', packagesCount: 20 }] })
  })

  it('из нескольких листов берёт тот, где есть таблица товаров (Invoice без таблицы, Packing list с ней)', async () => {
    const wb = realXlsx.utils.book_new()
    realXlsx.utils.book_append_sheet(wb, realXlsx.utils.aoa_to_sheet([['Банковские реквизиты'], ['IBAN', 'KZ00']]), 'Invoice')
    realXlsx.utils.book_append_sheet(wb, realXlsx.utils.aoa_to_sheet([['Наименование', 'ТН ВЭД', 'Мест'], ['Корзина', '3924900009', 7]]), 'Packing list')
    const out = realXlsx.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const blob = new Blob([out])
    if (!('arrayBuffer' in blob)) Object.assign(blob, { arrayBuffer: async () => out })
    const r = await readGoodsExcel(blob)
    expect(r).toMatchObject({ goods: [{ description: 'Корзина', tnvedCode: '3924900009', packagesCount: 7 }] })
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
