import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Обе ветки — заглушки: настоящие экраны тянут API и роутер, а здесь проверяется только выбор по роли.
// __esModule — чтобы defineAsyncComponent взял default, а не трогал прокси мока чужими ключами.
vi.mock('@/views/client/ClientShipmentsView.vue', () => ({ __esModule: true, default: { render: () => h('div', { 'data-view': 'client' }) } }))
vi.mock('@/views/broker/requests/BrokerRequestsView.vue', () => ({ __esModule: true, default: { render: () => h('div', { 'data-view': 'staff' }) } }))

import Import40Route from '../Import40Route.vue'
import { useAuthStore } from '@/stores/auth'

let w: VueWrapper
beforeEach(() => setActivePinia(createPinia()))
afterEach(() => w?.unmount())

const mountAs = async (role: string) => {
  useAuthStore().role = role
  w = mount(Import40Route)
  await flushPromises()
}

describe('Import40Route', () => {
  it('клиенту — «Мои поставки»', async () => {
    await mountAs('Client')
    expect(w.find('[data-view="client"]').exists()).toBe(true)
    expect(w.find('[data-view="staff"]').exists()).toBe(false)
  })
  it.each(['administrator', 'declarant'])('сотруднику (%s) — список заявок', async (role) => {
    await mountAs(role)
    expect(w.find('[data-view="staff"]').exists()).toBe(true)
    expect(w.find('[data-view="client"]').exists()).toBe(false)
  })
})
