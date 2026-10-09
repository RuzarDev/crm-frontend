import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { TnvedNodeDto, TnvedPathNodeDto } from '@/types/api'

// Дерево ТН ВЭД на ZTree: корень и ветки — tnvedApi.children, reveal(code) — по tnvedApi.path,
// select(node) — полный TnvedNodeDto (им пользуются окно выбора кода и экран справочника).
const api = vi.hoisted(() => ({ children: vi.fn(), path: vi.fn() }))
vi.mock('@/api/tnved', () => ({ tnvedApi: api }))

import TnvedTree from '../TnvedTree.vue'

const node = (id: number, code: string, name: string, parentId: number | null, extra: Partial<TnvedNodeDto> = {}): TnvedNodeDto => ({
  id, code, name, treeName: name, parentId, is10: code.replace(/\D/g, '').length === 10, isLast: false, unitShort: null, nodeLevel: 0, ...extra,
})
const tree: Record<number, TnvedNodeDto[]> = {
  0: [node(1, 'XVI', 'Машины, оборудование и механизмы', 0), node(2, 'XVII', 'Средства наземного транспорта', 0)],
  1: [node(10, '84', 'Реакторы ядерные, котлы', 1)],
  10: [node(100, '8471', '– – Машины вычислительные', 10)],
  100: [node(1000, '8471300000', 'Ноутбуки и планшеты', 100, { is10: true, isLast: true, unitShort: 'шт' })],
  2: [node(20, '87', 'Средства наземного транспорта', 2)],
  20: [node(200, '8703', 'Автомобили легковые', 20)],
  200: [node(2000, '8703231981', 'Прочие', 200, { is10: true, isLast: true })],
}
const pathOf: Record<string, TnvedPathNodeDto[]> = {
  '8471300000': [1, 10, 100, 1000].map((id) => ({ id, code: '', treeName: '', nodeLevel: 0 })),
  '8703231981': [2, 20, 200, 2000].map((id) => ({ id, code: '', treeName: '', nodeLevel: 0 })),
}
const ok = <T,>(data: T) => Promise.resolve({ data })

let w: VueWrapper
beforeEach(() => {
  api.children.mockReset().mockImplementation((id: number) => ok(tree[id] ?? []))
  api.path.mockReset().mockImplementation((code: string) => ok(pathOf[code] ?? []))
})
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })

type TreeApi = {
  reveal: (c: string) => Promise<TnvedNodeDto | null>; collapseAll: () => void; scrollToSelected: () => Promise<unknown>; reload: () => Promise<unknown>
  pathOf: (id: number) => TnvedNodeDto[]; selectLoaded: (id: number) => Promise<TnvedNodeDto | null>
}
const mountTree = () => {
  w = mountWithI18n(TnvedTree, { attachTo: document.body })
  return w.vm as unknown as TreeApi
}
const rowTexts = () => w.findAll('[role="treeitem"]').map((r) => r.text().replace(/\s+/g, ' ').trim())

describe('TnvedTree', () => {
  it('корень — children(0) без тоста; код по группам, название без тире уровня; единица у 10-значного', async () => {
    mountTree()
    expect(w.find('[data-z-tree-skeleton]').exists()).toBe(true)
    await flushPromises()
    expect(api.children).toHaveBeenCalledWith(0, { silent: true })
    expect(rowTexts()).toEqual(['XVI Машины, оборудование и механизмы', 'XVII Средства наземного транспорта'])
    const t = w.vm as unknown as TreeApi
    await t.reveal('8471300000')
    await flushPromises()
    expect(rowTexts()).toContain('8471 Машины вычислительные')
    expect(rowTexts()).toContain('8471 30 000 0 Ноутбуки и планшеты шт')
  })

  it('корень не загрузился — «Не удалось загрузить» и «Повторить»', async () => {
    api.children.mockImplementationOnce(() => Promise.reject(new Error('500')))
    mountTree()
    await flushPromises()
    expect(w.text()).toContain('Не удалось загрузить')
    await w.get('[data-tnved-tree-retry]').trigger('click')
    await flushPromises()
    expect(rowTexts()).toHaveLength(2)
  })

  it('клик по узлу — select(TnvedNodeDto) и догрузка ветки', async () => {
    mountTree()
    await flushPromises()
    await w.get('[data-z-tree-id="1"]').trigger('click')
    await flushPromises()
    expect(w.emitted('select')?.[0][0]).toEqual(tree[0][0])
    expect(api.children).toHaveBeenCalledWith(1)
    expect(rowTexts()).toContain('84 Реакторы ядерные, котлы')
  })

  it('reveal(code) до загрузки корня: ждёт корень, раскрывает путь, возвращает узел без select', async () => {
    const t = mountTree()
    const n = await t.reveal('8471300000')
    expect(n).toEqual(tree[100][0])
    expect(api.children.mock.calls.filter(([id]) => id === 0)).toHaveLength(1)
    await flushPromises()
    expect(w.get('[data-z-tree-id="1000"]').attributes('aria-selected')).toBe('true')
    expect(w.emitted('select')).toBeUndefined()
  })

  it('reveal: поздний ответ пути для прежнего кода не перебивает новый', async () => {
    let releaseA!: () => void
    api.path.mockImplementation((code: string) =>
      code === '8471300000'
        ? new Promise((res) => { releaseA = () => res({ data: pathOf[code] }) })
        : ok(pathOf[code]))
    const t = mountTree()
    await flushPromises()
    const a = t.reveal('8471300000')
    const b = await t.reveal('8703231981')
    releaseA()
    expect(await a).toBeNull()
    expect(b).toEqual(tree[200][0])
    await flushPromises()
    expect(w.get('[data-z-tree-id="2000"]').attributes('aria-selected')).toBe('true')
    expect(w.find('[data-z-tree-id="1000"]').exists()).toBe(false)
  })

  it('неизвестный код — null; collapseAll и scrollToSelected на месте', async () => {
    const t = mountTree()
    expect(await t.reveal('0000000000')).toBeNull()
    await t.reveal('8471300000')
    await flushPromises()
    t.collapseAll()
    await flushPromises()
    expect(rowTexts()).toHaveLength(2)
    await expect(t.scrollToSelected()).resolves.toBeDefined()
  })

  it('pathOf — предки по загруженным веткам; selectLoaded выделяет предка без запросов и без select', async () => {
    const t = mountTree()
    await t.reveal('8471300000')
    await flushPromises()
    expect(t.pathOf(1000).map((n) => n.code)).toEqual(['XVI', '84', '8471', '8471300000'])
    expect(t.pathOf(999)).toEqual([])
    const calls = api.children.mock.calls.length + api.path.mock.calls.length
    const n = await t.selectLoaded(10)
    await flushPromises()
    expect(n).toEqual(tree[1][0])
    expect(api.children.mock.calls.length + api.path.mock.calls.length).toBe(calls)
    expect(w.get('[data-z-tree-id="10"]').attributes('aria-selected')).toBe('true')
    expect(w.emitted('select')).toBeUndefined()
  })
})
