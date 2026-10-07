import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import ZDescriptions from '../ZDescriptions.vue'
import ZDescriptionsItem from '../ZDescriptionsItem.vue'

let w: VueWrapper
afterEach(() => w?.unmount())

const item = (label: string, value: unknown, props: Record<string, unknown> = {}) =>
  h(ZDescriptionsItem, { label, ...props }, () => value as string)

const spanOf = (wrapper: VueWrapper, i: number) => {
  const pair = wrapper.findAll('dl > div')[i]
  return pair.classes().find((c) => c.startsWith('col-span-') && !c.includes(':'))
}

describe('ZDescriptions', () => {
  it('разметка dl > div > dt + dd в порядке подписей и значений', () => {
    w = mountWithI18n(ZDescriptions, { props: { column: 2 }, slots: { default: () => [item('Клиент', 'ТОО Альфа'), item('БИН', '123')] } })
    const dl = w.find('dl')
    expect(dl.exists()).toBe(true)
    const pairs = dl.findAll(':scope > div')
    expect(pairs).toHaveLength(2)
    for (const p of pairs) expect(p.element.children[0].tagName).toBe('DT')
    for (const p of pairs) expect(p.element.children[1].tagName).toBe('DD')
    expect(w.findAll('dt').map((x) => x.text())).toEqual(['Клиент', 'БИН'])
    expect(w.findAll('dd').map((x) => x.text())).toEqual(['ТОО Альфа', '123'])
  })

  it('column задаёт сетку: две пары в строке', () => {
    w = mountWithI18n(ZDescriptions, { props: { column: 2 }, slots: { default: () => [item('A', 'a'), item('B', 'b'), item('C', 'c')] } })
    expect(w.find('dl').classes().join(' ')).toContain('grid-cols-[repeat(2,')
    expect(spanOf(w, 0)).toBe('col-span-2')
    expect(spanOf(w, 1)).toBe('col-span-2')
    expect(spanOf(w, 2)).toBe('col-span-4')
  })

  it('column=1 и column=3', () => {
    w = mountWithI18n(ZDescriptions, { props: { column: 1 }, slots: { default: () => [item('A', 'a')] } })
    expect(w.find('dl').classes().join(' ')).toContain('grid-cols-[repeat(1,')
    w.unmount()
    w = mountWithI18n(ZDescriptions, { props: { column: 3 }, slots: { default: () => [item('A', 'a'), item('B', 'b'), item('C', 'c')] } })
    expect(w.find('dl').classes().join(' ')).toContain('grid-cols-[repeat(3,')
    expect([0, 1, 2].map((i) => spanOf(w, i))).toEqual(['col-span-2', 'col-span-2', 'col-span-2'])
  })

  it('span растягивает пару; значение занимает все дорожки справа от подписи', () => {
    w = mountWithI18n(ZDescriptions, { props: { column: 3 }, slots: { default: () => [item('A', 'a', { span: 2 }), item('B', 'b')] } })
    expect(spanOf(w, 0)).toBe('col-span-4')
    expect(spanOf(w, 1)).toBe('col-span-2')
    expect(w.findAll('dd')[0].classes()).toContain('col-span-3')
    expect(w.findAll('dd')[1].classes()).toContain('col-span-1')
  })

  it('span больше остатка строки: перенос, последняя пара прежней строки дотягивается', () => {
    w = mountWithI18n(ZDescriptions, {
      props: { column: 3 },
      slots: { default: () => [item('A', 'a'), item('B', 'b', { span: 2 }), item('C', 'c')] },
    })
    // A(1) + B(2) = 3: строка полная; C — в новой строке и растягивается на всю строку
    expect([0, 1, 2].map((i) => spanOf(w, i))).toEqual(['col-span-2', 'col-span-4', 'col-span-6'])
    w.unmount()
    w = mountWithI18n(ZDescriptions, {
      props: { column: 3 },
      slots: { default: () => [item('A', 'a', { span: 2 }), item('B', 'b', { span: 2 }), item('C', 'c')] },
    })
    // A(2) | B(2) не влезает -> A растягивается до 3; B(2)+C(1) = полная строка
    expect([0, 1, 2].map((i) => spanOf(w, i))).toEqual(['col-span-6', 'col-span-4', 'col-span-2'])
  })

  it('span больше column обрезается до column', () => {
    w = mountWithI18n(ZDescriptions, { props: { column: 2 }, slots: { default: () => [item('A', 'a', { span: 5 })] } })
    expect(spanOf(w, 0)).toBe('col-span-4')
  })

  it('пустое значение — «—» приглушённым цветом', () => {
    w = mountWithI18n(ZDescriptions, {
      slots: { default: () => [h(ZDescriptionsItem, { label: 'A' }), item('B', ''), item('C', null), item('D', 'ok')] },
    })
    const dds = w.findAll('dd')
    expect(dds.map((d) => d.text())).toEqual(['—', '—', '—', 'ok'])
    expect(dds[0].find('.text-faint').exists()).toBe(true)
    expect(dds[3].find('.text-faint').exists()).toBe(false)
  })

  it('слот #label заменяет подпись', () => {
    w = mountWithI18n(ZDescriptions, {
      slots: { default: () => h(ZDescriptionsItem, null, { label: () => h('b', 'Жирная'), default: () => 'v' }) },
    })
    expect(w.find('dt b').text()).toBe('Жирная')
  })

  it('items-проп эквивалентен дочерним', () => {
    const viaItems = mountWithI18n(ZDescriptions, {
      props: { column: 2, items: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b', span: 2 }, { label: 'C', value: null }] },
    })
    const viaChildren = mountWithI18n(ZDescriptions, {
      props: { column: 2 },
      slots: { default: () => [item('A', 'a'), item('B', 'b', { span: 2 }), item('C', null)] },
    })
    expect(viaItems.find('dl').html()).toBe(viaChildren.find('dl').html())
    viaItems.unmount()
    w = viaChildren
  })

  it('v-for и условные дочерние (комментарии, фрагменты) раскладываются', () => {
    w = mountWithI18n(ZDescriptions, {
      props: { column: 2 },
      slots: { default: () => [[item('A', 'a'), item('B', 'b')], null, false, item('C', 'c')] },
    })
    expect(w.findAll('dt').map((x) => x.text())).toEqual(['A', 'B', 'C'])
    expect([0, 1, 2].map((i) => spanOf(w, i))).toEqual(['col-span-2', 'col-span-2', 'col-span-4'])
  })

  it('bordered: рамка, фон подписи, скругление; size small плотнее middle', () => {
    w = mountWithI18n(ZDescriptions, { props: { bordered: true, size: 'small' }, slots: { default: () => [item('A', 'a')] } })
    const dl = w.find('dl')
    expect(dl.classes()).toEqual(expect.arrayContaining(['border', 'border-line', 'rounded-row', 'overflow-hidden']))
    expect(w.find('dt').classes()).toContain('bg-canvas')
    const small = w.find('dd').classes().join(' ')
    w.unmount()
    w = mountWithI18n(ZDescriptions, { props: { bordered: true, size: 'middle' }, slots: { default: () => [item('A', 'a')] } })
    expect(w.find('dd').classes().join(' ')).not.toBe(small)
  })

  it('без bordered нет рамки; типографика подписи и значения', () => {
    w = mountWithI18n(ZDescriptions, { slots: { default: () => [item('A', 'a')] } })
    expect(w.find('dl').classes()).not.toContain('border')
    expect(w.find('dt').classes()).toEqual(expect.arrayContaining(['text-sm', 'text-ink-3']))
    expect(w.find('dd').classes()).toEqual(expect.arrayContaining(['text-sm', 'text-ink', 'break-words']))
  })

  it('multiline сохраняет переводы строк (на всех или на одном значении)', () => {
    w = mountWithI18n(ZDescriptions, { props: { multiline: true }, slots: { default: () => [item('A', 'a\nb')] } })
    expect(w.find('dd').classes()).toContain('whitespace-pre-line')
    w.unmount()
    w = mountWithI18n(ZDescriptions, { slots: { default: () => [item('A', 'a\nb', { multiline: true }), item('B', 'b')] } })
    const dds = w.findAll('dd')
    expect(dds[0].classes()).toContain('whitespace-pre-line')
    expect(dds[1].classes()).not.toContain('whitespace-pre-line')
  })

  it('на телефоне одна колонка: сетка и пары имеют max-[640px]-варианты', () => {
    w = mountWithI18n(ZDescriptions, { props: { column: 3 }, slots: { default: () => [item('A', 'a', { span: 2 })] } })
    expect(w.find('dl').classes().join(' ')).toContain('max-[640px]:grid-cols-[')
    expect(w.findAll('dl > div')[0].classes()).toContain('max-[640px]:col-span-2')
    expect(w.find('dd').classes()).toContain('max-[640px]:col-span-1')
  })

  it('title выводится над списком; class и style на корне', () => {
    w = mountWithI18n(ZDescriptions, { props: { title: 'Основной лист' }, attrs: { class: 'mine', style: 'margin: 1px' }, slots: { default: () => [item('A', 'a')] } })
    expect(w.text()).toContain('Основной лист')
    expect(w.classes()).toContain('mine')
    expect(w.attributes('style')).toContain('margin')
    expect(w.element.querySelector('dl')).not.toBeNull()
  })
})
