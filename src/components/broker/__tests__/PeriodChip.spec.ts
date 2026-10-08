import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import PeriodChip from '../PeriodChip.vue'

let w: VueWrapper
afterEach(() => { w?.unmount(); document.body.innerHTML = ''; vi.useRealTimers() })
const tick = async () => { await nextTick(); await nextTick() }

const mount = (value: [string, string] | null) => {
  w = mountWithI18n(PeriodChip, { props: { label: 'Период', value }, attachTo: document.body })
  return w
}
const year = new Date().getFullYear()

describe('PeriodChip', () => {
  it('без значения — «Период», пунктир, без крестика', () => {
    mount(null)
    expect(w.text()).toBe('Период')
    expect(w.find('[aria-label="Сбросить фильтр"]').exists()).toBe(false)
  })

  it('текущий год — подпись без года', () => {
    mount([`${year}-10-01`, `${year}-10-08`])
    expect(w.text()).toBe('Период: 01.10–08.10')
  })

  it('другой год — с годом', () => {
    mount(['2024-12-30', `${year}-01-05`])
    expect(w.text()).toBe(`Период: 30.12.2024–05.01.${year}`)
  })

  it('«×» эмитит null', async () => {
    mount([`${year}-10-01`, `${year}-10-08`])
    await w.get('[aria-label="Сбросить фильтр"]').trigger('click')
    expect(w.emitted('update:value')).toEqual([[null]])
  })

  it('в окне две даты; обе введены — эмит пары, одна — нет', async () => {
    mount(null)
    await w.get('button').trigger('click')
    await tick()
    const inputs = [...document.body.querySelectorAll('input')] as HTMLInputElement[]
    expect(inputs).toHaveLength(2)
    const enter = async (el: HTMLInputElement, v: string) => {
      el.focus(); el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await tick()
    }
    await enter(inputs[0], '01.10.2026')
    expect(w.emitted('update:value')).toBeUndefined()
    await enter(inputs[1], '08.10.2026')
    expect(w.emitted('update:value')).toEqual([[['2026-10-01', '2026-10-08']]])
  })

  it('после «×» фокус переходит на кнопку чипа', async () => {
    mount([`${year}-10-01`, `${year}-10-08`])
    ;(w.get('[aria-label="Сбросить фильтр"]').element as HTMLElement).focus()
    await w.get('[aria-label="Сбросить фильтр"]').trigger('click')
    await w.setProps({ value: null })
    await tick()
    expect(document.activeElement).toBe(w.get('button').element)
  })

  it('черновик с одним стёртым концом при закрытии возвращается к значению', async () => {
    mount(['2026-10-01', '2026-10-08'])
    await w.get('button').trigger('click')
    await tick()
    const inputs = [...document.body.querySelectorAll('input')] as HTMLInputElement[]
    expect(inputs.map((i) => i.value)).toEqual(['01.10.2026', '08.10.2026'])
    inputs[1].focus(); inputs[1].value = ''
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }))
    inputs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await tick()
    expect(w.emitted('update:value')).toBeUndefined()
    document.body.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise((r) => setTimeout(r, 0)); await tick()
    await w.get('button').trigger('click')
    await tick()
    expect([...document.body.querySelectorAll('input')].map((i) => (i as HTMLInputElement).value)).toEqual(['01.10.2026', '08.10.2026'])
  })
})
