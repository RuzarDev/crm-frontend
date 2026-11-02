import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

const api = vi.hoisted(() => ({ homeBadge: vi.fn() }))
vi.mock('@/api/dashboard', () => ({ dashboardApi: { homeBadge: api.homeBadge } }))

import { HOME_BADGE_POLL_MS, homeBadgeFromHome, startHomeBadgePolling, stopHomeBadgePolling } from '@/shell/homeBadge'
import { homeAttention, homeAttentionTone, resetHomeAttention, setStaffHomeBadge } from '@/shell/attention'

// Пакет G (02.11.2026): значок «Главной» сотрудника — красный «Срочно», иначе жёлтый «Ждут вас», иначе нет;
// считается без открытия Главной (лёгкий запрос при входе и раз в несколько минут).
beforeEach(() => {
  resetHomeAttention()
  api.homeBadge.mockResolvedValue({ urgent: 0, awaitingMe: 0 })
})
afterEach(() => {
  stopHomeBadgePolling()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('setStaffHomeBadge', () => {
  it('срочное — его число красным; иначе «Ждут вас» жёлтым; ноль — значка нет', () => {
    setStaffHomeBadge({ urgent: 2, awaitingMe: 5 })
    expect([homeAttention.value, homeAttentionTone.value]).toEqual([2, 'danger'])
    setStaffHomeBadge({ urgent: 0, awaitingMe: 5 })
    expect([homeAttention.value, homeAttentionTone.value]).toEqual([5, 'gold'])
    setStaffHomeBadge({ urgent: 0, awaitingMe: 0 })
    expect(homeAttention.value).toBe(0)
  })
})

describe('опрос значка', () => {
  it('сразу при старте и раз в несколько минут, пока вкладка видна; после остановки — нет', async () => {
    vi.useFakeTimers()
    api.homeBadge.mockResolvedValue({ urgent: 1, awaitingMe: 3 })
    startHomeBadgePolling()
    await flushPromises()
    expect(api.homeBadge).toHaveBeenCalledTimes(1)
    expect([homeAttention.value, homeAttentionTone.value]).toEqual([1, 'danger'])

    vi.advanceTimersByTime(HOME_BADGE_POLL_MS)
    expect(api.homeBadge).toHaveBeenCalledTimes(2)

    stopHomeBadgePolling()
    vi.advanceTimersByTime(HOME_BADGE_POLL_MS * 3)
    expect(api.homeBadge).toHaveBeenCalledTimes(2)
  })

  it('ошибка запроса — значок прежний, без исключения', async () => {
    setStaffHomeBadge({ urgent: 0, awaitingMe: 4 })
    api.homeBadge.mockRejectedValue(new Error('net'))
    startHomeBadgePolling()
    await flushPromises()
    expect(homeAttention.value).toBe(4)
  })

  it('ответ опроса, ушедшего до свежих данных Главной, не перетирает их', async () => {
    let resolve!: (v: { urgent: number; awaitingMe: number }) => void
    api.homeBadge.mockReturnValue(new Promise((r) => { resolve = r }))
    startHomeBadgePolling()
    homeBadgeFromHome({ urgent: 0, awaitingMe: 7 })
    resolve({ urgent: 9, awaitingMe: 0 })
    await flushPromises()
    expect([homeAttention.value, homeAttentionTone.value]).toEqual([7, 'gold'])
  })
})
