import { describe, expect, it } from 'vitest'
import { placesFromText } from '../places'

// Те же образцы, что zircon-ai/tests/test_import2.py::test_parse_places — правило одно.
describe('placesFromText — места словами (Импорт 2.0, правка 2.5)', () => {
  it.each([
    ['两个木箱，编号 3 和 4.        Два деревянных ящика № 3 и № 4', 2],
    ['2 盒            2 ящика', 2],
    ['1 盒            1 ящик', 1],
    ['95米/卷，共6卷，2托+配件1托.   95 метров в рулоне, всего 6 рулонов; 2 паллеты + 1 паллета с комплектующими.', 3],
    [' 69张/托，67张/托，共2托.   Всего две паллеты:   69 листов/паллета,   67 листов/паллета.', 2],
    ['X100：4台，X50：2台，1托，\n自带启动柜6台，1托. X100: 4 шт.; X50: 2 шт. (1 партия);\n6 шкафов (1 партия).', 2],
    ['共计19件. 19 мест', 19],
    ['12', 12],
    ['12 ctns', 12],
    [47, 47],
    ['2 pallets', 2],
  ])('%s → %s', (text, value) => {
    expect(placesFromText(text)).toEqual({ value, ambiguous: false })
  })

  it.each([
    '50箱，1托.    50 коробок, 1 палета',
    '电动葫芦4木箱，配件2木箱+1托盘.   4 деревянных ящика для талей; 2 деревянных ящика и 1 поддон для комплектующих.',
    '1 партия',
    '№ 3 и № 4',
  ])('неоднозначно: %s', (text) => {
    expect(placesFromText(text)).toEqual({ value: null, ambiguous: true })
  })

  it('пусто — не неоднозначно', () => {
    expect(placesFromText(null)).toEqual({ value: null, ambiguous: false })
    expect(placesFromText('  ')).toEqual({ value: null, ambiguous: false })
  })
})
