import { describe, expect, it } from 'vitest'
import { almatyStamp, canSeeSync, isPermanentSyncError, lastPollAt, parseUtc, syncTime } from '../kedenSync'

// Строка состояния kedenlogger (23.10.2026): время по Алматы (UTC+5) независимо от пояса браузера.
const at = (iso: string) => new Date(iso).getTime()

describe('kedenSync: время', () => {
  it('время без пояса — UTC; пусто и мусор — null', () => {
    expect(parseUtc('2026-10-23T09:20:00')).toBe(at('2026-10-23T09:20:00Z'))
    expect(parseUtc('2026-10-23T09:20:00+05:00')).toBe(at('2026-10-23T04:20:00Z'))
    expect(parseUtc(null)).toBeNull()
    expect(parseUtc('')).toBeNull()
    expect(parseUtc('мусор')).toBeNull()
  })

  it('последний опрос — быстрый или полный, что позже; нет обоих — null', () => {
    expect(lastPollAt({ lastQuickPollAtUtc: '2026-10-23T09:20:00Z', lastFullSyncAtUtc: '2026-10-23T09:00:00Z' })).toBe(at('2026-10-23T09:20:00Z'))
    expect(lastPollAt({ lastQuickPollAtUtc: '2026-10-23T08:00:00Z', lastFullSyncAtUtc: '2026-10-23T09:00:00Z' })).toBe(at('2026-10-23T09:00:00Z'))
    expect(lastPollAt({ lastQuickPollAtUtc: null, lastFullSyncAtUtc: '2026-10-23T09:00:00Z' })).toBe(at('2026-10-23T09:00:00Z'))
    expect(lastPollAt({ lastQuickPollAtUtc: '2026-10-23T09:20:00Z', lastFullSyncAtUtc: null })).toBe(at('2026-10-23T09:20:00Z'))
    expect(lastPollAt({ lastQuickPollAtUtc: null, lastFullSyncAtUtc: null })).toBeNull()
  })

  it('меньше минуты — «только что», меньше часа — минуты, из будущего — «только что»', () => {
    const now = at('2026-10-23T09:20:00Z')
    expect(syncTime(now - 30_000, now)).toEqual({ kind: 'now' })
    expect(syncTime(now + 120_000, now)).toEqual({ kind: 'now' })
    expect(syncTime(now - 60_000, now)).toEqual({ kind: 'ago', minutes: 1 })
    expect(syncTime(now - 59 * 60_000 - 59_000, now)).toEqual({ kind: 'ago', minutes: 59 })
  })

  it('час и больше — время по Алматы: сегодня — ЧЧ:ММ, раньше — ДД.ММ, другой год — с годом', () => {
    // 09:20 UTC = 14:20 в Алматы
    const now = at('2026-10-23T09:20:00Z')
    expect(syncTime(at('2026-10-23T03:15:00Z'), now)).toEqual({ kind: 'at', text: '08:15' })
    // 23.10 00:30 по Алматы — это ещё 22.10 по UTC, но день тот же, что «сейчас» в Алматы
    expect(syncTime(at('2026-10-22T19:30:00Z'), now)).toEqual({ kind: 'at', text: '00:30' })
    expect(syncTime(at('2026-10-22T18:30:00Z'), now)).toEqual({ kind: 'at', text: '22.10, 23:30' })
    expect(syncTime(at('2025-12-31T20:00:00Z'), now)).toEqual({ kind: 'at', text: '01.01, 01:00' })
    expect(syncTime(at('2025-12-31T18:00:00Z'), now)).toEqual({ kind: 'at', text: '31.12.2025, 23:00' })
  })

  it('полная отметка для подсказки — по Алматы', () => {
    expect(almatyStamp(at('2026-10-23T09:20:00Z'))).toBe('23.10.2026, 14:20')
  })
})

describe('kedenSync: ошибки', () => {
  it('нет права, нет маршрута, нет сессии — больше не спрашиваем; сеть и 5xx — спросим снова', () => {
    expect(isPermanentSyncError({ response: { status: 403 } })).toBe(true)
    expect(isPermanentSyncError({ response: { status: 404 } })).toBe(true)
    expect(isPermanentSyncError({ response: { status: 401 } })).toBe(true)
    expect(isPermanentSyncError({ response: { status: 500 } })).toBe(false)
    expect(isPermanentSyncError({ response: { status: 503 } })).toBe(false)
    expect(isPermanentSyncError(new Error('network'))).toBe(false)
    expect(isPermanentSyncError(null)).toBe(false)
  })
})

describe('kedenSync: кому строка', () => {
  const perms = (...p: string[]) => (x: string) => p.includes(x)
  it('администратор — всегда; сотрудник — с import40.read или reestr.read', () => {
    expect(canSeeSync('Administrator', perms())).toBe(true)
    expect(canSeeSync('importer', perms('import40.read'))).toBe(true)
    expect(canSeeSync('broker', perms('reestr.read'))).toBe(true)
    expect(canSeeSync('sales', perms('import40.read'))).toBe(true)
    expect(canSeeSync('sales', perms('sales.read'))).toBe(false)
  })
  it('клиент и экспедитор — нет, даже с правами; без роли — нет', () => {
    expect(canSeeSync('client', perms('import40.read', 'reestr.read'))).toBe(false)
    expect(canSeeSync('expeditor', perms('import40.read', 'reestr.read'))).toBe(false)
    expect(canSeeSync(null, perms('import40.read'))).toBe(false)
  })
})
