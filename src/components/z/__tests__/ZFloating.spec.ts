import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, onMounted, ref } from 'vue'
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
  it('без title — только триггер: подсказка выключена, без содержимого и aria-describedby', async () => {
    w = mountWithI18n({ render: () => h(TooltipProvider, { delayDuration: 0 }, () => h(ZTooltip, { title: '' }, () => h('button', 'Гр.31'))) }, { attachTo: document.body })
    expect(w.html()).toContain('Гр.31')
    // Обёртки Reka остаются (иначе смена title перемонтировала бы элемент) — лишних DOM-узлов они не дают.
    expect(w.get('button').element.parentElement).toBe(w.element)
    await w.get('button').trigger('focus')
    await tick()
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull()
    expect(w.find('[aria-describedby]').exists()).toBe(false)
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

  it('без TooltipProvider выше — не падает и показывается при фокусе', async () => {
    w = mountWithI18n(ZTooltip, { props: { title: 'Графа 31' }, slots: { default: '<button>Гр.31</button>' }, attachTo: document.body })
    await w.get('button').trigger('focus')
    await tick()
    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain('Графа 31')
  })

  it('title из пробелов — как пустой: только слот', () => {
    w = mountWithI18n({ render: () => h(TooltipProvider, () => h(ZTooltip, { title: '   ' }, () => h('button', 'Гр.31'))) }, { attachTo: document.body })
    expect(w.html()).toContain('Гр.31')
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull()
    expect(w.find('[aria-describedby]').exists()).toBe(false)
  })

  it('смена title не перемонтирует обёрнутый элемент; фокус остаётся на нём', async () => {
    let mounts = 0
    const Child = defineComponent({
      setup() {
        onMounted(() => { mounts++ })
        return () => h('button', 'Гр.31')
      },
    })
    const title = ref('')
    w = mountWithI18n({
      render: () => h(TooltipProvider, { delayDuration: 0 }, () => h(ZTooltip, { title: title.value }, () => h(Child))),
    }, { attachTo: document.body })
    const btn = w.get('button').element as HTMLButtonElement
    btn.focus()
    expect(mounts).toBe(1)
    title.value = 'Графа 31'
    await tick()
    expect(w.get('button').element).toBe(btn)
    expect(document.activeElement).toBe(btn)
    title.value = ''
    await tick()
    expect(w.get('button').element).toBe(btn)
    expect(document.activeElement).toBe(btn)
    expect(mounts).toBe(1)
  })

  it('title стал пустым при открытой подсказке — подсказка и aria-describedby исчезают', async () => {
    const title = ref('Графа 31')
    w = mountWithI18n({
      render: () => h(TooltipProvider, { delayDuration: 0 }, () => h(ZTooltip, { title: title.value }, () => h('button', 'Гр.31'))),
    }, { attachTo: document.body })
    const btn = w.get('button')
    await btn.trigger('focus')
    await tick()
    expect(document.body.querySelector('[role="tooltip"]')).not.toBeNull()
    title.value = ''
    await tick()
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull()
    expect(btn.attributes('aria-describedby')).toBeUndefined()
    // выключенная подсказка не открывается на фокусе
    await btn.trigger('blur')
    await btn.trigger('focus')
    await tick()
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull()
    expect(btn.attributes('aria-describedby')).toBeUndefined()
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

  it('клавиатура: ArrowDown открывает, ArrowDown ведёт подсветку, Enter выбирает один раз, фокус на триггере', async () => {
    w = mountDd()
    const trigger = w.get('button').element as HTMLButtonElement
    trigger.focus()
    await w.get('button').trigger('keydown', { key: 'ArrowDown' })
    await tick()
    const menu = document.body.querySelector('[role="menu"]') as HTMLElement
    const key = async (k: string) => { (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); await tick() }
    const els = menuItems()
    // подсветка стартует на первом пункте, ArrowDown перескакивает выключенный и идёт на «Удалить ДТ»
    expect(document.activeElement).toBe(els[0])
    await key('ArrowDown')
    expect(document.activeElement).toBe(els[2])
    expect(els[2].hasAttribute('data-highlighted')).toBe(true)
    await key('ArrowUp')
    expect(document.activeElement).toBe(els[0])
    expect(menu.contains(document.activeElement)).toBe(true)
    await key('Enter')
    await new Promise((r) => setTimeout(r, 0))
    await tick()
    expect(w.emitted('select')).toEqual([['xml']])
    expect(menuItems()).toHaveLength(0)
    expect(document.activeElement).toBe(trigger)
  })

  it('Escape закрывает меню и возвращает фокус на триггер', async () => {
    w = mountDd()
    const trigger = w.get('button').element as HTMLButtonElement
    trigger.focus()
    await w.get('button').trigger('keydown', { key: 'Enter' })
    await tick()
    expect(menuItems()).toHaveLength(3)
    ;(document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    await tick()
    expect(menuItems()).toHaveLength(0)
    expect(document.activeElement).toBe(trigger)
    expect(w.emitted('select')).toBeUndefined()
  })

  it('меню не модальное: страница не блокируется', async () => {
    w = mountDd()
    await w.get('button').trigger('keydown', { key: 'Enter' })
    await tick()
    expect(document.body.style.pointerEvents).not.toBe('none')
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

  it('слот header: подпись вверху меню, над пунктами и с разделителем под ней', async () => {
    w = mountWithI18n(ZDropdown, {
      props: { items: [{ key: 'a', label: 'A' }] },
      slots: { default: '<button>Ещё</button>', header: '<span id="hdr">Шапка</span>' },
      attachTo: document.body,
    })
    await w.get('button').trigger('keydown', { key: 'Enter' })
    await tick()
    const hdr = document.getElementById('hdr')!
    expect(hdr).not.toBeNull()
    const item = menuItems()[0]
    expect(item.textContent?.trim()).toBe('A')
    expect(hdr.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // подпись — не пункт меню: стрелки по ней не ходят
    expect(hdr.closest('[role="menuitem"]')).toBeNull()
    const sep = document.body.querySelector('[role="separator"]')!
    expect(hdr.compareDocumentPosition(sep) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(sep.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('без слота header — ни подписи, ни разделителя', async () => {
    w = mountWithI18n(ZDropdown, { props: { items: [{ key: 'a', label: 'A' }] }, slots: { default: '<button>Ещё</button>' }, attachTo: document.body })
    await w.get('button').trigger('keydown', { key: 'Enter' })
    await tick()
    expect(menuItems()).toHaveLength(1)
    expect(document.body.querySelector('[data-z-dropdown-header]')).toBeNull()
    expect(document.body.querySelector('[role="separator"]')).toBeNull()
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
    const descId = dialog.getAttribute('aria-describedby')!
    expect(document.getElementById(descId)?.textContent).toBe('Файл будет удалён')
    find('Отмена').click()
    await tick()
    expect(w.emitted('cancel')).toHaveLength(1)
    expect(w.emitted('confirm')).toBeUndefined()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    // повторное открытие: связи aria остаются
    await w.get('button').trigger('click')
    await tick()
    const again = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(document.getElementById(again.getAttribute('aria-labelledby')!)?.textContent).toBe('Удалить файл?')
    expect(document.getElementById(again.getAttribute('aria-describedby')!)?.textContent).toBe('Файл будет удалён')
    expect(document.activeElement).toBe(find('Отмена'))
  })

  it('без описания aria-describedby не ставится', async () => {
    w = mountPc()
    await w.get('button').trigger('click')
    await tick()
    expect(document.body.querySelector('[role="dialog"]')?.hasAttribute('aria-describedby')).toBe(false)
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
    await new Promise((r) => setTimeout(r, 20)) // Reka вешает слушатель клика снаружи через setTimeout(0)
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await tick()
    await new Promise((r) => setTimeout(r, 20)) // Presence снимает окно после макрозадачи
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
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
