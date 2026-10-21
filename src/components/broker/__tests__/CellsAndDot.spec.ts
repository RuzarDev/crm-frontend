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
    expect(w.classes()).toContain('whitespace-nowrap')
    expect(w.find('[data-status-sub]').exists()).toBe(false)
  })

  it('узкая колонка: sub — второй строкой мельче, подпись в одну строку; wrap — подпись переносится', () => {
    const sub = mount(StatusDot, { props: { tone: 'danger', label: 'Нетто > брутто', sub: 'ещё 2' } })
    expect(sub.get('[data-status-label]').text()).toBe('Нетто > брутто')
    expect(sub.get('[data-status-label]').classes()).toContain('whitespace-nowrap')
    expect(sub.get('[data-status-sub]').text()).toBe('ещё 2')
    expect(sub.get('[data-status-sub]').classes()).toContain('text-xs')
    expect(sub.classes()).not.toContain('whitespace-nowrap')
    expect(sub.get('[aria-hidden="true"]').classes()).toContain('bg-tone-danger-fg')
    const wrap = mount(StatusDot, { props: { tone: 'danger', label: 'Нет в справочнике', wrap: true } })
    expect(wrap.text()).toBe('Нет в справочнике')
    expect(wrap.classes()).not.toContain('whitespace-nowrap')
    expect(wrap.get('[data-status-label]').classes()).not.toContain('whitespace-nowrap')
  })
})
