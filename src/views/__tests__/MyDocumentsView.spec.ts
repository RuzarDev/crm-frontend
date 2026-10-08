import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'

const api = vi.hoisted(() => ({ listMyDocuments: vi.fn(), getById: vi.fn(), downloadDocument: vi.fn() }))
vi.mock('@/api/reestr', () => ({ reestrApi: api }))

import MyDocumentsView from '../MyDocumentsView.vue'

// AntD-обёртки экрана — заглушки: проверяется только переход «Декларация» на страницу записи.
const pass = { template: '<div><slot /></div>' }
const stubs = {
  'a-card': pass, 'a-space': pass, 'a-input': pass, 'a-select': pass, PageHeader: pass, ReestrStatusCell: pass, SearchOutlined: pass,
  'a-button': { emits: ['click'], template: '<button type="button" @click="$emit(\'click\')"><slot /></button>' },
}

let w: VueWrapper
let router: Router
beforeEach(() => {
  setActivePinia(createPinia())
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  api.listMyDocuments.mockResolvedValue({
    items: [{
      id: 'd1', reestrEntryId: 'r1', container: 'DRYU9953726', reestrStatus: 1, section: 'client', originalFileName: 'invoice.pdf',
      sizeBytes: 2048, createdAtUtc: '2026-10-01T08:00:00Z',
    }],
    totalCount: 1, page: 1, pageSize: 20,
  })
})
afterEach(() => {
  w?.unmount()
  vi.clearAllMocks()
})

describe('MyDocumentsView', () => {
  it('«Декларация» открывает страницу записи с возвратом в «Мои документы», без окна и без загрузки записи', async () => {
    await router.push('/my-documents')
    w = mountWithI18n(MyDocumentsView, { global: { plugins: [router], stubs } })
    await flushPromises()
    const btn = w.findAll('button').find((b) => b.text() === 'Декларация')!
    await btn.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/reestr/r1?from=my-documents')
    expect(api.getById).not.toHaveBeenCalled()
  })
})
