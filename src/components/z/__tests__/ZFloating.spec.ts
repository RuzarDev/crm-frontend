import { afterEach, describe, expect, it } from 'vitest'
import { h, nextTick, ref } from 'vue'
import { TooltipProvider } from 'reka-ui'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import ZTooltip from '../ZTooltip.vue'
import ZDropdown from '../ZDropdown.vue'
import ZPopconfirm from '../ZPopconfirm.vue'

let w: VueWrapper
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })

const tick = async () => { await nextTick(); await nextTick() }
const popButtons = () => [...document.body.querySelectorAll('[role="dialog"] button')] as HTMLButtonElement[]

describe('ZTooltip', () => {
  it('без title — только триггер, без обёрток Reka', () => {
    w = mountWithI18n({ render: () => h(TooltipProvider, () => h(ZTooltip, { title: '' }, () => h('button', 'Гр.31'))) }, { attachTo: document.body })
    expect(w.html()).toContain('Гр.31')
    expect(w.find('[data-state]').exists()).toBe(false)
  })

  it('с title — содержимое показывается при фокусе триггера и связано aria-describedby', async () => {
    w = mountWithI18n({
      render: () => h(TooltipProvider, { delayDuration: 0 }, () => h(ZTooltip, { title: 'Графа 31' }, () => h('button', 'Гр.31'))),
    }, { attachTo: document.body })
    const btn = w.get('button')
    expect(document.body.textContent).not.toContain('Графа 31')
    await btn.trigger('focus')
    await tick()
    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain('Графа 31')
    expect(btn.attributes('aria-describedby')).toBeTruthy()
    // триггер — сам элемент слота, лишней обёртки нет
    expect(btn.element.parentElement).toBe(w.element)
    expect(w.element.querySelectorAll('span').length).toBe(0)
  })

  it('Escape закрывает подсказку', async () => {
    w = mountWithI18n({
      render: () => h(TooltipProvider, { delayDuration: 0 }, () => h(ZTooltip, { title: 'Графа 31' }, () => h('button', 'Гр.31'))),
    }, { attachTo: document.body })
    await w.get('button').trigger('focus')
    await tick()
    expect(document.body.querySelector('[role="tooltip"]')).not.toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await tick()
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull()
  })
})

describe('ZDropdown', () => {
  const items = [
    { key: 'xml', label: 'Выгрузить XML' },
    { key: 'off', label: 'Недоступно', disabled: true, divider: true },
    { key: 'del', label: 'Удалить ДТ', danger: true },
  ]
  const mountDd = () => mountWithI18n(ZDropdown, { props: { items }, slots: { default: '<button>Ещё</button>' }, attachTo: document.body })
  const menuItems = () => [...document.body.querySelectorAll('[role="menuitem"]')] as HTMLElement[]

  it('пункты и select(key); danger-пункт отмечен, disabled не выбирается', async () => {
    w = mountDd()
    await w.get('button').trigger('keydown', { key: 'Enter' })
    await tick()
    const els = menuItems()
    expect(els.map((i) => i.textContent?.trim())).toEqual(['Выгрузить XML', 'Недоступно', 'Удалить ДТ'])
    expect(els[2].className).toContain('text-danger')
    expect(els[1].hasAttribute('data-disabled')).toBe(true)
    expect(document.body.querySelector('[role="separator"]')).not.toBeNull()
    els[1].click()
    await tick()
    expect(w.emitted('select')).toBeUndefined()
    els[0].click()
    await tick()
    expect(w.emitted('select')?.at(-1)).toEqual(['xml'])
    await new Promise((r) => setTimeout(r, 0)) // Reka закрывает меню после nextTick
    await tick()
    expect(menuItems()).toHaveLength(0) // после выбора меню закрывается
  })

  it('клавиатура: ArrowDown открывает, Escape закрывает', async () => {
    w = mountDd()
    await w.get('button').trigger('keydown', { key: 'ArrowDown' })
    await tick()
    expect(menuItems()).toHaveLength(3)
    expect(w.get('button').attributes('aria-expanded')).toBe('true')
    const menu = document.body.querySelector('[role="menu"]') as HTMLElement
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await tick()
    expect(menuItems()).toHaveLength(0)
  })
})

describe('ZPopconfirm', () => {
  const mountPc = (props: Record<string, unknown> = {}) =>
    mountWithI18n(ZPopconfirm, { props: { title: 'Удалить файл?', ...props }, slots: { default: '<button>Удалить</button>' }, attachTo: document.body })
  const find = (name: string) => popButtons().find((b) => b.textContent?.trim() === name)!

  it('подтверждение эмитит confirm и закрывает окно', async () => {
    w = mountPc({ danger: true })
    await w.get('button').trigger('click')
    await tick()
    expect(document.body.textContent).toContain('Удалить файл?')
    find('Подтвердить').click()
    await tick()
    expect(w.emitted('confirm')).toHaveLength(1)
    expect(w.emitted('cancel')).toBeUndefined()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('отмена эмитит cancel один раз; role dialog подписан заголовком; фокус на «Отмена»', async () => {
    w = mountPc({ description: 'Файл будет удалён' })
    await w.get('button').trigger('click')
    await tick()
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    const titleEl = document.getElementById(dialog.getAttribute('aria-labelledby')!)
    expect(titleEl?.textContent).toBe('Удалить файл?')
    expect(document.body.textContent).toContain('Файл будет удалён')
    expect(document.activeElement).toBe(find('Отмена'))
    find('Отмена').click()
    await tick()
    expect(w.emitted('cancel')).toHaveLength(1)
    expect(w.emitted('confirm')).toBeUndefined()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('Escape — cancel один раз', async () => {
    w = mountPc()
    await w.get('button').trigger('click')
    await tick()
    find('Отмена').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await tick()
    expect(w.emitted('cancel')).toHaveLength(1)
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('клик снаружи — cancel один раз', async () => {
    w = mountPc()
    await w.get('button').trigger('click')
    await tick()
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await tick()
    expect(w.emitted('cancel')).toHaveLength(1)
  })

  it('свои тексты кнопок и disabled — не открывается', async () => {
    w = mountPc({ okText: 'Да, удалить', cancelText: 'Нет' })
    await w.get('button').trigger('click')
    await tick()
    expect(popButtons().map((b) => b.textContent?.trim())).toEqual(['Нет', 'Да, удалить'])
    w.unmount()
    document.body.innerHTML = ''
    w = mountPc({ title: 'Удалить?', disabled: true })
    await w.get('button').trigger('click')
    await tick()
    expect(document.body.textContent).not.toContain('Удалить?')
    expect(w.emitted('cancel')).toBeUndefined()
  })
})
void ref
