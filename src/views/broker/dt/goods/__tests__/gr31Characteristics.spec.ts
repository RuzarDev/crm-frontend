import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureOkeiUnits, resetOkeiUnits } from '../editor/okei'
import { characteristicTotals, isBlankCharacteristic, rowsFromLegacy, rowsWithoutMeasure, singleRowOf, tradeMarksOf } from '../editor/characteristics'
import { gr31Number, gr31Packaging, gr31Text } from '../editor/gr31Text'

// Тот же образец, что в серверном Gr31CharacteristicRowsTests (печать бланка) — текст должен совпадать.
const OWNER_SAMPLE =
  '1. ШТОРЫ ДЛЯ ВАННОЙ 180*240 (ИЗ ТЕКСТИЛЬНОГО МАТЕРИАЛА), ШТОРЫ ДЛЯ ВАННОЙ 180*240 (ИЗ ТЕКСТИЛЬНОГО МАТЕРИАЛА): '
  + 'ПРОИЗВОДИТЕЛЬ: YIWU LONGJU TRADING FIRM, ТОВАРНЫЙ ЗНАК: YIWU LONGJU TRADING FIRM, МАРКА: ОТСУТСТВУЕТ, '
  + 'МОДЕЛЬ: ОТСУТСТВУЕТ, АРТИКУЛ: JJ-17, СТАНДАРТ (ГОСТ): ОТСУТСТВУЕТ, СОРТ: ОТСУТСТВУЕТ, СТОИМОСТЬ: 1854, '
  + 'КОЛИЧЕСТВО: 1800 ШТ;\n2. 30, BX-30'

vi.mock('@/api/references', () => ({
  referencesApi: { listOkeiUnits: vi.fn(async () => [{ id: '1', code: '796', name: 'Штука', shortName: 'ШТ', isActive: true }]) },
}))

describe('текст гр. 31 как в КЕДЕН', () => {
  beforeEach(async () => {
    resetOkeiUnits()
    await ensureOkeiUnits() // краткие наименования ОКЕИ: 796 → ШТ
  })

  it('образец владельца: «1. {описание}, {строка}: …;» и «2. места, упаковка-количество»', () => {
    const text = gr31Text({
      description: 'шторы для ванной 180*240 (из текстильного материала)', tnvedDescription: null,
      cargoPlacesQuantity: 30, packagesCount: 30, packageKindCode: 'BX', packageQuantity: 30,
      characteristics: [{
        name: 'ШТОРЫ ДЛЯ ВАННОЙ 180*240 (ИЗ ТЕКСТИЛЬНОГО МАТЕРИАЛА)', quantity: 1800, unitCode: '796', invoiceValue: 1854.0,
        manufacturerName: 'YIWU LONGJU TRADING FIRM', tradeMarkName: 'YIWU LONGJU TRADING FIRM', productArticle: 'JJ-17',
      }],
    })
    expect(text).toBe(OWNER_SAMPLE)
  })

  it('несколько строк — каждая с новой строки; пустое наименование строки — описание товара; серийные — если есть', () => {
    const text = gr31Text({
      description: 'ДУХОВКА', tnvedDescription: null, cargoPlacesQuantity: 2, packagesCount: null, packageKindCode: null, packageQuantity: null,
      characteristics: [
        { productModelName: 'M1', serialNumbers: 'S1, S2', quantity: 1.5 },
        { name: 'духовка белая', productModelName: 'M2', invoiceValue: 10.5 },
      ],
    }).split('\n')
    expect(text).toHaveLength(3)
    expect(text[0]).toBe('1. ДУХОВКА, ДУХОВКА: ПРОИЗВОДИТЕЛЬ: ОТСУТСТВУЕТ, ТОВАРНЫЙ ЗНАК: ОТСУТСТВУЕТ, МАРКА: ОТСУТСТВУЕТ, МОДЕЛЬ: M1, '
      + 'АРТИКУЛ: ОТСУТСТВУЕТ, СТАНДАРТ (ГОСТ): ОТСУТСТВУЕТ, СОРТ: ОТСУТСТВУЕТ, СЕРИЙНЫЕ НОМЕРА: S1, S2, СТОИМОСТЬ: ОТСУТСТВУЕТ, КОЛИЧЕСТВО: 1.5;')
    expect(text[1]).toMatch(/^ДУХОВКА БЕЛАЯ: ПРОИЗВОДИТЕЛЬ: ОТСУТСТВУЕТ, .*МОДЕЛЬ: M2, .*СТОИМОСТЬ: 10\.5, КОЛИЧЕСТВО: ОТСУТСТВУЕТ;$/)
    expect(text[2]).toBe('2. 2')
  })

  it('единственная строка без количества — гр. 41 товара (как сервер); пустые строки не печатаются', () => {
    const base = { description: 'ПАРТА', tnvedDescription: null, cargoPlacesQuantity: null, packagesCount: null, packageKindCode: null, packageQuantity: null }
    const one = gr31Text({ ...base, quantity: 800, unitCode: '796', characteristics: [{ tradeMarkName: 'SUNO' }, { name: ' ' }] })
    expect(one.split('\n')).toHaveLength(1)
    expect(one).toContain('КОЛИЧЕСТВО: 800 ШТ;')
    // 2+ строк — без подстановки
    const two = gr31Text({ ...base, quantity: 800, unitCode: '796', characteristics: [{ tradeMarkName: 'SUNO' }, { productModelName: 'M2', quantity: 5, unitCode: '796' }] })
    expect(two.split('\n')[0]).toContain('КОЛИЧЕСТВО: ОТСУТСТВУЕТ;')
    expect(two.split('\n')[1]).toContain('КОЛИЧЕСТВО: 5 ШТ;')
  })

  // (баг, итоговое ревью пакета 7, I1) Единственная строка следует за гр. 41 / гр. 42 — так же, как сервер (Gr31Text).
  it('единственная строка без стоимости — гр. 42; строк нет, а гр. 41 / гр. 42 есть — одна строка с ними', () => {
    const base = { description: 'ПАРТА', tnvedDescription: null, cargoPlacesQuantity: null, packagesCount: null, packageKindCode: null, packageQuantity: null }
    expect(gr31Text({ ...base, quantity: 800, unitCode: '796', customsValue: 4233.6, characteristics: [{ tradeMarkName: 'SUNO' }] }))
      .toContain('СТОИМОСТЬ: 4233.6, КОЛИЧЕСТВО: 800 ШТ;')
    expect(gr31Text({ ...base, quantity: 800, unitCode: '796', customsValue: 4233.6, characteristics: [{ tradeMarkName: 'SUNO' }, { productModelName: 'M2' }] }))
      .not.toContain('4233.6')
    expect(gr31Text({ ...base, quantity: 800, unitCode: '796', customsValue: 4233.6, characteristics: [{}] })).toBe(
      '1. ПАРТА, ПАРТА: ПРОИЗВОДИТЕЛЬ: ОТСУТСТВУЕТ, ТОВАРНЫЙ ЗНАК: ОТСУТСТВУЕТ, МАРКА: ОТСУТСТВУЕТ, МОДЕЛЬ: ОТСУТСТВУЕТ, '
      + 'АРТИКУЛ: ОТСУТСТВУЕТ, СТАНДАРТ (ГОСТ): ОТСУТСТВУЕТ, СОРТ: ОТСУТСТВУЕТ, СТОИМОСТЬ: 4233.6, КОЛИЧЕСТВО: 800 ШТ;')
    expect(gr31Text({ ...base, quantity: null, unitCode: null, customsValue: null, characteristics: [] })).toBe('1. ПАРТА')
  })

  it('строк нет — только описание; ни описания, ни мест — пусто', () => {
    const base = { tnvedDescription: 'ВИНТЫ', cargoPlacesQuantity: null, packagesCount: null, packageKindCode: null, packageQuantity: null }
    expect(gr31Text({ ...base, description: null, characteristics: [] })).toBe('1. ВИНТЫ')
    expect(gr31Text({ ...base, tnvedDescription: null, description: null, characteristics: [] })).toBe('')
  })

  it('числа без лишних нулей; упаковка без количества — места', () => {
    expect(gr31Number(1854.0)).toBe('1854')
    expect(gr31Number(12.5)).toBe('12.5')
    expect(gr31Number(0.1 + 0.2)).toBe('0.3')
    expect(gr31Packaging(30, 'bx', null)).toBe('30, BX-30')
    expect(gr31Packaging(0, 'PK', 5)).toBe('PK-5')
    expect(gr31Packaging(0, null, null)).toBeNull()
  })
})

describe('строки характеристик: помощники', () => {
  it('строка 1 из прежних одиночных полей — без копии гр. 41 / гр. 42; всё пусто — строк нет', () => {
    const legacy = { tradeMarkName: 'ACME', quantity: 5, unitCode: '796', invoiceValue: 9, extras: { standardName: 'ГОСТ' } }
    expect(rowsFromLegacy(legacy)).toEqual([
      expect.objectContaining({ tradeMarkName: 'ACME', quantity: null, unitCode: null, invoiceValue: null, standardName: 'ГОСТ', name: null }),
    ])
    expect(rowsFromLegacy({})).toEqual([])
    expect(rowsFromLegacy({ quantity: 5, invoiceValue: 9 } as Parameters<typeof rowsFromLegacy>[0])).toEqual([])
    expect(isBlankCharacteristic({ name: ' ', quantity: null })).toBe(true)
  })

  it('итоги: количество — строк в единице гр. 41 (в т. ч. «55» = «055»), стоимость — всех строк со стоимостью', () => {
    const t = characteristicTotals({
      quantity: 10, unitCode: '055', customsValue: 100,
      characteristics: [{ quantity: 4, unitCode: '55', invoiceValue: 40 }, { quantity: 6, unitCode: '055', invoiceValue: 60 }, { quantity: 3, unitCode: '166' }],
    })
    expect(t).toEqual({ quantity: 10, value: 100, quantityMismatch: false, valueMismatch: false })
    const off = characteristicTotals({ quantity: 11, unitCode: '055', customsValue: 99, characteristics: [{ quantity: 10, unitCode: '055', invoiceValue: 100 }] })
    expect(off.quantityMismatch && off.valueMismatch).toBe(true)
    // у товара нет ДЕИ (гр. 41 пуста) — количество не сверяется
    expect(characteristicTotals({ quantity: null, unitCode: null, customsValue: null, characteristics: [{ quantity: 1, unitCode: '796' }] }).quantityMismatch).toBe(false)
  })

  it('строки, которые уйдут в XML без количества: номера как в таблице', () => {
    expect(rowsWithoutMeasure({ quantity: 800, unitCode: '796', characteristics: [{ tradeMarkName: 'A' }] })).toEqual({ noUnit: [], noQuantity: [] })
    expect(rowsWithoutMeasure({ quantity: null, unitCode: null, characteristics: [{ quantity: 5 }] })).toEqual({ noUnit: [1], noQuantity: [] })
    expect(rowsWithoutMeasure({ quantity: 800, unitCode: '796', characteristics: [{ tradeMarkName: 'A' }, {}, { quantity: 3 }, { quantity: 1, unitCode: '796' }] }))
      .toEqual({ noUnit: [3], noQuantity: [1] })
  })

  it('строка, которая следует за товаром: единственная непустая или единственная пустая', () => {
    const a = { tradeMarkName: 'A' }
    const blank = { name: null }
    expect(singleRowOf([a])).toBe(a)
    expect(singleRowOf([blank, a])).toBe(a)
    expect(singleRowOf([blank])).toBe(blank)
    expect(singleRowOf([blank, { name: ' ' }])).toBeNull()
    expect(singleRowOf([a, { productModelName: 'B' }])).toBeNull()
    expect(singleRowOf([])).toBeNull()
  })

  it('марки всех строк (ТРОИС), без пустых', () => {
    expect(tradeMarksOf({ characteristics: [{ tradeMarkName: 'LG' }, { tradeMarkName: ' ' }, { tradeMarkName: 'SONY' }] })).toEqual(['LG', 'SONY'])
  })
})
