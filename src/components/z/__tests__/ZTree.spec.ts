import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import ZTree, { type ZTreeNode } from '../ZTree.vue'

// ZTree — дерево комплекта на Reka Tree. Ветки догружаются по раскрытию (loadChildren), строка: отступ по уровню,
// шеврон, код моноширинным, название с обрезкой. Выбор — v-model:selected (id) + select(node) на действие
// пользователя; reveal(path) раскрывает путь, выделяет и прокручивает к узлу; collapseAll() сворачивает всё.

const roots: ZTreeNode[] = [
  { id: 1, code: 'XVI', label: 'Машины и оборудование', hasChildren: true },
  { id: 2, code: 'XVII', label: 'Средства наземного транспорта', hasChildren: true },
  { id: 3, label: 'Лист без кода' },
]
const kids: Record<number, ZTreeNode[]> = {
  1: [{ id: 10, code: '84', label: 'Реакторы ядерные, котлы', hasChildren: true }, { id: 11, code: '85', label: 'Электрические машины', hasChildren: true }],
  10: [{ id: 100, code: '8471', label: 'Машины вычислительные', hasChildren: true }],
  100: [{ id: 1000, code: '8471 30 000 0', label: 'Ноутбуки и планшеты' }],
  2: [{ id: 20, code: '87', label: 'Средства наземного транспорта' }],
  11: [],
}

let w: VueWrapper
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })

const deferred = <T,>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const mountTree = (props: Record<string, unknown> = {}) => {
  const loadChildren = vi.fn(async (n: ZTreeNode) => kids[n.id as number] ?? [])
  w = mountWithI18n(ZTree, {
    props: {
      items: roots, loadChildren, ariaLabel: 'Дерево',
      'onUpdate:selected': (v: string | number | null) => w.setProps({ selected: v }),
      ...props,
    },
    attachTo: document.body,
  })
  return { loadChildren }
}
const rows = () => w.findAll('[role="treeitem"]')
const row = (id: number) => w.get(`[data-z-tree-id="${id}"]`)
const labels = () => rows().map((r) => r.text().replace(/\s+/g, ' ').trim())

describe('ZTree', () => {
  it('строки: код моноширинным, название; ветка — aria-expanded=false, лист — без aria-expanded; уровень в aria-level', () => {
    mountTree()
    expect(w.get('[role="tree"]').attributes('aria-label')).toBe('Дерево')
    expect(labels()).toEqual(['XVI Машины и оборудование', 'XVII Средства наземного транспорта', 'Лист без кода'])
    expect(row(1).get('[data-z-tree-code]').classes()).toContain('font-mono')
    expect(row(1).get('[data-z-tree-label]').classes()).toContain('truncate')
    expect(row(1).attributes('aria-expanded')).toBe('false')
    expect(row(1).attributes('aria-level')).toBe('1')
    expect(row(3).attributes('aria-expanded')).toBeUndefined()
    expect(row(3).find('[data-z-tree-code]').exists()).toBe(false)
  })

  it('ленивая загрузка: индикатор в строке, дети на уровне 2, повторное раскрытие — без запроса', async () => {
    const d = deferred<ZTreeNode[]>()
    const loadChildren = vi.fn(() => d.promise)
    mountTree({ loadChildren })
    await row(1).trigger('click')
    expect(loadChildren).toHaveBeenCalledTimes(1)
    expect(loadChildren.mock.calls[0][0]).toMatchObject({ id: 1 })
    expect(row(1).find('[data-z-tree-loading]').exists()).toBe(true)
    expect(row(1).attributes('aria-busy')).toBe('true')
    d.resolve(kids[1])
    await flushPromises()
    expect(row(1).find('[data-z-tree-loading]').exists()).toBe(false)
    expect(row(1).attributes('aria-expanded')).toBe('true')
    expect(row(10).attributes('aria-level')).toBe('2')
    expect(labels().slice(0, 3)).toEqual(['XVI Машины и оборудование', '84 Реакторы ядерные, котлы', '85 Электрические машины'])
    // Отступ по уровню
    const pad = (id: number) => parseInt((row(id).element as HTMLElement).style.paddingLeft, 10)
    expect(pad(10)).toBeGreaterThan(pad(1))
    // Свернуть и раскрыть снова — из памяти
    await row(1).trigger('click')
    expect(w.find('[data-z-tree-id="10"]').exists()).toBe(false)
    await row(1).trigger('click')
    await flushPromises()
    expect(w.find('[data-z-tree-id="10"]').exists()).toBe(true)
    expect(loadChildren).toHaveBeenCalledTimes(1)
  })

  it('пустой ответ — узел становится листом; двойной клик во время загрузки — один запрос', async () => {
    const { loadChildren } = mountTree()
    await row(1).trigger('click')
    await flushPromises()
    await row(11).trigger('click')
    await row(11).trigger('click')
    await flushPromises()
    expect(loadChildren.mock.calls.filter(([n]) => n.id === 11)).toHaveLength(1)
    expect(row(11).attributes('aria-expanded')).toBeUndefined()
  })

  it('ошибка загрузки — load-error, ветка свёрнута, повторное раскрытие пробует снова', async () => {
    const loadChildren = vi.fn().mockRejectedValueOnce(new Error('429')).mockResolvedValueOnce(kids[2])
    mountTree({ loadChildren })
    await row(2).trigger('click')
    await flushPromises()
    expect(w.emitted('load-error')?.[0][0]).toMatchObject({ id: 2 })
    expect(row(2).attributes('aria-expanded')).toBe('false')
    await row(2).trigger('click')
    await flushPromises()
    expect(row(2).attributes('aria-expanded')).toBe('true')
    expect(w.find('[data-z-tree-id="20"]').exists()).toBe(true)
  })

  it('выбор: клик — update:selected и select(node); выбранная строка — aria-selected и фон zircon-soft', async () => {
    mountTree()
    await row(3).trigger('click')
    expect(w.emitted('update:selected')?.at(-1)).toEqual([3])
    expect(w.emitted('select')?.at(-1)?.[0]).toMatchObject({ id: 3, label: 'Лист без кода' })
    await nextTick()
    expect(row(3).attributes('aria-selected')).toBe('true')
    expect(row(3).classes()).toContain('data-[selected]:bg-zircon-soft')
    expect(row(1).attributes('aria-selected')).toBe('false')
    // Повторный клик по выбранной строке выбор не снимает
    await row(3).trigger('click')
    expect(w.emitted('update:selected')?.at(-1)).toEqual([3])
  })

  it('шеврон раскрывает без выбора', async () => {
    mountTree()
    await row(1).get('[data-z-tree-toggle]').trigger('click')
    await flushPromises()
    expect(row(1).attributes('aria-expanded')).toBe('true')
    expect(w.emitted('select')).toBeUndefined()
  })

  it('клавиатура: стрелки, Home/End, Enter выбирает, вправо раскрывает, влево сворачивает', async () => {
    const { loadChildren } = mountTree()
    const el = (id: number) => row(id).element as HTMLElement
    const press = async (key: string) => {
      ;(document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
      await flushPromises()
      await nextTick()
    }
    // Reka вешает обработчики клавиш на строки после первой отрисовки.
    await flushPromises()
    el(1).focus()
    await press('ArrowDown')
    expect(document.activeElement).toBe(el(2))
    await press('End')
    expect(document.activeElement).toBe(el(3))
    await press('Home')
    expect(document.activeElement).toBe(el(1))
    await press('ArrowRight')
    expect(loadChildren).toHaveBeenCalledTimes(1)
    expect(row(1).attributes('aria-expanded')).toBe('true')
    await press('ArrowDown')
    expect(document.activeElement).toBe(el(10))
    await press('Enter')
    expect(w.emitted('update:selected')?.at(-1)).toEqual([10])
    expect(w.emitted('select')?.at(-1)?.[0]).toMatchObject({ id: 10 })
    // Влево с ребёнка — к родителю, ещё раз влево — свернуть
    await press('ArrowLeft')
    expect(document.activeElement).toBe(el(1))
    await press('ArrowLeft')
    expect(row(1).attributes('aria-expanded')).toBe('false')
  })

  it('reveal(path): раскрывает путь с догрузкой, выделяет узел (без select) и прокручивает к нему', async () => {
    const { loadChildren } = mountTree()
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    const node = await (w.vm as unknown as { reveal: (p: number[]) => Promise<ZTreeNode | null> }).reveal([1, 10, 100, 1000])
    await flushPromises()
    expect(node).toMatchObject({ id: 1000 })
    expect(loadChildren.mock.calls.map(([n]) => n.id)).toEqual([1, 10, 100])
    expect(w.emitted('update:selected')?.at(-1)).toEqual([1000])
    expect(w.emitted('select')).toBeUndefined()
    expect(row(1000).attributes('aria-selected')).toBe('true')
    expect(row(1000).attributes('aria-level')).toBe('4')
    expect(spy.mock.contexts.at(-1)).toBe(row(1000).element)
    spy.mockRestore()
  })

  it('reveal: путь с неизвестным узлом — null; новый reveal отменяет прежний', async () => {
    const d = deferred<ZTreeNode[]>()
    const loadChildren = vi.fn(async (n: ZTreeNode) => (n.id === 1 ? d.promise : kids[n.id as number] ?? []))
    mountTree({ loadChildren })
    const api = w.vm as unknown as { reveal: (p: number[]) => Promise<ZTreeNode | null> }
    expect(await api.reveal([999, 1])).toBeNull()
    const first = api.reveal([1, 10])
    const second = api.reveal([2, 20])
    d.resolve(kids[1])
    expect(await first).toBeNull()
    expect(await second).toMatchObject({ id: 20 })
    await flushPromises()
    expect(w.emitted('update:selected')?.at(-1)).toEqual([20])
    expect(w.emitted('update:selected')?.some(([v]) => v === 10)).toBe(false)
  })

  it('collapseAll сворачивает все ветки; выбор остаётся', async () => {
    mountTree({ selected: 3 })
    const api = w.vm as unknown as { reveal: (p: number[]) => Promise<unknown>; collapseAll: () => void }
    await api.reveal([1, 10, 100])
    await flushPromises()
    expect(rows().length).toBeGreaterThan(3)
    api.collapseAll()
    await nextTick()
    expect(rows().map((r) => r.attributes('data-z-tree-id'))).toEqual(['1', '2', '3'])
    expect(row(1).attributes('aria-expanded')).toBe('false')
  })

  it('статичные дети (children) — без loadChildren', async () => {
    w = mountWithI18n(ZTree, {
      props: { items: [{ id: 'a', label: 'Корень', children: [{ id: 'b', label: 'Ребёнок' }] }] },
      attachTo: document.body,
    })
    await w.get('[data-z-tree-id="a"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-z-tree-id="b"]').exists()).toBe(true)
  })

  it('loading — скелетон вместо строк; пусто — слот empty', async () => {
    mountTree({ loading: true })
    expect(w.find('[role="treeitem"]').exists()).toBe(false)
    expect(w.find('[data-z-tree-skeleton]').exists()).toBe(true)
    w.unmount()
    w = mountWithI18n(ZTree, { props: { items: [] }, slots: { empty: '<p data-empty>Пусто</p>' }, attachTo: document.body })
    expect(w.find('[data-empty]').exists()).toBe(true)
  })

  it('слот suffix — справа в строке', () => {
    w = mountWithI18n(ZTree, {
      props: { items: roots },
      slots: { suffix: '<template #suffix="{ node }"><i data-suffix>{{ node.id }}</i></template>' },
      attachTo: document.body,
    })
    expect(w.findAll('[data-suffix]').map((s) => s.text())).toEqual(['1', '2', '3'])
  })
})
