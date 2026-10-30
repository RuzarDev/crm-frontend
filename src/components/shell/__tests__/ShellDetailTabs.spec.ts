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
import { buildBrokerNav, type NavAccess } from '@/shell/navModel'

// 30.10.2026, аудит S-1/S-5: на вложенных страницах (карточка клиента, заявка) вкладки раздела в шапке не рисуются —
// «Документы» не выдают себя за вкладку карточки; «Компания клиента» из карточки (?client=) — раздел «Клиенты».
let w: VueWrapper
let router: Router
const acc: NavAccess = {
  role: 'administrator', hasPermission: () => true, clientHasModule: () => true,
  canUseImport40: true, canUseSales: true, isFinanceOnly: false, registrationIncomplete: false,
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }] })
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
const headerTabs = () => w.get('header').findAll('nav a').map((a) => a.attributes('href'))
const activeSidebar = () => w.get('aside').findAll('a[aria-current="page"]').map((a) => a.attributes('href'))

describe('ShellFrame: вкладки раздела на вложенных страницах', () => {
  it('список «Клиенты» — вкладки «Клиенты · Документы»; карточка клиента — без них, «Клиенты» в меню горит', async () => {
    await mountAt('/clients')
    expect(headerTabs()).toEqual(['/clients', '/client-documents'])
    w.unmount()
    await mountAt('/clients/c1?tab=docs')
    expect(headerTabs()).toEqual([])
    expect(activeSidebar()).toEqual(['/clients'])
  })

  it('заявка — без вкладок «Заявки · Распределение»', async () => {
    await mountAt('/import-40/c1')
    expect(headerTabs()).toEqual([])
    expect(activeSidebar()).toEqual(['/import-40'])
  })

  it('«Компания клиента» с ?client= — горит «Клиенты», а не «Заявки»; без ?client= — «Заявки»', async () => {
    await mountAt('/import-40/company?client=c1')
    expect(activeSidebar()).toEqual(['/clients'])
    expect(headerTabs()).toEqual([])
    w.unmount()
    await mountAt('/import-40/company')
    expect(activeSidebar()).toEqual(['/import-40'])
  })
})
