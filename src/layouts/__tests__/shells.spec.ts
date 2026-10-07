import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { computed, defineComponent, h, ref } from 'vue'
import { mountWithI18n } from '@/test/mountWithI18n'

const notifApi = vi.hoisted(() => ({
  list: vi.fn(),
  getUnreadCount: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
}))
vi.mock('@/api/notifications', () => ({ notificationsApi: notifApi }))
const profileGet = vi.hoisted(() => vi.fn())
vi.mock('@/api/profile', () => ({ profileApi: { get: profileGet, update: vi.fn() } }))

// Регистрация клиента — состояние задаёт тест; по умолчанию завершена.
const reg = vi.hoisted(() => ({
  state: { isClient: true, loaded: true, complete: true, nextStep: null as null | 'profile' | 'contract' | 'poa', doneCount: 3, needNew: null as string | null },
  refresh: vi.fn(),
}))
vi.mock('@/composables/useClientRegistration', () => ({
  useClientRegistration: () => {
    const s = ref({ ...reg.state })
    return {
      isClient: computed(() => s.value.isClient),
      loaded: computed(() => s.value.loaded),
      complete: computed(() => s.value.complete),
      nextStep: computed(() => s.value.nextStep),
      doneCount: computed(() => s.value.doneCount),
      needNew: computed(() => s.value.needNew),
      refresh: reg.refresh,
    }
  },
}))

import AppShell from '@/layouts/AppShell.vue'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import { useProfileStore } from '@/stores/profile'

let w: VueWrapper | undefined
let pinia: Pinia
let router: Router

const page = { template: '<p>page</p>' }
// Карточка ДТ, как настоящая, читает dtId один раз при создании: без :key у router-view переход на другую ДТ
// оставил бы старый экземпляр со старым номером.
const dtCreated: string[] = []
const DtStub = defineComponent({
  setup() {
    const id = String(router.currentRoute.value.params.dtId)
    dtCreated.push(id)
    return () => h('p', `dt ${id}`)
  },
})

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/home', component: page },
      { path: '/billing', component: page },
      { path: '/login', component: page },
      { path: '/import-40/company', component: page },
      { path: '/import-40/:caseId/dt/:dtId', name: 'import-40-dt', component: DtStub },
      { path: '/:p(.*)*', component: page },
    ],
  })
  notifApi.list.mockResolvedValue({ data: [] })
  notifApi.getUnreadCount.mockResolvedValue({ data: { count: 0 } })
  profileGet.mockResolvedValue({ data: { displayName: 'Айгерим Касымова' } })
  reg.refresh.mockResolvedValue(undefined)
  reg.state = { isClient: true, loaded: true, complete: true, nextStep: null, doneCount: 3, needNew: null }
  dtCreated.length = 0
})
afterEach(() => {
  w?.unmount()
  w = undefined
  document.body.innerHTML = ''
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

const mountAs = async (role: string, path: string) => {
  useAuthStore().role = role
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(AppShell, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
  return w
}
const link = (text: string) => w!.findAll('a').find((a) => a.text().trim() === text)
const header = () => w!.get('header')

describe('оболочки', () => {
  it('администратор — оболочка брокера: «Настройки» есть, «Мои поставки» нет, плотная раскладка', async () => {
    await mountAs('administrator', '/home')
    expect(link('Настройки')).toBeTruthy()
    expect(link('Мои поставки')).toBeUndefined()
    expect(w!.get('[data-density]').attributes('data-density')).toBe('compact')
    expect(w!.get('main#main').text()).toContain('page')
  })

  it('клиент — кабинет клиента: «Мои поставки» есть, «Настройки» нет, просторная раскладка', async () => {
    await mountAs('client', '/home')
    expect(link('Мои поставки')).toBeTruthy()
    expect(link('Настройки')).toBeUndefined()
    expect(w!.get('[data-density]').attributes('data-density')).toBe('comfortable')
  })

  it('на /billing у администратора в шапке — вкладки раздела «Обзор» и «Счета и акты»', async () => {
    await mountAs('administrator', '/billing')
    const tabs = header().findAll('nav a').map((a) => a.text().trim())
    expect(tabs).toEqual(['Обзор', 'Счета и акты'])
    expect(header().get('a[aria-current="page"]').text().trim()).toBe('Счета и акты')
  })

  it('на /home в шапке — сегодняшняя дата с заглавной буквы, вкладок нет', async () => {
    await mountAs('administrator', '/home')
    const date = header().findAll('span').find((s) => /\d/.test(s.text()) && s.classes().includes('text-muted'))
    expect(date).toBeTruthy()
    expect(date!.text()).toMatch(/^[А-ЯЁ]/)
    expect(header().find('nav').exists()).toBe(false)
  })

  it('опрос уведомлений — с монтирования до размонтирования', async () => {
    const store = useNotificationsStore()
    const start = vi.spyOn(store, 'startPolling')
    const stop = vi.spyOn(store, 'stopPolling')
    await mountAs('administrator', '/home')
    expect(start).toHaveBeenCalledTimes(1)
    expect(stop).not.toHaveBeenCalled()
    w!.unmount()
    w = undefined
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('имя для шапки — из профиля, тихой загрузкой; уже загруженный профиль не перезапрашивается', async () => {
    await mountAs('administrator', '/home')
    expect(profileGet).toHaveBeenCalledWith({ silent: true })
    expect(useProfileStore().profile?.displayName).toBe('Айгерим Касымова')
    expect(w!.get('[data-user-name]').text()).toBe('Айгерим К.')
    w!.unmount()
    w = undefined
    profileGet.mockClear()
    w = mountWithI18n(AppShell, { attachTo: document.body, global: { plugins: [pinia, router] } })
    await flushPromises()
    expect(profileGet).not.toHaveBeenCalled()
  })

  it('⌘K открывает палитру; после размонтирования горячая клавиша снята', async () => {
    await mountAs('administrator', '/home')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: true }))
    await flushPromises()
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: true }))
    await flushPromises()
    w!.unmount()
    w = undefined
    document.body.innerHTML = ''
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: true }))
    await flushPromises()
    const { useCommandPalette } = await import('@/shell/useCommandPalette')
    expect(useCommandPalette().open.value).toBe(false)
  })

  it('карточка ДТ пересоздаётся при переходе на другую ДТ', async () => {
    await mountAs('administrator', '/import-40/c1/dt/d1')
    expect(w!.get('main#main').text()).toContain('dt d1')
    await router.push('/import-40/c1/dt/d2')
    await flushPromises()
    expect(dtCreated).toEqual(['d1', 'd2'])
    expect(w!.get('main#main').text()).toContain('dt d2')
  })

  it('«К содержимому» — первая ссылка в оболочке, переводит фокус в main без смены адреса', async () => {
    await mountAs('administrator', '/billing')
    const skip = w!.get('a')
    expect(skip.text()).toBe('К содержимому')
    expect(skip.attributes('href')).toBe('#main')
    await skip.trigger('click')
    expect(document.activeElement).toBe(w!.get('main#main').element)
    expect(router.currentRoute.value.fullPath).toBe('/billing')
  })

  it.each(['Client', ' client '])('роль %j — кабинет клиента', async (role) => {
    await mountAs(role, '/home')
    expect(link('Мои поставки')).toBeTruthy()
    expect(w!.get('[data-density]').attributes('data-density')).toBe('comfortable')
  })

  it('выход сбрасывает профиль: следующий пользователь в этой вкладке видит своё имя', async () => {
    await mountAs('administrator', '/home')
    expect(w!.get('[data-user-name]').text()).toBe('Айгерим К.')
    await w!.get('[data-user-name]').element.closest('button')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    await new Promise((r) => setTimeout(r, 0))
    const logout = [...document.body.querySelectorAll('[role="menuitem"]')].find((i) => i.textContent?.includes('Выйти')) as HTMLElement
    logout.click()
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/login')
    expect(useProfileStore().profile).toBeNull()
    w!.unmount()
    w = undefined

    // Вход второго пользователя — SPA-переход, сторы те же.
    profileGet.mockClear()
    profileGet.mockResolvedValue({ data: { displayName: 'Бауыржан Сейтказы' } })
    const auth = useAuthStore()
    auth.username = 'b'
    await mountAs('administrator', '/home')
    expect(profileGet).toHaveBeenCalledWith({ silent: true })
    expect(w!.get('[data-user-name]').text()).toBe('Бауыржан С.')
  })

  it('ящик меню ниже lg: кнопка «Меню» открывает, переход по пункту закрывает', async () => {
    await mountAs('administrator', '/home')
    const btn = w!.get('button[aria-label="Меню"]')
    expect(btn.attributes('aria-expanded')).toBe('false')
    await btn.trigger('click')
    await flushPromises()
    const dlg = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dlg).not.toBeNull()
    expect(btn.attributes('aria-expanded')).toBe('true')
    const item = [...dlg.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'Настройки')!
    item.click()
    await flushPromises()
    expect(router.currentRoute.value.path).not.toBe('/home')
    expect(btn.attributes('aria-expanded')).toBe('false')
  })
})

describe('кабинет клиента — регистрация', () => {
  it('незавершённая регистрация: плашка «Продолжить регистрацию» ведёт на шаг', async () => {
    reg.state = { isClient: true, loaded: true, complete: false, nextStep: 'contract', doneCount: 1, needNew: 'poa' }
    sessionStorage.setItem('zircon-reg-redirect', '1')
    await mountAs('client', '/billing')
    expect(reg.refresh).toHaveBeenCalled()
    const banner = w!.get('[role="region"]')
    expect(banner.text()).toContain('Сделано шагов: 1 из 3. Следующий шаг — договор.')
    await banner.get('button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/import-40/company?step=poa')
    // На самой странице регистрации плашки нет.
    expect(w!.find('[role="region"]').exists()).toBe(false)
  })

  it('ждём AQNIET — информационная плашка без действия', async () => {
    reg.state = { isClient: true, loaded: true, complete: false, nextStep: null, doneCount: 2, needNew: null }
    await mountAs('client', '/home')
    expect(w!.get('[role="status"]').text()).toContain('Договор на подписи у AQNIET')
  })

  it('первый заход с /home — один раз на шаги регистрации', async () => {
    reg.state = { isClient: true, loaded: true, complete: false, nextStep: 'profile', doneCount: 0, needNew: null }
    await mountAs('client', '/home')
    expect(router.currentRoute.value.path).toBe('/import-40/company')
    expect(sessionStorage.getItem('zircon-reg-redirect')).toBe('1')
    w!.unmount()
    w = undefined
    await router.push('/home')
    w = mountWithI18n(AppShell, { attachTo: document.body, global: { plugins: [pinia, router] } })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/home')
  })

  it('состояние регистрации не загрузилось — зарегистрированного клиента с /home не уводим', async () => {
    reg.state = { isClient: true, loaded: false, complete: false, nextStep: 'profile', doneCount: 0, needNew: null }
    await mountAs('client', '/home')
    expect(router.currentRoute.value.path).toBe('/home')
    expect(sessionStorage.getItem('zircon-reg-redirect')).toBeNull()
    expect(w!.find('[role="region"]').exists()).toBe(false)
  })

  it('уход со страницы регистрации перечитывает состояние', async () => {
    sessionStorage.setItem('zircon-reg-redirect', '1')
    await mountAs('client', '/import-40/company')
    reg.refresh.mockClear()
    await router.push('/billing')
    await flushPromises()
    expect(reg.refresh).toHaveBeenCalledTimes(1)
  })
})
