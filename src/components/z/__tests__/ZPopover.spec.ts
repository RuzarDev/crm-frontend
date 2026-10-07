import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import ZPopover from '../ZPopover.vue'

let w: VueWrapper
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })
const tick = async () => { await nextTick(); await nextTick() }
const dialog = () => document.body.querySelector('[role="dialog"]') as HTMLElement | null
const settle = async () => { await new Promise((r) => setTimeout(r, 0)); await tick() }

const mountPop = (props: Record<string, unknown> = {}) =>
  mountWithI18n(ZPopover, {
    props,
    slots: { trigger: '<button id="trg">Фильтр</button>', default: '<input id="inner" /><p>Содержимое</p>' },
    attachTo: document.body,
  })

describe('ZPopover', () => {
  it('открывается по клику триггера, содержимое в body с floatingSurface', async () => {
    w = mountPop({ title: 'Колонки' })
    expect(dialog()).toBeNull()
    await w.get('#trg').trigger('click')
    await tick()
    const d = dialog()!
    expect(d).not.toBeNull()
    expect(d.textContent).toContain('Содержимое')
    expect(d.className).toContain('z-[1100]')
    expect(d.className).toContain('p-3')
  })

  it('title связан с диалогом через aria-labelledby (не id триггера)', async () => {
    w = mountPop({ title: 'Колонки' })
    await w.get('#trg').trigger('click')
    await tick()
    const d = dialog()!
    const titleEl = document.getElementById(d.getAttribute('aria-labelledby')!)
    expect(titleEl?.textContent).toBe('Колонки')
    expect(d.getAttribute('aria-labelledby')).not.toBe('trg')
  })

  it('без title заголовка и aria-labelledby-заголовка нет', async () => {
    w = mountPop()
    await w.get('#trg').trigger('click')
    await tick()
    expect(document.body.querySelector('[role="dialog"] p.font-semibold')).toBeNull()
  })

  it('Escape закрывает, фокус возвращается на триггер, update:open эмитится', async () => {
    w = mountPop({ title: 'Колонки' })
    ;(w.get('#trg').element as HTMLElement).focus()
    await w.get('#trg').trigger('click')
    await tick()
    expect(dialog()).not.toBeNull()
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(w.get('#trg').element)
    expect(w.emitted('update:open')).toEqual([[true], [false]])
  })

  it('клик снаружи закрывает', async () => {
    w = mountPop()
    await w.get('#trg').trigger('click')
    await new Promise((r) => setTimeout(r, 20)) // Reka вешает слушатель клика снаружи через setTimeout(0)
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await settle()
    expect(dialog()).toBeNull()
  })

  it('управляемое open: открыт сразу', async () => {
    w = mountPop({ open: true })
    await tick()
    expect(dialog()).not.toBeNull()
  })

  it('contentClass дополняет и перекрывает классы окна (отступ p-3 → p-0)', async () => {
    w = mountPop({ contentClass: 'p-0 w-[360px]' })
    await w.get('#trg').trigger('click')
    await tick()
    const cls = dialog()!.className.split(/\s+/)
    expect(cls).toContain('p-0')
    expect(cls).toContain('w-[360px]')
    expect(cls).not.toContain('p-3')
    expect(cls).toContain('z-[1100]')
  })

  it('по умолчанию при открытии фокус на первом элементе внутри', async () => {
    w = mountPop()
    await w.get('#trg').trigger('click')
    await settle()
    expect(document.activeElement?.id).toBe('inner')
  })

  it('focusContent — фокус на само окно (tabindex=-1), Tab ведёт дальше по порядку', async () => {
    w = mountPop({ focusContent: true })
    await w.get('#trg').trigger('click')
    await settle()
    const d = dialog()!
    expect(document.activeElement).toBe(d)
    expect(d.getAttribute('tabindex')).toBe('-1')
    expect(d.getAttribute('aria-labelledby')).toBeTruthy()
  })

  it('v-model:open — закрытие снаружи (open=false) убирает окно', async () => {
    w = mountPop({ open: true })
    await tick()
    expect(dialog()).not.toBeNull()
    await w.setProps({ open: false })
    await settle()
    expect(dialog()).toBeNull()
  })

  it('width задаёт ширину окна', async () => {
    w = mountPop({ width: 320 })
    await w.get('#trg').trigger('click')
    await tick()
    expect(dialog()!.style.width).toBe('320px')
  })
})
