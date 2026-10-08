import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Старые экраны — заглушки: проверяется только то, что обёртка лениво подгружает нужный экран для обеих ролей.
vi.mock('@/views/BillingView.vue', () => ({ __esModule: true, default: { render: () => h('div', { 'data-view': 'billing' }) } }))
vi.mock('@/views/Import40CompanyView.vue', () => ({ __esModule: true, default: { render: () => h('div', { 'data-view': 'company' }) } }))
vi.mock('@/views/TnvedTreeView.vue', () => ({ __esModule: true, default: { render: () => h('div', { 'data-view': 'tree' }) } }))
vi.mock('@/views/TnvedCurrenciesView.vue', () => ({ __esModule: true, default: { render: () => h('div', { 'data-view': 'currencies' }) } }))
vi.mock('@/views/client/ClientInvoicesView.vue', () => ({ __esModule: true, default: { render: () => h('div', { 'data-view': 'client-invoices' }) } }))
vi.mock('@/views/client/ClientCompanyView.vue', () => ({ __esModule: true, default: { render: () => h('div', { 'data-view': 'client-company' }) } }))

import BillingRoute from '../BillingRoute.vue'
import Import40CompanyRoute from '../Import40CompanyRoute.vue'
import TnvedTreeRoute from '../TnvedTreeRoute.vue'
import TnvedCurrenciesRoute from '../TnvedCurrenciesRoute.vue'
import { useAuthStore } from '@/stores/auth'

let w: VueWrapper
beforeEach(() => setActivePinia(createPinia()))
afterEach(() => w?.unmount())

// [обёртка, экран клиента, экран сотрудника]: пока клиентский экран не готов, обе роли видят прежний.
describe.each([
  ['BillingRoute', BillingRoute, 'client-invoices', 'billing'],
  ['Import40CompanyRoute', Import40CompanyRoute, 'client-company', 'company'],
  ['TnvedTreeRoute', TnvedTreeRoute, 'tree', 'tree'],
  ['TnvedCurrenciesRoute', TnvedCurrenciesRoute, 'currencies', 'currencies'],
])('%s', (_name, Comp, clientView, staffView) => {
  it.each([['Client', clientView], ['administrator', staffView]])('роль %s — экран %s', async (role, view) => {
    useAuthStore().role = role
    w = mount(Comp)
    await flushPromises()
    expect(w.find(`[data-view="${view}"]`).exists()).toBe(true)
  })
})
