import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { TnvedNodeDto, TnvedRateDto } from '@/types/api'

const api = vi.hoisted(() => ({
  rates: vi.fn(), getTransition: vi.fn(), reference: vi.fn(), exportReference: vi.fn(), notes: vi.fn(),
  search: vi.fn(), currencies: vi.fn(), calculate: vi.fn(), classify: vi.fn(),
}))
vi.mock('@/api/tnved', () => ({ tnvedApi: api }))
vi.mock('@/api/references', () => ({ referencesApi: { listCountries: vi.fn().mockResolvedValue([]) } }))
// Дерево — заглушка: кнопка с data-node выбирает узел, как клик в настоящем дереве.
const tree = vi.hoisted(() => ({ nodes: [] as unknown[] }))
vi.mock('@/components/TnvedTree.vue', () => ({
  default: defineComponent({
    emits: ['select'],
    setup(_, { emit, expose }) {
      expose({ reveal: vi.fn(), collapseAll: vi.fn(), scrollToSelected: vi.fn() })
      return () => h('div', (tree.nodes as TnvedNodeDto[]).map((n) => h('button', { 'data-node': n.code, onClick: () => emit('select', n) })))
    },
  }),
}))

import TnvedTreeView from '../TnvedTreeView.vue'

const node = (code: string): TnvedNodeDto => ({
  id: Number(code), code, treeName: `Узел ${code}`, name: `Узел ${code}`, parentId: null, is10: true, isLast: true, unitShort: null, nodeLevel: 5,
})
const rate = (code: string, rateStr: string): TnvedRateDto => ({
  code, treeName: null, rateStr, rateSourceName: null, rateSourceUrl: null, vtoStatus: null, unitCode: null, unitName: null, updatedAtUtc: null,
})
const deferred = <T>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

let w: VueWrapper
beforeEach(() => {
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  tree.nodes = [node('1111111111'), node('2222222222')]
  api.getTransition.mockResolvedValue({ data: { oldCode: '', newCodes: [], isDeprecated: false, sourceVersion: null, effectiveDate: null } })
  api.reference.mockResolvedValue({ data: null })
  api.exportReference.mockResolvedValue({ data: null })
  api.notes.mockResolvedValue({ data: null })
  api.currencies.mockResolvedValue({ data: [] })
})
afterEach(() => {
  w?.unmount()
  vi.clearAllMocks()
})

describe('TnvedTreeView: устаревшие ответы', () => {
  it('поздний ответ по прежнему коду не подменяет ставки нового', async () => {
    const a = deferred<{ data: TnvedRateDto }>()
    const b = deferred<{ data: TnvedRateDto }>()
    api.rates.mockImplementation((code: string) => (code === '1111111111' ? a.promise : b.promise))
    w = mountWithI18n(TnvedTreeView, { global: { stubs: { PageHeader: true } } })
    await flushPromises()

    await w.get('[data-node="1111111111"]').trigger('click')
    await w.get('[data-node="2222222222"]').trigger('click')
    b.resolve({ data: rate('2222222222', '7%') })
    await flushPromises()
    a.resolve({ data: rate('1111111111', '15%') })
    await flushPromises()

    expect(w.text()).toContain('Узел 2222222222')
    expect(w.text()).toContain('7%')
    expect(w.text()).not.toContain('15%')
  })
})
