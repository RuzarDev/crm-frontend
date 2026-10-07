import { afterEach, describe, expect, it } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import ZNumber from '../ZNumber.vue'

let w: VueWrapper
afterEach(() => w?.unmount())

describe('ZNumber', () => {
  it('показывает значение и эмитит число на blur', async () => {
    w = mountWithI18n(ZNumber, { props: { value: 10 } })
    const input = w.get('input')
    expect((input.element as HTMLInputElement).value).toBe('10')
    await input.setValue('1 234,5')
    await input.trigger('blur')
    expect(w.emitted('update:value')?.at(-1)).toEqual([1234.5])
    expect(w.emitted('change')?.at(-1)).toEqual([1234.5])
  })
  it('пустое поле → null', async () => {
    w = mountWithI18n(ZNumber, { props: { value: 3 } })
    await w.get('input').setValue('')
    await w.get('input').trigger('blur')
    expect(w.emitted('update:value')?.at(-1)).toEqual([null])
  })
  it('min/max/precision применяются при коммите, мусор откатывается к прежнему значению', async () => {
    w = mountWithI18n(ZNumber, { props: { value: 2, min: 0, max: 100, precision: 2 } })
    const input = w.get('input')
    await input.setValue('150.129')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:value')?.at(-1)).toEqual([100])
    await w.setProps({ value: 100 })
    await input.setValue('abc')
    await input.trigger('blur')
    expect((input.element as HTMLInputElement).value).toBe('100')
  })
  it('кнопки шага и стрелки клавиатуры', async () => {
    w = mountWithI18n(ZNumber, { props: { value: 1, step: 0.5, controls: true } })
    await w.get('button[aria-label="Увеличить"]').trigger('click')
    expect(w.emitted('update:value')?.at(-1)).toEqual([1.5])
    // поле уже показывает 1.5 (родитель v-model не подключил) — шаг считается от показанного значения
    await w.get('input').trigger('keydown', { key: 'ArrowDown' })
    expect(w.emitted('update:value')?.at(-1)).toEqual([1])
  })
  it('атрибуты — на input, inputmode=decimal', () => {
    w = mountWithI18n(ZNumber, { props: { value: null }, attrs: { 'aria-label': 'Вес нетто', class: 'w-40' } })
    expect(w.get('input').attributes('aria-label')).toBe('Вес нетто')
    expect(w.get('input').attributes('inputmode')).toBe('decimal')
    expect(w.classes()).toContain('w-40')
  })
})
