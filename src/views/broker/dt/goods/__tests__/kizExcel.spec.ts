import { describe, expect, it } from 'vitest'
import type { Import40GoodsItemInput } from '@/types/api'
import {
  cellCode, columnLetter, isLegacyMarkingsSheet, kizColumn, kizFileRows, matchKizRowsToGoods, parseLegacyMarkingsSheet,
  scanKizWorkbook, trimSheetRange, type KizSheet,
} from '../editor/kizExcel'

// «Из Excel» для КИЗ (правка №12): столбец кодов по шапке или по содержимому, старый формат без шапки, раскладка по
// товарам. Данные — обезличенные выдержки по образцу инвойса декларанта (номер инвойса в A, GTIN в «Штрих-код»).
const G1 = '4871813090801'
const G2 = '4871813090818'
const G3 = '4006381333931'
const BAD = '4871813090802'
const G4 = '4600000000008'

/** Лист: тексты — как показал бы Excel (General: длинные числа «4.87181E+12»). */
const sheet = (rows: unknown[][], name = 'Invoice', texts?: unknown[][]): KizSheet => ({
  name,
  rows,
  texts: texts ?? rows.map((r) => r.map((v) => (v == null ? null : typeof v === 'number' && v > 1e11 ? v.toExponential(5).replace('e+', 'E+') : String(v)))),
})
const none = new Set<string>()

describe('cellCode', () => {
  it('числа: целое — код; ведущие нули из текста формата; больше 15 цифр и E+ — искажено; дробь — не код', () => {
    expect(cellCode(4871813090801, '4.87181E+12')).toEqual({ codes: [G1] })
    expect(cellCode(4871813090801, '04871813090801')).toEqual({ codes: ['04871813090801'] })
    expect(cellCode(1.04600000000001e15, '1.046E+15')).toEqual({ lossy: true })
    expect(cellCode(3.41, '3.41')).toEqual({ codes: [] })
    expect(cellCode(null, null)).toBeNull()
    expect(cellCode('', '')).toBeNull()
  })

  it('строки: «\'» снимается, «4.87181E+12» — искажено, цифры с пробелами склеиваются, несколько кодов в ячейке', () => {
    expect(cellCode(`'${G1}`, null)).toEqual({ codes: [G1] })
    expect(cellCode('4.87181E+12', null)).toEqual({ lossy: true })
    expect(cellCode('4 871813 090801', null)).toEqual({ codes: [G1] })
    expect(cellCode(`${G1}\n${G2}`, null)).toEqual({ codes: [G1, G2] })
    expect(cellCode('rU-123456-abcde12345', null)).toEqual({ codes: ['RU-123456-ABCDE12345'] })
  })

  it('буквы столбцов', () => {
    expect([0, 3, 25, 26, 27].map(columnLetter)).toEqual(['A', 'D', 'Z', 'AA', 'AB'])
  })
})

describe('scanKizWorkbook', () => {
  it('инвойс декларанта: номер инвойса в A не берётся, столбец D «Штрих-код» — по шапке, «Итого» — пропуск', () => {
    const inv = sheet([
      ['INVOICE / ИНВОЙС', null, null, null],
      ['№ UR0910 Дата: 10.09.2026', null, null, null],
      ['Invoice No', 'Описание', 'Кол-во', 'Штрих-код'],
      [2026020201, 'Сушилка для белья', 470, 4871813090801],
      [2026020201, 'Полки для обуви', 300, G2],
      [2026020201, 'Корзина', 10, BAD],
      [2026020201, 'Корзина', 10, G1],
      ['Итого', null, 790, 4],
      [null, null, null, null],
    ])
    const scan = scanKizWorkbook([inv], none)
    expect(scan.legacy).toBeNull()
    expect(scan.best).toMatchObject({ source: 'header', col: 3, letter: 'D', header: 'Штрих-код', headerRow: 2, sheetName: 'Invoice' })
    expect(scan.best!.codes.map((c) => c.number)).toEqual([G1, G2, BAD])
    expect(scan.best).toMatchObject({ duplicates: 1, skipped: 1, badCheck: 1, lossy: 0 })
    // Выбор вручную: все непустые столбцы, найденный — со своим источником.
    expect(scan.options.map((o) => `${o.letter}:${o.source}`)).toEqual(['A:manual', 'B:manual', 'C:manual', 'D:header'])
    expect(scan.options[0].codes.map((c) => c.number)).toEqual(['2026020201'])
    // Уже введённые в товаре — повторы.
    expect(scanKizWorkbook([inv], new Set([G1])).best!.codes.map((c) => c.number)).toEqual([G2, BAD])
  })

  it('заголовки «EAN-13», «Barcode», «条形码», «商品条码» находятся; «European standard» — не EAN', () => {
    for (const h of ['EAN-13', 'Barcode', '条形码', '商品条码', 'GTIN (01)']) {
      const scan = scanKizWorkbook([sheet([['European standard', h], ['EN 71', G1], ['EN 71', G2]])], none)
      expect(scan.best, h).toMatchObject({ source: 'header', col: 1, header: h })
    }
    expect(scanKizWorkbook([sheet([['European standard'], ['ГОСТ 1'], ['ГОСТ 2']])], none).best).toBeNull()
  })

  it('без шапки: столбец из 13 цифр с годной контрольной цифрой — по содержимому; даты 20261021 и номер инвойса — нет', () => {
    const s = sheet([
      [20261021, 2026020201, 'Сушилка', G1],
      [20261021, 2026020201, 'Полка', G2],
      [20261022, 2026020201, 'Корзина', G3],
    ])
    const scan = scanKizWorkbook([s], none)
    expect(scan.best).toMatchObject({ source: 'content', col: 3, headerRow: null })
    expect(scan.best!.codes.map((c) => c.number)).toEqual([G1, G2, G3])
    // Только даты — ничего.
    expect(scanKizWorkbook([sheet([[20261021], [20261022]])], none).best).toBeNull()
    // Столбец, где больше половины — с ошибкой контрольной цифры, не берётся.
    expect(scanKizWorkbook([sheet([[BAD], ['4871813090803'], [G1]])], none).best).toBeNull()
  })

  it('по содержимому: шапка таблицы — подпись; столбец NTIN пропускается', () => {
    const s = sheet([['Код ТН ВЭД', 'Наименование', 'Код товара'], ['7323990000', 'Сушилка', G1], ['7323990000', 'Полка', G2]])
    expect(scanKizWorkbook([s], none).best).toMatchObject({ source: 'content', col: 2, header: 'Код товара', headerRow: 0 })
    expect(scanKizWorkbook([sheet([['NTIN', 'Штрих-код'], ['0200000123451', G1]])], none).best).toMatchObject({ col: 1, source: 'header' })
    expect(scanKizWorkbook([sheet([['NTIN (гр. 33.3)'], ['0200000123451']])], none).best).toBeNull()
  })

  it('старый формат «Книга1» без шапки (A номер, B 0, C 1, D 301) — значения из файла', () => {
    const rows = [['CODE1', 0, 1, 301], [null, null, null, null], ['CODE2', '1', '21', '101']]
    expect(isLegacyMarkingsSheet(rows)).toBe(true)
    const scan = scanKizWorkbook([sheet(rows, 'Лист1')], none)
    expect(scan.best).toBeNull()
    expect(scan.legacy!.rows.map((m) => [m.number, m.levelCode, m.idApplicationCode, m.idTypeCode])).toEqual([
      ['CODE1', '0', '01', '301'], ['CODE2', '1', '21', '101'],
    ])
    // Инвойс без шапки (B — описание) — не старый формат.
    expect(isLegacyMarkingsSheet([[2026020201, 'Сушилка', 470, 3.41]])).toBe(false)
  })

  it('ревью: «GTIN | количество» без шапки — не старый формат (количество не становится уровнем)', () => {
    const rows = [[4871813090801, 2], [4871813090818, 1], [4600000000008, 3]]
    expect(isLegacyMarkingsSheet(rows)).toBe(false)
    const scan = scanKizWorkbook([sheet(rows)], none)
    expect(scan.legacy).toBeNull()
    expect(scan.best).toMatchObject({ source: 'content', col: 0 })
  })

  it('ревью: старый разбор — номер как столбец кодов (заглавными, без «\'», искажённое и не код — пропуск), B–D только в формате', () => {
    const res = parseLegacyMarkingsSheet([
      [" 'abc123 ", 2, 2, '302'], [], ['', null, '', null], 'мусор', [null, '0', null, null],
      [1.04600000000001e15, 0, 1, 301],
      ['CODE3', 'комментарий длиннее шестнадцати', 'X', 'вид указан текстом'],
      ['ПРОСТО ТЕКСТ', 0, 1, 301],
    ])
    expect(res.rows).toEqual([
      { markingAfterRelease: false, kizCount: null, levelCode: '2', idTypeCode: '302', idApplicationCode: '02', number: 'ABC123', aggregated: false },
      { markingAfterRelease: false, kizCount: null, levelCode: null, idTypeCode: null, idApplicationCode: null, number: 'CODE3', aggregated: false },
    ])
    expect(res).toMatchObject({ skipped: 1, lossy: 1 })
  })

  it('ревью: примечание «Note: barcode labels attached» над таблицей не перебивает настоящий столбец «EAN»', () => {
    const s = sheet([
      ['PROFORMA INVOICE'],
      ['Note: barcode labels attached'],
      ['No', 'Description', 'Qty', 'EAN'],
      ['URS07', 'Dryer', 10, G1],
      ['URS08', 'Shelf', 5, G2],
      ['URS09', 'Basket', 3, G3],
      ['URS10', 'Hanger', 2, G4],
    ])
    const scan = scanKizWorkbook([s], none)
    expect(scan.best).toMatchObject({ source: 'header', col: 3, header: 'EAN', headerRow: 2 })
    expect(scan.best!.codes.map((c) => c.number)).toEqual([G1, G2, G3, G4])
  })

  it('ревью: «штрихкод» в описании товара не перебивает столбец GTIN — ни найденный по шапке, ни по содержимому', () => {
    const rows = [
      ['Артикул', 'Наименование', 'Кол-во', 'EAN-13'],
      ['SC-100', 'Сканер штрихкода', 2, G1],
      ['PR-200', 'Принтер этикеток', 1, G2],
    ]
    expect(scanKizWorkbook([sheet(rows)], none).best).toMatchObject({ source: 'header', col: 3 })
    // Шапки GTIN нет — столбец по содержимому, а не «по шапке» описания.
    const noHeader = rows.map((r, i) => (i === 0 ? ['Артикул', 'Наименование', 'Кол-во', 'Код товара'] : r))
    expect(scanKizWorkbook([sheet(noHeader)], none).best).toMatchObject({ source: 'content', col: 3 })
  })

  it('ревью: шапка, повторённая внутри данных («GTIN», «EAN13»), — не код', () => {
    const s = sheet([['Наименование', 'GTIN'], ['Сушилка', '4871813090801'], ['Наименование', 'GTIN'], ['Полка', '4871813090818'], ['Наименование', 'EAN13']])
    const scan = scanKizWorkbook([s], none)
    expect(scan.best!.codes.map((c) => c.number)).toEqual([G1, G2])
    expect(scan.best!.skipped).toBe(2)
  })

  it('искажённые Excel числа считаются, но не добавляются', () => {
    const scan = scanKizWorkbook([sheet([['Штрих-код'], [G1], [1.04600000000001e15], ['4.87181E+12']])], none)
    expect(scan.best).toMatchObject({ lossy: 2 })
    expect(scan.best!.codes.map((c) => c.number)).toEqual([G1])
  })

  it('столбец вручную: по правилам столбца по шапке, строка шапки — таблицы товаров', () => {
    const s = sheet([['Артикул', 'Наименование', 'Код ТН ВЭД', 'Серийный'], ['A-1', 'Сушилка', '7323990000', 'SN-0001'], ['A-2', 'Полка', '7323990000', 'SN-0002']])
    const c = kizColumn([s], 0, 3, none)
    expect(c).toMatchObject({ source: 'manual', headerRow: 0, header: 'Серийный' })
    expect(c.codes.map((x) => x.number)).toEqual(['SN-0001', 'SN-0002'])
  })
})

describe('trimSheetRange', () => {
  it('ревью: объявленный диапазон «A1:AZ300000» при одной ячейке сужается до реальных ячеек; только сужает', () => {
    const ws: Record<string, unknown> = { '!ref': 'A1:AZ300000', A1: { v: 'GTIN' }, B3: { v: G1 }, '!merges': [] }
    trimSheetRange(ws)
    expect(ws['!ref']).toBe('A1:B3')
    const wide: Record<string, unknown> = { '!ref': 'B2:C3', D9: { v: 1 }, C3: { v: 2 } }
    trimSheetRange(wide)
    expect(wide['!ref']).toBe('B2:C3')
    const empty: Record<string, unknown> = { '!ref': 'A1:Z100' }
    trimSheetRange(empty)
    expect(empty['!ref']).toBe('A1:Z100')
  })
})

describe('раскладка по товарам ДТ', () => {
  const goods = (o: Partial<Import40GoodsItemInput>[]): Import40GoodsItemInput[] =>
    o.map((x) => ({ description: null, tnvedCode: null, characteristics: [], ...x }) as unknown as Import40GoodsItemInput)

  it('строки файла: коды и сведения товара из той же шапки (артикул, наименование, код ТН ВЭД)', () => {
    const s = sheet([
      ['№', 'HS Code / ТН ВЭД', '货号 Артикул', '品名 Наименование', 'Штрих-код'],
      [1, 7323990000, 'URS07', 'Сушилка для белья 18 м', G1],
      [2, '7326 90 980 7', 'GSL010', 'Полки для обуви 4 яруса', `${G2}\n${G3}`],
    ])
    const scan = scanKizWorkbook([s], none)
    expect(kizFileRows([s], scan.best!)).toEqual([
      { codes: [G1], description: 'Сушилка для белья 18 м', tnved: '7323990000', article: 'URS07', model: null },
      { codes: [G2, G3], description: 'Полки для обуви 4 яруса', tnved: '7326909807', article: 'GSL010', model: null },
    ])
    // По содержимому (без шапки) — раскладки нет.
    expect(kizFileRows([s], { ...scan.best!, source: 'content' })).toBeNull()
  })

  it('артикул; код ТН ВЭД, если товар с ним один; два товара с одним кодом — по наименованию; без совпадений — не сопоставлено', () => {
    const g = goods([
      { description: 'СУШИЛКА ДЛЯ БЕЛЬЯ 18 М', tnvedCode: '7323990000', characteristics: [{ productArticle: 'URS-07' }] },
      { description: 'ПОЛКИ ДЛЯ ОБУВИ 4 ЯРУСА', tnvedCode: '7326909807', characteristics: [{ name: 'ПОЛКА', productArticle: '506' }] },
      { description: 'КОРЗИНА ПЛЕТЁНАЯ', tnvedCode: '7326909807', characteristics: [{ productArticle: '506' }] },
      { description: 'ВЕШАЛКА', tnvedCode: '7323990000', characteristics: [{ productModelName: 'JJ 17' }] },
    ])
    const res = matchKizRowsToGoods([
      { codes: ['C1'], description: null, tnved: null, article: 'urs07', model: null },
      { codes: ['C2'], description: 'Корзина плетёная', tnved: '7326909807', article: '506', model: null },
      { codes: ['C3'], description: 'Полки для обуви', tnved: '7326909807', article: null, model: null },
      { codes: ['C4', 'C5'], description: null, tnved: null, article: 'JJ-17', model: null },
      { codes: ['C6'], description: 'Зонт', tnved: '6601100000', article: 'X', model: null },
      { codes: ['C7'], description: null, tnved: null, article: null, model: 'jj17' },
      // «Отсутствует» в модели (шаблон декларанта) — не ключ; дальше — по коду ТН ВЭД и наименованию.
      { codes: ['C8'], description: 'Вешалка', tnved: '7323990000', article: null, model: 'ОТСУТСТВУЕТ' },
    ], [...g.slice(0, 3), { ...g[3], characteristics: [{ productModelName: 'JJ 17' }, { productArticle: 'Отсутствует' }] }])
    expect(res.groups).toEqual([
      { goodsIndex: 0, codes: ['C1'] },
      { goodsIndex: 1, codes: ['C3'] },
      { goodsIndex: 2, codes: ['C2'] },
      { goodsIndex: 3, codes: ['C4', 'C5', 'C7', 'C8'] },
    ])
    expect(res.unmatched).toEqual(['C6'])
  })

  it('ревью: точное наименование главнее начала («Сушилка» при «СУШИЛКА» и «СУШИЛКА ДЛЯ БЕЛЬЯ»)', () => {
    const g = goods([{ description: 'СУШИЛКА ДЛЯ БЕЛЬЯ' }, { description: 'СУШИЛКА' }])
    expect(matchKizRowsToGoods([{ codes: ['C1'], description: 'Сушилка', tnved: null, article: null, model: null }], g))
      .toEqual({ groups: [{ goodsIndex: 1, codes: ['C1'] }], unmatched: [] })
    // Начало — по-прежнему, когда точного нет.
    expect(matchKizRowsToGoods([{ codes: ['C2'], description: 'Сушилка для', tnved: null, article: null, model: null }], g).groups)
      .toEqual([{ goodsIndex: 0, codes: ['C2'] }])
  })
})
