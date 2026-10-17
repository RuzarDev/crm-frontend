import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import { fileDto } from '@/views/client/__tests__/caseFixture'
import { regDoc } from './registryFixture'

const api = vi.hoisted(() => ({ listAll: vi.fn(), saveCaseFile: vi.fn(), documents: vi.fn(), exportXlsx: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/clientRegistry', async (orig) => ({
  ...(await orig<typeof import('@/api/clientRegistry')>()),
  clientRegistryApi: { listAll: api.listAll, saveCaseFile: api.saveCaseFile },
}))
vi.mock('@/api/clientCard', () => ({ clientCardApi: { documents: api.documents } }))
vi.mock('@/ui/message', () => ({ message: msg }))
vi.mock('@/views/broker/list', async (orig) => ({ ...(await orig<typeof import('@/views/broker/list')>()), exportXlsx: api.exportXlsx }))

import ClientDocumentsRegisterView from '@/views/broker/clients/ClientDocumentsRegisterView.vue'
import CaseFilesDrawer from '@/views/broker/case/CaseFilesDrawer.vue'
import { useAuthStore } from '@/stores/auth'

const ROWS = [
  regDoc({ id: 'a', clientId: 'ca', clientName: 'ТОО «Альфа»', category: 'certificate', number: 'KZ-1', status: 'expiring', daysLeft: 9 }),
  regDoc({ id: 'b', clientId: 'cb', clientName: 'ТОО «Бета»', category: 'supplyContract', number: 'SC-2', status: 'active', daysLeft: 300, validUntil: '2027-08-01' }),
  regDoc({ id: 'c', clientId: 'cc', clientName: 'ИП «Гамма»', category: 'permit', number: 'P-3', status: 'expired', daysLeft: -2, validUntil: '2026-10-15' }),
]

let w: VueWrapper
let router: Router
const names = () => w.findAll('[data-register-client] .truncate').map((b) => b.text())

beforeEach(async () => {
  setActivePinia(createPinia())
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  api.listAll.mockResolvedValue(ROWS)
  api.documents.mockResolvedValue([])
  const auth = useAuthStore()
  auth.role = 'manager'
  auth.permissions = ['clients.read', 'import40.read']
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('«Документы клиентов» → «Реестр документов»', () => {
  it('вкладка по ?view=registry: таблица всех клиентов, фильтр статуса, Excel, переход в карточку', async () => {
    await router.push('/client-documents?view=registry')
    w = mountWithI18n(ClientDocumentsRegisterView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()
    expect(api.listAll).toHaveBeenCalledWith({ silent: true })
    expect(names()).toEqual(['ТОО «Альфа»', 'ТОО «Бета»', 'ИП «Гамма»'])
    expect(w.find('[data-docs-export]').exists()).toBe(false) // кнопки договоров скрыты

    const states = w.findAll('[data-register-status] button')
    await states[3].trigger('click') // «Истёк»
    expect(names()).toEqual(['ИП «Гамма»'])
    expect(w.get('[data-register-hint]').text()).toBe('истёк 2 дн. назад')

    await w.get('[data-register-export]').trigger('click')
    await flushPromises()
    expect(api.exportXlsx).toHaveBeenCalledTimes(1)
    const [base, , rows] = api.exportXlsx.mock.calls[0]
    expect(base).toBe('client-registry')
    expect(rows).toHaveLength(1)
    expect(rows[0]['Клиент']).toBe('ИП «Гамма»')

    await w.get('[data-register-client]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/clients/cc?tab=docs')
  })

  it('переключатель вкладок пишет ?view в адрес', async () => {
    await router.push('/client-documents')
    w = mountWithI18n(ClientDocumentsRegisterView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()
    expect(w.find('[data-registry-register]').exists()).toBe(false)
    await w.findAll('[data-docs-view] button')[1].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.view).toBe('registry')
    expect(w.find('[data-registry-register]').exists()).toBe(true)
  })
})

describe('Файлы заявки → «Сохранить в реестр клиента»', () => {
  it('категория по виду документа; сохранение — копия файла в реестр клиента', async () => {
    api.saveCaseFile.mockResolvedValue(regDoc())
    const file = fileDto({ id: 'f9', originalFileName: 'contract.pdf', docKind: 'contract' })
    w = mountWithI18n(CaseFilesDrawer, { props: { open: true, caseId: 'case1', files: [file] }, attachTo: document.body })
    await flushPromises()
    ;(document.body.querySelector('[data-file-to-registry]') as HTMLElement).click()
    await flushPromises()
    const modal = document.body.querySelector('[data-registry-modal]')!
    expect(modal.querySelector('[data-registry-source-file]')?.textContent).toContain('contract.pdf')
    const number = modal.querySelector('input[data-registry-number]') as HTMLInputElement
    number.value = 'SC-2026/9'
    number.dispatchEvent(new Event('input'))
    await flushPromises()
    modal.querySelector('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(api.saveCaseFile).toHaveBeenCalledWith('case1', 'f9', expect.objectContaining({ category: 'supplyContract', number: 'SC-2026/9' }))
    expect(msg.success).toHaveBeenCalledWith('Документ сохранён в реестр клиента')
  })
})
