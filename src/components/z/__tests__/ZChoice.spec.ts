import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import ZCheckbox from '../ZCheckbox.vue'
import ZSwitch from '../ZSwitch.vue'
import ZRadioGroup from '../ZRadioGroup.vue'
import ZSegmented from '../ZSegmented.vue'

let w: VueWrapper
afterEach(() => w?.unmount())

describe('ZCheckbox', () => {
  it('клик по подписи переключает, эмитит update:checked и change', async () => {
    w = mountWithI18n(ZCheckbox, { props: { checked: false }, slots: { default: 'Без ЭЦП' } })
    await w.get('label').trigger('click')
    expect(w.emitted('update:checked')?.at(-1)).toEqual([true])
    expect(w.emitted('change')).toHaveLength(1)
    expect(w.emitted('update:checked')).toHaveLength(1)
    expect(w.emitted('change')?.at(-1)).toEqual([true])
  })
  it('role=checkbox, aria-checked отражает состояние; indeterminate → mixed', () => {
    w = mountWithI18n(ZCheckbox, { props: { checked: true } })
    expect(w.get('[role="checkbox"]').attributes('aria-checked')).toBe('true')
    w.unmount()
    w = mountWithI18n(ZCheckbox, { props: { checked: false, indeterminate: true } })
    expect(w.get('[role="checkbox"]').attributes('aria-checked')).toBe('mixed')
  })
  it('hover меняет рамку только у неотмеченного; граница — токен control', () => {
    w = mountWithI18n(ZCheckbox, { props: { checked: true } })
    const cls = w.get('[role="checkbox"]').classes()
    expect(cls).toContain('border-control')
    expect(cls).toContain('data-[state=unchecked]:hover:not-focus-visible:border-ink-3')
    expect(cls).not.toContain('hover:not-focus-visible:border-faint')
  })
  it('снятие отметки; disabled не реагирует; aria-* на кнопке, class на подписи', async () => {
    w = mountWithI18n(ZCheckbox, { props: { checked: true }, attrs: { 'aria-label': 'ЭЦП', class: 'mine' } })
    expect(w.get('[role="checkbox"]').attributes('aria-label')).toBe('ЭЦП')
    expect(w.get('label').classes()).toContain('mine')
    await w.get('[role="checkbox"]').trigger('click')
    expect(w.emitted('change')?.at(-1)).toEqual([false])
    w.unmount()
    w = mountWithI18n(ZCheckbox, { props: { checked: false, disabled: true } })
    await w.get('[role="checkbox"]').trigger('click')
    expect(w.emitted('change')).toBeUndefined()
  })
})

// jsdom не превращает Space в click (это делает браузер для нативной button), поэтому проверяем условия,
// при которых браузер это сделает: нативная фокусируемая button, Space не отменяется, disabled блокирует.
const spaceKeepsNativeActivation = (btn: HTMLElement) => {
  expect(btn.tagName).toBe('BUTTON')
  expect(btn.getAttribute('type')).toBe('button')
  expect(btn.tabIndex).toBeGreaterThanOrEqual(0)
  const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
  btn.dispatchEvent(ev)
  expect(ev.defaultPrevented).toBe(false)
}

describe('Space на чекбоксе и переключателе', () => {
  it('ZCheckbox: нативная кнопка, Space не отменяется, затем click переключает', async () => {
    w = mountWithI18n(ZCheckbox, { props: { checked: false }, attachTo: document.body })
    const btn = w.get('[role="checkbox"]')
    spaceKeepsNativeActivation(btn.element as HTMLElement)
    await btn.trigger('click') // click, который браузер шлёт после Space
    expect(w.emitted('change')).toHaveLength(1)
  })
  it('ZSwitch: нативная кнопка, Space не отменяется, затем click переключает', async () => {
    w = mountWithI18n(ZSwitch, { props: { checked: false }, attachTo: document.body })
    const btn = w.get('[role="switch"]')
    spaceKeepsNativeActivation(btn.element as HTMLElement)
    await btn.trigger('click')
    expect(w.emitted('change')).toHaveLength(1)
  })
})

describe('ZSwitch', () => {
  it('переключение', async () => {
    w = mountWithI18n(ZSwitch, { props: { checked: false } })
    await w.get('[role="switch"]').trigger('click')
    expect(w.emitted('update:checked')?.at(-1)).toEqual([true])
    expect(w.emitted('change')?.at(-1)).toEqual([true])
    expect(w.emitted('change')).toHaveLength(1)
  })
  it('дорожка выключенного — токен control', () => {
    w = mountWithI18n(ZSwitch, { props: { checked: false } })
    expect(w.get('[role="switch"]').classes()).toContain('bg-control')
  })
  it('aria-checked, подпись, disabled', async () => {
    w = mountWithI18n(ZSwitch, { props: { checked: true, size: 'sm' }, slots: { default: 'Активен' } })
    expect(w.get('[role="switch"]').attributes('aria-checked')).toBe('true')
    await w.get('label').trigger('click')
    expect(w.emitted('change')?.at(-1)).toEqual([false])
    w.unmount()
    w = mountWithI18n(ZSwitch, { props: { checked: false, disabled: true } })
    await w.get('[role="switch"]').trigger('click')
    expect(w.emitted('change')).toBeUndefined()
  })
})

describe('ZRadioGroup', () => {
  it('выбор варианта', async () => {
    w = mountWithI18n(ZRadioGroup, { props: { value: 'a', options: [{ value: 'a', label: 'Разовый' }, { value: 'b', label: 'Многоразовый' }] } })
    const radios = w.findAll('[role="radio"]')
    expect(radios).toHaveLength(2)
    await radios[1].trigger('click')
    expect(w.emitted('update:value')?.at(-1)).toEqual(['b'])
    expect(w.emitted('change')?.at(-1)).toEqual(['b'])
    expect(w.emitted('change')).toHaveLength(1)
    expect(w.emitted('update:value')).toHaveLength(1)
  })
  it('числовые и пустые значения уходят исходными; выбранный повторно — без событий', async () => {
    w = mountWithI18n(ZRadioGroup, { props: { value: 1, options: [{ value: '', label: 'Все' }, { value: 1, label: 'Один' }, { value: 2, label: 'Два' }] } })
    const radios = w.findAll('[role="radio"]')
    expect(radios[1].attributes('aria-checked')).toBe('true')
    await radios[1].trigger('click')
    expect(w.emitted('change')).toBeUndefined()
    await radios[2].trigger('click')
    expect(w.emitted('change')?.at(-1)).toEqual([2])
    await radios[0].trigger('click')
    expect(w.emitted('change')?.at(-1)).toEqual([''])
  })
  it('стрелки переключают выбор', async () => {
    w = mountWithI18n(ZRadioGroup, {
      props: { value: 'a', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
      attachTo: document.body,
    })
    await nextTick()
    const radios = w.findAll('[role="radio"]')
    ;(radios[0].element as HTMLElement).focus()
    await radios[0].trigger('keydown', { key: 'ArrowRight' })
    // Reka переводит фокус в nextTick, а выбор фокусируемого радио делает кликом в setTimeout(0).
    await new Promise((r) => setTimeout(r, 10))
    expect(document.activeElement).toBe(radios[1].element)
    expect(w.emitted('change')?.at(-1)).toEqual(['b'])
  })
  it.each([undefined, null])('значение %s при создании, затем value=a: повторный клик по a — без событий, a остаётся отмеченным', async (initial) => {
    w = mountWithI18n(ZRadioGroup, { props: { value: initial, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] } })
    await w.setProps({ value: 'a' })
    const radios = w.findAll('[role="radio"]')
    expect(radios[0].attributes('data-state')).toBe('checked')
    await radios[0].trigger('click')
    expect(w.emitted('update:value')).toBeUndefined()
    expect(radios[0].attributes('data-state')).toBe('checked')
  })
  it('hover меняет рамку только у неотмеченного; граница — токен control', () => {
    w = mountWithI18n(ZRadioGroup, { props: { value: 'a', options: [{ value: 'a', label: 'A' }] } })
    const cls = w.get('[role="radio"]').classes()
    expect(cls).toContain('border-control')
    expect(cls).toContain('data-[state=unchecked]:hover:not-focus-visible:border-ink-3')
    expect(cls).not.toContain('hover:not-focus-visible:border-faint')
  })
  it('disabled блокирует выбор', async () => {
    w = mountWithI18n(ZRadioGroup, { props: { value: 'a', disabled: true, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] } })
    await w.findAll('[role="radio"]')[1].trigger('click')
    expect(w.emitted('change')).toBeUndefined()
  })
})

describe('ZSegmented', () => {
  it('счётчик пункта (option.count) выводится рядом с подписью; без него — только подпись', () => {
    w = mountWithI18n(ZSegmented, { props: { value: 'a', options: [{ value: 'a', label: 'Все', count: 12 }, { value: 'b', label: 'Мои', count: 0 }, { value: 'c', label: 'Ещё' }] } })
    expect(w.findAll('button').map((b) => b.text())).toEqual(['Все 12', 'Мои 0', 'Ещё'])
    expect(w.findAll('[data-z-count]')).toHaveLength(2)
  })
  it('строковые опции и выбор; снять выбор нельзя', async () => {
    w = mountWithI18n(ZSegmented, { props: { value: 'Список', options: ['Список', 'Таблица'] } })
    const items = w.findAll('button')
    expect(items.map((b) => b.text())).toEqual(['Список', 'Таблица'])
    await items[1].trigger('click')
    expect(w.emitted('update:value')?.at(-1)).toEqual(['Таблица'])
    expect(w.emitted('update:value')).toHaveLength(1)
    await items[0].trigger('click') // текущий выбран — Reka может прислать undefined, не эмитим
    expect(w.emitted('update:value')?.every(([v]) => v !== undefined && v !== '')).toBe(true)
  })
  it('повторный клик по выбранному — без событий; числовые опции; change', async () => {
    w = mountWithI18n(ZSegmented, { props: { value: 2, options: [{ value: 1, label: 'Один' }, { value: 2, label: 'Два' }] } })
    const items = w.findAll('button')
    await items[1].trigger('click')
    expect(w.emitted('update:value')).toBeUndefined()
    await items[0].trigger('click')
    expect(w.emitted('update:value')?.at(-1)).toEqual([1])
    expect(w.emitted('change')?.at(-1)).toEqual([1])
  })
  it('стрелка вправо переводит фокус на следующий пункт, Space не отменяется, click по нему выбирает', async () => {
    w = mountWithI18n(ZSegmented, { props: { value: 'a', options: ['a', 'b'] }, attachTo: document.body })
    await nextTick()
    const items = w.findAll('button')
    ;(items[0].element as HTMLElement).focus()
    await items[0].trigger('keydown', { key: 'ArrowRight' })
    await new Promise((r) => setTimeout(r, 10))
    expect(document.activeElement).toBe(items[1].element)
    spaceKeepsNativeActivation(items[1].element as HTMLElement)
    await items[1].trigger('click')
    expect(w.emitted('update:value')?.at(-1)).toEqual(['b'])
  })
  it('фокус-кольцо побеждает тень выбранного пункта', () => {
    w = mountWithI18n(ZSegmented, { props: { value: 'a', options: ['a', 'b'] } })
    for (const b of w.findAll('button')) expect(b.classes()).toContain('data-[state=on]:focus-visible:shadow-focus')
  })
  it.each([undefined, null])('значение %s при создании, затем value=a: повторный клик по a — без событий, a остаётся выбранным', async (initial) => {
    w = mountWithI18n(ZSegmented, { props: { value: initial, options: ['a', 'b'] } })
    await w.setProps({ value: 'a' })
    const items = w.findAll('button')
    expect(items[0].attributes('data-state')).toBe('on')
    await items[0].trigger('click')
    expect(w.emitted('update:value')).toBeUndefined()
    expect(items[0].attributes('data-state')).toBe('on')
  })
})
