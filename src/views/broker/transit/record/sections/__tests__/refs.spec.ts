import { describe, expect, it } from 'vitest'
import { DEPARTURE_OFFICE_MAX, customsPostCode, departureOfficeTooLong, departureOfficeValue } from '../refs'

const POST = '57507 — ТАМОЖЕННЫЙ ПОСТ «АЛТЫНКОЛЬ-ЖОЛ»'

describe('таможня отправления хранит код поста (B.12)', () => {
  it('код — ведущие 5–8 цифр названия', () => {
    expect(customsPostCode(POST)).toBe('57507')
    expect(customsPostCode('5750712 ПОСТ')).toBe('5750712')
    expect(customsPostCode('12345678 — ПОСТ')).toBe('12345678')
    expect(customsPostCode('  57507 — ПОСТ')).toBe('57507')
  })

  it('нет кода — null: меньше 5 цифр, цифры не в начале, пусто', () => {
    expect(customsPostCode('1234 ПОСТ')).toBeNull()
    expect(customsPostCode('ПОСТ 57507')).toBeNull()
    expect(customsPostCode('')).toBeNull()
    expect(customsPostCode(null)).toBeNull()
  })

  it('значение для сохранения: код вместо названия', () => {
    expect(departureOfficeValue(POST)).toEqual({ value: '57507', tooLong: false })
  })

  it('без кода — само название, если помещается в 32 знака', () => {
    expect(departureOfficeValue('КПП Хоргос')).toEqual({ value: 'КПП Хоргос', tooLong: false })
    const exactly32 = 'Я'.repeat(DEPARTURE_OFFICE_MAX)
    expect(departureOfficeValue(exactly32)).toEqual({ value: exactly32, tooLong: false })
  })

  it('без кода и длиннее 32 знаков — ошибка', () => {
    const long = 'ТАМОЖЕННЫЙ ПОСТ «БЕЗ КОДА» ОЧЕНЬ ДЛИННОЕ НАЗВАНИЕ'
    expect(long.length).toBeGreaterThan(DEPARTURE_OFFICE_MAX)
    expect(departureOfficeValue(long)).toEqual({ value: long, tooLong: true })
    expect(departureOfficeTooLong(long)).toBe(true)
    expect(departureOfficeTooLong('57507')).toBe(false)
    expect(departureOfficeTooLong(null)).toBe(false)
    expect(departureOfficeTooLong('')).toBe(false)
  })
})
