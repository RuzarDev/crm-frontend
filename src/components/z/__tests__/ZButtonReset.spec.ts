import { afterEach, describe, expect, it } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import { mountWithI18n } from '@/test/mountWithI18n'
import ZSwitch from '../ZSwitch.vue'
import ZSegmented from '../ZSegmented.vue'
import ZTabs from '../ZTabs.vue'
import ZCheckbox from '../ZCheckbox.vue'
import ZRadioGroup from '../ZRadioGroup.vue'
import ZCollapse from '../ZCollapse.vue'
import ZCollapseItem from '../ZCollapseItem.vue'
import ZAlert from '../ZAlert.vue'
import ZButton from '../ZButton.vue'
import ZInput from '../ZInput.vue'
import ZNumber from '../ZNumber.vue'
import ZSelect from '../ZSelect.vue'
import ZCombobox from '../ZCombobox.vue'
import ZDate from '../ZDate.vue'
import ZModal from '../ZModal.vue'
import ZDrawer from '../ZDrawer.vue'

// Tailwind идёт без preflight: у нативной <button> остаётся браузерная рамка (2px outset) и серый фон.
// jsdom стилей не считает, поэтому проверяем сами классы: у каждой кнопки — border-0 либо border + цвет рамки.
let w: VueWrapper
afterEach(() => w?.unmount())

const opts = [{ value: 'a', label: 'Первый' }, { value: 'b', label: 'Второй' }]

const BORDER_COLORS = ['control', 'line', 'line-strong', 'navy', 'transparent', 'danger', 'zircon']
const hasBorderReset = (el: Element) => {
  const cls = [...el.classList]
  return cls.includes('border-0') || (cls.includes('border') && cls.some((c) => c.startsWith('border-') && BORDER_COLORS.includes(c.slice(7))))
}
// Фон: у нативной кнопки он серый, пока класс bg-* не задан (в том числе data-[state=…]:bg-* не считается).
const hasOwnBackground = (el: Element) => [...el.classList].some((c) => /^bg-[a-z]/.test(c))
const expectButtons = (min = 1, bgFor: string[] = []) => {
  const buttons = [...document.body.querySelectorAll('button, [role="switch"], [role="tab"], [role="radio"], [role="checkbox"]')]
  expect(buttons.length).toBeGreaterThanOrEqual(min)
  for (const b of buttons) {
    const what = `${b.tagName} ${b.getAttribute('role') ?? ''}: ${b.className}`
    expect(hasBorderReset(b), what).toBe(true)
    // Кнопки, чей вид был багом: переключатель, сегмент, вкладка — фон задан явно.
    if (bgFor.includes(b.getAttribute('role') ?? '') || bgFor.includes('*')) expect(hasOwnBackground(b), `без фона: ${what}`).toBe(true)
  }
}
const mount = (c: object, options: Record<string, unknown> = {}) => {
  w = mountWithI18n(c as never, { attachTo: document.body, ...options })
}

describe('сброс браузерного вида кнопок', () => {
  it('ZSwitch', () => { mount(ZSwitch, { props: { checked: true } }); expectButtons(1, ['switch']) })
  it('ZSegmented', () => { mount(ZSegmented, { props: { value: 'a', options: opts } }); expectButtons(2, ['radio', 'button', '*']) })
  it('ZTabs', () => {
    mount(ZTabs, { props: { activeKey: 'a', items: [{ key: 'a', label: 'Документы', count: 3 }, { key: 'b', label: 'Платежи' }] } })
    expectButtons(2, ['tab'])
  })
  it('ZCheckbox', () => { mount(ZCheckbox, { props: { checked: true } }); expectButtons() })
  it('ZRadioGroup', () => { mount(ZRadioGroup, { props: { value: 'a', options: opts } }); expectButtons(2) })
  it('ZCollapse', () => {
    mount({ render: () => h(ZCollapse, { activeKey: [] }, () => h(ZCollapseItem, { value: 'g31', header: 'Гр.31' }, () => 'x')) })
    expectButtons()
  })
  it('ZAlert closable', () => { mount(ZAlert, { props: { message: 'Внимание', closable: true } }); expectButtons() })
  it('ZButton', () => { mount(ZButton, { slots: { default: 'Сохранить' } }); expectButtons() })
  it('ZInput allowClear', () => { mount(ZInput, { props: { value: 'ТОО', allowClear: true } }); expectButtons() })
  it('ZNumber controls', () => { mount(ZNumber, { props: { value: 3, controls: true } }); expectButtons(2) })
  it('ZSelect allowClear + multiple chips', () => {
    mount(ZSelect, { props: { value: ['a', 'b'], options: opts, mode: 'multiple', allowClear: true } })
    expectButtons(3)
  })
  it('ZCombobox allowClear', () => { mount(ZCombobox, { props: { value: 'Хор', options: opts, allowClear: true } }); expectButtons() })
  it('ZDate allowClear + календарь', () => { mount(ZDate, { props: { value: '2026-09-28', allowClear: true } }); expectButtons(2) })
  it('ZModal closable', async () => { mount(ZModal, { props: { open: true, title: 'Окно' } }); await nextTick(); await nextTick(); expectButtons(3) })
  it('ZDrawer closable', async () => { mount(ZDrawer, { props: { open: true, title: 'Панель' } }); await nextTick(); await nextTick(); expectButtons() })
})
