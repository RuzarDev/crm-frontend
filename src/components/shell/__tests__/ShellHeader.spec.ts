import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { AppNotification } from '@/types/api'

// Форма ответов — как у src/api/notifications.ts (axios: { data }) и как её читает стор.
const notif = (o: Partial<AppNotification> = {}): AppNotification => ({
  id: 'n1', title: 'ДТ выпущена', body: 'И40-182', type: 'case', caseId: 'c1', reestrEntryId: null,
  isRead: false, createdAtUtc: '2026-10-08T05:40:00Z', ...o,
})
const api = vi.hoisted(() => ({
  list: vi.fn(),
  getUnreadCount: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
}))
vi.mock('@/api/notifications', () => ({ notificationsApi: api }))
vi.mock('@/i18n', async (orig) => ({ ...(await orig<typeof import('@/i18n')>()), setLocale: vi.fn() }))

import NotificationsBell from '@/components/shell/NotificationsBell.vue'
import UserMenu from '@/components/shell/UserMenu.vue'
import LangMenu from '@/components/shell/LangMenu.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { useAuthStore } from '@/stores/auth'
import { useProfileStore } from '@/stores/profile'
import { homeAttention } from '@/shell/attention'
import { setLocale } from '@/i18n'

let w: VueWrapper
let pinia: Pinia
let router: Router

beforeEach(async () => {
  pinia = createPinia()
  setActivePinia(pinia)
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  await router.push('/home')
  await router.isReady()
  api.list.mockResolvedValue({ data: [notif(), notif({ id: 'n2', title: 'Счёт оплачен', body: 'СЧ-12', isRead: true, caseId: null, reestrEntryId: 'r1' })] })
  api.getUnreadCount.mockResolvedValue({ data: { count: 1 } })
  api.markRead.mockResolvedValue({})
  api.markAllRead.mockResolvedValue({})
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
  localStorage.clear()
})

const mountIt = (c: Parameters<typeof mountWithI18n>[0], props: Record<string, unknown> = {}) =>
  mountWithI18n(c, { props, attachTo: document.body, global: { plugins: [pinia, router] } })
const settle = async () => { await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises() }
const dialog = () => document.body.querySelector('[role="dialog"]') as HTMLElement | null
const bodyButton = (text: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined
const menuItem = (text: string) =>
  [...document.body.querySelectorAll('[role="menuitem"]')].find((i) => i.textContent?.includes(text)) as HTMLElement | undefined

describe('NotificationsBell', () => {
  it('aria-label: без новых — «Уведомления», с новыми — число и красная точка', async () => {
    w = mountIt(NotificationsBell)
    const btn = w.get('button')
    expect(btn.attributes('aria-label')).toBe('Уведомления')
    expect(btn.find('[data-unread-dot]').exists()).toBe(false)
    useNotificationsStore().unreadCount = 1
    await flushPromises()
    expect(btn.attributes('aria-label')).toBe('Уведомления, новых: 1')
    expect(btn.find('[data-unread-dot]').exists()).toBe(true)
  })

  it('открытие загружает список; клик по уведомлению читает его, ведёт к заявке и закрывает окно', async () => {
    w = mountIt(NotificationsBell)
    await w.get('button').trigger('click')
    await settle()
    expect(api.list).toHaveBeenCalledTimes(1)
    const d = dialog()!
    expect(d.textContent).toContain('ДТ выпущена')
    expect(d.textContent).toContain('И40-182')
    expect(d.textContent).toMatch(/\d{2}\.10 \d{2}:40/)
    bodyButton('ДТ выпущена')!.click()
    await settle()
    expect(api.markRead).toHaveBeenCalledWith('n1')
    expect(router.currentRoute.value.fullPath).toBe('/import-40/c1')
    expect(dialog()).toBeNull()
  })

  it('прочитанное с привязкой к реестру — без markRead, переход на /reestr', async () => {
    w = mountIt(NotificationsBell)
    await w.get('button').trigger('click')
    await settle()
    bodyButton('Счёт оплачен')!.click()
    await settle()
    expect(api.markRead).not.toHaveBeenCalled()
    expect(router.currentRoute.value.fullPath).toBe('/reestr')
  })

  it('«Прочитать все» — только при непрочитанных; вызывает markAllRead и пропадает', async () => {
    w = mountIt(NotificationsBell)
    await w.get('button').trigger('click')
    await settle()
    bodyButton('Прочитать все')!.click()
    await settle()
    expect(api.markAllRead).toHaveBeenCalledTimes(1)
    expect(bodyButton('Прочитать все')).toBeUndefined()
    expect(useNotificationsStore().unreadCount).toBe(0)
  })

  it('пустой список — «Новых уведомлений нет»; ссылка «Все уведомления» ведёт на /notifications и закрывает окно', async () => {
    api.list.mockResolvedValue({ data: [] })
    w = mountIt(NotificationsBell)
    await w.get('button').trigger('click')
    await settle()
    expect(dialog()!.textContent).toContain('Новых уведомлений нет')
    expect(bodyButton('Прочитать все')).toBeUndefined()
    const all = dialog()!.querySelector('a[href="/notifications"]') as HTMLAnchorElement
    expect(all.textContent).toContain('Все уведомления')
    all.click()
    await settle()
    expect(router.currentRoute.value.fullPath).toBe('/notifications')
    expect(dialog()).toBeNull()
  })

  it('пока список грузится впервые — скелет', async () => {
    let resolve!: (v: unknown) => void
    api.list.mockReturnValue(new Promise((r) => { resolve = r }))
    w = mountIt(NotificationsBell)
    await w.get('button').trigger('click')
    await flushPromises()
    expect(dialog()!.querySelectorAll('[data-z-line]').length).toBeGreaterThan(0)
    resolve({ data: [notif()] })
    await settle()
    expect(dialog()!.querySelectorAll('[data-z-line]').length).toBe(0)
  })

  it('показывает не больше 8 уведомлений', async () => {
    api.list.mockResolvedValue({ data: Array.from({ length: 12 }, (_, i) => notif({ id: `n${i}`, title: `Событие ${i}` })) })
    w = mountIt(NotificationsBell)
    await w.get('button').trigger('click')
    await settle()
    expect(dialog()!.querySelectorAll('li').length).toBe(8)
  })
})

describe('UserMenu', () => {
  const openMenu = async () => {
    await w.get('button').trigger('keydown', { key: 'Enter' })
    await settle()
  }

  it('короткое имя из профиля на кнопке; в шапке меню — полное имя и роль', async () => {
    const auth = useAuthStore()
    auth.username = 'aigerim'
    auth.role = 'Import'
    auth.businessRoles = ['declarant']
    useProfileStore().profile = { userId: 'u1', username: 'aigerim', displayName: 'Айгерим Касымова', phone: null, companyName: null, innBin: null, role: 'Import' }
    w = mountIt(UserMenu)
    expect(w.get('button').text()).toContain('Айгерим К.')
    expect(w.get('button').text()).toContain('Меню пользователя')
    await openMenu()
    const menu = document.body.querySelector('[role="menu"]')!
    expect(menu.textContent).toContain('Айгерим Касымова')
    expect(menu.textContent).toContain('Брокер-декларант (импорт)')
  })

  it('без профиля — логин; у клиента строки роли нет', async () => {
    const auth = useAuthStore()
    auth.username = 'client1'
    auth.role = 'Client'
    w = mountIt(UserMenu)
    expect(w.get('button').text()).toContain('client1')
    await openMenu()
    const header = document.body.querySelector('[data-z-dropdown-header]')!
    expect(header.textContent?.trim()).toBe('client1')
  })

  it('compact — имя только для чтения с экрана', () => {
    useAuthStore().username = 'admin'
    w = mountIt(UserMenu, { compact: true })
    const name = w.get('[data-user-name]')
    expect(name.classes()).toContain('sr-only')
  })

  it('«Профиль» ведёт на /profile', async () => {
    useAuthStore().username = 'admin'
    w = mountIt(UserMenu)
    await openMenu()
    menuItem('Профиль')!.click()
    await settle()
    expect(router.currentRoute.value.fullPath).toBe('/profile')
  })

  it('«Выйти»: сброс уведомлений и бейджа, logout, переход на /login', async () => {
    const auth = useAuthStore()
    auth.username = 'admin'
    const logout = vi.spyOn(auth, 'logout').mockImplementation(() => {})
    const notifStore = useNotificationsStore()
    notifStore.unreadCount = 4
    homeAttention.value = 3
    w = mountIt(UserMenu)
    await openMenu()
    menuItem('Выйти')!.click()
    await settle()
    expect(logout).toHaveBeenCalledTimes(1)
    expect(homeAttention.value).toBeNull()
    expect(notifStore.unreadCount).toBe(0)
    expect(router.currentRoute.value.fullPath).toBe('/login')
  })
})

describe('LangMenu', () => {
  it('подпись — код текущего языка, aria-label — «Язык: Русский»; выбор вызывает setLocale', async () => {
    w = mountIt(LangMenu)
    const btn = w.get('button')
    expect(btn.text()).toBe('RU')
    expect(btn.attributes('aria-label')).toBe('Язык: Русский')
    await btn.trigger('keydown', { key: 'Enter' })
    await settle()
    expect([...document.body.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent?.trim())).toEqual(['Русский', 'Қазақша', 'English'])
    menuItem('English')!.click()
    await settle()
    expect(setLocale).toHaveBeenCalledWith('en')
  })
})
