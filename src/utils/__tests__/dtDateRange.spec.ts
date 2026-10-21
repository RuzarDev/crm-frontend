import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import ru from '@/i18n/locales/ru'
import kk from '@/i18n/locales/kk'
import en from '@/i18n/locales/en'
import { dtDateFieldProps, dtDateIssue, dtDateLimits, dtDateWarning, todayKzIso, validityBeforeStart } from '../dtDateRange'

const i18n = createI18n({ legacy: false, locale: 'ru', messages: { ru, kk, en } })
const t = i18n.global.t as unknown as (k: string, p?: Record<string, unknown>) => string
const TODAY = '2026-10-21'

describe('dtDateRange: границы (как DtDateRanges на сервере)', () => {
  it('событие — 01.01.2000 … сегодня + 1 год, границы допустимы', () => {
    expect(dtDateLimits('event', TODAY)).toEqual({ min: '2000-01-01', max: '2027-10-21' })
    expect(dtDateIssue('1999-12-31', 'event', TODAY)).toEqual({ kind: 'tooEarly', limit: '2000-01-01' })
    expect(dtDateIssue('2000-01-01', 'event', TODAY)).toBeNull()
    expect(dtDateIssue('2027-10-21', 'event', TODAY)).toBeNull()
    expect(dtDateIssue('2027-10-22', 'event', TODAY)).toEqual({ kind: 'tooLate', limit: '2027-10-21' })
    expect(dtDateIssue('2202-09-10', 'event', TODAY)).toEqual({ kind: 'tooLate', limit: '2027-10-21' })
  })

  it('срок действия — до сегодня + 10 лет; дата выпуска — с 1900 (1995 — без предупреждения)', () => {
    expect(dtDateIssue('2036-10-21', 'validity', TODAY)).toBeNull()
    expect(dtDateIssue('2036-10-22', 'validity', TODAY)).toEqual({ kind: 'tooLate', limit: '2036-10-21' })
    expect(dtDateIssue('1999-12-31', 'validity', TODAY)).toEqual({ kind: 'tooEarly', limit: '2000-01-01' })
    expect(dtDateIssue('1995-06-01', 'manufacture', TODAY)).toBeNull()
    expect(dtDateIssue('1899-12-31', 'manufacture', TODAY)).toEqual({ kind: 'tooEarly', limit: '1900-01-01' })
    expect(dtDateIssue('2027-10-22', 'manufacture', TODAY)).toEqual({ kind: 'tooLate', limit: '2027-10-21' })
  })

  it('пусто и не дата — без предупреждения; хвост времени с сервера отбрасывается', () => {
    expect(dtDateIssue(null, 'event', TODAY)).toBeNull()
    expect(dtDateIssue('', 'event', TODAY)).toBeNull()
    expect(dtDateIssue('мусор', 'event', TODAY)).toBeNull()
    expect(dtDateIssue('2202-09-10T00:00:00', 'event', TODAY)).toEqual({ kind: 'tooLate', limit: '2027-10-21' })
  })

  it('«действует по» раньше даты документа или «действует с»', () => {
    expect(validityBeforeStart('2026-03-01', '2026-04-01')).toBe(true)
    expect(validityBeforeStart('2026-04-15', '2026-04-01', '2026-05-01')).toBe(true)
    expect(validityBeforeStart('2026-04-01', '2026-04-01')).toBe(false)
    expect(validityBeforeStart(null, '2026-04-01')).toBe(false)
    expect(validityBeforeStart('2026-04-01', null, undefined)).toBe(false)
  })

  it('«сегодня» — по Казахстану (UTC+5): 23:30 UTC — уже следующий день', () => {
    expect(todayKzIso(Date.UTC(2026, 9, 21, 18, 59))).toBe('2026-10-21')
    expect(todayKzIso(Date.UTC(2026, 9, 21, 23, 30))).toBe('2026-10-22')
  })
})

describe('dtDateRange: тексты', () => {
  it('предупреждение с датами ДД.ММ.ГГГГ; для ZField — warning + help', () => {
    expect(dtDateWarning(t, '2202-09-10', 'event', TODAY)).toBe('10.09.2202 позже 21.10.2027 — проверьте год')
    expect(dtDateWarning(t, '1999-01-01', 'event', TODAY)).toBe('01.01.1999 раньше 01.01.2000 — проверьте год')
    expect(dtDateWarning(t, '2026-10-20', 'event', TODAY)).toBeNull()
    expect(dtDateFieldProps(t, '2202-09-10', 'event', TODAY)).toEqual({ validateStatus: 'warning', help: '10.09.2202 позже 21.10.2027 — проверьте год' })
    expect(dtDateFieldProps(t, '2026-10-20', 'event', TODAY)).toEqual({})
  })

  it('ключи есть на трёх языках', () => {
    for (const lang of ['ru', 'kk', 'en'] as const) {
      i18n.global.locale.value = lang
      for (const k of ['tooEarly', 'tooLate', 'validityBeforeStart']) {
        expect(i18n.global.te(`broker.dt.dates.${k}`, lang)).toBe(true)
      }
      expect(dtDateWarning(t, '2202-09-10', 'event', TODAY)).toContain('10.09.2202')
    }
    i18n.global.locale.value = 'ru'
  })
})
