import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ZTextarea from '../ZTextarea.vue'

describe('ZTextarea', () => {
  it('v-model:value и rows', async () => {
    const w = mount(ZTextarea, { props: { value: 'a', rows: 5 } })
    const ta = w.find('textarea')
    expect(ta.attributes('rows')).toBe('5')
    await ta.setValue('ab')
    expect(w.emitted('update:value')?.[0]).toEqual(['ab'])
  })
  it('invalid — aria-invalid', () => {
    expect(mount(ZTextarea, { props: { invalid: true } }).find('textarea').attributes('aria-invalid')).toBe('true')
  })
  it('фокус: outline-hidden + кольцо shadow-focus', () => {
    const ta = mount(ZTextarea).find('textarea')
    expect(ta.classes()).toContain('outline-hidden')
    expect(ta.classes()).toContain('focus:shadow-focus')
  })
  describe('autoGrow', () => {
    const metric = (name: 'scrollHeight' | 'offsetHeight' | 'clientHeight', value: number) =>
      vi.spyOn(HTMLTextAreaElement.prototype, name, 'get').mockReturnValue(value)
    afterEach(() => vi.restoreAllMocks())

    it('высота учитывает рамки (border-box): scrollHeight + offsetHeight − clientHeight', () => {
      metric('scrollHeight', 100); metric('offsetHeight', 102); metric('clientHeight', 100)
      const ta = mount(ZTextarea, { props: { autoGrow: true, value: 'a' } }).find('textarea')
      expect((ta.element as HTMLTextAreaElement).style.height).toBe('102px')
    })
    it('предел — 12 строк содержимого (256px) плюс рамки', () => {
      metric('scrollHeight', 400); metric('offsetHeight', 102); metric('clientHeight', 100)
      const ta = mount(ZTextarea, { props: { autoGrow: true, value: 'a' } }).find('textarea')
      expect((ta.element as HTMLTextAreaElement).style.height).toBe('258px')
    })
  })
  it('disabled — текст и плейсхолдер ink-3 на sunken, не muted', () => {
    const ta = mount(ZTextarea, { props: { disabled: true } }).find('textarea')
    expect(ta.classes()).toContain('text-ink-3')
    expect(ta.classes()).toContain('disabled:placeholder:text-ink-3')
    expect(ta.classes()).not.toContain('text-muted')
  })
  it('hover не перебивает рамку фокуса', () => {
    const ta = mount(ZTextarea).find('textarea')
    expect(ta.classes()).toContain('hover:not-focus:border-faint')
    expect(ta.classes()).not.toContain('hover:border-faint')
  })
  it('change — на каждый ввод, как у a-textarea', async () => {
    const onChange = vi.fn()
    const w = mount(ZTextarea, { attrs: { onChange } })
    await w.find('textarea').setValue('a')
    expect(w.emitted('change')).toHaveLength(1)
    expect(onChange).toHaveBeenCalledTimes(1)
    await w.find('textarea').trigger('change')
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

