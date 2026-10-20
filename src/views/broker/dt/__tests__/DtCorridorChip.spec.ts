import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'

// Чип «Коридор» в шапке ДТ (21.10, СУР): умолчание «green» без отметки — «не отмечен»; отметка — своим запросом;
// коридор КЕДЕН — «по КЕДЕН»; без права — только текст.
const api = vi.hoisted(() => ({ setCorridor: vi.fn(), stats: vi.fn() }))
vi.mock('@/api/sur', () => ({ surApi: api }))
vi.mock('@/ui/message', () => ({ message: { success: vi.fn(), error: vi.fn() } }))

import DtCorridorChip from '../DtCorridorChip.vue'
import ZDropdown from '@/components/z/ZDropdown.vue'

let w: VueWrapper
const mount = (props: Record<string, unknown>) => {
  w = mountWithI18n(DtCorridorChip, { props: { caseId: 'c1', dtId: 'd1', corridor: 'green', setAtUtc: null, kedenCorridor: null, canEdit: true, ...props } })
}
beforeEach(() => { api.setCorridor.mockReset() })
afterEach(() => { w?.unmount() })

describe('DtCorridorChip', () => {
  it('default green without a mark is «не отмечен»; choosing sets it via the corridor action', async () => {
    mount({})
    expect(w.get('[data-dt-corridor-text]').text()).toBe('не отмечен')
    api.setCorridor.mockResolvedValue({ data: { corridor: 'yellow', setAtUtc: '2026-10-21T05:00:00Z', setByUserId: 'u', kedenCorridor: null } })
    w.findComponent(ZDropdown).vm.$emit('select', 'yellow')
    await flushPromises()
    expect(api.setCorridor).toHaveBeenCalledWith('c1', 'd1', 'yellow')
    expect(w.get('[data-dt-corridor-text]').text()).toBe('жёлтый')
    expect(w.get('[data-dt-corridor]').attributes('data-dt-corridor-known')).toBe('yellow')
  })

  it('shows the KEDEN corridor and is read-only without the right', () => {
    mount({ kedenCorridor: 'red', canEdit: false })
    expect(w.findComponent(ZDropdown).exists()).toBe(false)
    expect(w.get('[data-dt-corridor-text]').text()).toBe('красный · по КЕДЕН')
  })
})
