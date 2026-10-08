import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ZAvatar from '../ZAvatar.vue'

describe('ZAvatar', () => {
  it('инициалы, полное имя в title, скрыт от скринридера текст-дубль', () => {
    const w = mount(ZAvatar, { props: { name: 'ТОО «Казахмыс Трейд»' } })
    expect(w.text()).toBe('КТ')
    expect(w.attributes('title')).toBe('ТОО «Казахмыс Трейд»')
    expect(w.attributes('aria-hidden')).toBe('true')
  })
  it('class с места вызова заменяет размер пропа без «!»; прочие атрибуты — на корень', () => {
    const w = mount(ZAvatar, { props: { name: 'Altyn Med' }, attrs: { class: 'size-8', 'data-x': '1' } })
    expect(w.classes()).toContain('size-8')
    expect(w.classes()).not.toContain('size-[30px]')
    expect(w.classes()).toContain('rounded-[9px]')
    expect(w.attributes('data-x')).toBe('1')
  })
})
