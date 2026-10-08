import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import RepeatCards from '../RepeatCards.vue'

interface Row { name: string; draft?: string }
let w: VueWrapper

// В слоте — настоящее поле ввода: введённое, но не сохранённое в данные значение живёт в самом узле, так что
// перемешивание узлов при удалении (ключ по индексу) было бы видно.
const mountCards = (items: Row[], o: { readonly?: boolean; inline?: boolean } = {}) => {
  const list = reactive(items)
  w = mountWithI18n(RepeatCards as never, {
    props: { items: list, readonly: o.readonly ?? false, emptyText: 'Пусто', newItem: (): Row => ({ name: '' }), inline: o.inline ?? false },
    slots: { item: ({ item, index }: { item: Row; index: number }) => h('input', { 'data-name': index, value: item.name, onInput: (e: Event) => { item.name = (e.target as HTMLInputElement).value } }) },
    attachTo: document.body,
  })
  return list
}
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })

describe('RepeatCards', () => {
  it('пусто — текст, без списка', () => {
    mountCards([])
    expect(w.get('[data-repeat-empty]').text()).toBe('Пусто')
    expect(w.find('[data-repeat-item]').exists()).toBe(false)
  })

  it('add() добавляет строку из newItem в массив черновика', async () => {
    const list = mountCards([{ name: 'a' }])
    ;(w.vm as unknown as { add: () => void }).add()
    await nextTick()
    expect(list).toEqual([{ name: 'a' }, { name: '' }])
    expect(w.findAll('[data-repeat-item]')).toHaveLength(2)
    expect(w.findAll('[data-repeat-number]').map((n) => n.text())).toEqual(['1', '2'])
  })

  it('удаление второй из трёх: остальные на месте, узлы не пересоздаются (ключи стабильны)', async () => {
    const list = mountCards([{ name: 'один' }, { name: 'два' }, { name: 'три' }])
    const before = w.findAll('[data-repeat-item]').map((n) => n.element)
    await w.findAll('[data-repeat-delete]')[1].trigger('click')
    expect(list.map((r) => r.name)).toEqual(['один', 'три'])
    const after = w.findAll('[data-repeat-item]').map((n) => n.element)
    expect(after).toHaveLength(2)
    expect(after[0]).toBe(before[0])
    expect(after[1]).toBe(before[2])
    expect(w.findAll('[data-repeat-number]').map((n) => n.text())).toEqual(['1', '2'])
    expect((w.get('[data-name="1"]').element as HTMLInputElement).value).toBe('три')
  })

  it('«Удалить» — aria-label «Удалить N»', () => {
    mountCards([{ name: 'a' }, { name: 'b' }])
    expect(w.findAll('[data-repeat-delete]').map((b) => b.attributes('aria-label'))).toEqual(['Удалить 1', 'Удалить 2'])
  })

  it('readonly — без кнопок «Удалить», add() ничего не делает', async () => {
    const list = mountCards([{ name: 'a' }], { readonly: true })
    expect(w.find('[data-repeat-delete]').exists()).toBe(false)
    ;(w.vm as unknown as { add: () => void }).add()
    await nextTick()
    expect(list).toHaveLength(1)
  })

  it('inline — строка без карточки, с номером и «Удалить»', () => {
    mountCards([{ name: 'a' }], { inline: true })
    const li = w.get('[data-repeat-item]')
    expect(li.classes().join(' ')).not.toContain('border')
    expect(li.find('[data-repeat-number]').exists()).toBe(true)
    expect(li.find('[data-repeat-delete]').exists()).toBe(true)
  })

  it('замена массива целиком даёт новые строки без ошибок', async () => {
    const Host = defineComponent({
      components: { RepeatCards },
      setup: () => { const s = reactive({ items: [{ name: 'a' }] as Row[] }); return { s } },
      template: '<RepeatCards :items="s.items" :readonly="false" empty-text="Пусто" :new-item="() => ({ name: \'\' })"><template #item="{ item }"><b>{{ item.name }}</b></template></RepeatCards>',
    })
    const host = mountWithI18n(Host as never)
    ;(host.vm as unknown as { s: { items: Row[] } }).s.items = [{ name: 'x' }, { name: 'y' }]
    await nextTick()
    expect(host.findAll('b').map((b) => b.text())).toEqual(['x', 'y'])
    host.unmount()
  })

  it('номер строки скруглён токеном набора (rounded-md сброшен в tokens.css и дал бы квадрат)', () => {
    mountCards([{ name: 'a' }])
    const cls = w.get('[data-repeat-number]').classes()
    expect(cls).toContain('rounded-field')
    expect(cls).not.toContain('rounded-md')
  })
})
