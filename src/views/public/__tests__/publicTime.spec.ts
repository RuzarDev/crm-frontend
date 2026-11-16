import { describe, expect, it } from 'vitest'
import { pickLocale, relativeTime } from '../publicTime'

const t = (key: string, p?: Record<string, unknown>) => `${key.split('.').pop()}${p?.n != null ? `:${p.n}` : ''}`
const now = new Date('2026-11-16T12:00:00Z')

describe('relativeTime', () => {
  it('до минуты и «из будущего» — только что', () => {
    expect(relativeTime('2026-11-16T11:59:30Z', now, t, 'ru')).toBe('justNow')
    expect(relativeTime('2026-11-16T12:05:00Z', now, t, 'ru')).toBe('justNow')
  })
  it('минуты, часы', () => {
    expect(relativeTime('2026-11-16T11:57:00Z', now, t, 'ru')).toBe('minAgo:3')
    expect(relativeTime('2026-11-16T11:01:00Z', now, t, 'ru')).toBe('minAgo:59')
    expect(relativeTime('2026-11-16T11:00:00Z', now, t, 'ru')).toBe('hourAgo:1')
    expect(relativeTime('2026-11-15T12:01:00Z', now, t, 'ru')).toBe('hourAgo:23')
  })
  it('сутки и больше — дата', () => {
    expect(relativeTime('2026-11-15T12:00:00Z', now, t, 'ru')).toBe('15.11.2026')
  })
  it('битая дата — пусто', () => {
    expect(relativeTime('oops', now, t, 'ru')).toBe('')
  })
})

describe('pickLocale', () => {
  it('сохранённый выбор главнее браузера', () => {
    expect(pickLocale('kk', ['en-US'])).toBe('kk')
  })
  it('язык браузера, затем русский', () => {
    expect(pickLocale(null, ['de-DE', 'en-US'])).toBe('en')
    expect(pickLocale(null, ['kk-KZ'])).toBe('kk')
    expect(pickLocale(null, ['de'])).toBe('ru')
    expect(pickLocale('xx', undefined)).toBe('ru')
  })
})
