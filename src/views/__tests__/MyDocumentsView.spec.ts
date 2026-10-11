import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'

const api = vi.hoisted(() => ({ listMyDocuments: vi.fn(), getById: vi.fn(), downloadDocument: vi.fn() }))
vi.mock('@/api/reestr', () => ({ reestrApi: api }))
const saveBlob = vi.hoisted(() => vi.fn())
vi.mock('@/ui/download', () => ({ saveBlob }))

import MyDocumentsView from '../MyDocumentsView.vue'

const row = (over: Record<string, unknown> = {}) => ({
  id: 'd1', reestrEntryId: 'r1', container: 'DRYU9953726', reestrStatus: 2, section: 'client', originalFileName: 'invoice.pdf',
  sizeBytes: 2048, createdAtUtc: '2026-10-01T08:00:00Z', ...over,
})

let w: VueWrapper
let router: Router
const mountView = async () => {
  await router.push('/my-documents')
  w = mountWithI18n(MyDocumentsView, { global: { plugins: [router] } })
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  api.listMyDocuments.mockResolvedValue({ items: [row()], totalCount: 1, page: 1, pageSize: 25 })
})
afterEach(() => {
  w?.unmount()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('MyDocumentsView', () => {
  it('загружает первую страницу и показывает строку: статус, раздел, размер, дату', async () => {
    await mountView()
    expect(api.listMyDocuments).toHaveBeenCalledWith({ page: 1, pageSize: 25, section: null, search: undefined })
    const text = w.get('[data-my-docs-table]').text()
    expect(text).toContain('DRYU9953726')
    expect(text).toContain('invoice.pdf')
    expect(text).toContain('Выпущено')
    expect(text).toContain('Клиент')
    expect(text).toContain('2.0 КБ')
    expect(text).toContain('01.10.2026')
  })

  it('«Декларация» открывает страницу записи с возвратом в «Мои документы», без окна и без загрузки записи', async () => {
    await mountView()
    await w.get('[data-my-doc-declaration]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/reestr/r1?from=my-documents')
    expect(api.getById).not.toHaveBeenCalled()
  })

  it('«Скачать» берёт файл записи и отдаёт его браузеру под исходным именем', async () => {
    const blob = new Blob(['x'])
    api.downloadDocument.mockResolvedValue(blob)
    await mountView()
    await w.get('[data-my-doc-download]').trigger('click')
    await flushPromises()
    expect(api.downloadDocument).toHaveBeenCalledWith('r1', 'd1')
    expect(saveBlob).toHaveBeenCalledWith(blob, 'invoice.pdf')
  })

  it('поиск уходит на сервер после паузы ввода и сбрасывает страницу на первую', async () => {
    vi.useFakeTimers()
    await mountView()
    api.listMyDocuments.mockClear()
    const input = w.get('[data-my-docs-search]')
    await input.setValue('DRYU')
    expect(api.listMyDocuments).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(350)
    await flushPromises()
    expect(api.listMyDocuments).toHaveBeenCalledTimes(1)
    expect(api.listMyDocuments).toHaveBeenCalledWith({ page: 1, pageSize: 25, section: null, search: 'DRYU' })
  })

  it('страницы серверные: «следующая» запрашивает вторую страницу с теми же фильтрами', async () => {
    api.listMyDocuments.mockResolvedValue({ items: [row()], totalCount: 60, page: 1, pageSize: 25 })
    await mountView()
    api.listMyDocuments.mockClear()
    api.listMyDocuments.mockResolvedValue({ items: [row({ id: 'd2' })], totalCount: 60, page: 2, pageSize: 25 })
    await w.get('nav button[aria-label="Следующая страница"]').trigger('click')
    await flushPromises()
    expect(api.listMyDocuments).toHaveBeenCalledWith({ page: 2, pageSize: 25, section: null, search: undefined })
  })

  it('пустой ответ сервера и сбой запроса дают пустую таблицу, а не ошибку', async () => {
    api.listMyDocuments.mockRejectedValue(new Error('boom'))
    await mountView()
    expect(w.findAll('tbody tr [data-my-doc-download]')).toHaveLength(0)
  })
})
