// src/components/shell/__tests__/CommandPalette.spec.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import CommandPalette from '@/components/shell/CommandPalette.vue'
import { useCommandPalette, installPaletteHotkey } from '@/shell/useCommandPalette'
import { systemApi } from '@/api/system'

vi.mock('@/api/system', () => ({ systemApi: { search: vi.fn() } }))
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
const dest = [
  { key: 'home', label: 'Главная', to: '/home' },
  { key: 'billing', label: 'Счета и акты', hint: 'Финансы', to: '/billing' },
]
const mountIt = () => mountWithI18n(CommandPalette, { props: { destinations: dest }, global: { plugins: [router] }, attachTo: document.body })
const input = () => document.body.querySelector('input[role="combobox"]') as HTMLInputElement
const options = () => [...document.body.querySelectorAll('[role="option"]')].map((o) => o.textContent?.trim())

describe('CommandPalette', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.mocked(systemApi.search).mockReset(); useCommandPalette().hide() })
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

  it('⌘K открывает, повторно — закрывает', async () => {
    const off = installPaletteHotkey()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
    expect(useCommandPalette().open.value).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'K', ctrlKey: true }))
    expect(useCommandPalette().open.value).toBe(false)
    off()
  })

  it('пустой запрос — все переходы; фильтр по подсказке', async () => {
    const w = mountIt(); useCommandPalette().show(); await flushPromises()
    expect(options()).toHaveLength(2)
    input().value = 'фин'; input().dispatchEvent(new Event('input')); await flushPromises()
    expect(options()).toHaveLength(1)
    w.unmount()
  })

  it('поиск с задержкой 250 мс, silent, выбор по Enter', async () => {
    vi.mocked(systemApi.search).mockResolvedValue([{ type: 'case', title: 'И40-182', subtitle: 'ТОО «Казахмыс Трейд»', url: '/import-40/c1' }])
    const push = vi.spyOn(router, 'push')
    const w = mountIt(); useCommandPalette().show(); await flushPromises()
    input().value = 'И40'; input().dispatchEvent(new Event('input'))
    expect(systemApi.search).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(250); await flushPromises()
    expect(systemApi.search).toHaveBeenCalledWith('И40', { silent: true })
    expect(options().some((o) => o?.includes('И40-182'))).toBe(true)
    // единственный пункт (переходы «И40» не совпали) — он и активен
    expect(input().getAttribute('aria-activedescendant')).toBe(document.body.querySelector('[role="option"]')!.id)
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await flushPromises()
    expect(push).toHaveBeenCalledWith('/import-40/c1')
    expect(useCommandPalette().open.value).toBe(false)
    w.unmount()
  })

  it('ошибка поиска — сообщение и «Повторить»', async () => {
    vi.mocked(systemApi.search).mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce([])
    const w = mountIt(); useCommandPalette().show(); await flushPromises()
    input().value = 'abc'; input().dispatchEvent(new Event('input'))
    await vi.advanceTimersByTimeAsync(250); await flushPromises()
    expect(document.body.textContent).toContain('Поиск не ответил')
    ;(document.body.querySelector('[data-retry]') as HTMLButtonElement).click()
    await flushPromises()
    expect(systemApi.search).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).toContain('Ничего не нашлось')
    w.unmount()
  })

  it('устаревший ответ не перетирает новый', async () => {
    let resolveFirst!: (v: unknown) => void
    vi.mocked(systemApi.search)
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }) as never)
      .mockResolvedValueOnce([{ type: 'client', title: 'Новый', url: '/clients/2' }])
    const w = mountIt(); useCommandPalette().show(); await flushPromises()
    input().value = 'ст'; input().dispatchEvent(new Event('input')); await vi.advanceTimersByTimeAsync(250)
    input().value = 'нов'; input().dispatchEvent(new Event('input')); await vi.advanceTimersByTimeAsync(250); await flushPromises()
    resolveFirst([{ type: 'client', title: 'Старый', url: '/clients/1' }]); await flushPromises()
    expect(document.body.textContent).toContain('Новый')
    expect(document.body.textContent).not.toContain('Старый')
    w.unmount()
  })
  const key = (k: string) => input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
  const activeOption = () => document.getElementById(input().getAttribute('aria-activedescendant') ?? '')
  const typeQuery = async (q: string) => {
    input().value = q; input().dispatchEvent(new Event('input'))
    await vi.advanceTimersByTimeAsync(250); await flushPromises()
  }

  it('клавиатура: ↓ по кругу через переходы и результаты, ↑ с первого — на последний, activedescendant', async () => {
    vi.mocked(systemApi.search).mockResolvedValue([{ type: 'case', title: 'Заявка И40-182', url: '/import-40/c1' }])
    const w = mountWithI18n(CommandPalette, {
      props: { destinations: [{ key: 'a', label: 'Заявки', to: '/a' }, { key: 'b', label: 'Заявки клиента', to: '/b' }] },
      global: { plugins: [router] }, attachTo: document.body,
    })
    useCommandPalette().show(); await flushPromises()
    await typeQuery('Заяв')
    const opts = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')]
    expect(opts.map((o) => o.textContent?.trim())).toEqual(['Заявки', 'Заявки клиента', expect.stringContaining('И40-182')])
    const expectActive = (i: number) => {
      expect(activeOption()).toBe(opts[i])
      expect(opts[i].getAttribute('aria-selected')).toBe('true')
      expect(opts.filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(1)
    }
    expectActive(0)
    key('ArrowDown'); await flushPromises(); expectActive(1)
    key('ArrowDown'); await flushPromises(); expectActive(2)
    key('ArrowDown'); await flushPromises(); expectActive(0) // с последнего — на первый
    key('ArrowUp'); await flushPromises(); expectActive(2) // с первого — на последний результат
    w.unmount()
  })

  it('Escape закрывает палитру', async () => {
    const w = mountIt(); useCommandPalette().show(); await flushPromises()
    key('Escape'); await flushPromises()
    expect(useCommandPalette().open.value).toBe(false)
    w.unmount()
  })

  it('Enter во время загрузки ничего не открывает', async () => {
    let resolve!: (v: unknown) => void
    vi.mocked(systemApi.search).mockImplementationOnce(() => new Promise((r) => { resolve = r }) as never)
    const push = vi.spyOn(router, 'push'); push.mockClear()
    const w = mountIt(); useCommandPalette().show(); await flushPromises()
    input().value = 'И40'; input().dispatchEvent(new Event('input'))
    key('Enter'); await flushPromises() // ещё в задержке
    await vi.advanceTimersByTimeAsync(250)
    key('Enter'); await flushPromises() // запрос летит
    expect(push).not.toHaveBeenCalled()
    expect(useCommandPalette().open.value).toBe(true)
    expect(input().hasAttribute('aria-activedescendant')).toBe(false)
    resolve([{ type: 'case', title: 'И40-182', url: '/import-40/c1' }]); await flushPromises()
    expect(options()).toHaveLength(1)
    expect(systemApi.search).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('размонтирование: отложенный поиск не уходит, палитра закрыта', async () => {
    const w = mountIt(); useCommandPalette().show(); await flushPromises()
    input().value = 'abc'; input().dispatchEvent(new Event('input'))
    w.unmount()
    await vi.advanceTimersByTimeAsync(500); await flushPromises()
    expect(systemApi.search).not.toHaveBeenCalled()
    expect(useCommandPalette().open.value).toBe(false)
  })

  it('неизвестный тип результата — без метки, а не ключ словаря', async () => {
    vi.mocked(systemApi.search).mockResolvedValue([{ type: 'weird', title: 'Нечто', url: '/x' }] as never)
    const w = mountIt(); useCommandPalette().show(); await flushPromises()
    await typeQuery('нечто')
    expect(options()).toEqual(['Нечто'])
    expect(document.body.textContent).not.toContain('shell.palette')
    w.unmount()
  })

  describe('горячая клавиша', () => {
    const press = (init: KeyboardEventInit) => {
      const e = new KeyboardEvent('keydown', { cancelable: true, ...init })
      window.dispatchEvent(e)
      return e
    }

    it('preventDefault и снятие обработчика', () => {
      const off = installPaletteHotkey()
      expect(press({ key: 'k', metaKey: true }).defaultPrevented).toBe(true)
      expect(useCommandPalette().open.value).toBe(true)
      off()
      const e = press({ key: 'k', metaKey: true })
      expect(e.defaultPrevented).toBe(false)
      expect(useCommandPalette().open.value).toBe(true)
    })

    it('русская раскладка: key «л», code KeyK', () => {
      const off = installPaletteHotkey()
      press({ key: 'л', code: 'KeyK', ctrlKey: true })
      expect(useCommandPalette().open.value).toBe(true)
      off()
    })

    it('автоповтор, Alt, Shift и K без модификатора не срабатывают', () => {
      const off = installPaletteHotkey()
      for (const init of [
        { key: 'k', metaKey: true, repeat: true },
        { key: 'k', metaKey: true, altKey: true },
        { key: 'K', ctrlKey: true, shiftKey: true },
        { key: 'k' },
      ]) {
        const e = press(init)
        expect(e.defaultPrevented).toBe(false)
        expect(useCommandPalette().open.value).toBe(false)
      }
      off()
    })
  })
})
