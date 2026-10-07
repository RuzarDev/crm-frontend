import { describe, expect, it } from 'vitest'
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
})
