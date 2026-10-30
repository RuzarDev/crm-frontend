import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/preBorder', () => ({ preBorderApi: api }))

import { usePreBorder } from '../usePreBorder'

// E-2 (30.10.2026, живой прогон): блок «До границы» перечитывается, когда заявка сменила статус или отметку прибытия.
const caseId = ref('c1')
const key = ref('1|')
let pb: ReturnType<typeof usePreBorder>
let w: VueWrapper | undefined
const host = () => (w = mount(defineComponent({
  setup() {
    pb = usePreBorder(() => caseId.value, () => key.value)
    return () => h('div')
  },
})))

afterEach(() => {
  w?.unmount()
  caseId.value = 'c1'
  key.value = '1|'
  vi.clearAllMocks()
})

describe('usePreBorder', () => {
  it('смена статуса / прибытия той же заявки — перечитывает; смена заявки — одна загрузка', async () => {
    api.get.mockImplementation(async (id: string) => ({ caseId: id, borderArrivedAtUtc: key.value.split('|')[1] || null }))
    host()
    await flushPromises()
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(pb.data.value?.borderArrivedAtUtc).toBeNull()

    key.value = '1|2026-10-30T04:15:00Z'
    await flushPromises()
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(pb.data.value?.borderArrivedAtUtc).toBe('2026-10-30T04:15:00Z')

    caseId.value = 'c2'
    key.value = '0|'
    await flushPromises()
    expect(api.get).toHaveBeenCalledTimes(3)
    expect(api.get).toHaveBeenLastCalledWith('c2')
  })
})
