import { describe, expect, it } from 'vitest'
import { caseFilterSearch } from '@/views/billingQuery'

const rows = [
  { caseId: null, caseNumber: null },
  { caseId: 'c1', caseNumber: 'И40-182' },
  { caseId: 'c2', caseNumber: 'И40-190' },
]

describe('caseFilterSearch (/billing?case=)', () => {
  it('подставляет номер заявки из счёта этой заявки', () => {
    expect(caseFilterSearch(rows, 'c2')).toBe('И40-190')
  })
  it('счетов по заявке нет — пустой поиск, то есть полный список', () => {
    expect(caseFilterSearch(rows, 'zzz')).toBe('')
  })
  it('нет параметра — пусто; массив — берётся первый', () => {
    expect(caseFilterSearch(rows, undefined)).toBe('')
    expect(caseFilterSearch(rows, '')).toBe('')
    expect(caseFilterSearch(rows, ['c1', 'c2'])).toBe('И40-182')
  })
})
