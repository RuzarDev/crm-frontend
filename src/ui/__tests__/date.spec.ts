import { describe, expect, it } from 'vitest'
import { CalendarDate } from '@internationalized/date'
import { calendarLocale, fromCalendarDate, toCalendarDate } from '../date'

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
