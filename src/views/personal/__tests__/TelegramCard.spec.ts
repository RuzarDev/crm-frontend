import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountWithI18n } from '@/test/mountWithI18n'
import TelegramCard from '../TelegramCard.vue'

// Карточка «Telegram» в профиле клиента (очередь 4, задача 3): бот не настроен → подсказка; не привязан → «Подключить»
// даёт ссылку и ждёт привязку; привязан → аккаунт, выключатель уведомлений, «Отвязать» с подтверждением.
const api = vi.hoisted(() => ({
  status: vi.fn(),
  createLink: vi.fn(),
  unlink: vi.fn(),
  setNotifications: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  confirm: vi.fn(),
}))
vi.mock('@/api/telegram', () => ({ telegramApi: { status: api.status, createLink: api.createLink, unlink: api.unlink, setNotifications: api.setNotifications } }))
vi.mock('@/ui/message', () => ({ message: api.toast }))
vi.mock('@/ui/confirm', () => ({ useConfirm: () => ({ confirm: api.confirm }) }))

const status = (over: Partial<Record<string, unknown>> = {}) => ({
  botConfigured: true, botUsername: 'zircon_bot', linked: false, username: null, firstName: null, linkedAtUtc: null, notificationsEnabled: true, ...over,
})

describe('TelegramCard', () => {
  beforeEach(() => { vi.useFakeTimers(); Object.values(api).forEach((f) => typeof f === 'function' && f.mockReset()) })
  afterEach(() => vi.useRealTimers())

  it('бот не настроен на сервере — подсказка вместо кнопки', async () => {
    api.status.mockResolvedValue(status({ botConfigured: false }))
    const w = mountWithI18n(TelegramCard)
    await flushPromises()
    expect(w.find('[data-telegram-off]').exists()).toBe(true)
    expect(w.find('[data-telegram-connect]').exists()).toBe(false)
  })

  it('«Подключить» показывает ссылку t.me, а после привязки карточка переключается сама', async () => {
    api.status.mockResolvedValue(status())
    api.createLink.mockResolvedValue({ url: 'https://t.me/zircon_bot?start=abc', expiresAtUtc: new Date(Date.now() + 15 * 60_000).toISOString() })
    const w = mountWithI18n(TelegramCard)
    await flushPromises()
    await w.get('[data-telegram-connect]').trigger('click')
    await flushPromises()
    expect(w.get('[data-telegram-url]').attributes('href')).toBe('https://t.me/zircon_bot?start=abc')
    expect(w.get('[data-telegram-url]').text()).toContain('t.me/zircon_bot')

    api.status.mockResolvedValue(status({ linked: true, username: 'ivan' }))
    await vi.advanceTimersByTimeAsync(3100)
    await flushPromises()
    expect(w.find('[data-telegram-link]').exists()).toBe(false)
    expect(w.get('[data-telegram-linked]').text()).toContain('@ivan')
    expect(api.toast.success).toHaveBeenCalled()
  })

  it('привязан: выключатель уведомлений и отвязка с подтверждением', async () => {
    api.status.mockResolvedValue(status({ linked: true, firstName: 'Иван' }))
    api.setNotifications.mockResolvedValue(undefined)
    api.unlink.mockResolvedValue(undefined)
    const w = mountWithI18n(TelegramCard)
    await flushPromises()
    expect(w.get('[data-telegram-linked]').text()).toContain('Иван')
    expect(w.get('[data-telegram-notify]').attributes('aria-checked')).toBe('true')

    await w.get('[data-telegram-notify]').trigger('click')
    await flushPromises()
    expect(api.setNotifications).toHaveBeenCalledWith(false)

    api.confirm.mockResolvedValue(false)
    await w.get('[data-telegram-unlink]').trigger('click')
    await flushPromises()
    expect(api.unlink).not.toHaveBeenCalled()

    api.confirm.mockResolvedValue(true)
    api.status.mockResolvedValue(status())
    await w.get('[data-telegram-unlink]').trigger('click')
    await flushPromises()
    expect(api.unlink).toHaveBeenCalled()
    expect(w.find('[data-telegram-connect]').exists()).toBe(true)
  })
})
