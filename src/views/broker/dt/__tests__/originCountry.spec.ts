// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isEuCode, normalizeOrigin, originForGoods, specialCountryKey } from '../originCountry'

// Гр. 16 по гр. 34а — Решение КТС № 257; коды — R.055 19.14.1 (те же правила на сервере: OriginCountryCodes).
describe('originCountry — гр. 16 и особые значения страны', () => {
  it.each([
    [['156'], '156'],
    [['156', ' 156 '], '156'],
    [['156', '268'], '99'],
    [['156', '00'], '99'],     // неизвестна хотя бы у одного среди других — РАЗНЫЕ
    [['00', '00'], '00'],      // у всех неизвестна — НЕИЗВЕСТНО
    [['ЕС', 'EU'], 'ЕС'],      // один Евросоюз в двух написаниях
    [['ЕС', '380'], '99'],
    [['', null, undefined], null],
  ] as [(string | null | undefined)[], string | null][])('%j → %s', (goods, expected) => {
    expect(originForGoods(goods)).toBe(expected)
  })

  it('прежнее «000» — это «99»; Евросоюз — «ЕС» и «EU»', () => {
    expect(normalizeOrigin('000')).toBe('99')
    expect(normalizeOrigin(' 156 ')).toBe('156')
    expect(normalizeOrigin(null)).toBe('')
    expect(isEuCode('ЕС')).toBe(true)
    expect(isEuCode('eu')).toBe(true)
    expect(isEuCode('ES')).toBe(false)
    expect(['99', '000', '00', 'ЕС', 'EU', '156'].map(specialCountryKey)).toEqual(['various', 'various', 'unknown', 'eu', 'eu', null])
  })
})
