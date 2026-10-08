import { describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { caseFilterSearch, watchCaseQuery } from '@/views/billingQuery'

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

describe('watchCaseQuery (повторный клик по уведомлению на открытой странице)', () => {
  it('срабатывает при смене ?case=, но не при первом запуске', async () => {
    const query = reactive<{ case?: string }>({ case: 'c1' })
    const onChange = vi.fn()
    const stop = watchCaseQuery(() => query.case, onChange)
    expect(onChange).not.toHaveBeenCalled()
    query.case = 'c2'
    await nextTick()
    expect(onChange).toHaveBeenCalledWith('c2')
    query.case = undefined
    await nextTick()
    expect(onChange).toHaveBeenLastCalledWith(undefined)
    stop()
  })
})
