import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { MarkingMatchRow } from '@/api/nationalLists'

const api = vi.hoisted(() => ({ marking: vi.fn() }))
vi.mock('@/api/nationalLists', async (orig) => ({ ...(await orig<typeof import('@/api/nationalLists')>()), nationalListsApi: api }))

import MarkingHint from '../editor/MarkingHint.vue'
import { clearMarkingListCache, loadMarkingList, markingRows, useMarkingList } from '../useMarkingList'

const row = (p: Partial<MarkingMatchRow> = {}): MarkingMatchRow => ({
  number: 1, codeText: '2402 20 900 0', name: 'прочие сигареты', partial: false, startDate: '2020-10-01', required: true,
  condition: 'С 1 октября 2020 года обязательная маркировка…', check: null, ...p,
})

afterEach(() => {
  clearMarkingListCache()
  vi.clearAllMocks()
})

describe('MarkingHint', () => {
  it('обязательна / будет / «из …» — возможно, условие, позиция под вопросом', () => {
    const w = mountWithI18n(MarkingHint, {
      props: {
        act: 'Приказ МТИ РК № 199-НҚ',
        rows: [row(), row({ number: 31, partial: true, required: false, startDate: '2027-03-01', name: 'косметика', condition: null }), row({ number: 183, check: 'сверить', startDate: '2027-04-01', required: false })],
      },
    })
    const rows = w.findAll('[data-marking-hint-row]')
    expect(rows[0].text()).toContain('Подлежит маркировке с 01.10.2020 · Приказ МТИ РК № 199-НҚ, поз. 1')
    expect(rows[0].get('[data-marking-hint-condition]').text()).toContain('С 1 октября 2020 года')
    expect(rows[1].attributes('data-marking-hint-row')).toBe('upcoming')
    expect(rows[1].text()).toContain('Возможно будет подлежать маркировке с 01.03.2027')
    expect(rows[1].get('[data-marking-hint-only]').text()).toBe('Только: косметика')
    expect(rows[2].get('[data-marking-hint-check]').text()).toContain('№ 253-ОД')
  })

  it('нет позиций — подсказки нет', () => {
    const w = mountWithI18n(MarkingHint, { props: { act: '', rows: [] } })
    expect(w.find('[data-marking-hint]').exists()).toBe(false)
  })
})

describe('useMarkingList', () => {
  it('кэш на сессию по (код, дата): повтор без запроса, сбой — без кэша', async () => {
    api.marking.mockResolvedValueOnce({ actLabel: 'Приказ МТИ РК № 199-НҚ', actUrl: 'u', items: [{ code: '2402209000', rows: [row()] }] })
    await loadMarkingList(['2402209000', '8471300000', 'abc'], '2026-10-17')
    expect(api.marking).toHaveBeenCalledWith(['2402209000', '8471300000'], '2026-10-17', { silent: true })
    expect(markingRows('2402209000', '2026-10-17')).toHaveLength(1)
    expect(markingRows('8471300000', '2026-10-17')).toEqual([])
    await loadMarkingList(['2402209000'], '2026-10-17')
    expect(api.marking).toHaveBeenCalledTimes(1)

    api.marking.mockRejectedValueOnce(new Error('x'))
    await expect(loadMarkingList(['2402209000'], '2026-11-01')).rejects.toThrow()
    expect(markingRows('2402209000', '2026-11-01')).toEqual([])
  })

  it('компонент перерисовывается после загрузки', async () => {
    api.marking.mockResolvedValue({ actLabel: 'Приказ МТИ РК № 199-НҚ', actUrl: 'u', items: [{ code: '2402209000', rows: [row()] }] })
    const C = defineComponent({
      setup() {
        const m = useMarkingList(() => ({ code: '2402209000', onDate: '2026-10-17' }))
        return () => h('span', `${m.act()}|${m.rows().length}`)
      },
    })
    const w = mountWithI18n(C)
    expect(w.text()).toBe('|0')
    await flushPromises()
    expect(w.text()).toBe('Приказ МТИ РК № 199-НҚ|1')
  })
})
