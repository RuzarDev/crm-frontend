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
})
