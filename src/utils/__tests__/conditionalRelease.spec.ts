import { describe, expect, it } from 'vitest'
import ru from '@/i18n/locales/ru'
import type { ConditionalReleaseBrief, ConditionalReleaseDto } from '@/api/conditionalRelease'
import { briefOf, condRelDate, condRelDoc, condRelLabel, condRelState, matchesCondRel } from '../conditionalRelease'

// Простой переводчик по ru-словарю: ключ через точки, {name} подставляется.
const t = (key: string, named: Record<string, unknown> = {}) => {
  const v = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], ru)
  return String(v ?? key).replace(/\{(\w+)\}/g, (_, k) => String(named[k] ?? ''))
}

const brief = (over: Partial<ConditionalReleaseBrief> = {}): ConditionalReleaseBrief => ({
  declarationId: 'd1', declarationNumber: null, docKind: 'origin', note: null, deadline: '2026-12-15',
  overdue: false, daysLeft: 10, uploaded: false, openCount: 1, ...over,
})
const now = new Date(2026, 9, 17)

describe('conditionalRelease', () => {
  it('дата: ДД.ММ в текущем году, иначе с годом; мусор — пусто', () => {
    expect(condRelDate('2026-12-15', now)).toBe('15.12')
    expect(condRelDate('2027-01-05', now)).toBe('05.01.2027')
    expect(condRelDate(null, now)).toBe('')
  })

  it('документ: вид словарём, «другой» — текстом основания', () => {
    expect(condRelDoc('origin', null, t)).toBe('сертификат происхождения')
    expect(condRelDoc('certificate', null, t)).toBe('сертификат')
    expect(condRelDoc('other', 'письмо производителя', t)).toBe('письмо производителя')
    expect(condRelDoc('other', '', t)).toBe('документ')
    expect(condRelDoc('weird', null, t)).toBe('документ')
  })

  it('подпись метки по состоянию; загрузка важнее просрочки', () => {
    expect(condRelLabel(brief(), t, now)).toBe('Условный выпуск: до 15.12 нужен сертификат происхождения')
    expect(condRelLabel(brief({ overdue: true }), t, now)).toBe('Условный выпуск: срок истёк 15.12 — нужен сертификат происхождения')
    expect(condRelState(brief({ overdue: true, uploaded: true }))).toBe('uploaded')
    expect(condRelLabel(brief({ uploaded: true }), t, now)).toContain('документ на проверке')
  })

  it('фильтр списка: любой открытый или по состоянию', () => {
    expect(matchesCondRel(null, null)).toBe(true)
    expect(matchesCondRel(null, 'any')).toBe(false)
    expect(matchesCondRel(brief(), 'any')).toBe(true)
    expect(matchesCondRel(brief({ overdue: true }), 'overdue')).toBe(true)
    expect(matchesCondRel(brief(), 'overdue')).toBe(false)
    expect(matchesCondRel(brief({ uploaded: true }), 'uploaded')).toBe(true)
  })

  it('краткая метка из ДТ: только открытый (не закрытый)', () => {
    const cr: ConditionalReleaseDto = {
      docKind: 'permit', note: null, deadline: '2026-12-01', setAtUtc: null, fileId: null, fileName: null,
      uploadedAtUtc: '2026-10-17T05:00:00Z', resolvedAtUtc: null, overdue: false, daysLeft: 45,
    }
    expect(briefOf({ id: 'd9', declarationNumber: '55302/1', conditionalRelease: cr })).toMatchObject({ declarationId: 'd9', uploaded: true, docKind: 'permit' })
    expect(briefOf({ id: 'd9', conditionalRelease: { ...cr, resolvedAtUtc: '2026-10-18T00:00:00Z' } })).toBeNull()
    expect(briefOf({ id: 'd9', conditionalRelease: null })).toBeNull()
  })
})
