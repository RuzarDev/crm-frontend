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
  it('loading блокирует и помечает aria-busy, иконку заменяет индикатор', () => {
    const w = mount(ZButton, { props: { loading: true }, slots: { icon: '<i class="ic" />', default: 'Сохранить' } })
    expect(w.attributes('disabled')).toBeDefined()
    expect(w.attributes('aria-busy')).toBe('true')
    expect(w.find('.ic').exists()).toBe(false)
    expect(w.find('[data-z-spin]').exists()).toBe(true)
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
})
