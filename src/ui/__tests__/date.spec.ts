import { describe, expect, it } from 'vitest'
import { CalendarDate } from '@internationalized/date'
import { calendarLocale, formatDateText, fromCalendarDate, isCompleteDateText, maskDateText, parseDateText, toCalendarDate } from '../date'

describe('даты ZDate', () => {
  it('строка ↔ CalendarDate', () => {
    expect(toCalendarDate('2026-09-28')?.toString()).toBe('2026-09-28')
    expect(fromCalendarDate(new CalendarDate(2026, 10, 7))).toBe('2026-10-07')
  })
  it('время с сервера отбрасывается', () => {
    expect(toCalendarDate('2026-09-28T00:00:00')?.toString()).toBe('2026-09-28')
    expect(toCalendarDate('2026-09-28T10:15:00.000Z')?.toString()).toBe('2026-09-28')
  })
  it('пусто и мусор', () => {
    expect(toCalendarDate(null)).toBeUndefined()
    expect(toCalendarDate('')).toBeUndefined()
    expect(toCalendarDate('28.09.2026')).toBeUndefined()
    expect(toCalendarDate('2026-02-30')).toBeUndefined()
    expect(fromCalendarDate(undefined)).toBeNull()
  })
  it('локаль календаря — день перед месяцем', () => {
    expect(calendarLocale('ru')).toBe('ru-RU')
    expect(calendarLocale('kk')).toBe('kk-KZ')
    expect(calendarLocale('en')).toBe('en-GB')
  })
})

describe('текст поля ZDate', () => {
  it('значение → ДД.ММ.ГГГГ', () => {
    expect(formatDateText('2026-09-08')).toBe('08.09.2026')
    expect(formatDateText(null)).toBe('')
    expect(formatDateText('мусор')).toBe('')
  })
  it('маска: цифры, точки ставятся сами', () => {
    expect(maskDateText('2')).toBe('2')
    expect(maskDateText('28')).toBe('28')
    expect(maskDateText('280')).toBe('28.0')
    expect(maskDateText('28092026')).toBe('28.09.2026')
    expect(maskDateText('280920261')).toBe('28.09.2026')
    expect(maskDateText('28a09')).toBe('28.09')
  })
  it('маска: свои разделители и вставка', () => {
    expect(maskDateText('28.')).toBe('28.')
    expect(maskDateText('1.09.2026')).toBe('1.09.2026')
    expect(maskDateText('28/09/2026')).toBe('28.09.2026')
    expect(maskDateText('28-09-2026')).toBe('28.09.2026')
    expect(maskDateText(' 2026-09-28 ')).toBe('28.09.2026')
    expect(maskDateText('2026-9-8')).toBe('08.09.2026')
    // точку стёрли — цифры снова раскладываются по маске
    expect(maskDateText('2809.2026')).toBe('28.09.2026')
  })
  it('разбор: полная дата, двузначный год, мусор', () => {
    expect(parseDateText('')).toBeNull()
    expect(parseDateText('  ')).toBeNull()
    expect(parseDateText('28.09.2026')?.toString()).toBe('2026-09-28')
    expect(parseDateText('1.2.2026')?.toString()).toBe('2026-02-01')
    expect(parseDateText('28.09.26')?.toString()).toBe('2026-09-28')
    expect(parseDateText('28.09')).toBeUndefined()
    expect(parseDateText('31.02.2026')).toBeUndefined()
    expect(parseDateText('28.09.0026')).toBeUndefined()
  })
  it('полный ли текст (для красной рамки при наборе)', () => {
    expect(isCompleteDateText('28.09.2026')).toBe(true)
    expect(isCompleteDateText('28.09.20')).toBe(false)
    expect(isCompleteDateText('28.09')).toBe(false)
  })
})
