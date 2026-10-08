import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import { pkg } from '@/views/broker/packages/partia/__tests__/packageFixture'

// Прежний экран «Разбор поезда» (AntD) — исправления, пока на маршруте он (редизайн, волна 4в, Task 2).
const api = vi.hoisted(() => ({
  getById: vi.fn(), linkFile: vi.fn(), generateRows: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/documentPackages', () => ({
  documentPackagesApi: { getById: api.getById, linkFile: api.linkFile, generateRows: api.generateRows },
}))
vi.mock('@/api/reestr', () => ({ reestrApi: { listPortfolioClients: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/api/references', () => ({
  referencesApi: {
    listStations: vi.fn().mockResolvedValue([]),
    listCustomsPosts: vi.fn().mockResolvedValue([]),
    listCountries: vi.fn().mockResolvedValue([]),
  },
}))
vi.mock('@/ui/message', () => ({ message: api.toast }))

import DocumentPackageWorkspaceView from '../DocumentPackageWorkspaceView.vue'
import { useAuthStore } from '@/stores/auth'

let w: VueWrapper
let router: Router
const as = (role: string, perms: string[]) => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = perms
}
const mountView = async () => {
  w = mountWithI18n(DocumentPackageWorkspaceView, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
}
const dt = (fileId: string) => ({ getData: () => fileId, setData: () => {}, effectAllowed: 'move', dropEffect: 'move' })

beforeEach(async () => {
  setActivePinia(createPinia())
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/document-packages/:id/workspace', component: { template: '<div/>' } },
    { path: '/:p(.*)*', component: { template: '<div/>' } },
  ] })
  await router.push('/document-packages/pkg1/workspace')
  api.getById.mockResolvedValue(pkg())
  api.linkFile.mockImplementation(async () => pkg())
  as('importer', ['reestr.read', 'reestr.write', 'packages.manage'])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('прежний «Разбор поезда»: перетаскивание', () => {
  it('файл, брошенный на партию, привязывается один раз — к партии, а не ещё и к её контейнеру', async () => {
    await mountView()
    await w.get('.consolidation-node-card').trigger('drop', { dataTransfer: dt('f-free') })
    await flushPromises()
    expect(api.linkFile).toHaveBeenCalledTimes(1)
    expect(api.linkFile).toHaveBeenCalledWith('pkg1', 'f-free', expect.objectContaining({ containerId: 'c1', clientConsolidationId: 'p1' }))
  })
})

describe('прежний «Разбор поезда»: привязка', () => {
  it('перенос инвойса в другой контейнер оставляет его инвойсом (documentType уходит в запросе)', async () => {
    await mountView()
    await w.findAll('.container-node-card')[1].trigger('drop', { dataTransfer: dt('f-inv') })
    await flushPromises()
    expect(api.linkFile).toHaveBeenCalledWith('pkg1', 'f-inv', { containerId: 'c2', clientConsolidationId: null, documentType: 'invoice' })
  })
  it('у обычного файла documentType — null, как и было', async () => {
    await mountView()
    await w.findAll('.container-node-card')[1].trigger('drop', { dataTransfer: dt('f-free') })
    await flushPromises()
    expect(api.linkFile).toHaveBeenCalledWith('pkg1', 'f-free', { containerId: 'c2', clientConsolidationId: null, documentType: null })
  })
})
