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
  it('class от родителя сливается через cn: переопределяет фон, а не дублирует', () => {
    const w = mount(ZButton, { attrs: { class: 'bg-surface w-full', 'data-x': '1' } })
    expect(w.classes()).toContain('bg-surface')
    expect(w.classes()).not.toContain('bg-sunken')
    expect(w.classes()).toContain('w-full')
    expect(w.attributes('data-x')).toBe('1')
  })
  it('aria-disabled/aria-busy родителя проходят, пока не loading', () => {
    const w = mount(ZButton, { attrs: { 'aria-disabled': 'true', 'aria-busy': 'false' } })
    expect(w.attributes('aria-disabled')).toBe('true')
    expect(w.attributes('aria-busy')).toBe('false')
    const plain = mount(ZButton)
    expect(plain.attributes('aria-disabled')).toBeUndefined()
    expect(plain.attributes('aria-busy')).toBeUndefined()
  })
  it('loading выставляет оба aria и перебивает значения родителя', () => {
    const w = mount(ZButton, { props: { loading: true }, attrs: { 'aria-disabled': 'false', 'aria-busy': 'false' } })
    expect(w.attributes('aria-disabled')).toBe('true')
    expect(w.attributes('aria-busy')).toBe('true')
  })
  it('style, необъявленный слушатель, data-*, htmlType/disabled работают', async () => {
    const onMouseenter = vi.fn()
    const w = mount(ZButton, { props: { htmlType: 'submit', disabled: true }, attrs: { style: 'margin-top: 4px', 'data-k': 'v', onMouseenter, type: 'reset' } })
    expect(w.attributes('style')).toContain('margin-top')
    expect(w.attributes('data-k')).toBe('v')
    expect(w.attributes('type')).toBe('submit')
    expect(w.attributes('disabled')).toBeDefined()
    const live = mount(ZButton, { attrs: { onMouseenter } })
    await live.trigger('mouseenter')
    expect(onMouseenter).toHaveBeenCalledTimes(1)
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

describe('ZButton size="lg" (страницы входа)', () => {
  it('44px, 15px, радиус 10px вместо rounded-field', () => {
    const w = mount(ZButton, { props: { size: 'lg', variant: 'primary' } })
    expect(w.classes()).toEqual(expect.arrayContaining(['h-11', 'rounded-[10px]', 'text-[15px]', 'bg-navy']))
    expect(w.classes()).not.toContain('h-9')
    expect(w.classes()).not.toContain('rounded-field')
  })
})
