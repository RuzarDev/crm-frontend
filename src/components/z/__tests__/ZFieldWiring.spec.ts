import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, type Component } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mountInField } from '@/test/fieldContext'
import { mountWithI18n } from '@/test/mountWithI18n'
import ZInput from '../ZInput.vue'
import ZTextarea from '../ZTextarea.vue'
import ZNumber from '../ZNumber.vue'
import ZSelect from '../ZSelect.vue'
import ZCombobox from '../ZCombobox.vue'
import ZDate from '../ZDate.vue'
import ZCheckbox from '../ZCheckbox.vue'
import ZSwitch from '../ZSwitch.vue'
import ZRadioGroup from '../ZRadioGroup.vue'
import ZSegmented from '../ZSegmented.vue'

// Каждое Z-поле внутри ZField: id/aria-* из контекста поля, о change и blur сообщает полю,
// focus поля ведёт в контрол. Контекст поддельный (src/test/fieldContext.ts): id 'f-1', ошибка 'f-1-msg'.
let w: VueWrapper
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const options = [{ value: 'IM', label: 'ИМ — импорт' }, { value: 'EK', label: 'ЭК — экспорт' }]
const expectBound = (el: Element) => {
  expect(el.getAttribute('id')).toBe('f-1')
  expect(el.getAttribute('aria-describedby')).toBe('f-1-msg')
  expect(el.getAttribute('aria-invalid')).toBe('true')
  expect(el.getAttribute('aria-required')).toBe('true')
}
const expectGroupBound = (el: Element) => {
  expect(el.getAttribute('aria-labelledby')).toBe('f-1-label')
  expect(el.getAttribute('aria-describedby')).toBe('f-1-msg')
  expect(el.getAttribute('aria-invalid')).toBe('true')
}
const leaveTo = async () => {
  const other = document.createElement('button')
  document.body.appendChild(other)
  other.focus()
  await nextTick()
  await nextTick()
}

describe('связь Z-полей с ZField', () => {
  it('ZInput: id/aria-*, красная рамка, change/blur, focus', async () => {
    const r = mountInField(ZInput, { value: '' })
    w = r.w
    const input = w.get('input')
    expectBound(input.element)
    expect(w.get('span').classes()).toContain('border-danger')
    await input.setValue('ТОО')
    expect(r.ctx.onChange).toHaveBeenCalledTimes(1)
    await input.trigger('blur')
    expect(r.ctx.onBlur).toHaveBeenCalledTimes(1)
    r.claimed[0].focus()
    expect(document.activeElement).toBe(input.element)
    expect(r.claimed[0].value()).toBe('')
  })

  it('ZInput: свои id и aria-* важнее контекста, aria-describedby объединяется', () => {
    const r = mountInField(ZInput, { id: 'bin' }, { attrs: { 'aria-describedby': 'bin-hint', 'aria-required': 'false' } })
    w = r.w
    const input = w.get('input')
    expect(input.attributes('id')).toBe('bin')
    expect(input.attributes('aria-describedby')).toBe('bin-hint f-1-msg')
    expect(input.attributes('aria-required')).toBe('false')
    expect(r.claimed[0].id()).toBe('bin')
  })

  it('ZTextarea', async () => {
    const r = mountInField(ZTextarea, { value: '' }, { attrs: { class: 'mine' } })
    w = r.w
    const ta = w.get('textarea')
    expectBound(ta.element)
    expect(ta.classes()).toEqual(expect.arrayContaining(['mine', 'border-danger']))
    await ta.setValue('Рубашка')
    expect(r.ctx.onChange).toHaveBeenCalledTimes(1)
    await ta.trigger('blur')
    expect(r.ctx.onBlur).toHaveBeenCalledTimes(1)
    r.claimed[0].focus()
    expect(document.activeElement).toBe(ta.element)
  })

  it('ZNumber', async () => {
    const r = mountInField(ZNumber, { value: null })
    w = r.w
    const input = w.get('input')
    expectBound(input.element)
    await input.trigger('focus')
    await input.setValue('5')
    expect(r.ctx.onChange).toHaveBeenCalledTimes(1)
    await input.trigger('blur')
    expect(r.ctx.onBlur).toHaveBeenCalledTimes(1)
    r.claimed[0].focus()
    expect(document.activeElement).toBe(input.element)
  })

  it('ZSelect', async () => {
    const r = mountInField(ZSelect, { value: null, options })
    w = r.w
    const input = w.get('input')
    expectBound(input.element)
    await input.trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    ;(document.body.querySelector('[role="option"]') as HTMLElement).click()
    await nextTick()
    expect(r.ctx.onChange).toHaveBeenCalledTimes(1)
    await input.trigger('blur')
    expect(r.ctx.onBlur).toHaveBeenCalledTimes(1)
    r.claimed[0].focus()
    expect(document.activeElement).toBe(input.element)
  })

  it('ZCombobox', async () => {
    const r = mountInField(ZCombobox, { value: '', options })
    w = r.w
    const input = w.get('input')
    expectBound(input.element)
    await input.setValue('575')
    expect(r.ctx.onChange).toHaveBeenCalledTimes(1)
    await input.trigger('blur')
    expect(r.ctx.onBlur).toHaveBeenCalledTimes(1)
    r.claimed[0].focus()
    expect(document.activeElement).toBe(input.element)
  })

  it('ZDate: change на фиксации, blur — на уходе из поля (не в календарь)', async () => {
    const r = mountInField(ZDate, { value: null })
    w = r.w
    const input = w.get('input').element as HTMLInputElement
    expectBound(input)
    input.focus()
    input.value = '28.09.2026'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(r.ctx.onChange).not.toHaveBeenCalled() // пока набирают — событий нет
    await leaveTo()
    expect(r.ctx.onChange).toHaveBeenCalledTimes(1)
    expect(r.ctx.onBlur).toHaveBeenCalledTimes(1)
    r.claimed[0].focus()
    expect(document.activeElement).toBe(input)
  })

  it('ZCheckbox', async () => {
    const r = mountInField(ZCheckbox, { checked: false }, { slots: { default: () => 'Согласен' } })
    w = r.w
    const box = w.get('[role="checkbox"]')
    expectBound(box.element)
    expect(box.classes()).toContain('data-[state=unchecked]:border-danger')
    expect(box.classes()).not.toContain('data-[state=unchecked]:hover:not-focus-visible:border-ink-3') // hover не перебивает ошибку
    await box.trigger('click')
    expect(r.ctx.onChange).toHaveBeenCalledTimes(1)
    await box.trigger('blur')
    expect(r.ctx.onBlur).toHaveBeenCalledTimes(1)
    r.claimed[0].focus()
    expect(document.activeElement).toBe(box.element)
  })

  it('ZSwitch', async () => {
    const r = mountInField(ZSwitch, { checked: false })
    w = r.w
    const sw = w.get('[role="switch"]')
    expectBound(sw.element)
    await sw.trigger('click')
    expect(r.ctx.onChange).toHaveBeenCalledTimes(1)
    await sw.trigger('blur')
    expect(r.ctx.onBlur).toHaveBeenCalledTimes(1)
    r.claimed[0].focus()
    expect(document.activeElement).toBe(sw.element)
  })

  it('ZRadioGroup: подпись через aria-labelledby (без id и label for), change, уход фокуса из группы', async () => {
    const r = mountInField(ZRadioGroup, { value: 'IM', options })
    w = r.w
    const group = w.get('[role="radiogroup"]')
    expectGroupBound(group.element)
    expect(group.attributes('aria-required')).toBe('true')
    expect(group.attributes('id')).toBeUndefined()
    expect(r.claimed[0].group).toBe(true)
    const radios = w.findAll('[role="radio"]')
    await radios[1].trigger('click')
    expect(r.ctx.onChange).toHaveBeenCalledTimes(1)
    r.claimed[0].focus()
    expect(document.activeElement).toBe(radios[0].element) // выбранный пункт (roving tabindex)
    radios[0].element.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: radios[1].element }))
    expect(r.ctx.onBlur).not.toHaveBeenCalled() // внутри группы — не уход
    await leaveTo()
    expect(r.ctx.onBlur).toHaveBeenCalledTimes(1)
  })

  it('ZSegmented: aria-labelledby, change, уход фокуса', async () => {
    const r = mountInField(ZSegmented, { value: 'IM', options })
    w = r.w
    const group = w.get('[role="group"]')
    // aria-invalid у role=group не поддерживается — ошибку объявляет aria-describedby (финальное ревью F7).
    expect(group.attributes('aria-labelledby')).toBe('f-1-label')
    expect(group.attributes('aria-describedby')).toBe('f-1-msg')
    expect(group.attributes('aria-invalid')).toBeUndefined()
    const items = w.findAll('button')
    await items[1].trigger('click')
    expect(r.ctx.onChange).toHaveBeenCalledTimes(1)
    r.claimed[0].focus()
    expect(group.element.contains(document.activeElement)).toBe(true)
    await leaveTo()
    expect(r.ctx.onBlur).toHaveBeenCalledTimes(1)
  })

  it('вне ZField — без id и aria-* поля', () => {
    w = mountWithI18n(ZInput, { props: { value: '' } })
    const input = w.get('input')
    for (const a of ['id', 'aria-describedby', 'aria-invalid', 'aria-required']) expect(input.attributes(a)).toBeUndefined()
  })

  // Свой aria-invalid (атрибутом) важнее контекста поля — и вне ZField не теряется.
  const cases: [string, Component, Record<string, unknown>, string][] = [
    ['ZInput', ZInput, { value: '' }, 'input'],
    ['ZTextarea', ZTextarea, { value: '' }, 'textarea'],
    ['ZNumber', ZNumber, { value: null }, 'input'],
    ['ZSelect', ZSelect, { value: null, options }, 'input'],
    ['ZCombobox', ZCombobox, { value: '', options }, 'input'],
    ['ZDate', ZDate, { value: null }, 'input'],
    ['ZCheckbox', ZCheckbox, { checked: false }, '[role="checkbox"]'],
    ['ZSwitch', ZSwitch, { checked: false }, '[role="switch"]'],
    ['ZRadioGroup', ZRadioGroup, { value: 'IM', options }, '[role="radiogroup"]'],
    ['ZSegmented', ZSegmented, { value: 'IM', options }, '[role="group"]'],
  ]
  it.each(cases)('%s: свой aria-invalid сохраняется вне ZField и важнее контекста внутри', (_n, cmp, props, sel) => {
    w = mountWithI18n(cmp, { props, attrs: { 'aria-invalid': 'true' }, attachTo: document.body })
    expect(w.get(sel).attributes('aria-invalid')).toBe('true')
    w.unmount()
    w = mountInField(cmp, props, { attrs: { 'aria-invalid': 'false' } }).w
    expect(w.get(sel).attributes('aria-invalid')).toBe('false')
  })
  it.each(cases)('%s: в поле без ошибки и не обязательном — без aria-invalid и aria-required', (_n, cmp, props, sel) => {
    w = mountInField(cmp, props, { invalid: false, required: false }).w
    const el = w.get(sel)
    expect(el.attributes('aria-invalid')).toBeUndefined()
    // Reka у checkbox/switch/radiogroup всегда пишет aria-required="false"; у нативных полей атрибута нет.
    const native = ['INPUT', 'TEXTAREA'].includes(el.element.tagName)
    expect(el.attributes('aria-required')).toBe(native ? undefined : (sel === '[role="group"]' ? undefined : 'false'))
  })
})
