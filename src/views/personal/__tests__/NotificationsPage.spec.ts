import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { h } from 'vue'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { AppNotification } from '@/types/api'

const api = vi.hoisted(() => ({
  list: vi.fn(), unread: vi.fn(), markRead: vi.fn(), markAll: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/notifications', () => ({
  notificationsApi: { list: api.list, getUnreadCount: api.unread, markRead: api.markRead, markAllRead: api.markAll },
}))
vi.mock('@/ui/message', () => ({ message: api.toast }))

import NotificationsPage from '../NotificationsPage.vue'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'

const note = (i: number, over: Partial<AppNotification> = {}): AppNotification => ({
  id: `n${i}`, title: `Заявка №${i}`, body: `Текст ${i}`, type: 'CaseAssigned', caseId: `c${i}`, reestrEntryId: null,
  isRead: false, createdAtUtc: '2026-10-08T09:20:00Z', ...over,
})
const page = (from: number, n: number, over: Partial<AppNotification> = {}) => Array.from({ length: n }, (_, i) => note(from + i, over))

let w: VueWrapper
let router: Router
const App = { render: () => h(RouterView) }
const open = async () => {
  await router.push('/notifications')
  await router.isReady()
  w = mountWithI18n(App, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
}
const rows = () => w.findAll('[data-notification]')

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/notifications', component: NotificationsPage },
      { path: '/:p(.*)*', component: { template: '<div data-other />' } },
    ],
  })
  api.list.mockResolvedValue({ data: page(1, 3) })
  api.unread.mockResolvedValue({ data: { count: 3 } })
  api.markRead.mockResolvedValue({})
  api.markAll.mockResolvedValue({})
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('NotificationsPage', () => {
  it('первая загрузка — скелетон, дальше список; запрос постраничный и silent', async () => {
    let resolve!: (v: unknown) => void
    api.list.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    await router.push('/notifications')
    w = mountWithI18n(App, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()
    expect(w.find('[data-notifications-skeleton]').exists()).toBe(true)
    expect(w.find('[data-notifications-empty]').exists()).toBe(false)
    resolve({ data: page(1, 3) })
    await flushPromises()
    expect(w.find('[data-notifications-skeleton]').exists()).toBe(false)
    expect(rows()).toHaveLength(3)
    expect(api.list).toHaveBeenCalledWith({ limit: 30, offset: 0 }, { silent: true })
  })

  it('непрочитанные жирные и помечены, прочитанные — обычные; время по языку', async () => {
    api.list.mockResolvedValue({ data: [note(1), note(2, { isRead: true })] })
    await open()
    const [a, b] = rows()
    expect(a.attributes('data-unread')).toBeDefined()
    expect(a.get('[data-notification-title]').classes()).toContain('font-semibold')
    expect(a.get('[data-notification-title]').text()).toContain('Не прочитано')
    expect(b.attributes('data-unread')).toBeUndefined()
    expect(b.get('[data-notification-title]').classes()).toContain('font-normal')
    expect(a.get('[data-notification-time]').text()).toMatch(/2026/)
  })

  it('ошибка загрузки — состояние ошибки, а не «уведомлений нет»; «Повторить» грузит заново', async () => {
    api.list.mockRejectedValueOnce(new Error('boom'))
    await open()
    expect(w.find('[data-notifications-error]').exists()).toBe(true)
    expect(w.find('[data-notifications-empty]').exists()).toBe(false)
    expect(w.text()).not.toContain('Уведомлений нет')
    await w.get('[data-notifications-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-notifications-error]').exists()).toBe(false)
    expect(rows()).toHaveLength(3)
  })

  it('настоящая пустота — отдельный текст', async () => {
    api.list.mockResolvedValue({ data: [] })
    api.unread.mockResolvedValue({ data: { count: 0 } })
    await open()
    expect(w.get('[data-notifications-empty]').text()).toContain('Уведомлений нет')
    expect(w.find('[data-notifications-error]').exists()).toBe(false)
    expect(w.get('[data-mark-all]').attributes('disabled')).toBeDefined()
  })

  it('«Показать ещё» скрыт, если пришло меньше страницы', async () => {
    await open()
    expect(w.find('[data-notifications-more]').exists()).toBe(false)
  })

  it('полная страница — «Показать ещё» дописывает следующую со смещением; неполная прячет кнопку', async () => {
    api.list.mockResolvedValueOnce({ data: page(1, 30) }).mockResolvedValueOnce({ data: page(31, 5) })
    await open()
    expect(rows()).toHaveLength(30)
    await w.get('[data-notifications-more]').trigger('click')
    await flushPromises()
    expect(api.list).toHaveBeenLastCalledWith({ limit: 30, offset: 30 }, { silent: true })
    expect(rows()).toHaveLength(35)
    expect(w.find('[data-notifications-more]').exists()).toBe(false)
  })

  it('ошибка «Показать ещё» — список остаётся, рядом сообщение и кнопка для повтора', async () => {
    api.list.mockResolvedValueOnce({ data: page(1, 30) }).mockRejectedValueOnce(new Error('boom'))
    await open()
    await w.get('[data-notifications-more]').trigger('click')
    await flushPromises()
    expect(rows()).toHaveLength(30)
    expect(w.find('[data-notifications-error]').exists()).toBe(false)
    expect(w.get('[data-notifications-more-error]').exists()).toBe(true)
    expect(w.find('[data-notifications-more]').exists()).toBe(true)
  })

  it('клик: читает и ведёт к заявке', async () => {
    await open()
    await rows()[1].trigger('click')
    await flushPromises()
    expect(api.markRead).toHaveBeenCalledWith('n2')
    expect(router.currentRoute.value.fullPath).toBe('/import-40/c2')
  })

  it('финансисту уведомление по заявке ведёт в счета с фильтром', async () => {
    const auth = useAuthStore()
    auth.role = 'accountant'
    auth.permissions = ['finance.read']
    await open()
    await rows()[0].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/billing?case=c1')
  })

  it('не отметилось как прочитанное — переход всё равно выполняется', async () => {
    api.markRead.mockRejectedValueOnce(new Error('boom'))
    await open()
    await rows()[0].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/import-40/c1')
  })

  it('«Отметить все как прочитанные» — всё прочитано, кнопка гаснет', async () => {
    useNotificationsStore().unreadCount = 3
    await open()
    await w.get('[data-mark-all]').trigger('click')
    await flushPromises()
    expect(api.markAll).toHaveBeenCalledTimes(1)
    expect(rows().every((r) => r.attributes('data-unread') === undefined)).toBe(true)
    expect(w.get('[data-mark-all]').attributes('disabled')).toBeDefined()
  })
})
