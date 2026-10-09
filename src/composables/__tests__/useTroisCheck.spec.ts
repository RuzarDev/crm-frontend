import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const api = vi.hoisted(() => ({ check: vi.fn() }))
vi.mock('@/api/trois', () => ({ troisApi: api }))

import { useTroisCheckProvider, type TroisCheck } from '../useTroisCheck'

const names = ref<string[]>([])
let check: TroisCheck
let w: ReturnType<typeof mount> | undefined
const host = () => (w = mount(defineComponent({
  setup() {
    check = useTroisCheckProvider(() => names.value, 700)
    return () => h('div')
  },
})))

beforeEach(() => {
  vi.useFakeTimers()
  api.check.mockReset()
  api.check.mockImplementation(async (list: string[]) => list.map((name) => ({ name, checked: true, matches: [] })))
})
afterEach(() => {
  w?.unmount()
  names.value = []
  vi.useRealTimers()
})

describe('useTroisCheckProvider', () => {
  it('одна пачка на все новые марки после задержки', async () => {
    names.value = ['SONY', 'LG', 'SONY', ' ', 'A']
    host()
    await vi.advanceTimersByTimeAsync(700)
    await flushPromises()
    expect(api.check).toHaveBeenCalledTimes(1)
    expect(api.check.mock.calls[0][0]).toEqual(['LG', 'SONY'])
    expect(check.resultFor(' SONY ')?.checked).toBe(true)
  })

  it('(T3) марки сверх 100 тоже проверяются — следующими пачками по 100', async () => {
    names.value = Array.from({ length: 230 }, (_, i) => `MARK${String(i).padStart(3, '0')}`)
    host()
    await vi.advanceTimersByTimeAsync(700)
    await flushPromises()
    expect(api.check).toHaveBeenCalledTimes(3)
    expect(api.check.mock.calls.map((c) => c[0].length)).toEqual([100, 100, 30])
    expect(check.resultFor('MARK229')?.checked).toBe(true)
  })

  it('сбой пачки — её марки спросятся снова при следующем изменении', async () => {
    api.check.mockRejectedValueOnce(new Error('500'))
    names.value = ['SONY']
    host()
    await vi.advanceTimersByTimeAsync(700)
    await flushPromises()
    expect(check.resultFor('SONY')).toBeUndefined()
    names.value = ['SONY', 'LG']
    await vi.advanceTimersByTimeAsync(700)
    await flushPromises()
    expect(api.check).toHaveBeenCalledTimes(2)
    expect(api.check.mock.calls[1][0]).toEqual(['LG', 'SONY'])
  })
})
