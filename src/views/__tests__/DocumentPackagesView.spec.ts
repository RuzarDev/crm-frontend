import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { DocumentPackageDto } from '@/types/api'

const api = vi.hoisted(() => ({
  list: vi.fn(), getById: vi.fn(), create: vi.fn(), uploadFile: vi.fn(), changeStatus: vi.fn(), clients: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/documentPackages', () => ({
  documentPackagesApi: { list: api.list, getById: api.getById, create: api.create, uploadFile: api.uploadFile, changeStatus: api.changeStatus },
}))
vi.mock('@/api/reestr', () => ({ reestrApi: { listPortfolioClients: api.clients } }))
vi.mock('@/ui/message', () => ({ message: api.toast }))

import DocumentPackagesView from '../DocumentPackagesView.vue'
import { useAuthStore } from '@/stores/auth'

const pkg = (o: Partial<DocumentPackageDto> = {}): DocumentPackageDto => ({
  id: 'p1', trainNumber: '2457', comment: null, status: 'accepted', createdByExpeditorId: 'e1', createdByExpeditorUsername: 'exp',
  createdAtUtc: '2026-10-08T04:14:00Z', updatedAtUtc: '2026-10-08T04:14:00Z', reviewedByUserId: null, reviewedAtUtc: null,
  reviewComment: 'нет веса брутто', files: [], containers: [],
  ...o,
})

let w: VueWrapper
// Внутренности <script setup> — через vm: экран на AntD, кликать по меню в jsdom нечем.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vm = () => w.vm as any

beforeEach(async () => {
  // AntD (a-table/a-drawer) следит за шириной окна через matchMedia — в jsdom его нет.
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  // jsdom не реализует getComputedStyle с псевдоэлементом, который просит a-table, — отвечаем без него.
  const computed = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => computed(el))
  setActivePinia(createPinia())
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  api.list.mockResolvedValue({ items: [pkg()], totalCount: 1 })
  api.getById.mockResolvedValue(pkg())
  api.clients.mockResolvedValue([])
  api.changeStatus.mockResolvedValue(pkg({ status: 'processed' }))
  const auth = useAuthStore()
  auth.role = 'importer'
  auth.permissions = ['reestr.read', 'packages.manage']
  w = mountWithI18n(DocumentPackagesView, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
})
afterEach(() => {
  w.unmount()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('DocumentPackagesView — правки по аудиту волны 3а', () => {
  it('проверяющий с packages.manage может загружать на принятом пакете (как на сервере)', async () => {
    vm().selectedPackage = pkg({ status: 'accepted' })
    await flushPromises()
    expect(vm().canUploadToSelected).toBe(true)
  })

  it('экспедитор без packages.manage на принятом пакете загружать не может', async () => {
    const auth = useAuthStore()
    auth.role = 'expeditor'
    auth.permissions = ['reestr.read']
    vm().selectedPackage = pkg({ status: 'accepted' })
    await flushPromises()
    expect(vm().canUploadToSelected).toBe(false)
  })

  it('смена статуса из списка не стирает комментарий проверки', async () => {
    await vm().updateStatus(pkg({ reviewComment: 'нет веса брутто' }), 'processed')
    expect(api.changeStatus).toHaveBeenCalledWith('p1', { status: 'processed', reviewComment: 'нет веса брутто' })
  })
})
