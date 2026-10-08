import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import dayjs from 'dayjs'
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
    expect(d.textContent).toContain(dayjs('2026-10-08T05:40:00Z').format('DD.MM HH:mm'))
    bodyButton('ДТ выпущена')!.click()
    await settle()
    expect(api.markRead).toHaveBeenCalledWith('n1')
    expect(router.currentRoute.value.fullPath).toBe('/import-40/c1')
    expect(dialog()).toBeNull()
  })

  it('финансист: уведомление по заявке ведёт в «Счета и акты» этой заявки', async () => {
    const auth = useAuthStore()
    auth.role = 'accountant'
    auth.permissions = ['finance.read']
    expect(auth.isFinanceOnly).toBe(true)
    w = mountIt(NotificationsBell)
    await w.get('button').trigger('click')
    await settle()
    bodyButton('ДТ выпущена')!.click()
    await settle()
    expect(router.currentRoute.value.fullPath).toBe('/billing?caseId=c1')
  })

  it('markRead упал — переход к заявке всё равно выполняется', async () => {
    api.markRead.mockRejectedValue(new Error('network'))
    w = mountIt(NotificationsBell)
    await w.get('button').trigger('click')
    await settle()
    bodyButton('ДТ выпущена')!.click()
    await settle()
    expect(api.markRead).toHaveBeenCalledWith('n1')
    expect(router.currentRoute.value.fullPath).toBe('/import-40/c1')
  })

  it('фокус при открытии — на окне, а не на ссылке «Все уведомления» (и пока грузится, и после)', async () => {
    let resolve!: (v: unknown) => void
    api.list.mockReturnValue(new Promise((r) => { resolve = r }))
    w = mountIt(NotificationsBell)
    ;(w.get('button').element as HTMLElement).focus()
    await w.get('button').trigger('click')
    await settle()
    expect(document.activeElement).toBe(dialog())
    expect((document.activeElement as HTMLElement).matches('a[href="/notifications"]')).toBe(false)
    resolve({ data: [notif()] })
    await settle()
    expect(document.activeElement).toBe(dialog())
  })

  it('ошибка загрузки: причина и «Повторить» вместо «пусто»; повтор загружает список', async () => {
    api.list.mockRejectedValueOnce(new Error('network'))
    w = mountIt(NotificationsBell)
    await w.get('button').trigger('click')
    await settle()
    const d = dialog()!
    expect(d.querySelector('[role="alert"]')?.textContent).toContain('Не удалось загрузить уведомления')
    expect(d.textContent).not.toContain('Новых уведомлений нет')
    expect(d.querySelectorAll('[data-z-line]').length).toBe(0)
    const retry = bodyButton('Повторить')!
    retry.focus()
    retry.click()
    await settle()
    expect(api.list).toHaveBeenCalledTimes(2)
    expect(dialog()!.querySelector('[role="alert"]')).toBeNull()
    expect(dialog()!.textContent).toContain('ДТ выпущена')
    // кнопка пропала — фокус на первом уведомлении, а не в никуда
    expect(document.activeElement?.textContent).toContain('ДТ выпущена')
  })

  it('ошибка загрузки при пустом ответе раньше — после успешного повтора пустой список показывает «нет уведомлений»', async () => {
    api.list.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ data: [] })
    w = mountIt(NotificationsBell)
    await w.get('button').trigger('click')
    await settle()
    expect(bodyButton('Повторить')).toBeDefined()
    bodyButton('Повторить')!.click()
    await settle()
    expect(dialog()!.textContent).toContain('Новых уведомлений нет')
    expect(bodyButton('Повторить')).toBeUndefined()
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

describe('useNotificationsStore.loadError', () => {
  it('ошибка fetch ставит флаг (без исключения наружу), успех и reset снимают', async () => {
    const st = useNotificationsStore()
    api.list.mockRejectedValueOnce(new Error('network'))
    await expect(st.fetch()).resolves.toBeUndefined()
    expect(st.loadError).toBe(true)
    expect(st.loading).toBe(false)
    await st.fetch()
    expect(st.loadError).toBe(false)
    expect(st.items).toHaveLength(2)
    api.list.mockRejectedValueOnce(new Error('network'))
    await st.fetch()
    expect(st.loadError).toBe(true)
    expect(st.items).toHaveLength(2) // прежний список не стирается
    st.reset()
    expect(st.loadError).toBe(false)
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
    useProfileStore().profile = { userId: 'u1', username: 'admin', displayName: 'Айгерим Касымова', phone: null, companyName: null, innBin: null, role: 'Import' }
    w = mountIt(UserMenu)
    await openMenu()
    menuItem('Выйти')!.click()
    await settle()
    expect(logout).toHaveBeenCalledTimes(1)
    expect(homeAttention.value).toBeNull()
    expect(notifStore.unreadCount).toBe(0)
    expect(useProfileStore().profile).toBeNull()
    expect(router.currentRoute.value.fullPath).toBe('/login')
  })
})

describe('LangMenu', () => {
  it('подпись — код текущего языка, aria-label с тем же кодом — «Язык: Русский (RU)»; выбор вызывает setLocale', async () => {
    w = mountIt(LangMenu)
    const btn = w.get('button')
    expect(btn.text()).toBe('RU')
    expect(btn.attributes('aria-label')).toBe('Язык: Русский (RU)')
    expect(btn.attributes('aria-label')).toContain(btn.text())
    await btn.trigger('keydown', { key: 'Enter' })
    await settle()
    const items = [...document.body.querySelectorAll('[role="menuitem"]')]
    expect(items.map((i) => i.textContent?.trim())).toEqual(['Русский', 'Қазақша', 'English'])
    // Текущий язык отмечен галочкой (svg), у остальных — пустое место того же размера.
    expect(items.map((i) => !!i.querySelector('svg'))).toEqual([true, false, false])
    expect(items[1].firstElementChild?.tagName).toBe('SPAN')
    expect(items[1].firstElementChild?.getAttribute('class')).toContain('size-4')
    menuItem('English')!.click()
    await settle()
    expect(setLocale).toHaveBeenCalledWith('en')
  })
})
