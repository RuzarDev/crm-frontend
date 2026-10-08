import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Обе ветки — заглушки: здесь проверяется только выбор карточки по роли (см. Import40Route.spec).
vi.mock('@/views/client/ClientShipmentView.vue', () => ({ __esModule: true, default: { render: () => h('div', { 'data-view': 'client' }) } }))
vi.mock('@/views/Import40CaseView.vue', () => ({ __esModule: true, default: { render: () => h('div', { 'data-view': 'staff' }) } }))

import Import40CaseRoute from '../Import40CaseRoute.vue'
import { useAuthStore } from '@/stores/auth'

let w: VueWrapper
beforeEach(() => setActivePinia(createPinia()))
afterEach(() => w?.unmount())

const mountAs = async (role: string) => {
  useAuthStore().role = role
  w = mount(Import40CaseRoute)
  await flushPromises()
}

describe('Import40CaseRoute', () => {
  it('клиенту — карточка поставки', async () => {
    await mountAs('Client')
    expect(w.find('[data-view="client"]').exists()).toBe(true)
    expect(w.find('[data-view="staff"]').exists()).toBe(false)
  })
  it.each(['administrator', 'declarant'])('сотруднику (%s) — карточка заявки', async (role) => {
    await mountAs(role)
    expect(w.find('[data-view="staff"]').exists()).toBe(true)
    expect(w.find('[data-view="client"]').exists()).toBe(false)
  })
})
