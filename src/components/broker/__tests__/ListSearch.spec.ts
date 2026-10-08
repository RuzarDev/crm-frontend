import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import ListSearch from '../ListSearch.vue'

let w: VueWrapper
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { w?.unmount(); vi.useRealTimers() })

const mount = (props: Record<string, unknown> = {}) => {
  w = mountWithI18n(ListSearch, { props: { value: '', placeholder: 'Клиент, номер', ...props }, attachTo: document.body })
  return w
}

describe('ListSearch', () => {
  it('update:value — сразу, search — после debounce', async () => {
    mount({ debounce: 300 })
    await w.get('input').setValue('аб')
    await w.get('input').setValue('абв')
    expect(w.emitted('update:value')).toEqual([['аб'], ['абв']])
    expect(w.emitted('search')).toBeUndefined()
    vi.advanceTimersByTime(299)
    expect(w.emitted('search')).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(w.emitted('search')).toEqual([['абв']])
  })

  it('Enter — search немедленно, таймер отменяется', async () => {
    mount({ debounce: 300 })
    await w.get('input').setValue('8471')
    await w.get('input').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('search')).toEqual([['8471']])
    vi.advanceTimersByTime(1000)
    expect(w.emitted('search')).toHaveLength(1)
  })

  it('очистка крестиком — search(\'\') сразу', async () => {
    mount({ value: 'аб', debounce: 300 })
    await w.get('[aria-label="Очистить"]').trigger('click')
    expect(w.emitted('update:value')).toEqual([['']])
    expect(w.emitted('search')).toEqual([['']])
    vi.advanceTimersByTime(1000)
    expect(w.emitted('search')).toHaveLength(1)
  })

  it('без debounce search приходит следом за вводом', async () => {
    mount()
    await w.get('input').setValue('а')
    vi.advanceTimersByTime(0)
    expect(w.emitted('search')).toEqual([['а']])
  })

  it('плейсхолдер и имя поля, ограничение ширины', () => {
    mount()
    const input = w.get('input')
    expect(input.attributes('placeholder')).toBe('Клиент, номер')
    expect(input.attributes('aria-label')).toBe('Клиент, номер')
    expect(w.classes()).toContain('sm:max-w-[360px]')
  })
})
