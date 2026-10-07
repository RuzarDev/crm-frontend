import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import ZSelect from '../ZSelect.vue'

const options = [
  { value: 'IM', label: 'ИМ — импорт' },
  { value: 'EK', label: 'ЭК — экспорт' },
  { value: 'TT', label: 'ТТ — транзит', disabled: true },
]
let w: VueWrapper
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })

const open = async () => {
  await w.get('input').trigger('keydown', { key: 'ArrowDown' })
  await nextTick()
}
const optionEls = () => [...document.body.querySelectorAll('[role="option"]')] as HTMLElement[]

describe('ZSelect', () => {
  it('показывает label выбранного значения', () => {
    w = mountWithI18n(ZSelect, { props: { value: 'EK', options }, attachTo: document.body })
    expect((w.get('input').element as HTMLInputElement).value).toBe('ЭК — экспорт')
  })
  it('открывается и выбирает: update:value и change(value, option)', async () => {
    w = mountWithI18n(ZSelect, { props: { value: null, options }, attachTo: document.body })
    await open()
    expect(optionEls().map((e) => e.textContent?.trim())).toEqual(['ИМ — импорт', 'ЭК — экспорт', 'ТТ — транзит'])
    optionEls()[0].click()
    await nextTick()
    expect(w.emitted('update:value')?.at(-1)).toEqual(['IM'])
    expect(w.emitted('change')?.at(-1)).toEqual(['IM', options[0]])
  })
  it('поиск фильтрует и эмитит search; пустой результат — «Ничего не найдено»', async () => {
    w = mountWithI18n(ZSelect, { props: { value: null, options, showSearch: true }, attachTo: document.body })
    await open()
    await w.get('input').setValue('эк')
    await nextTick()
    expect(optionEls().map((e) => e.textContent?.trim())).toEqual(['ЭК — экспорт'])
    expect(w.emitted('search')?.at(-1)).toEqual(['эк'])
    await w.get('input').setValue('zzz')
    await nextTick()
    expect(document.body.textContent).toContain('Ничего не найдено')
  })
  it('без showSearch поле только для чтения', () => {
    w = mountWithI18n(ZSelect, { props: { value: null, options }, attachTo: document.body })
    expect(w.get('input').attributes('readonly')).toBeDefined()
  })
  it('multiple: выбранные — метками, удаление крестиком', async () => {
    w = mountWithI18n(ZSelect, { props: { value: ['IM', 'EK'], options, mode: 'multiple' }, attachTo: document.body })
    expect(w.text()).toContain('ИМ — импорт')
    expect(w.text()).toContain('ЭК — экспорт')
    await w.get('button[aria-label="Убрать ИМ — импорт"]').trigger('click')
    expect(w.emitted('update:value')?.at(-1)).toEqual([['EK']])
  })
  it('tags: Enter добавляет свой текст', async () => {
    w = mountWithI18n(ZSelect, { props: { value: ['A1'], options: [], mode: 'tags' }, attachTo: document.body })
    await w.get('input').setValue('B2')
    await w.get('input').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:value')?.at(-1)).toEqual([['A1', 'B2']])
  })
  it('allowClear очищает (single → null)', async () => {
    w = mountWithI18n(ZSelect, { props: { value: 'IM', options, allowClear: true }, attachTo: document.body })
    await w.get('button[aria-label="Очистить"]').trigger('click')
    expect(w.emitted('update:value')?.at(-1)).toEqual([null])
    expect(w.emitted('change')?.at(-1)).toEqual([null, undefined])
  })
  it('status=error — aria-invalid и красная рамка; атрибуты — на input', () => {
    w = mountWithI18n(ZSelect, { props: { value: null, options, status: 'error' }, attrs: { 'aria-label': 'Процедура' }, attachTo: document.body })
    expect(w.get('input').attributes('aria-invalid')).toBe('true')
    expect(w.get('input').attributes('aria-label')).toBe('Процедура')
    expect(w.html()).toContain('border-danger')
  })
  it('клавиатура: ArrowDown открывает, стрелки двигают, Enter выбирает, Escape закрывает', async () => {
    w = mountWithI18n(ZSelect, { props: { value: null, options }, attachTo: document.body })
    const input = w.get('input')
    await open()
    expect(input.attributes('aria-expanded')).toBe('true')
    await new Promise((r) => setTimeout(r, 0))
    await input.trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    const hl = document.body.querySelector('[role="option"][data-highlighted]')
    expect(hl).not.toBeNull()
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(options.map((o) => o.label)).toContain(hl?.textContent?.trim())
    expect(w.emitted('update:value')?.at(-1)?.[0]).toBe(options.find((o) => o.label === hl?.textContent?.trim())?.value)
    expect(input.attributes('aria-expanded')).toBe('false')
    await open()
    expect(input.attributes('aria-expanded')).toBe('true')
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(input.attributes('aria-expanded')).toBe('false')
  })
  it('с выбранным значением и поиском открывается весь список, подпись — плейсхолдером', async () => {
    w = mountWithI18n(ZSelect, { props: { value: 'EK', options, showSearch: true }, attachTo: document.body })
    await w.get('input').trigger('focus')
    await open()
    expect(optionEls()).toHaveLength(3)
    const input = w.get('input').element as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.placeholder).toBe('ЭК — экспорт')
  })
  it('опции пришли позже значения — подпись обновляется', async () => {
    w = mountWithI18n(ZSelect, { props: { value: 'EK', options: [] }, attachTo: document.body })
    expect((w.get('input').element as HTMLInputElement).value).toBe('EK')
    await w.setProps({ options })
    expect((w.get('input').element as HTMLInputElement).value).toBe('ЭК — экспорт')
  })
  it('multiple: выбор из списка добавляет к массиву, список не закрывается', async () => {
    w = mountWithI18n(ZSelect, { props: { value: ['IM'], options, mode: 'multiple' }, attachTo: document.body })
    await open()
    optionEls()[1].click()
    await nextTick()
    expect(w.emitted('update:value')?.at(-1)).toEqual([['IM', 'EK']])
    expect(w.emitted('change')?.at(-1)).toEqual([['IM', 'EK'], [options[0], options[1]]])
    expect(w.get('input').attributes('aria-expanded')).toBe('true')
  })
  it('multiple: Backspace в пустом поле убирает последнюю метку', async () => {
    w = mountWithI18n(ZSelect, { props: { value: ['IM', 'EK'], options, mode: 'multiple', showSearch: true }, attachTo: document.body })
    await w.get('input').trigger('keydown', { key: 'Backspace' })
    expect(w.emitted('update:value')?.at(-1)).toEqual([['IM']])
  })
  it('filterOption-функция и optionFilterProp применяются к списку', async () => {
    const opts = [{ value: 1, label: 'Один', code: 'A' }, { value: 2, label: 'Два', code: 'B' }]
    w = mountWithI18n(ZSelect, { props: { value: null, options: opts, showSearch: true, optionFilterProp: 'code' }, attachTo: document.body })
    await open()
    await w.get('input').setValue('b')
    await nextTick()
    expect(optionEls().map((e) => e.textContent?.trim())).toEqual(['Два'])
  })
  it('tags: набранный текст — первым пунктом списка, клик добавляет', async () => {
    w = mountWithI18n(ZSelect, { props: { value: [], options, mode: 'tags' }, attachTo: document.body })
    await open()
    await w.get('input').setValue('ИМ')
    await nextTick()
    expect(optionEls().map((e) => e.textContent?.trim())).toEqual(['ИМ', 'ИМ — импорт'])
    optionEls()[0].click()
    await nextTick()
    expect(w.emitted('update:value')?.at(-1)).toEqual([['ИМ']])
    expect((w.get('input').element as HTMLInputElement).value).toBe('')
  })
  it('single с поиском: в фокусе поле пустое (набор не дописывается к подписи), на blur подпись возвращается', async () => {
    w = mountWithI18n(ZSelect, { props: { value: 'EK', options, showSearch: true }, attachTo: document.body })
    const input = w.get('input')
    const el = input.element as HTMLInputElement
    await input.trigger('focus')
    expect(el.value).toBe('')
    expect(el.placeholder).toBe('ЭК — экспорт')
    await input.setValue('им')
    await nextTick()
    expect(optionEls().map((e) => e.textContent?.trim())).toEqual(['ИМ — импорт'])
    await input.trigger('blur')
    await new Promise((r) => setTimeout(r, 5))
    expect(el.value).toBe('ЭК — экспорт')
    expect(w.emitted('update:value')).toBeUndefined()
  })
})
