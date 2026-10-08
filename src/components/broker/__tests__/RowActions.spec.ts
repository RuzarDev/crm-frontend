import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import RowActions from '../RowActions.vue'

let w: VueWrapper
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
})

const items = [{ key: 'open', label: 'Открыть' }, { key: 'void', label: 'Аннулировать', danger: true }]
const mount = (props: Record<string, unknown>, attrs: Record<string, unknown> = {}) => {
  w = mountWithI18n(RowActions, { props: { label: 'Действия: Счёт № 214/2026', ...props }, attrs, attachTo: document.body })
  return w
}

describe('RowActions', () => {
  it('клик по главной кнопке эмитит action с key', async () => {
    mount({ primary: { key: 'pay', label: 'Отметить оплату' }, items })
    await w.get('[data-row-primary]').trigger('click')
    expect(w.emitted('action')).toEqual([['pay']])
  })

  it('главная кнопка: primary — navy, outline — рамка', () => {
    mount({ primary: { key: 'issue', label: 'Выставить', variant: 'primary' }, items })
    expect(w.get('[data-row-primary]').classes()).toContain('bg-navy')
    w.unmount()
    mount({ primary: { key: 'pay', label: 'Напомнить', variant: 'outline' }, items })
    expect(w.get('[data-row-primary]').classes()).toContain('border-line-strong')
    expect(w.get('[data-row-primary]').classes()).toContain('bg-surface')
  })

  it('primary: loading блокирует эмит', async () => {
    mount({ primary: { key: 'pay', label: 'Отметить', loading: true }, items })
    await w.get('[data-row-primary]').trigger('click')
    expect(w.emitted('action')).toBeUndefined()
  })

  it('кнопка «⋯» с подписью, пункт меню эмитит action', async () => {
    mount({ items })
    const more = w.get('[data-row-more]')
    expect(more.attributes('aria-label')).toBe('Действия: Счёт № 214/2026')
    await more.trigger('keydown', { key: 'Enter' })
    await vi.waitFor(() => expect(document.body.querySelectorAll('[role="menuitem"]')).toHaveLength(2))
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((e) => e.textContent?.includes('Аннулировать'))!
    item.click()
    await vi.waitFor(() => expect(w.emitted('action')).toEqual([['void']]))
  })

  it('пустые items — меню нет', () => {
    mount({ items: [], primary: { key: 'pay', label: 'Отметить' } })
    expect(w.find('[data-row-more]').exists()).toBe(false)
    expect(w.find('[data-row-primary]').exists()).toBe(true)
  })

  it('без primary — только меню', () => {
    mount({ items })
    expect(w.find('[data-row-primary]').exists()).toBe(false)
    expect(w.find('[data-row-more]').exists()).toBe(true)
  })

  it('клик внутри не всплывает к родителю (строке)', async () => {
    const onRow = vi.fn()
    const Host = { components: { RowActions }, setup: () => ({ onRow, items }), template: '<div @click="onRow"><RowActions :items="items" label="Действия" :primary="{ key: \'pay\', label: \'Отметить\' }" /></div>' }
    w = mountWithI18n(Host, { attachTo: document.body })
    await w.get('[data-row-primary]').trigger('click')
    await w.get('[data-row-more]').trigger('click')
    expect(onRow).not.toHaveBeenCalled()
  })
})
