import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { SurStatsDto } from '@/api/sur'

// Подсказка СУР: доли коридоров при N ≥ 10, «мало данных», отдельно по посту, «цена ниже типичной»; «типичная от …» —
// только если сервер её прислал (сотрудник); сбой — строка без тоста; без кода — ничего.
const api = vi.hoisted(() => ({ stats: vi.fn() }))
vi.mock('@/api/sur', () => ({ surApi: api }))

import SurStatsHint from '../SurStatsHint.vue'

const corridor = (o: Partial<SurStatsDto['byCode']> = {}): SurStatsDto['byCode'] => ({
  postCode: null, n: 12, enough: true, greenPct: 67, yellowPct: 25, redPct: 8, bluePct: 0, ...o,
})
const STATS = (o: Partial<SurStatsDto> = {}): SurStatsDto => ({
  code: '8517130000', months: 12, minN: 10, byCode: corridor(), byPost: null, price: null, ...o,
})

let w: VueWrapper
const mount = async (props: Record<string, unknown> = {}) => {
  w = mountWithI18n(SurStatsHint, { props: { code: '8517130000', debounceMs: 0, ...props } })
  await flushPromises()
}

beforeEach(() => { api.stats.mockReset() })
afterEach(() => { w?.unmount() })

describe('SurStatsHint', () => {
  it('shows corridor shares, post line and the disclaimer', async () => {
    api.stats.mockResolvedValue({ data: STATS({ byPost: corridor({ postCode: '55302', n: 10, greenPct: 90, yellowPct: 10, redPct: 0 }) }) })
    await mount({ country: '156', declarationId: 'd1' })
    expect(api.stats).toHaveBeenCalledWith(expect.objectContaining({ code: '8517130000', country: '156', declarationId: 'd1' }))
    expect(w.get('[data-sur-code="enough"]').text()).toBe('По этому коду у нас 12 ДТ за 12 мес: зелёный 67%, жёлтый 25%, красный 8%.')
    expect(w.get('[data-sur-post]').text()).toContain('На посту 55302: 10 ДТ')
    expect(w.get('[data-sur-disclaimer]').text()).toContain('не прогноз таможни')
    expect(w.find('[data-sur-low-price]').exists()).toBe(false)
  })

  it('says «мало данных» when N < 10 and hides the post line', async () => {
    api.stats.mockResolvedValue({ data: STATS({ byCode: corridor({ n: 3, enough: false, greenPct: null }), byPost: corridor({ n: 2, enough: false }) }) })
    await mount()
    expect(w.get('[data-sur-code="few"]').text()).toBe('Мало данных: по этому коду 3 ДТ за 12 мес (нужно от 10).')
    expect(w.find('[data-sur-post]').exists()).toBe(false)
  })

  it('warns about a low price; typical value only when the server sent it', async () => {
    const price = { basis: 'kg' as const, unitCode: null, n: 12, enough: true, valuePerUnitKzt: 150, low: true, p25Kzt: null }
    api.stats.mockResolvedValue({ data: STATS({ price }) })
    await mount({ country: '156', valueKzt: 150, netKg: 1 })
    const warn = w.get('[data-sur-low-price]')
    expect(warn.attributes('role')).toBe('alert')
    expect(warn.text()).toContain('за 1 кг нетто ниже типичной')
    expect(warn.text()).toContain('риск корректировки стоимости')
    expect(warn.text()).not.toContain('Типичная')

    api.stats.mockResolvedValue({ data: STATS({ price: { ...price, basis: 'unit', unitCode: '796', p25Kzt: 375 } }) })
    await mount({ country: '156', valueKzt: 150, quantity: 1, unitCode: '796' })
    expect(w.get('[data-sur-low-price]').text()).toContain('за 1 доп. единицу')
    expect(w.get('[data-sur-low-price]').text()).toMatch(/Типичная — от 375/)
  })

  it('renders nothing without a 10-digit code and shows a quiet failure line', async () => {
    await mount({ code: '8517' })
    expect(w.find('[data-sur-hint]').exists()).toBe(false)
    expect(api.stats).not.toHaveBeenCalled()

    api.stats.mockRejectedValue(new Error('boom'))
    await mount()
    expect(w.find('[data-sur-failed]').exists()).toBe(true)
  })
})
