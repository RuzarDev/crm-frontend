import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ZTag from '../ZTag.vue'

describe('ZTag', () => {
  it('тон задаёт пару фон/текст', () => {
    const w = mount(ZTag, { props: { tone: 'done' }, slots: { default: 'Выпущена' } })
    expect(w.classes()).toEqual(expect.arrayContaining(['bg-tone-done-bg', 'text-tone-done-fg']))
    expect(w.text()).toBe('Выпущена')
  })
  it('по умолчанию нейтральный', () => {
    expect(mount(ZTag).classes()).toContain('bg-tone-neutral-bg')
  })
  it('accent — золотой «нужно действие»', () => {
    expect(mount(ZTag, { props: { tone: 'accent' } }).classes()).toContain('bg-gold-soft')
  })
})
