import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { KedenSyncStatusDto } from '@/api/keden'

// Строка состояния kedenlogger над списком КЕДЕН (23.10.2026): опрос раз в минуту, жёлтая плашка при stale,
// последняя ошибка — в подсказке, таймер снимается при уходе с экрана.
const api = vi.hoisted(() => ({ syncStatus: vi.fn() }))
vi.mock('@/api/keden', async (orig) => ({
  ...(await orig<typeof import('@/api/keden')>()),
  kedenApi: { syncStatus: api.syncStatus },
}))

import KedenSyncBar from '../KedenSyncBar.vue'
import { SYNC_REFRESH_MS } from '../kedenSync'

// «Сейчас» — 23.10.2026 14:20 по Алматы.
const NOW = new Date('2026-10-23T09:20:00Z')
const st = (over: Partial<KedenSyncStatusDto> = {}): KedenSyncStatusDto => ({
  lastQuickPollAtUtc: '2026-10-23T09:18:00Z',
  lastFullSyncAtUtc: '2026-10-23T09:00:00Z',
  dtCount: 220,
  logins: 1,
  refreshes: 14,
  lastLoginAtUtc: '2026-10-23T03:15:00Z',
  lastError: null,
  stale: false,
  ...over,
})

let w: VueWrapper | undefined
const mountBar = async () => {
  w = mountWithI18n(KedenSyncBar, { attachTo: document.body })
  await flushPromises()
}
const text = () => w!.get('[data-keden-sync-text]').text()
const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  api.syncStatus.mockReset()
  api.syncStatus.mockResolvedValue(st())
})
afterEach(() => {
  w?.unmount()
  w = undefined
  document.body.innerHTML = ''
  delete (document as unknown as Record<string, unknown>).visibilityState
  vi.useRealTimers()
})

describe('KedenSyncBar: строка', () => {
  it('обычная: «обновлён N мин назад · опрос каждые 3 мин · вход ЭЦП» (время входа — по Алматы), без плашки', async () => {
    await mountBar()
    expect(api.syncStatus).toHaveBeenCalledTimes(1)
    expect(text()).toBe('КЕДЕН обновлён: 2 мин назад · опрос каждые 3 мин · вход ЭЦП: 08:15')
    expect(w!.find('[data-keden-sync-stale]').exists()).toBe(false)
    expect(w!.find('[data-keden-sync-error]').exists()).toBe(false)
  })

  it('берёт более поздний из быстрого опроса и полной сверки; только что — «только что»', async () => {
    api.syncStatus.mockResolvedValue(st({ lastQuickPollAtUtc: '2026-10-23T08:00:00Z', lastFullSyncAtUtc: '2026-10-23T09:19:40Z' }))
    await mountBar()
    expect(text()).toContain('КЕДЕН обновлён: только что')
  })

  it('опроса ещё не было и входа нет — «ещё не обновлялся», без части про вход', async () => {
    api.syncStatus.mockResolvedValue(st({ lastQuickPollAtUtc: null, lastFullSyncAtUtc: null, lastLoginAtUtc: null, stale: true }))
    await mountBar()
    expect(text()).toBe('КЕДЕН ещё не обновлялся · опрос каждые 3 мин')
    expect(w!.find('[data-keden-sync-stale]').exists()).toBe(true)
  })

  it('stale — жёлтая плашка «больше 10 минут»', async () => {
    api.syncStatus.mockResolvedValue(st({ lastQuickPollAtUtc: '2026-10-23T09:05:00Z', lastFullSyncAtUtc: '2026-10-23T09:00:00Z', stale: true }))
    await mountBar()
    expect(text()).toContain('КЕДЕН обновлён: 15 мин назад')
    const banner = w!.get('[data-keden-sync-stale]')
    expect(banner.text()).toBe('kedenlogger не обновлял данные больше 10 минут — статусы могут быть устаревшими')
    expect(banner.attributes('role')).toBe('alert')
  })

  it('lastError — значок и текст в подсказке вместе с точным временем по Алматы и счётчиками', async () => {
    api.syncStatus.mockResolvedValue(st({ lastError: 'KEDEN 429 Too Many Requests' }))
    await mountBar()
    expect(w!.find('[data-keden-sync-error]').exists()).toBe(true)
    const line = w!.get('[data-keden-sync-line]')
    await line.trigger('focus')
    await flushPromises()
    const tip = document.body.querySelector('[role="tooltip"]')?.textContent ?? ''
    expect(tip).toContain('Время — Алматы (UTC+5)')
    expect(tip).toContain('Последний опрос: 23.10.2026, 14:18')
    expect(tip).toContain('Полная сверка: 23.10.2026, 14:00')
    expect(tip).toContain('Вход через ЭЦП: 23.10.2026, 08:15')
    expect(tip).toContain('ДТ в журнале: 220 · входов ЭЦП с запуска: 1 · продлений сессии: 14')
    expect(tip).toContain('Последняя ошибка: KEDEN 429 Too Many Requests')
  })
})

describe('KedenSyncBar: опрос', () => {
  it('переспрашивает каждые 60 с; «N мин назад» растёт', async () => {
    await mountBar()
    expect(api.syncStatus).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(SYNC_REFRESH_MS)
    await flushPromises()
    expect(api.syncStatus).toHaveBeenCalledTimes(2)
    expect(text()).toContain('3 мин назад')
    await vi.advanceTimersByTimeAsync(SYNC_REFRESH_MS)
    await flushPromises()
    expect(api.syncStatus).toHaveBeenCalledTimes(3)
  })

  it('уход с экрана снимает таймер — запросов больше нет', async () => {
    await mountBar()
    w!.unmount()
    w = undefined
    await vi.advanceTimersByTimeAsync(SYNC_REFRESH_MS * 5)
    expect(api.syncStatus).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('свежий ответ сменил stale — плашка уходит', async () => {
    api.syncStatus.mockResolvedValueOnce(st({ stale: true }))
    await mountBar()
    expect(w!.find('[data-keden-sync-stale]').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(SYNC_REFRESH_MS)
    await flushPromises()
    expect(w!.find('[data-keden-sync-stale]').exists()).toBe(false)
  })

  it('нет права (403) — строки нет и опрос прекращается', async () => {
    api.syncStatus.mockRejectedValue({ response: { status: 403 } })
    await mountBar()
    expect(w!.find('[data-keden-sync]').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(SYNC_REFRESH_MS * 3)
    expect(api.syncStatus).toHaveBeenCalledTimes(1)
  })

  it('сбой сервера — прежнее состояние остаётся, следующий раз спросит снова', async () => {
    await mountBar()
    api.syncStatus.mockRejectedValueOnce({ response: { status: 500 } })
    await vi.advanceTimersByTimeAsync(SYNC_REFRESH_MS)
    await flushPromises()
    expect(w!.find('[data-keden-sync]').exists()).toBe(true)
    expect(text()).toContain('КЕДЕН обновлён')
    await vi.advanceTimersByTimeAsync(SYNC_REFRESH_MS)
    await flushPromises()
    expect(api.syncStatus).toHaveBeenCalledTimes(3)
  })

  it('скрытая вкладка не спрашивает; вернулись — сразу обновляет', async () => {
    await mountBar()
    setHidden(true)
    await vi.advanceTimersByTimeAsync(SYNC_REFRESH_MS * 3)
    expect(api.syncStatus).toHaveBeenCalledTimes(1)
    setHidden(false)
    await flushPromises()
    expect(api.syncStatus).toHaveBeenCalledTimes(2)
  })
})
