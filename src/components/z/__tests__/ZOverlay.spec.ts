import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import { confirmState, useConfirm } from '@/ui/confirm'
import ZModal from '../ZModal.vue'
import ZDrawer from '../ZDrawer.vue'
import ZConfirmHost from '../ZConfirmHost.vue'
import ZDate from '../ZDate.vue'

let w: VueWrapper
afterEach(() => {
  w?.unmount()
  confirmState.resolve(false)
  document.body.innerHTML = ''
})
const btn = (text: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement
const dialog = () => document.body.querySelector('[role="dialog"]') as HTMLElement | null
// Reka вешает слушатель клика снаружи через setTimeout(0), а Presence снимает окно после макрозадачи.
const macrotask = () => new Promise((r) => setTimeout(r, 20))
const escape = (target: Element = document.activeElement ?? document.body) => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
}
// jsdom без PointerEvent — Reka слушает pointerdown, тип события ей не важен.
const pointerDown = (target: Element) => target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
const overlay = () => document.body.querySelector('[data-z-overlay]') as HTMLElement

// Управляемое окно: родитель принимает update:open — как v-model:open.
const mountModal = (props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) => {
  w = mountWithI18n(ZModal, {
    props: { open: true, title: 'T', ...props, 'onUpdate:open': (v: boolean) => w.setProps({ open: v }) },
    slots,
    attachTo: document.body,
  })
  return w
}

describe('ZModal', () => {
  it('рендерит заголовок и тело в портале, role=dialog с подписью', async () => {
    w = mountWithI18n(ZModal, { props: { open: true, title: 'Новая заявка' }, slots: { default: '<p>Тело</p>' }, attachTo: document.body })
    await nextTick()
    const dialog = document.body.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('Новая заявка')
    expect(dialog.textContent).toContain('Тело')
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy()
  })
  it('aria-labelledby указывает на заголовок; без описания нет aria-describedby', async () => {
    mountModal({ title: 'Новая заявка' })
    await nextTick()
    const title = document.getElementById(dialog()!.getAttribute('aria-labelledby')!)
    expect(title?.textContent?.trim()).toBe('Новая заявка')
    expect(dialog()!.hasAttribute('aria-describedby')).toBe(false)
    expect(dialog()!.getAttribute('aria-modal')).toBe('true')
  })
  it('слот title заменяет текст заголовка', async () => {
    mountModal({ title: undefined }, { title: '<span>Из слота</span>' })
    await nextTick()
    expect(document.getElementById(dialog()!.getAttribute('aria-labelledby')!)?.textContent).toBe('Из слота')
  })
  it('ok → ok, окно не закрывается само; отмена → update:open(false) и cancel', async () => {
    w = mountWithI18n(ZModal, { props: { open: true, title: 'T', okText: 'Создать' }, attachTo: document.body })
    await nextTick()
    btn('Создать').click()
    await nextTick()
    expect(w.emitted('ok')).toHaveLength(1)
    expect(w.emitted('update:open')).toBeUndefined()
    btn('Отмена').click()
    await nextTick()
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
    expect(w.emitted('cancel')).toHaveLength(1)
  })
  it('тексты по умолчанию: «Отмена» и «Подтвердить»; свои cancelText', async () => {
    mountModal()
    await nextTick()
    expect(btn('Отмена')).toBeDefined()
    expect(btn('Подтвердить')).toBeDefined()
    await w.setProps({ cancelText: 'Закрыть окно' })
    expect(btn('Закрыть окно')).toBeDefined()
  })
  it('confirmLoading — ок занят; footer=null — без подвала', async () => {
    w = mountWithI18n(ZModal, { props: { open: true, title: 'T', okText: 'Сохранить', confirmLoading: true }, attachTo: document.body })
    await nextTick()
    expect(btn('Сохранить').getAttribute('aria-busy')).toBe('true')
    w.unmount()
    w = mountWithI18n(ZModal, { props: { open: true, title: 'T', footer: null }, attachTo: document.body })
    await nextTick()
    expect(btn('Отмена')).toBeUndefined()
  })
  it('confirmLoading: клик по ок не эмитит ok, отмена работает', async () => {
    mountModal({ okText: 'Сохранить', confirmLoading: true })
    await nextTick()
    btn('Сохранить').click()
    expect(w.emitted('ok')).toBeUndefined()
    btn('Отмена').click()
    await nextTick()
    expect(w.emitted('cancel')).toHaveLength(1)
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
  })
  it('okButtonProps: disabled выключает ок, danger — красная кнопка', async () => {
    mountModal({ okText: 'Удалить', okButtonProps: { disabled: true, danger: true } })
    await nextTick()
    expect(btn('Удалить').disabled).toBe(true)
    expect(btn('Удалить').className).toContain('bg-danger')
    btn('Удалить').click()
    expect(w.emitted('ok')).toBeUndefined()
    await w.setProps({ okButtonProps: {} })
    expect(btn('Удалить').disabled).toBe(false)
    expect(btn('Удалить').className).toContain('bg-navy')
  })
  it('footer=false — без подвала; слот footer заменяет кнопки', async () => {
    mountModal({ footer: false })
    await nextTick()
    expect(btn('Отмена')).toBeUndefined()
    expect(btn('Подтвердить')).toBeUndefined()
    w.unmount()
    mountModal({}, { footer: '<button type="button">Своя кнопка</button>' })
    await nextTick()
    expect(btn('Своя кнопка')).toBeDefined()
    expect(btn('Отмена')).toBeUndefined()
    w.unmount()
    mountModal({ footer: null }, { footer: '<button type="button">Своя кнопка</button>' })
    await nextTick()
    expect(btn('Своя кнопка')).toBeUndefined()
  })
  it('крестик закрывает: update:open(false) и cancel', async () => {
    mountModal()
    await nextTick()
    ;(document.body.querySelector('button[aria-label="Закрыть"]') as HTMLButtonElement).click()
    await nextTick()
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
    expect(w.emitted('cancel')).toHaveLength(1)
    await macrotask()
    expect(dialog()).toBeNull()
  })
  it('closable=false — без крестика', async () => {
    mountModal({ closable: false })
    await nextTick()
    expect(document.body.querySelector('button[aria-label="Закрыть"]')).toBeNull()
  })
  it('Escape закрывает (cancel один раз); keyboard=false — не закрывает', async () => {
    mountModal()
    await nextTick()
    escape()
    await nextTick()
    expect(w.emitted('cancel')).toHaveLength(1)
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
    await macrotask()
    expect(dialog()).toBeNull()
    w.unmount()
    mountModal({ keyboard: false })
    await nextTick()
    escape()
    await macrotask()
    expect(w.emitted('cancel')).toBeUndefined()
    expect(dialog()).not.toBeNull()
  })
  it('клик по фону закрывает; maskClosable=false — не закрывает, Escape всё равно закрывает', async () => {
    mountModal()
    await nextTick()
    await macrotask()
    pointerDown(overlay())
    await nextTick()
    await macrotask()
    expect(w.emitted('cancel')).toHaveLength(1)
    expect(dialog()).toBeNull()
    w.unmount()

    mountModal({ maskClosable: false })
    await nextTick()
    await macrotask()
    pointerDown(overlay())
    await nextTick()
    await macrotask()
    expect(w.emitted('cancel')).toBeUndefined()
    expect(dialog()).not.toBeNull()
    escape()
    await nextTick()
    expect(w.emitted('cancel')).toHaveLength(1)
  })
  it('ширина: число → px в --w, строка как есть', async () => {
    mountModal()
    await nextTick()
    expect(dialog()!.style.getPropertyValue('--w')).toBe('520px')
    await w.setProps({ width: 720 })
    expect(dialog()!.style.getPropertyValue('--w')).toBe('720px')
    await w.setProps({ width: '80%' })
    expect(dialog()!.style.getPropertyValue('--w')).toBe('80%')
    expect(dialog()!.className).toContain('w-[min(var(--w),calc(100vw-32px))]')
  })
  it('прокрутка страницы заблокирована, пока окно открыто', async () => {
    mountModal()
    await nextTick()
    await nextTick()
    expect(document.body.style.overflow).toBe('hidden')
    escape()
    await nextTick()
    await macrotask()
    expect(document.body.style.overflow).toBe('')
  })
  it('фокус: сначала первое поле тела, наружу не уходит', async () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    mountModal({}, { default: '<input data-test="first" value="Казахмыс">' })
    await nextTick()
    await macrotask()
    expect(document.activeElement?.getAttribute('data-test')).toBe('first')
    // Текст поля не выделяется (иначе первый же символ стёр бы значение при правке).
    const first = document.activeElement as HTMLInputElement
    expect(first.selectionStart).toBe(first.selectionEnd)
    outside.focus()
    await nextTick()
    expect(dialog()!.contains(document.activeElement)).toBe(true)
  })
  it('после закрытия фокус возвращается к открывшему элементу', async () => {
    const Host = defineComponent({
      setup() {
        const open = ref(false)
        return () => [
          h('button', { id: 'opener', onClick: () => { open.value = true } }, 'Открыть'),
          h(ZModal, { open: open.value, title: 'T', 'onUpdate:open': (v: boolean) => { open.value = v } }, () => h('input')),
        ]
      },
    })
    w = mountWithI18n(Host, { attachTo: document.body })
    const opener = document.getElementById('opener') as HTMLButtonElement
    opener.focus()
    opener.click()
    await nextTick()
    await macrotask()
    expect(dialog()!.contains(document.activeElement)).toBe(true)
    escape()
    await nextTick()
    await macrotask()
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
  it('Escape в поле с черновиком (data-z-draft) не закрывает окно', async () => {
    mountModal({}, { default: '<input data-z-draft data-test="draft">' })
    await nextTick()
    escape(document.body.querySelector('[data-test="draft"]')!)
    await macrotask()
    expect(w.emitted('cancel')).toBeUndefined()
    expect(dialog()).not.toBeNull()
  })
  it('ZDate в окне: Escape откатывает черновик и не закрывает, второй Escape закрывает', async () => {
    const Host = defineComponent({
      setup() {
        const open = ref(true)
        const date = ref<string | null>('2026-09-28')
        return () => h(ZModal, { open: open.value, title: 'T', 'onUpdate:open': (v: boolean) => { open.value = v } }, () =>
          h(ZDate, { value: date.value, 'onUpdate:value': (v: string | null) => { date.value = v } }))
      },
    })
    w = mountWithI18n(Host, { attachTo: document.body })
    await nextTick()
    const input = document.body.querySelector('[role="dialog"] input') as HTMLInputElement
    input.focus()
    input.value = '01.01.2025'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(input.hasAttribute('data-z-draft')).toBe(true)
    escape(input)
    await nextTick()
    await macrotask()
    expect(dialog()).not.toBeNull()
    expect(input.value).toBe('28.09.2026')
    expect(input.hasAttribute('data-z-draft')).toBe(false)
    escape(input)
    await nextTick()
    await macrotask()
    expect(dialog()).toBeNull()
  })
})

describe('ZDrawer', () => {
  const mountDrawer = (props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) => {
    w = mountWithI18n(ZDrawer, {
      props: { open: true, title: 'Карточка', ...props, 'onUpdate:open': (v: boolean) => w.setProps({ open: v }) },
      slots,
      attachTo: document.body,
    })
    return w
  }
  it('панель с заголовком и закрытием', async () => {
    w = mountWithI18n(ZDrawer, { props: { open: true, title: 'Карточка клиента' }, slots: { default: 'x' }, attachTo: document.body })
    await nextTick()
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('Карточка клиента')
    ;(document.body.querySelector('button[aria-label="Закрыть"]') as HTMLButtonElement).click()
    await nextTick()
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
  })
  it('подпись, ширина, сторона, слот footer', async () => {
    mountDrawer({ width: 720 }, { default: 'Тело', footer: '<button type="button">Готово</button>' })
    await nextTick()
    const d = dialog()!
    expect(document.getElementById(d.getAttribute('aria-labelledby')!)?.textContent?.trim()).toBe('Карточка')
    expect(d.style.getPropertyValue('--w')).toBe('720px')
    expect(d.className).toContain('right-0')
    expect(btn('Готово')).toBeDefined()
    await w.setProps({ placement: 'left' })
    expect(dialog()!.className).toContain('left-0')
    expect(dialog()!.className).not.toContain('right-0')
  })
  it('Escape и фон закрывают (close); maskClosable=false — фон не закрывает; closable=false — без крестика', async () => {
    mountDrawer()
    await nextTick()
    escape()
    await nextTick()
    expect(w.emitted('close')).toHaveLength(1)
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
    await macrotask()
    expect(dialog()).toBeNull()
    await w.setProps({ open: true })
    await nextTick()
    await macrotask()
    pointerDown(overlay())
    await nextTick()
    await macrotask()
    expect(w.emitted('close')).toHaveLength(2)
    w.unmount()

    mountDrawer({ maskClosable: false, closable: false })
    await nextTick()
    await macrotask()
    expect(document.body.querySelector('button[aria-label="Закрыть"]')).toBeNull()
    pointerDown(overlay())
    await nextTick()
    await macrotask()
    expect(w.emitted('close')).toBeUndefined()
    expect(dialog()).not.toBeNull()
  })
})

describe('ZConfirmHost + useConfirm', () => {
  it('подтверждение: заголовок, текст как описание, danger; ок → true, окно закрыто', async () => {
    w = mountWithI18n(ZConfirmHost, { attachTo: document.body })
    const p = useConfirm().confirm({ title: 'Удалить файл?', content: 'Действие нельзя отменить', okText: 'Удалить', danger: true })
    await nextTick()
    await macrotask()
    const d = dialog()!
    expect(document.getElementById(d.getAttribute('aria-labelledby')!)?.textContent?.trim()).toBe('Удалить файл?')
    expect(document.getElementById(d.getAttribute('aria-describedby')!)?.textContent?.trim()).toBe('Действие нельзя отменить')
    expect(d.style.getPropertyValue('--w')).toBe('420px')
    expect(btn('Удалить').className).toContain('bg-danger')
    expect(document.activeElement).toBe(btn('Отмена'))
    btn('Удалить').click()
    await expect(p).resolves.toBe(true)
    await nextTick()
    await macrotask()
    expect(dialog()).toBeNull()
  })
  it('отмена и Escape → false', async () => {
    w = mountWithI18n(ZConfirmHost, { attachTo: document.body })
    const { confirm } = useConfirm()
    const p1 = confirm({ title: 'A?' })
    await nextTick()
    btn('Отмена').click()
    await expect(p1).resolves.toBe(false)
    await nextTick()
    await macrotask()
    const p2 = confirm({ title: 'B?' })
    await nextTick()
    await macrotask()
    expect(dialog()!.hasAttribute('aria-describedby')).toBe(false)
    escape()
    await expect(p2).resolves.toBe(false)
  })
})
