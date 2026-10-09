import { describe, expect, it } from 'vitest'
import { isoDate, rateChangeEntries } from '../changes'

describe('rateChangeEntries — изменения ставок', () => {
  it('название берётся из name, дата — из detectedAtUtc (а не из несуществующих treeName/changedAtUtc)', () => {
    const [e] = rateChangeEntries([
      { code: '2402209000', oldRateStr: '10%', newRateStr: '5%', detectedAtUtc: '2026-10-09T03:15:00Z', name: '– – сигареты' },
    ])
    expect(e.name).toBe('сигареты')
    expect(e.date).toBe('2026-10-09')
    expect(e.oldRate).toBe('10%')
    expect(e.newRate).toBe('5%')
    expect(e.codes).toEqual(['2402209000'])
  })

  it('дата без пояса остаётся датой сервера; мусор — пустая строка, а не «Invalid Date»', () => {
    expect(isoDate('2026-10-09T23:30:00')).toBe('2026-10-09')
    expect(isoDate(undefined)).toBe('')
    expect(isoDate('вчера')).toBe('')
  })

  it('ключи уникальны, даже когда у кода несколько изменений в один день', () => {
    const rows = rateChangeEntries([
      { code: '8516601010', oldRateStr: null, newRateStr: '5%', detectedAtUtc: '2026-10-09T01:00:00Z', name: null },
      { code: '8516601010', oldRateStr: '5%', newRateStr: '7%', detectedAtUtc: '2026-10-09T02:00:00Z', name: null },
    ])
    expect(new Set(rows.map((r) => r.key)).size).toBe(2)
    expect(rows[0].name).toBe('')
  })
})
