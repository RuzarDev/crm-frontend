import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ZButton from '../ZButton.vue'

describe('ZButton', () => {
  it('по умолчанию — secondary, type=button', () => {
    const w = mount(ZButton, { slots: { default: 'Отмена' } })
    expect(w.attributes('type')).toBe('button')
    expect(w.classes()).toContain('bg-sunken')
    expect(w.text()).toBe('Отмена')
  })
  it('primary — navy', () => {
    const w = mount(ZButton, { props: { variant: 'primary' } })
    expect(w.classes()).toContain('bg-navy')
  })
  it('loading: не выглядит выключенной (нет native disabled), aria-disabled + aria-busy, иконку заменяет индикатор', () => {
    const w = mount(ZButton, { props: { loading: true }, slots: { icon: '<i class="ic" />', default: 'Сохранить' } })
    expect(w.attributes('disabled')).toBeUndefined()
    expect(w.attributes('aria-disabled')).toBe('true')
    expect(w.attributes('aria-busy')).toBe('true')
    expect(w.find('.ic').exists()).toBe(false)
    expect(w.find('[data-z-spin]').exists()).toBe(true)
  })
  it('loading глотает click и не отправляет форму', async () => {
    const onClick = vi.fn()
    const w = mount(ZButton, { props: { loading: true, htmlType: 'submit' }, attrs: { onClick } })
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
    w.element.dispatchEvent(ev)
    expect(onClick).not.toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(true)
  })
  it('disabled — native disabled, без hover-фона; loading/disabled — без нажатия scale', () => {
    const w = mount(ZButton, { props: { disabled: true, variant: 'primary' } })
    expect(w.attributes('disabled')).toBeDefined()
    expect(w.attributes('aria-disabled')).toBeUndefined()
    expect(w.classes().some((c) => c.includes('hover:bg'))).toBe(false)
    expect(w.classes().some((c) => c.includes('active:scale'))).toBe(false)
    const l = mount(ZButton, { props: { loading: true, variant: 'primary' } })
    expect(l.classes()).toContain('bg-navy')
    expect(l.classes().some((c) => c.includes('opacity') && !c.startsWith('disabled:'))).toBe(false)
    expect(l.classes().some((c) => c.includes('hover:bg') || c.includes('active:scale'))).toBe(false)
  })
  it('hover только у доступной кнопки (enabled:), scale в transition', () => {
    const w = mount(ZButton, { props: { variant: 'primary' } })
    expect(w.classes()).toContain('enabled:hover:bg-navy-hover')
    expect(w.classes()).toContain('transition-[background-color,color,scale]')
  })
  it('danger-ghost: на hover текст tone-danger-fg (≥4.5:1 на tone-danger-bg)', () => {
    const w = mount(ZButton, { props: { variant: 'danger-ghost' } })
    expect(w.classes()).toContain('enabled:hover:text-tone-danger-fg')
  })
  it('click доходит, а у disabled — нет', async () => {
    const onClick = vi.fn()
    await mount(ZButton, { attrs: { onClick } }).trigger('click')
    expect(onClick).toHaveBeenCalledTimes(1)
    const offClick = vi.fn()
    await mount(ZButton, { props: { disabled: true }, attrs: { onClick: offClick } }).trigger('click')
    expect(offClick).not.toHaveBeenCalled()
  })
  it('block растягивает, htmlType=submit', () => {
    const w = mount(ZButton, { props: { block: true, htmlType: 'submit' } })
    expect(w.classes()).toContain('w-full')
    expect(w.attributes('type')).toBe('submit')
  })
  it('фокус: outline-hidden (виден в forced-colors) + кольцо shadow-focus', () => {
    const w = mount(ZButton)
    expect(w.classes()).toContain('outline-hidden')
    expect(w.classes()).not.toContain('outline-none')
    expect(w.classes()).toContain('focus-visible:shadow-focus')
  })
})
