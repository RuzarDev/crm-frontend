import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import ZCombobox from '../ZCombobox.vue'

const options = [
  { value: '55201', label: '55201 — т/п «Хоргос»' },
  { value: '57507', label: '57507 — т/п «Алтынколь»' },
]
let w: VueWrapper
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })
const optionEls = () => [...document.body.querySelectorAll('[role="option"]')] as HTMLElement[]
// v-model как у родителя: update:value возвращается пропом.
const vModel = (value: string, extra: Record<string, unknown> = {}) => ({
  value,
  options,
  ...extra,
  'onUpdate:value': (v: string) => w.setProps({ value: v }),
})

describe('ZCombobox', () => {
  it('свободный ввод: update:value, change и search на каждый символ', async () => {
    w = mountWithI18n(ZCombobox, { props: { value: '', options }, attachTo: document.body })
    await w.get('input').setValue('575')
    expect(w.emitted('update:value')?.at(-1)).toEqual(['575'])
    expect(w.emitted('change')?.at(-1)).toEqual(['575'])
    expect(w.emitted('search')?.at(-1)).toEqual(['575'])
  })
  it('подсказки фильтруются по вводу; выбор подсказки — select и значение', async () => {
    w = mountWithI18n(ZCombobox, { props: { value: '', options }, attachTo: document.body })
    await w.get('input').setValue('алт')
    await nextTick()
    expect(optionEls().map((e) => e.textContent?.trim())).toEqual(['57507 — т/п «Алтынколь»'])
    optionEls()[0].click()
    await nextTick()
    expect(w.emitted('select')?.at(-1)).toEqual(['57507', options[1]])
    expect(w.emitted('update:value')?.at(-1)).toEqual(['57507'])
  })
  it('атрибуты на input', () => {
    w = mountWithI18n(ZCombobox, { props: { value: 'x', options }, attrs: { 'aria-label': 'Пост' }, attachTo: document.body })
    expect(w.get('input').attributes('aria-label')).toBe('Пост')
    expect((w.get('input').element as HTMLInputElement).value).toBe('x')
  })
  it('нет совпадений — окна нет (aria-expanded=false), появились — открывается', async () => {
    w = mountWithI18n(ZCombobox, { props: vModel(''), attachTo: document.body })
    const input = w.get('input')
    await input.setValue('zzz')
    await nextTick()
    expect(optionEls()).toHaveLength(0)
    expect(document.body.querySelector('[role="listbox"]')).toBeNull()
    expect(input.attributes('aria-expanded')).toBe('false')
    await input.setValue('хор')
    await nextTick()
    expect(optionEls().map((e) => e.textContent?.trim())).toEqual(['55201 — т/п «Хоргос»'])
    expect(input.attributes('aria-expanded')).toBe('true')
  })
  it('после выбора поле показывает значение подсказки, окно закрыто; select без change, если значение то же', async () => {
    w = mountWithI18n(ZCombobox, { props: vModel(''), attachTo: document.body })
    await w.get('input').setValue('алт')
    await nextTick()
    optionEls()[0].click()
    await nextTick()
    await nextTick()
    expect((w.get('input').element as HTMLInputElement).value).toBe('57507')
    // Окно закрыто (уходит с анимацией — содержимое ещё в DOM с data-state=closed).
    expect(w.get('input').attributes('aria-expanded')).toBe('false')
    expect(document.body.querySelector('[role="listbox"]')?.getAttribute('data-state')).toBe('closed')
    expect(w.emitted('change')?.at(-1)).toEqual(['57507'])
    // Тот же текст и та же подсказка: select есть, лишнего update/change нет.
    const changes = w.emitted('change')?.length
    await w.get('input').trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    optionEls()[0].click()
    await nextTick()
    expect(w.emitted('select')).toHaveLength(2)
    expect(w.emitted('change')).toHaveLength(changes!)
  })
  it('клавиатура: первая подсказка подсвечена — Enter выбирает её (как defaultActiveFirstOption у AntD); стрелки двигают; Escape закрывает', async () => {
    w = mountWithI18n(ZCombobox, { props: vModel(''), attachTo: document.body })
    const input = w.get('input')
    await input.setValue('т/п')
    await nextTick()
    await nextTick()
    expect(optionEls()).toHaveLength(2)
    expect(optionEls()[0].hasAttribute('data-highlighted')).toBe(true)
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(w.emitted('select')?.at(-1)).toEqual(['55201', options[0]])
    await input.setValue('т/п')
    await nextTick()
    await nextTick()
    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(w.emitted('select')?.at(-1)).toEqual(['57507', options[1]])
    await input.setValue('т/п')
    await nextTick()
    expect(input.attributes('aria-expanded')).toBe('true')
    await input.trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(input.attributes('aria-expanded')).toBe('false')
    expect(w.emitted('update:value')?.at(-1)).toEqual(['т/п'])
  })
  it('IME: во время композиции событий нет, на compositionend — один раз', async () => {
    w = mountWithI18n(ZCombobox, { props: { value: '', options }, attachTo: document.body })
    const input = w.get('input')
    await input.trigger('compositionstart')
    await input.setValue('алт')
    expect(w.emitted('update:value')).toBeUndefined()
    expect(w.emitted('search')).toBeUndefined()
    await input.trigger('compositionend')
    await nextTick()
    expect(w.emitted('update:value')).toEqual([['алт']])
    expect(w.emitted('change')).toEqual([['алт']])
    expect(w.emitted('search')).toEqual([['алт']])
  })
  it('allowClear очищает (update:value и change с \'\'), mono — моноширинный шрифт', async () => {
    w = mountWithI18n(ZCombobox, { props: { value: '55201', options, allowClear: true, mono: true }, attachTo: document.body })
    expect(w.get('input').classes()).toContain('font-mono')
    await w.get('button[aria-label="Очистить"]').trigger('click')
    expect(w.emitted('update:value')?.at(-1)).toEqual([''])
    expect(w.emitted('change')?.at(-1)).toEqual([''])
    expect(document.activeElement).toBe(w.get('input').element)
  })
  it('значение подсказки — строкой: числовое и пустое значения опций', async () => {
    const opts = [{ value: 30, label: '30 — автомобильный' }, { value: '', label: 'Без кода' }]
    w = mountWithI18n(ZCombobox, { props: { value: 'x', options: opts, filterOption: false }, attachTo: document.body })
    await w.get('input').trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    optionEls()[0].click()
    await nextTick()
    expect(w.emitted('update:value')?.at(-1)).toEqual(['30'])
    expect(w.emitted('select')?.at(-1)).toEqual([30, opts[0]])
    await w.get('input').trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    optionEls()[1].click()
    await nextTick()
    expect(w.emitted('update:value')?.at(-1)).toEqual([''])
    expect(w.emitted('select')?.at(-1)).toEqual(['', opts[1]])
  })
  it('значение, поменянное снаружи, попадает в поле; disabled и invalid', async () => {
    w = mountWithI18n(ZCombobox, { props: { value: '', options }, attachTo: document.body })
    await w.setProps({ value: '57507' })
    expect((w.get('input').element as HTMLInputElement).value).toBe('57507')
    await w.setProps({ disabled: true, invalid: true })
    expect(w.get('input').attributes('disabled')).toBeDefined()
    expect(w.get('input').attributes('aria-invalid')).toBe('true')
  })
  it('уход фокуса закрывает окно; подсказки, пришедшие после ухода, окно не открывают', async () => {
    w = mountWithI18n(ZCombobox, { props: vModel(''), attachTo: document.body })
    const input = w.get('input')
    await input.setValue('хор')
    await nextTick()
    expect(optionEls()).toHaveLength(1)
    await input.trigger('blur')
    await nextTick()
    expect(input.attributes('aria-expanded')).toBe('false')
    await input.setValue('zzz')
    await input.trigger('blur')
    await w.setProps({ options: [...options, { value: 'zzz1', label: 'zzz1' }] })
    await nextTick()
    expect(input.attributes('aria-expanded')).toBe('false')
    expect(document.body.querySelector('[role="listbox"][data-state="open"]')).toBeNull()
  })
  it('доступность: aria-controls поля указывает на список с подсказками — с первого открытия и после повторного', async () => {
    w = mountWithI18n(ZCombobox, { props: vModel(''), attachTo: document.body })
    const input = w.get('input')
    // Стабильный id: есть и до первого открытия (пустой aria-controls — ошибка), не меняется между открытиями.
    const stable = input.attributes('aria-controls')
    expect(stable).toBeTruthy()
    const check = () => {
      const id = input.attributes('aria-controls')
      expect(id).toBe(stable)
      const list = document.getElementById(id!)
      expect(list?.getAttribute('role')).toBe('listbox')
      expect(list?.contains(optionEls()[0])).toBe(true)
    }
    await input.setValue('хор')
    await nextTick()
    await nextTick()
    check()
    await input.trigger('keydown', { key: 'Escape' })
    await new Promise((r) => setTimeout(r, 20))
    await input.setValue('алт')
    await nextTick()
    await nextTick()
    check()
  })
  it('Enter без подходящей подсказки: ни select, ни лишнего update:value, текст остаётся', async () => {
    w = mountWithI18n(ZCombobox, { props: vModel(''), attachTo: document.body })
    const input = w.get('input')
    await input.setValue('zzz')
    await nextTick()
    const updates = w.emitted('update:value')?.length
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(w.emitted('select')).toBeUndefined()
    expect(w.emitted('update:value')).toHaveLength(updates!)
    expect((input.element as HTMLInputElement).value).toBe('zzz')
  })
  it('popupWidth — минимальная ширина окна (число — px, строка — как есть); без него — ширина поля', async () => {
    w = mountWithI18n(ZCombobox, { props: vModel('', { popupWidth: 420 }), attachTo: document.body })
    await w.get('input').setValue('т/п')
    await nextTick()
    const list = () => document.body.querySelector('[role="listbox"]') as HTMLElement
    expect(list().style.minWidth).toBe('420px')
    await w.setProps({ popupWidth: '30rem' })
    expect(list().style.minWidth).toBe('30rem')
    await w.setProps({ popupWidth: undefined })
    expect(list().style.minWidth).toBe('')
    expect(list().className).toContain('w-(--reka-combobox-trigger-width)')
  })
  it('focus/blur через ref', async () => {
    w = mountWithI18n(ZCombobox, { props: { value: '', options }, attachTo: document.body })
    ;(w.vm as unknown as { focus: () => void }).focus()
    expect(document.activeElement).toBe(w.get('input').element)
    ;(w.vm as unknown as { blur: () => void }).blur()
    expect(document.activeElement).not.toBe(w.get('input').element)
  })
  it('class/style — на корневой DOM-элемент компонента, рамка — w-full', () => {
    w = mountWithI18n(ZCombobox, { props: { value: '', options }, attrs: { class: 'flex-1 col-span-2', style: 'margin-top:4px' } })
    // Корень Reka (PopperRoot) — фрагмент, поэтому w.element — контейнер; единственный его элемент — DOM-корень ZCombobox.
    expect(w.element.childElementCount).toBe(1)
    const root = w.element.firstElementChild as HTMLElement
    expect(root.classList).toContain('flex-1')
    expect(root.classList).toContain('col-span-2')
    expect(root.classList).toContain('inline-flex')
    expect(root.classList).toContain('min-w-0')
    expect(root.style.marginTop).toBe('4px')
    const anchor = root.firstElementChild as HTMLElement
    expect(anchor.classList).toContain('w-full')
    expect(anchor.classList).not.toContain('flex-1')
    expect(anchor.style.marginTop).toBe('')
  })
})
