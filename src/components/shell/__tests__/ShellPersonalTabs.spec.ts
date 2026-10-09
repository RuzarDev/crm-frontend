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
import { buildBrokerNav } from '@/shell/navModel'
import { useAuthStore } from '@/stores/auth'

let w: VueWrapper
let router: Router

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
})

const model = () => buildBrokerNav({
  role: 'importer', hasPermission: () => false, clientHasModule: () => false,
  canUseImport40: false, canUseSales: false, isFinanceOnly: false, registrationIncomplete: false,
})
const mountAt = async (path: string) => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(ShellFrame, { props: { model: model() }, attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
}
const tabs = () => w.findAll('header nav a').map((a) => a.text())

describe('Вкладки личного раздела', () => {
  it('«Профиль · Уведомления» — две вкладки', async () => {
    await mountAt('/profile')
    expect(tabs()).toEqual(['Профиль', 'Уведомления'])
  })

  it('временный пароль: вкладок нет — «Уведомления» закрыты до смены', async () => {
    useAuthStore().setMustChangePassword(true)
    await mountAt('/profile?tab=password')
    expect(tabs()).toEqual([])
  })
})
