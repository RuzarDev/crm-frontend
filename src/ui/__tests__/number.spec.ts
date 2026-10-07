import { describe, expect, it } from 'vitest'
import { clampRound, parseNumber } from '../number'

describe('parseNumber', () => {
  it.each([
    ['1234.56', 1234.56], ['1234,56', 1234.56], ['1 234,56', 1234.56], ['1 234.5', 1234.5],
    ['-12', -12], ['  7 ', 7], ['', null], ['   ', null], ['abc', null], ['1.2.3', null], ['.5', 0.5],
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
})
