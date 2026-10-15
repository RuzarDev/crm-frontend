import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureOkeiUnits, okeiFromText, resetOkeiUnits } from '../editor/okei'
import { quantityByUnit } from '../editor/characteristics'
import { buildRows, defaultMapping, detectHeader, parseCellNumber, splitPasted } from '../editor/characteristicsPaste'

const units = vi.hoisted(() => [
  { id: '1', code: '796', name: 'Штука', shortName: 'ШТ', isActive: true },
  { id: '2', code: '166', name: 'Килограмм', shortName: 'КГ', isActive: true },
  { id: '3', code: '055', name: 'Квадратный метр', shortName: 'М2', isActive: true },
  { id: '4', code: '112', name: 'Литр', shortName: 'Л', isActive: true },
  { id: '5', code: '006', name: 'Метр', shortName: 'М', isActive: true },
])
vi.mock('@/api/references', () => ({ referencesApi: { listOkeiUnits: vi.fn(async () => units) } }))

describe('вставка строк гр. 31: разбор текста', () => {
  beforeEach(async () => {
    resetOkeiUnits()
    await ensureOkeiUnits()
  })

  it('Excel (табуляция): ячейки в кавычках с переводом строки и "" внутри; пустые строки пропускаются', () => {
    const { cells, delimiter } = splitPasted('ПАРТА\t10\tШТ\r\n\r\n"СТОЛ\nБОЛЬШОЙ"\t2\t"шт ""Б"""\n')
    expect(delimiter).toBe('tab')
    expect(cells).toEqual([['ПАРТА', '10', 'ШТ'], ['СТОЛ\nБОЛЬШОЙ', '2', 'шт "Б"']])
  })

  it('текст через «;»; без разделителя — одна колонка; кавычка внутри текста — обычный знак (27")', () => {
    expect(splitPasted('Монитор 27";5;шт\nКабель;10;м')).toEqual({ cells: [['Монитор 27"', '5', 'шт'], ['Кабель', '10', 'м']], delimiter: 'semicolon' })
    expect(splitPasted('Парта\n  \nСтул')).toEqual({ cells: [['Парта'], ['Стул']], delimiter: 'none' })
  })

  it('числа с пробелами, запятыми и точками; отрицательные и мусор — не числа', () => {
    expect(parseCellNumber('1 234,5')).toBe(1234.5)
    expect(parseCellNumber('1 234,50')).toBe(1234.5)
    expect(parseCellNumber('1,234.5')).toBe(1234.5)
    expect(parseCellNumber('1.234,5')).toBe(1234.5)
    expect(parseCellNumber('1.234.567')).toBe(1234567)
    expect(parseCellNumber('1,234,567')).toBe(1234567)
    expect(parseCellNumber('12,5')).toBe(12.5)
    expect(parseCellNumber('0')).toBe(0)
    expect(parseCellNumber('-5')).toBeNull()
    expect(parseCellNumber('abc')).toBeNull()
    expect(parseCellNumber('')).toBeNull()
  })

  it('единица ОКЕИ по тексту: кр. наименование, код, наименование, латиница; справочника нет — код как есть', () => {
    expect(okeiFromText('шт')).toBe('796')
    expect(okeiFromText('ШТ.')).toBe('796')
    expect(okeiFromText('кг')).toBe('166')
    expect(okeiFromText('М2')).toBe('055')
    expect(okeiFromText('m2')).toBe('055') // латинская M
    expect(okeiFromText('м²')).toBe('055')
    expect(okeiFromText('55')).toBe('055')
    expect(okeiFromText('796')).toBe('796')
    expect(okeiFromText('килограмм')).toBe('166')
    expect(okeiFromText('PCS')).toBe('796')
    expect(okeiFromText('KG')).toBe('166')
    expect(okeiFromText('M')).toBe('006') // латинская M — кириллическая «М» справочника
    expect(okeiFromText('999')).toBeNull() // нет в справочнике
    expect(okeiFromText('ящик')).toBeNull()
    expect(okeiFromText('')).toBeNull()
    resetOkeiUnits()
    expect(okeiFromText('999')).toBe('999')
    expect(okeiFromText('pcs')).toBe('796')
  })

  it('порядок колонок по умолчанию: Наименование, Кол-во, Ед., Стоимость, Производитель, Тов. знак, Марка, Модель, Артикул…', () => {
    expect(defaultMapping(9)).toEqual(['name', 'quantity', 'unitCode', 'invoiceValue', 'manufacturerName', 'tradeMarkName', 'productMarkName', 'productModelName', 'productArticle'])
    expect(defaultMapping(14).slice(9)).toEqual(['standardName', 'productSortName', 'serialNumbers', null, null])
  })

  it('строки: ЗАГЛАВНЫЕ, числа, единицы; нераспознанное — в issues, ячейка пустая; пустые строки не загружаются', () => {
    const { cells } = splitPasted([
      'парта школьная\t1 800\tшт\t1 854,00\tyiwu\tsuno\t\tp-1\tA-17',
      'стул\t2,5\tящик\tabc',
      '\t\t\t',
      'стол\t100 кг',
    ].join('\n'))
    const { rows, issues } = buildRows(cells, defaultMapping(9))
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      name: 'ПАРТА ШКОЛЬНАЯ', quantity: 1800, unitCode: '796', invoiceValue: 1854, manufacturerName: 'YIWU', tradeMarkName: 'SUNO',
      productMarkName: null, productModelName: 'P-1', productArticle: 'A-17',
    })
    expect(rows[1]).toMatchObject({ name: 'СТУЛ', quantity: 2.5, unitCode: null, invoiceValue: null })
    // «100 кг» в колонке количества — количество и единица
    expect(rows[2]).toMatchObject({ name: 'СТОЛ', quantity: 100, unitCode: '166' })
    expect(issues).toEqual([
      { row: 1, field: 'unitCode', kind: 'unit', raw: 'ящик' },
      { row: 1, field: 'invoiceValue', kind: 'number', raw: 'abc' },
    ])
  })

  it('подписи колонок в первой строке задают порядок; колонку можно не загружать; длиннее предела — обрезано и в issues', () => {
    const { cells } = splitPasted(`Модель;Кол-во;Ед. изм.;Комментарий;Артикул\nM1;5;м2;x;${'A'.repeat(60)}`)
    const header = detectHeader(cells[0])
    expect(header).toEqual(['productModelName', 'quantity', 'unitCode', null, 'productArticle'])
    expect(detectHeader(['ПАРТА', '10', 'ШТ'])).toBeNull()
    const { rows, issues } = buildRows(cells, header!, true)
    expect(rows).toEqual([expect.objectContaining({ productModelName: 'M1', quantity: 5, unitCode: '055', productArticle: 'A'.repeat(50), name: null })])
    expect(issues).toEqual([{ row: 0, field: 'productArticle', kind: 'tooLong', raw: 'A'.repeat(60), max: 50 }])
  })

  it('итог количества по единицам — в порядке появления; без единицы — отдельно', () => {
    expect(quantityByUnit([
      { quantity: 1800, unitCode: '796' }, { quantity: 2.5, unitCode: '166' }, { quantity: 200, unitCode: '796' }, { quantity: 3 }, { name: 'X' },
    ])).toEqual([{ unitCode: '796', quantity: 2000 }, { unitCode: '166', quantity: 2.5 }, { unitCode: '', quantity: 3 }])
  })
})
