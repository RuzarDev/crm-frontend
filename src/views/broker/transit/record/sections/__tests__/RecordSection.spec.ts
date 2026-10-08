import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RecordSection from '../RecordSection.vue'
import { sectionDomId } from '../sectionId'

describe('RecordSection', () => {
  it('id раздела — sec-<ключ>; заголовок h2 связан через aria-labelledby', () => {
    expect(sectionDomId('goods')).toBe('sec-goods')
    const w = mount(RecordSection, { props: { id: 'goods', title: 'Товары' }, slots: { default: '<p data-body>тело</p>' } })
    const section = w.get('section')
    expect(section.attributes('id')).toBe('sec-goods')
    const h2 = w.get('h2')
    expect(h2.text()).toBe('Товары')
    expect(section.attributes('aria-labelledby')).toBe(h2.attributes('id'))
    expect(w.get('[data-body]').text()).toBe('тело')
  })

  it('счётчик-пилюля — только когда count задан (0 тоже показывается); действия — справа, только если есть слот', () => {
    const plain = mount(RecordSection, { props: { id: 'main', title: 'Основное' } })
    expect(plain.find('[data-section-count]').exists()).toBe(false)
    expect(plain.find('[data-section-actions]').exists()).toBe(false)
    const zero = mount(RecordSection, { props: { id: 'goods', title: 'Товары', count: 0 } })
    expect(zero.get('[data-section-count]').text()).toBe('0')
    const full = mount(RecordSection, { props: { id: 'goods', title: 'Товары', count: 3 }, slots: { actions: '<button type="button">Добавить</button>' } })
    expect(full.get('[data-section-count]').text()).toBe('3')
    expect(full.get('[data-section-actions] button').text()).toBe('Добавить')
  })
})
