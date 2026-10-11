import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/keden', async (orig) => ({ ...(await orig<typeof import('@/api/keden')>()), kedenApi: api }))

import KedenView from '../KedenView.vue'

const dto = (over: Record<string, unknown> = {}) => ({
  id: 'x1', kedenId: 'KID-77', declarationType: 'TD', registrationNumber: '60900/101026/0000123', shortName: null,
  referenceCode: 'REF-1', statusCode: 'RELEASED', statusName: 'Выпущена', statusDateTimeUtc: '2026-10-02T10:00:00Z',
  registeredDateTimeUtc: '2026-10-01T09:30:00Z', declarantXin: '123456789012', declarantName: 'ТОО Тест', customsPost: 'Пост 1',
  raw: { a: 1 }, syncedAtUtc: '2026-10-03T11:00:00Z', ...over,
})

let w: VueWrapper
let router: Router
const mountView = async () => {
  await router.push('/keden/KID-77')
  w = mountWithI18n(KedenView, { global: { plugins: [router] } })
}

beforeEach(() => {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/keden/:id', component: { template: '<div/>' } }, { path: '/keden', component: { template: '<div/>' } }],
  })
  api.get.mockResolvedValue(dto())
})
afterEach(() => {
  w?.unmount()
  vi.clearAllMocks()
})

describe('KedenView', () => {
  it('показывает скелет, пока декларация грузится, затем карточку', async () => {
    let resolve!: (v: unknown) => void
    api.get.mockReturnValue(new Promise((r) => { resolve = r }))
    await mountView()
    expect(w.find('[data-keden-skeleton]').exists()).toBe(true)
    expect(w.find('[data-keden-card]').exists()).toBe(false)
    resolve(dto())
    await flushPromises()
    expect(api.get).toHaveBeenCalledWith('KID-77')
    expect(w.find('[data-keden-skeleton]').exists()).toBe(false)
    expect(w.get('[data-keden-card]').text()).toContain('60900/101026/0000123')
    expect(w.get('[data-keden-card]').text()).toContain('Транзитная декларация')
    expect(w.get('[data-keden-card]').text()).toContain('ТОО Тест')
    expect(w.get('[data-keden-status]').text()).toBe('Выпущена')
    expect(w.get('[data-keden-raw]').text()).toContain('"a": 1')
  })

  it('«Обновить» перечитывает декларацию', async () => {
    await mountView()
    await flushPromises()
    api.get.mockResolvedValue(dto({ statusName: 'Принята', statusCode: 'ACCEPTED' }))
    await w.get('[data-keden-reload]').trigger('click')
    await flushPromises()
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(w.get('[data-keden-status]').text()).toBe('Принята')
  })

  it('«К списку» ведёт в /keden', async () => {
    await mountView()
    await flushPromises()
    await w.get('[data-keden-back]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/keden')
  })

  it('без номера регистрации заголовок — ID в КЕДЕН; пустые поля — прочерк', async () => {
    api.get.mockResolvedValue(dto({ registrationNumber: null, declarantName: null }))
    await mountView()
    await flushPromises()
    expect(w.get('h1').text()).toBe('KID-77')
    expect(w.get('[data-keden-card]').text()).toContain('—')
  })
})
