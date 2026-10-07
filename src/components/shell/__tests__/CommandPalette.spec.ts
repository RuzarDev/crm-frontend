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
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    // единственный пункт (переходы «И40» не совпали) — ArrowDown по кругу остаётся на нём
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
})
