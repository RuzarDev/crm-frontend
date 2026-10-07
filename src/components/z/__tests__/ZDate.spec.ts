import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import ZDate from '../ZDate.vue'

let w: VueWrapper
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })

const segment = (part: 'day' | 'month' | 'year') => w.get(`[data-reka-date-field-segment="${part}"]`).element as HTMLElement
// Набор с клавиатуры: Reka слушает keydown на сегменте в фокусе и сам переводит фокус дальше.
const type = async (keys: string | string[]) => {
  for (const key of keys) {
    const el = document.activeElement as HTMLElement
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    await nextTick()
  }
}
const cells = () => [...document.body.querySelectorAll('[data-reka-calendar-cell-trigger]')] as HTMLElement[]
const cell = (iso: string) => document.body.querySelector(`[data-reka-calendar-cell-trigger][data-value="${iso}"]:not([data-outside-view])`) as HTMLElement
const openByKeyboard = async () => {
  segment('day').focus()
  segment('day').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }))
  await nextTick()
  await nextTick()
}

describe('ZDate', () => {
  it('показывает дату сегментами ДД.ММ.ГГГГ', () => {
    w = mountWithI18n(ZDate, { props: { value: '2026-09-28' }, attachTo: document.body })
    const segs = w.findAll('[data-reka-date-field-segment]').map((s) => s.text()).filter((t) => /\d/.test(t))
    expect(segs).toEqual(['28', '09', '2026'])
  })
  it('очистка → null и change(null)', async () => {
    w = mountWithI18n(ZDate, { props: { value: '2026-09-28', allowClear: true }, attachTo: document.body })
    await w.get('button[aria-label="Очистить"]').trigger('click')
    expect(w.emitted('update:value')?.at(-1)).toEqual([null])
    expect(w.emitted('change')?.at(-1)).toEqual([null])
  })
  it('кнопка календаря подписана, invalid — красная рамка', () => {
    w = mountWithI18n(ZDate, { props: { value: null, invalid: true }, attachTo: document.body })
    expect(w.find('button[aria-label="Выбрать дату"]').exists()).toBe(true)
    expect(w.html()).toContain('border-danger')
  })

  it('ввод цифрами: сегменты сами переходят дальше, change — один раз, на полной дате', async () => {
    w = mountWithI18n(ZDate, { props: { value: null }, attachTo: document.body })
    segment('day').focus()
    await type('28092026')
    expect(w.emitted('update:value')).toEqual([['2026-09-28']])
    expect(w.emitted('change')).toEqual([['2026-09-28']])
  })
  it('частично заполненные сегменты не эмитят; уход из поля возвращает прежнее значение', async () => {
    w = mountWithI18n(ZDate, { props: { value: '2026-09-28' }, attachTo: document.body })
    segment('year').focus()
    await type('20')
    expect(w.emitted('change')).toBeUndefined()
    segment('year').blur()
    w.get('[role="group"]').element.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }))
    await nextTick()
    await nextTick()
    expect(segment('year').textContent).toBe('2026')
    expect(w.emitted('update:value')).toBeUndefined()
  })
  it('недописанный сегмент фиксируется, когда фокус уходит из него', async () => {
    w = mountWithI18n(ZDate, { props: { value: '2026-09-28' }, attachTo: document.body })
    segment('day').focus()
    await type('1')
    expect(w.emitted('change')).toBeUndefined()
    segment('month').focus()
    await nextTick()
    expect(w.emitted('change')).toEqual([['2026-09-01']])
  })
  it('readonly: без очистки, календарь не открыть', () => {
    w = mountWithI18n(ZDate, { props: { value: '2026-09-28', allowClear: true, readonly: true }, attachTo: document.body })
    expect(w.find('button[aria-label="Очистить"]').exists()).toBe(false)
    expect(w.get('button[aria-label="Выбрать дату"]').attributes('disabled')).toBeDefined()
    expect(segment('day').getAttribute('contenteditable')).toBe('false')
  })
  it('ArrowUp меняет сегмент — change с новой датой', async () => {
    w = mountWithI18n(ZDate, { props: { value: '2026-09-28' }, attachTo: document.body })
    segment('day').focus()
    await type(['ArrowUp'])
    expect(w.emitted('change')).toEqual([['2026-09-29']])
  })
  it('Backspace во всех сегментах — null, пока хоть один сегмент заполнен — без событий', async () => {
    w = mountWithI18n(ZDate, { props: { value: '2026-09-08' }, attachTo: document.body })
    segment('day').focus()
    await type(['Backspace'])
    segment('month').focus()
    await type(['Backspace'])
    expect(w.emitted('change')).toBeUndefined()
    segment('year').focus()
    await type(['Backspace', 'Backspace', 'Backspace', 'Backspace'])
    expect(w.emitted('update:value')).toEqual([[null]])
    expect(w.emitted('change')).toEqual([[null]])
  })
  it('год меньше 1000 и дата вне min/max — не значение', async () => {
    w = mountWithI18n(ZDate, { props: { value: null, min: '2026-01-01', max: '2026-12-31' }, attachTo: document.body })
    segment('day').focus()
    await type('01012025')
    expect(w.emitted('change')).toBeUndefined()
    const group = w.get('[role="group"]')
    expect(group.classes()).toContain('border-danger')
    expect(group.attributes('aria-invalid')).toBe('true')
  })
  it('Alt+ArrowDown открывает календарь: сегодня, выбранная, вне месяца; Escape закрывает', async () => {
    w = mountWithI18n(ZDate, { props: { value: '2026-09-28' }, attachTo: document.body })
    await openByKeyboard()
    expect(cells().length).toBeGreaterThan(27)
    // неделя с понедельника
    const head = [...document.body.querySelectorAll('th')].map((e) => e.textContent?.trim().toLowerCase())
    expect(head[0]).toBe('пн')
    expect(cell('2026-09-28').className).toContain('data-[selected]:bg-navy')
    expect(cell('2026-09-28').hasAttribute('data-selected')).toBe(true)
    // навигация — подписанные кнопки
    expect(document.body.querySelector('[aria-label="Предыдущий месяц"]')).not.toBeNull()
    expect(document.body.querySelector('[aria-label="Следующий месяц"]')).not.toBeNull()
    expect(w.emitted('change')).toBeUndefined()
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await nextTick()
    await nextTick()
    // окно уходит с анимацией — в DOM остаётся с data-state=closed
    expect(document.body.querySelector('[role="dialog"][data-state="open"]')).toBeNull()
  })
  it('переход в календарь — не уход из поля: набранное не откатывается', async () => {
    w = mountWithI18n(ZDate, { props: { value: '2026-09-28' }, attachTo: document.body })
    segment('year').focus()
    await type('20')
    segment('year').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }))
    await nextTick()
    await nextTick()
    expect(document.activeElement?.hasAttribute('data-reka-calendar-cell-trigger')).toBe(true)
    await nextTick()
    expect(segment('year').textContent).toBe('20')
  })
  it('клик по дню в календаре — значение и закрытие', async () => {
    w = mountWithI18n(ZDate, { props: { value: '2026-09-28' }, attachTo: document.body })
    await openByKeyboard()
    cell('2026-09-15').click()
    await nextTick()
    await nextTick()
    expect(w.emitted('update:value')).toEqual([['2026-09-15']])
    expect(w.emitted('change')).toEqual([['2026-09-15']])
    // окно уходит с анимацией — в DOM остаётся с data-state=closed
    expect(document.body.querySelector('[role="dialog"][data-state="open"]')).toBeNull()
  })
  it('повторный клик по выбранному дню не сбрасывает и не эмитит', async () => {
    w = mountWithI18n(ZDate, { props: { value: '2026-09-28' }, attachTo: document.body })
    await openByKeyboard()
    cell('2026-09-28').click()
    await nextTick()
    expect(w.emitted('change')).toBeUndefined()
  })
  it('дни вне min/max — недоступны', async () => {
    w = mountWithI18n(ZDate, { props: { value: '2026-09-15', min: '2026-09-10', max: '2026-09-20' }, attachTo: document.body })
    await openByKeyboard()
    expect(cell('2026-09-05').hasAttribute('data-disabled')).toBe(true)
    cell('2026-09-05').click()
    await nextTick()
    expect(w.emitted('change')).toBeUndefined()
  })
  it('атрибуты — на группу поля, class/style — на обёртку; disabled — без кнопок', () => {
    w = mountWithI18n(ZDate, {
      props: { value: '2026-09-28', allowClear: true, disabled: true },
      attrs: { 'aria-label': 'Дата документа', 'aria-describedby': 'hint', class: 'w-40', style: 'margin-top: 4px' },
      attachTo: document.body,
    })
    const group = w.get('[role="group"]')
    expect(group.attributes('aria-label')).toBe('Дата документа')
    expect(group.attributes('aria-describedby')).toBe('hint')
    expect(group.classes()).toContain('w-40')
    expect(group.attributes('style')).toContain('margin-top: 4px')
    expect(w.find('button[aria-label="Очистить"]').exists()).toBe(false)
    expect(w.get('button[aria-label="Выбрать дату"]').attributes('disabled')).toBeDefined()
  })
  it('сегменты подписаны по-русски', () => {
    w = mountWithI18n(ZDate, { props: { value: null }, attachTo: document.body })
    expect(['day', 'month', 'year'].map((p) => segment(p as 'day').getAttribute('aria-label'))).toEqual(['День', 'Месяц', 'Год'])
  })
  it('placeholder виден, пока поле пустое', () => {
    w = mountWithI18n(ZDate, { props: { value: null, placeholder: 'Дата платёжки' }, attachTo: document.body })
    expect(w.text()).toContain('Дата платёжки')
  })
  it('focus() ставит фокус в первый сегмент', () => {
    w = mountWithI18n(ZDate, { props: { value: null }, attachTo: document.body })
    ;(w.vm as unknown as { focus: () => void }).focus()
    expect(document.activeElement).toBe(segment('day'))
  })
})
