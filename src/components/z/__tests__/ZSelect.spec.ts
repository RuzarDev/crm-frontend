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
    expect(w.emitted('update:value')).toHaveLength(1)
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
  it('с выбранным значением и поиском открывается весь список, подпись остаётся значением поля', async () => {
    w = mountWithI18n(ZSelect, { props: { value: 'EK', options, showSearch: true }, attachTo: document.body })
    await w.get('input').trigger('focus')
    await open()
    expect(optionEls()).toHaveLength(3)
    expect((w.get('input').element as HTMLInputElement).value).toBe('ЭК — экспорт')
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
  it('single с поиском: в фокусе подпись — значение поля (для скринридера), первый символ заменяет её, на blur подпись возвращается', async () => {
    w = mountWithI18n(ZSelect, { props: { value: 'EK', options, showSearch: true }, attachTo: document.body })
    const input = w.get('input')
    const el = input.element as HTMLInputElement
    await input.trigger('focus')
    expect(el.value).toBe('ЭК — экспорт')
    // Браузер: beforeinput (на любую правку), затем символ вставляется в поле и приходит input.
    await input.trigger('beforeinput', { inputType: 'insertText', data: 'э' })
    el.value += 'э'
    await input.trigger('input')
    await nextTick()
    expect(el.value).toBe('э')
    expect(w.emitted('search')?.at(-1)).toEqual(['э'])
    await input.setValue('им')
    await nextTick()
    expect(optionEls().map((e) => e.textContent?.trim())).toEqual(['ИМ — импорт'])
    await input.trigger('blur')
    await new Promise((r) => setTimeout(r, 5))
    expect(el.value).toBe('ЭК — экспорт')
    expect(w.emitted('update:value')).toBeUndefined()
  })
  it('пустая строка — обычное значение: опция рендерится, выбирается, change(\'\', option), в поле её подпись', async () => {
    const withEmpty = [{ value: '', label: 'Все' }, ...options]
    w = mountWithI18n(ZSelect, { props: { value: null, options: withEmpty }, attachTo: document.body })
    await open()
    expect(optionEls().map((e) => e.textContent?.trim())[0]).toBe('Все')
    optionEls()[0].click()
    await nextTick()
    expect(w.emitted('update:value')?.at(-1)).toEqual([''])
    expect(w.emitted('change')?.at(-1)).toEqual(['', withEmpty[0]])
    await w.setProps({ value: '' })
    await new Promise((r) => setTimeout(r, 5))
    expect((w.get('input').element as HTMLInputElement).value).toBe('Все')
  })
  it('повторный выбор того же значения ничего не эмитит', async () => {
    w = mountWithI18n(ZSelect, { props: { value: 'EK', options }, attachTo: document.body })
    await open()
    optionEls()[1].click()
    await nextTick()
    expect(w.emitted('update:value')).toBeUndefined()
    expect(w.emitted('change')).toBeUndefined()
  })
  it('multiple без show-search — с поиском, как у AntD', async () => {
    w = mountWithI18n(ZSelect, { props: { value: [], options, mode: 'multiple' }, attachTo: document.body })
    expect(w.get('input').attributes('readonly')).toBeUndefined()
    await open()
    await w.get('input').setValue('эк')
    await nextTick()
    expect(optionEls().map((e) => e.textContent?.trim())).toEqual(['ЭК — экспорт'])
  })
  it('сброс поиска эмитит search(\'\') один раз; compositionend после input не дублирует search', async () => {
    w = mountWithI18n(ZSelect, { props: { value: [], options, mode: 'multiple' }, attachTo: document.body })
    const input = w.get('input')
    await open()
    await input.setValue('эк')
    await input.trigger('compositionend')
    expect(w.emitted('search')).toEqual([['эк']])
    await nextTick()
    optionEls()[0].click()
    await nextTick()
    expect(w.emitted('search')).toEqual([['эк'], ['']])
  })
  it('кнопки очистки и меток не забирают фокус у поля', async () => {
    w = mountWithI18n(ZSelect, { props: { value: ['IM'], options, mode: 'multiple', allowClear: true }, attachTo: document.body })
    for (const sel of ['button[aria-label="Очистить"]', 'button[aria-label="Убрать ИМ — импорт"]']) {
      const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
      w.get(sel).element.dispatchEvent(ev)
      expect(ev.defaultPrevented).toBe(true)
    }
    expect(w.get('button[aria-label="Убрать ИМ — импорт"]').attributes('tabindex')).toBe('-1')
  })
  it('подпись заменяется только первой правкой: набранный текст, совпавший с подписью, не стирается', async () => {
    const opts = [{ value: 'al', label: 'Ал' }, { value: 'alm', label: 'Алматы' }]
    w = mountWithI18n(ZSelect, { props: { value: 'al', options: opts, showSearch: true }, attachTo: document.body })
    const input = w.get('input')
    const el = input.element as HTMLInputElement
    const typeChar = async (c: string) => {
      await input.trigger('beforeinput', { inputType: 'insertText', data: c })
      el.value += c
      await input.trigger('input')
      await nextTick()
    }
    await input.trigger('focus')
    for (const c of 'Алм') await typeChar(c)
    expect(el.value).toBe('Алм')
    expect(w.emitted('search')?.at(-1)).toEqual(['Алм'])
  })
  it('IME: beforeinput композиции не трогает поле (выделенную подпись заменяет сама композиция)', async () => {
    w = mountWithI18n(ZSelect, { props: { value: 'EK', options, showSearch: true }, attachTo: document.body })
    const input = w.get('input')
    const el = input.element as HTMLInputElement
    await input.trigger('focus')
    el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertCompositionText', data: 'к', isComposing: true, bubbles: true, cancelable: true }))
    await nextTick()
    expect(el.value).toBe('ЭК — экспорт')
    // Композиция заменила подпись — дальнейшие правки поле не очищают.
    el.value = 'к'
    el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'а', bubbles: true, cancelable: true }))
    expect(el.value).toBe('к')
  })
  it('class/style — на корневой DOM-элемент компонента (как у ZInput/ZNumber/ZDate), рамка — w-full', () => {
    w = mountWithI18n(ZSelect, { props: { value: null, options }, attrs: { class: 'flex-1 col-span-2', style: 'margin-top:4px' } })
    // Корень Reka (PopperRoot) — фрагмент, поэтому w.element — контейнер; единственный его элемент — DOM-корень ZSelect.
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
  it('class ширины перебивает базовую w-full корня', () => {
    w = mountWithI18n(ZSelect, { props: { value: null, options }, attrs: { class: 'w-40' } })
    const root = w.element.firstElementChild as HTMLElement
    expect(root.classList).toContain('w-40')
    expect(root.classList).not.toContain('w-full')
  })
  it('popupWidth — минимальная ширина окна (число — px, строка — как есть); без него — ширина поля', async () => {
    w = mountWithI18n(ZSelect, { props: { value: null, options, popupWidth: 420 }, attachTo: document.body })
    await open()
    const list = () => document.body.querySelector('[role="listbox"]') as HTMLElement
    expect(list().style.minWidth).toBe('420px')
    await w.setProps({ popupWidth: '30rem' })
    expect(list().style.minWidth).toBe('30rem')
    await w.setProps({ popupWidth: undefined })
    expect(list().style.minWidth).toBe('')
    expect(list().className).toContain('w-(--reka-combobox-trigger-width)')
  })
  it('длинные подписи: у пункта title с полной подписью', async () => {
    w = mountWithI18n(ZSelect, { props: { value: null, options }, attachTo: document.body })
    await open()
    expect(optionEls().map((e) => e.getAttribute('title'))).toEqual(options.map((o) => o.label))
  })
})
