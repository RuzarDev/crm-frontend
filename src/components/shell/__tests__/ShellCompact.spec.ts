import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'

vi.mock('@/api/notifications', () => ({
  notificationsApi: { list: vi.fn(async () => ({ data: [] })), getUnreadCount: vi.fn(async () => ({ data: { count: 0 } })) },
}))
vi.mock('@/api/profile', () => ({ profileApi: { get: vi.fn(async () => ({ data: null })) } }))

import ShellFrame from '@/components/shell/ShellFrame.vue'
import ShellSidebar from '@/components/shell/ShellSidebar.vue'
import { buildBrokerNav, type NavAccess } from '@/shell/navModel'

// Узкое меню из иконок (meta.shell: 'compact') — страница ДТ, как на доске волны 6.
let w: VueWrapper
let router: Router
const acc: NavAccess = {
  role: 'administrator', hasPermission: () => true, clientHasModule: () => true,
  canUseImport40: true, canUseSales: true, isFinanceOnly: false, registrationIncomplete: false,
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  const page = { template: '<div data-page />' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/import-40/:caseId/dt/:dtId', name: 'import-40-dt', component: page, meta: { shell: 'compact' } },
      { path: '/:p(.*)*', component: page },
    ],
  })
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
})

const mountAt = async (path: string) => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(ShellFrame, { props: { model: buildBrokerNav(acc) }, attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
}
const aside = () => w.get('aside')
const rootStyle = () => (w.get('[data-shell-root]').element as HTMLElement).style.getPropertyValue('--shell-header-h')

describe('ShellFrame: узкое меню', () => {
  it('на странице ДТ — меню из иконок, шапка оболочки не липнет', async () => {
    await mountAt('/import-40/c1/dt/d1')
    expect(aside().attributes('data-shell-compact')).toBeDefined()
    expect(aside().classes()).toContain('lg:w-16')
    expect(aside().find('nav[data-compact]').exists()).toBe(true)
    expect(w.get('header').classes()).not.toContain('sticky')
    // Липкая — своя шапка страницы (top: 0).
    expect(rootStyle()).toBe('0px')
  })

  it('на остальных страницах — обычное меню', async () => {
    await mountAt('/home')
    expect(aside().attributes('data-shell-compact')).toBeUndefined()
    expect(aside().find('nav[data-compact]').exists()).toBe(false)
    expect(w.get('header').classes()).toContain('sticky')
  })
})

describe('ShellSidebar compact', () => {
  const mountSidebar = (compact: boolean) => mountWithI18n(ShellSidebar, {
    props: { model: buildBrokerNav(acc), path: '/import-40/c1/dt/d1', attention: 2, compact },
    global: { plugins: [router] },
  })

  it('подписи пунктов — для чтения с экрана и в подсказке; активный раздел подсвечен', () => {
    w = mountSidebar(true)
    const current = w.get('a[aria-current="page"]')
    expect(current.attributes('title')).toBe('Заявки')
    expect(current.get('span.sr-only').text()).toBe('Заявки')
    // Поиск — кнопка-иконка с именем; слово логотипа скрыто визуально.
    const search = w.get('button[aria-label="Поиск"]')
    expect(search.text()).toBe('')
    expect(w.get('[data-shell-logo]').find('.sr-only').text()).toBe('ZIRCON')
  })

  it('без compact — подписи видны', () => {
    w = mountSidebar(false)
    const current = w.get('a[aria-current="page"]')
    expect(current.attributes('title')).toBeUndefined()
    expect(current.find('span.sr-only').exists()).toBe(false)
  })
})
