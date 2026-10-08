import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ClientCell from '../ClientCell.vue'
import StatusDot from '../StatusDot.vue'

describe('ClientCell', () => {
  it('аватар с инициалами и имя с title', () => {
    const w = mount(ClientCell, { props: { name: 'ТОО «Казахмыс Трейд»' } })
    expect(w.text()).toContain('КТ')
    const name = w.find('.truncate')
    expect(name.text()).toBe('ТОО «Казахмыс Трейд»')
    expect(name.attributes('title')).toBe('ТОО «Казахмыс Трейд»')
  })
})

describe('StatusDot', () => {
  it('точка цвета тона и подпись', () => {
    const w = mount(StatusDot, { props: { tone: 'done', label: 'Выпущено' } })
    expect(w.text()).toBe('Выпущено')
    const dot = w.get('[aria-hidden="true"]')
    expect(dot.classes()).toContain('bg-tone-done-fg')
    expect(dot.classes()).toContain('size-[7px]')
    expect(w.classes()).toContain('text-ink-2')
  })
})
