import { describe, expect, it } from 'vitest'
import { clampRound, formatFixed, formatMoney, parseNumber } from '../number'

describe('parseNumber', () => {
  it.each([
    ['1234.56', 1234.56], ['1234,56', 1234.56], ['1 234,56', 1234.56], ['1 234.5', 1234.5],
    ['-12', -12], ['  7 ', 7], ['', null], ['   ', null], ['abc', null], ['1.2.3', null], ['.5', 0.5],
    // вставка из Excel/банка: последний из «,» и «.» — десятичный, второй — разделитель тысяч
    ['1,234.56', 1234.56], ['1.234,56', 1234.56], ['1,234,567.8', 1234567.8], ['1.234.567,8', 1234567.8],
    ['1 234,56', 1234.56], ['1 234,56', 1234.56],
    ['−5', -5], ['+5', 5], ['-', null], ['+', null], ['1,2,3', null],
  ])('%j → %j', (text, expected) => {
    expect(parseNumber(text)).toBe(expected)
  })
})

describe('clampRound', () => {
  it('ограничивает и округляет до precision', () => {
    expect(clampRound(5, { min: 0, max: 3 })).toBe(3)
    expect(clampRound(-1, { min: 0 })).toBe(0)
    expect(clampRound(1.23456, { precision: 2 })).toBe(1.23)
    expect(clampRound(1.005, { precision: 2 })).toBe(1.01)
  })
  it('денежное округление half-up через сдвиг порядка, симметрично для отрицательных', () => {
    expect(clampRound(2.135, { precision: 2 })).toBe(2.14)
    expect(clampRound(1.005, { precision: 2 })).toBe(1.01)
    expect(clampRound(1234.565, { precision: 2 })).toBe(1234.57)
    expect(clampRound(-2.5, { precision: 0 })).toBe(-3)
    expect(clampRound(-1.005, { precision: 2 })).toBe(-1.01)
    expect(clampRound(2.5, { precision: 0 })).toBe(3)
    expect(Object.is(clampRound(-0.001, { precision: 2 }), 0)).toBe(true)
    expect(clampRound(1e-7, { precision: 10 })).toBe(1e-7)
    expect(clampRound(1.5, { precision: 10 })).toBe(1.5)
  })
})

describe('formatFixed', () => {
  it('фиксированное число знаков с тем же округлением', () => {
    expect(formatFixed(12.5, 2)).toBe('12.50')
    expect(formatFixed(2.135, 2)).toBe('2.14')
    expect(formatFixed(3, 0)).toBe('3')
  })
})

describe('formatMoney', () => {
  it('разряды неразрывным пробелом и валюта', () => {
    expect(formatMoney(2840000)).toBe('2\u00A0840\u00A0000\u00A0₸')
    expect(formatMoney(0)).toBe('0\u00A0₸')
  })
  it('округляет до целых и принимает свою валюту', () => {
    expect(formatMoney(1234.6, '$')).toBe('1\u00A0235\u00A0$')
  })
  it('не оставляет узких неразрывных пробелов', () => {
    expect(formatMoney(1234567)).not.toMatch(/\u202F/)
  })
})
