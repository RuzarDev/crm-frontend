import { describe, expect, it, vi } from 'vitest'
import { mountWithI18n } from '@/test/mountWithI18n'
import ZInput from '../ZInput.vue'

describe('ZInput', () => {
  it('v-model:value — значение и update:value', async () => {
    const w = mountWithI18n(ZInput, { props: { value: 'ТОО' } })
    const input = w.find('input')
    expect((input.element as HTMLInputElement).value).toBe('ТОО')
    await input.setValue('ТОО «Ақжол»')
    expect(w.emitted('update:value')?.[0]).toEqual(['ТОО «Ақжол»'])
  })
  it('Enter → pressEnter', async () => {
    const w = mountWithI18n(ZInput)
    await w.find('input').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('pressEnter')).toHaveLength(1)
  })
  it('invalid — aria-invalid и красная рамка', () => {
    const w = mountWithI18n(ZInput, { props: { invalid: true } })
    expect(w.find('input').attributes('aria-invalid')).toBe('true')
    expect(w.classes()).toContain('border-danger')
  })
  it('allowClear: крестик с подписью очищает', async () => {
    const w = mountWithI18n(ZInput, { props: { value: '123', allowClear: true } })
    const btn = w.get('button[aria-label="Очистить"]')
    await btn.trigger('click')
    expect(w.emitted('update:value')?.[0]).toEqual([''])
  })
  it('крестика нет у пустого и у disabled', () => {
    expect(mountWithI18n(ZInput, { props: { value: '', allowClear: true } }).find('button').exists()).toBe(false)
    expect(mountWithI18n(ZInput, { props: { value: 'x', allowClear: true, disabled: true } }).find('button').exists()).toBe(false)
  })
  it('mono — моноширинный шрифт у поля (коды ТН ВЭД, БИН)', () => {
    expect(mountWithI18n(ZInput, { props: { mono: true } }).find('input').classes()).toContain('font-mono')
  })
  it('атрибуты: aria-*/data-* — на <input>, class/style — на обёртке', () => {
    const w = mountWithI18n(ZInput, { attrs: { 'aria-label': 'БИН', 'data-x': '1', class: 'w-40', style: 'margin: 1px' } })
    const input = w.find('input')
    expect(input.attributes('aria-label')).toBe('БИН')
    expect(input.attributes('data-x')).toBe('1')
    expect(w.attributes('aria-label')).toBeUndefined()
    expect(w.attributes('data-x')).toBeUndefined()
    expect(w.classes()).toContain('w-40')
    expect(input.classes()).not.toContain('w-40')
    expect(w.attributes('style')).toContain('margin: 1px')
    expect(input.attributes('style')).toBeUndefined()
  })
  it('слушатели из $attrs (onKeydown) — на <input>', async () => {
    const onKeydown = vi.fn()
    const w = mountWithI18n(ZInput, { attrs: { onKeydown } })
    await w.find('input').trigger('keydown', { key: 'a' })
    expect(onKeydown).toHaveBeenCalledTimes(1)
    await w.trigger('keydown', { key: 'a' }) // на обёртке слушателя нет
    expect(onKeydown).toHaveBeenCalledTimes(1)
  })
  it('change — на каждый ввод, как у a-input (автосейв на @change); нативный change не дублирует', async () => {
    const onChange = vi.fn()
    const w = mountWithI18n(ZInput, { attrs: { onChange } })
    const input = w.find('input')
    await input.setValue('1')
    await input.setValue('12')
    expect(w.emitted('change')).toHaveLength(2)
    expect(w.emitted('change')?.[0][0]).toBeInstanceOf(Event)
    expect(onChange).toHaveBeenCalledTimes(2)
    await input.trigger('change')
    expect(onChange).toHaveBeenCalledTimes(2)
  })
  it('Enter во время IME-набора не шлёт pressEnter', async () => {
    const w = mountWithI18n(ZInput)
    await w.find('input').trigger('keydown', { key: 'Enter', isComposing: true })
    expect(w.emitted('pressEnter')).toBeUndefined()
  })
  it('disabled — текст ink-3 на sunken, не muted', () => {
    const w = mountWithI18n(ZInput, { props: { disabled: true } })
    expect(w.classes()).toContain('text-ink-3')
    expect(w.classes()).not.toContain('text-muted')
    expect(w.find('input').classes()).toContain('disabled:placeholder:text-ink-3')
  })
  it('hover не перебивает рамку фокуса', () => {
    const w = mountWithI18n(ZInput)
    expect(w.classes()).toContain('hover:not-focus-within:border-faint')
    expect(w.classes()).not.toContain('hover:border-faint')
  })
  it('фокус: outline-hidden у поля и у крестика, кольцо на обёртке', () => {
    const w = mountWithI18n(ZInput, { props: { value: 'x', allowClear: true } })
    expect(w.find('input').classes()).toContain('outline-hidden')
    expect(w.find('button').classes()).toContain('outline-hidden')
    expect(w.find('button').classes()).toContain('focus-visible:shadow-focus')
    expect(w.classes()).toContain('focus-within:shadow-focus')
  })
})
