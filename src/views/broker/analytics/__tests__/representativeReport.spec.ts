import { describe, expect, it } from 'vitest'
import {
  cancelledRows, defaultPeriod, matchingQuarter, periodText, postKey, proceduresText, quarterPeriod, quickQuarters, rowsOfPost, shiftQuarter, xlsxFileName,
} from '../representativeReport'
import type { RepDeclarationRow } from '@/api/reports'

describe('отчёт представителя: кварталы и подписи', () => {
  it('по умолчанию — прошлый квартал; в январе — IV квартал прошлого года', () => {
    expect(defaultPeriod(new Date(2026, 9, 17))).toEqual({ from: '2026-07-01', to: '2026-09-30' })
    expect(defaultPeriod(new Date(2026, 0, 5))).toEqual({ from: '2025-10-01', to: '2025-12-31' })
    expect(defaultPeriod(new Date(2026, 3, 1))).toEqual({ from: '2026-01-01', to: '2026-03-31' })
  })

  it('границы кварталов, високосный февраль не мешает', () => {
    expect(quarterPeriod({ year: 2028, q: 1 })).toEqual({ from: '2028-01-01', to: '2028-03-31' })
    expect(quarterPeriod({ year: 2026, q: 2 })).toEqual({ from: '2026-04-01', to: '2026-06-30' })
    expect(quarterPeriod({ year: 2026, q: 4 })).toEqual({ from: '2026-10-01', to: '2026-12-31' })
    expect(shiftQuarter({ year: 2026, q: 1 }, -1)).toEqual({ year: 2025, q: 4 })
    expect(shiftQuarter({ year: 2025, q: 4 }, 1)).toEqual({ year: 2026, q: 1 })
  })

  it('быстрые кнопки: текущий и три предыдущих; совпадение периода с кварталом', () => {
    const qs = quickQuarters(new Date(2026, 9, 17))
    expect(qs).toEqual([{ year: 2026, q: 4 }, { year: 2026, q: 3 }, { year: 2026, q: 2 }, { year: 2026, q: 1 }])
    expect(matchingQuarter({ from: '2026-07-01', to: '2026-09-30' }, qs)).toEqual({ year: 2026, q: 3 })
    expect(matchingQuarter({ from: '2026-07-01', to: '2026-09-29' }, qs)).toBeNull()
  })

  it('период, имя файла, процедуры строкой', () => {
    const p = { from: '2026-07-01', to: '2026-09-30' }
    expect(periodText(p)).toBe('01.07.2026–30.09.2026')
    expect(xlsxFileName('Отчёт представителя', p)).toBe('Отчёт представителя 01.07.2026–30.09.2026.xlsx')
    expect(proceduresText([{ procedure: 'ИМ 40', count: 12 }, { procedure: 'ЭК 10', count: 1 }])).toBe('ИМ 40: 12 · ЭК 10: 1')
    expect(proceduresText([])).toBe('')
  })

  it('ДТ поста — по паре ДГД/пост, «Орган не указан» — по null, без отменённых', () => {
    const r = (id: string, dgdCode: string | null, postCode: string | null) => ({ declarationId: id, dgdCode, postCode, status: 'submitted' }) as RepDeclarationRow
    const rows = [r('a', '55300', '55302'), r('b', '55300', '55301'), r('c', null, null)]
    expect(rowsOfPost(rows, '55300', '55302').map((x) => x.declarationId)).toEqual(['a'])
    expect(rowsOfPost(rows, null, null).map((x) => x.declarationId)).toEqual(['c'])
    const withCancelled = [...rows, { ...r('d', '55300', '55302'), status: 'cancelled' } as RepDeclarationRow]
    expect(rowsOfPost(withCancelled, '55300', '55302').map((x) => x.declarationId)).toEqual(['a'])
    expect(cancelledRows(withCancelled).map((x) => x.declarationId)).toEqual(['d'])
    expect(postKey(null, null)).toBe('-_-')
    expect(postKey('55300', '55302')).toBe('55300_55302')
  })
})
