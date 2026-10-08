import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import FilterChip from '../FilterChip.vue'

let w: VueWrapper
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })
const tick = async () => { await nextTick(); await nextTick() }
const settle = async () => { await new Promise((r) => setTimeout(r, 0)); await tick() }

const clients = [
  { value: 'a', label: 'ТОО «Казахмыс Трейд»' },
  { value: 'b', label: 'ТОО «Алатау Строй»' },
]
const many = Array.from({ length: 10 }, (_, i) => ({ value: `v${i}`, label: i === 7 ? 'Особый клиент' : `Клиент ${i}` }))

const mount = (props: Record<string, unknown>) => {
  w = mountWithI18n(FilterChip, {
    props: { label: 'Клиент', options: clients, value: null, ...props },
    attachTo: document.body,
  })
  return w
}
const options = () => [...document.body.querySelectorAll('[role="option"]')] as HTMLElement[]
const openList = async () => { await w.get('button').trigger('click'); await tick() }

describe('FilterChip', () => {
  it('неактивный показывает «Клиент» с плюсом и без крестика', () => {
    mount({})
    expect(w.text()).toBe('Клиент')
    expect(w.find('[aria-label="Сбросить фильтр"]').exists()).toBe(false)
    expect(w.get('span').classes()).toContain('border-dashed')
  })

  it('активный показывает «Клиент: значение» и крестик', () => {
    mount({ value: 'b' })
    expect(w.text()).toBe('Клиент: ТОО «Алатау Строй»')
    expect(w.find('[aria-label="Сбросить фильтр"]').exists()).toBe(true)
    expect(w.get('span').classes()).toContain('bg-zircon-soft')
  })

  it('список открывается: «Все» + варианты, у выбранного aria-selected', async () => {
    mount({ value: 'b' })
    await openList()
    expect(options().map((o) => o.textContent?.trim())).toEqual(['Все', 'ТОО «Казахмыс Трейд»', 'ТОО «Алатау Строй»'])
    expect(options().map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true'])
    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull()
  })

  it('выбор варианта эмитит значение и закрывает список', async () => {
    mount({})
    await openList()
    options()[2].click()
    await settle()
    expect(w.emitted('update:value')).toEqual([['b']])
    expect(document.body.querySelector('[role="listbox"]')).toBeNull()
  })

  it('«Все» сбрасывает в null', async () => {
    mount({ value: 'a' })
    await openList()
    options()[0].click()
    await settle()
    expect(w.emitted('update:value')).toEqual([[null]])
  })

  it('«×» эмитит null и не открывает список', async () => {
    mount({ value: 'a' })
    await w.get('[aria-label="Сбросить фильтр"]').trigger('click')
    await tick()
    expect(w.emitted('update:value')).toEqual([[null]])
    expect(document.body.querySelector('[role="listbox"]')).toBeNull()
  })

  it('поиск включается сам при >8 вариантов и фильтрует', async () => {
    mount({ options: many })
    await openList()
    const input = document.body.querySelector('input[type="search"]') as HTMLInputElement
    expect(input).not.toBeNull()
    input.value = 'особ'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await tick()
    expect(options().map((o) => o.textContent?.trim())).toEqual(['Особый клиент'])
  })

  it('до 9 вариантов поиска нет; searchable=true включает принудительно', async () => {
    mount({})
    await openList()
    expect(document.body.querySelector('input[type="search"]')).toBeNull()
    w.unmount()
    document.body.innerHTML = ''
    mount({ searchable: true })
    await openList()
    expect(document.body.querySelector('input[type="search"]')).not.toBeNull()
  })

  it('пустой результат поиска — «Нет вариантов»', async () => {
    mount({ options: many })
    await openList()
    const input = document.body.querySelector('input[type="search"]') as HTMLInputElement
    input.value = 'ъъъ'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await tick()
    expect(options()).toHaveLength(0)
    expect(document.body.textContent).toContain('Нет вариантов')
  })

  it('клавиатура: ↓ ↓ Enter выбирает второй вариант; активный — по aria-activedescendant', async () => {
    mount({})
    await openList()
    const list = document.body.querySelector('[role="listbox"]') as HTMLElement
    const key = async (k: string) => { list.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); await tick() }
    expect(list.getAttribute('aria-activedescendant')).toBe(options()[0].id)
    await key('ArrowDown')
    await key('ArrowDown')
    expect(list.getAttribute('aria-activedescendant')).toBe(options()[2].id)
    await key('ArrowUp')
    expect(list.getAttribute('aria-activedescendant')).toBe(options()[1].id)
    await key('Enter')
    await settle()
    expect(w.emitted('update:value')).toEqual([['a']])
  })

  it('Esc закрывает список', async () => {
    mount({})
    await openList()
    document.body.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(document.body.querySelector('[role="listbox"]')).toBeNull()
  })

  it('поиск: ↓ и Enter работают из поля ввода', async () => {
    mount({ options: many })
    await openList()
    const input = document.body.querySelector('input[type="search"]') as HTMLInputElement
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    await tick()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await settle()
    expect(w.emitted('update:value')).toEqual([['v0']])
  })

  it('после «×» фокус переходит на кнопку чипа', async () => {
    mount({ value: 'a' })
    const x = w.get('[aria-label="Сбросить фильтр"]').element as HTMLElement
    x.focus()
    await w.get('[aria-label="Сбросить фильтр"]').trigger('click')
    await w.setProps({ value: null })
    await tick()
    expect(document.activeElement).toBe(w.get('button').element)
  })

  it('повторное открытие после выбора через поиск подсвечивает выбранный пункт', async () => {
    mount({ options: many })
    await openList()
    const input = document.body.querySelector('input[type="search"]') as HTMLInputElement
    input.value = 'особ'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await tick()
    options()[0].click()
    await settle()
    expect(w.emitted('update:value')).toEqual([['v7']])
    await w.setProps({ value: 'v7' })
    await openList()
    await tick()
    const list = document.body.querySelector('input[type="search"]')
    expect(list).not.toBeNull()
    const selectedIdx = options().findIndex((o) => o.getAttribute('aria-selected') === 'true')
    expect(options()[selectedIdx].textContent).toContain('Особый клиент')
    const combo = document.body.querySelector('[role="combobox"]')!
    expect(combo.getAttribute('aria-activedescendant')).toBe(options()[selectedIdx].id)
  })

  it('ключи пунктов не путают «Все» и пустое значение', async () => {
    mount({ options: [{ value: '', label: 'Пусто' }, { value: 'a', label: 'А' }] })
    await openList()
    expect(options().map((o) => o.textContent?.trim())).toEqual(['Все', 'Пусто', 'А'])
  })
})
