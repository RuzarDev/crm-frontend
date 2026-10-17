import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'

const api = vi.hoisted(() => ({ suggest: vi.fn(), select: vi.fn(), status: vi.fn(), settings: vi.fn(), saveSettings: vi.fn(), stats: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/aiTnved', async (orig) => ({ ...(await orig<typeof import('@/api/aiTnved')>()), aiTnvedApi: api }))
vi.mock('@/ui/message', () => ({ message: msg }))

import AiSettingsPage from '../AiSettingsPage.vue'

const SETTINGS = {
  provider: 'Anthropic', model: 'claude-sonnet-5-5', baseUrlHost: null, configured: true, clientsEnabled: true,
  userDailyLimit: 30, clientDailyLimit: 60, totalDailyLimit: 1000, updatedAtUtc: null,
}
const STATS = {
  days: 30, requests: 40, aiAnswered: 30, cached: 5, fallback: 5, withAnswer: 35, selectedFirst: 21, selectedAny: 28,
  selectedOther: 3, inputTokens: 150000, outputTokens: 30000, requestsToday: 4,
}

let w: VueWrapper
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('AiSettingsPage', () => {
  it('провайдер и модель — только чтение; статистика: первый вариант и любой из предложенных', async () => {
    api.settings.mockResolvedValue(SETTINGS)
    api.stats.mockResolvedValue(STATS)
    w = mountWithI18n(AiSettingsPage, { attachTo: document.body })
    await flushPromises()
    expect(w.get('[data-ai-provider-name]').text()).toBe('Anthropic')
    expect(w.get('[data-ai-provider]').text()).toContain('claude-sonnet-5-5')
    expect(w.get('[data-ai-configured]').text()).toBe('Подключена')
    expect(w.get('[data-ai-stat="selectedFirst"]').text()).toContain('21')
    expect(w.get('[data-ai-stat="selectedFirst"]').text()).toContain('60%')
    expect(w.get('[data-ai-stat="selectedAny"]').text()).toContain('80%')
    expect(api.stats).toHaveBeenCalledWith(30)
  })

  it('«ИИ для клиентов» и лимиты сохраняются; неверный лимит не даёт сохранить', async () => {
    api.settings.mockResolvedValue(SETTINGS)
    api.stats.mockResolvedValue(STATS)
    api.saveSettings.mockResolvedValue({ ...SETTINGS, clientsEnabled: false, userDailyLimit: 10 })
    w = mountWithI18n(AiSettingsPage, { attachTo: document.body })
    await flushPromises()
    expect(w.get('[data-ai-settings-save]').attributes('disabled')).toBeDefined()
    await w.get('[data-ai-clients]').trigger('click')
    const input = w.get('[data-ai-limit-input="userDailyLimit"] input, input[data-ai-limit-input="userDailyLimit"]')
    await input.setValue('10')
    await input.trigger('blur')
    await w.get('[data-ai-settings-form]').trigger('submit')
    await flushPromises()
    expect(api.saveSettings).toHaveBeenCalledWith({ clientsEnabled: false, userDailyLimit: 10, clientDailyLimit: 60, totalDailyLimit: 1000 })
    expect(msg.success).toHaveBeenCalled()
  })

  it('ключ не задан — «Не подключена» и подсказка, где прописать', async () => {
    api.settings.mockResolvedValue({ ...SETTINGS, provider: 'Off', model: null, configured: false })
    api.stats.mockResolvedValue(STATS)
    w = mountWithI18n(AiSettingsPage, { attachTo: document.body })
    await flushPromises()
    expect(w.get('[data-ai-configured]').text()).toBe('Не подключена')
    expect(w.get('[data-ai-provider]').text()).toContain('Ai__ApiKey')
  })
})
