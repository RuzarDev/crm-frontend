import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ClientOnboardingRow } from '@/api/clientsOnboarding'
import type { Import40DocumentDto } from '@/api/import40Contract'

const api = vi.hoisted(() => ({ listDocuments: vi.fn(), downloadDocument: vi.fn(), downloadDocumentSignedFile: vi.fn(), saveBlob: vi.fn() }))
vi.mock('@/api/import40Contract', () => ({
  import40ContractApi: {
    listDocuments: api.listDocuments, downloadDocument: api.downloadDocument, downloadDocumentSignedFile: api.downloadDocumentSignedFile,
  },
}))
vi.mock('@/ui/download', () => ({ saveBlob: api.saveBlob }))

import ClientDocsDrawer from '../ClientDocsDrawer.vue'

const DrawerStub = {
  props: ['open'], emits: ['update:open'],
  template: '<div v-if="open" data-drawer><div data-drawer-title><slot name="title" /></div><slot /></div>',
}

const client: ClientOnboardingRow = {
  id: 'c1', username: 'login', email: null, companyName: 'ТОО «Казахмыс Трейд»', bin: '160440012345', phone: null, status: 'Active',
  emailConfirmed: true, hasContract: true, hasPoa: true, createdAtUtc: '2026-03-12T04:00:00Z', inviteExpiresAtUtc: null,
}
const doc = (o: Partial<Import40DocumentDto>): Import40DocumentDto => ({
  id: 'd', clientId: 'c1', kind: 'contract', number: '12', year: 2026, generatedAtUtc: '2026-03-12T04:00:00Z', status: 2,
  clientSigned: true, clientSignedAtUtc: '2026-03-13T04:00:00Z', providerSigned: true, providerSignedAtUtc: '2026-03-14T04:00:00Z',
  clientSignMethod: 'egov', providerSignMethod: 'upload', isSingleUse: false, validUntilUtc: null, consumedByCaseId: null, files: [],
  ...o,
})
const CONTRACT = doc({ id: 'k', files: [{ id: 'f1', section: 'contract', originalFileName: 'contract-signed.pdf', createdAtUtc: '2026-03-13T04:00:00Z' }] })
const POA = doc({
  id: 'p', kind: 'poa', number: '3', year: 2026, status: 1, clientSigned: false, clientSignedAtUtc: null, clientSignMethod: null,
  providerSigned: false, providerSignedAtUtc: null, providerSignMethod: null, isSingleUse: true, validUntilUtc: '2020-01-01T00:00:00Z',
})

let w: VueWrapper
const mountDrawer = async (props: Record<string, unknown> = {}) => {
  w = mountWithI18n(ClientDocsDrawer, { props: { open: true, client, ...props }, attachTo: document.body, global: { stubs: { ZDrawer: DrawerStub } } })
  await flushPromises()
}
const cards = () => w.findAll('[data-doc-card]')

beforeEach(() => { api.listDocuments.mockResolvedValue([CONTRACT, POA]) })
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('ClientDocsDrawer', () => {
  it('заголовок с именем клиента; запрос документов без тоста перехватчика (silent)', async () => {
    await mountDrawer()
    expect(api.listDocuments).toHaveBeenCalledWith('c1', undefined, { silent: true })
    expect(w.get('[data-drawer-title]').text()).toContain('Документы клиента')
    expect(w.get('[data-docs-client]').text()).toBe('ТОО «Казахмыс Трейд»')
  })

  it('пока грузится — скелетоны', async () => {
    let done: (d: Import40DocumentDto[]) => void = () => {}
    api.listDocuments.mockReturnValue(new Promise((r) => { done = r }))
    await mountDrawer()
    expect(w.find('[data-docs-skeleton]').exists()).toBe(true)
    done([CONTRACT])
    await flushPromises()
    expect(w.find('[data-docs-skeleton]').exists()).toBe(false)
    expect(cards()).toHaveLength(1)
  })

  it('пусто: «У клиента пока нет документов»', async () => {
    api.listDocuments.mockResolvedValue([])
    await mountDrawer()
    expect(w.get('[data-docs-empty]').text()).toContain('У клиента пока нет документов')
  })

  it('ошибка: по месту, с «Повторить»', async () => {
    api.listDocuments.mockRejectedValueOnce(new Error('403'))
    await mountDrawer()
    expect(w.get('[data-docs-error]').text()).toContain('Не удалось загрузить документы')
    await w.get('[data-docs-retry]').trigger('click')
    await flushPromises()
    expect(api.listDocuments).toHaveBeenCalledTimes(2)
    expect(w.find('[data-docs-error]').exists()).toBe(false)
    expect(cards()).toHaveLength(2)
  })

  it('карточка договора: номер, дата, статус, подписи клиента и AQNIET, файл', async () => {
    await mountDrawer()
    const c = cards()[0]
    expect(c.get('[data-doc-title]').text()).toBe('Договор № 12/2026')
    expect(c.text()).toContain('Сформирован 12.03.2026')
    expect(c.get('[data-doc-status]').text()).toBe('Действует')
    expect(c.get('[data-sign-client]').text()).toBe('Клиент: 13.03.2026 · ЭЦП eGov')
    expect(c.get('[data-sign-provider]').text()).toBe('AQNIET: 14.03.2026 · загружен файл')
    expect(c.get('[data-doc-file]').text()).toBe('contract-signed.pdf')
    expect(c.find('[data-doc-until]').exists()).toBe(false)
  })

  it('доверенность: подписи AQNIET нет; «разовый», истёкший срок красным, «нет» по клиенту, файлов нет', async () => {
    await mountDrawer()
    const c = cards()[1]
    expect(c.get('[data-doc-title]').text()).toBe('Доверенность № 3/2026')
    expect(c.find('[data-sign-provider]').exists()).toBe(false)
    expect(c.get('[data-sign-client]').text()).toBe('Клиент: нет')
    expect(c.get('[data-doc-status]').text()).toBe('Ждёт подписи')
    expect(c.get('[data-doc-single]').text()).toBe('Разовый')
    expect(c.get('[data-doc-until]').text()).toBe('до 01.01.2020')
    expect(c.get('[data-doc-until]').classes()).toContain('text-tone-danger-fg')
    expect(c.text()).toContain('Подписанных файлов нет')
  })

  it('срок в будущем — без красного', async () => {
    api.listDocuments.mockResolvedValue([doc({ validUntilUtc: '2099-01-01T00:00:00Z' })])
    await mountDrawer()
    expect(w.get('[data-doc-until]').classes()).not.toContain('text-tone-danger-fg')
  })

  it('«Скачать бланк»: запрос API и saveBlob с именем «Вид-номер-год.docx»', async () => {
    const blob = new Blob(['x'])
    api.downloadDocument.mockResolvedValue(blob)
    await mountDrawer()
    await cards()[1].get('[data-doc-blank]').trigger('click')
    await flushPromises()
    expect(api.downloadDocument).toHaveBeenCalledWith('c1', 'p')
    expect(api.saveBlob).toHaveBeenCalledWith(blob, 'Доверенность-3-2026.docx')
  })

  it('подписанный файл: запрос API и saveBlob под исходным именем', async () => {
    const blob = new Blob(['y'])
    api.downloadDocumentSignedFile.mockResolvedValue(blob)
    await mountDrawer()
    await w.get('[data-doc-file]').trigger('click')
    await flushPromises()
    expect(api.downloadDocumentSignedFile).toHaveBeenCalledWith('c1', 'k', 'f1')
    expect(api.saveBlob).toHaveBeenCalledWith(blob, 'contract-signed.pdf')
  })

  it('ошибка скачивания: saveBlob не зовётся, кнопка снова доступна', async () => {
    api.downloadDocument.mockRejectedValueOnce(new Error('404'))
    await mountDrawer()
    await cards()[0].get('[data-doc-blank]').trigger('click')
    await flushPromises()
    expect(api.saveBlob).not.toHaveBeenCalled()
    expect(cards()[0].get('[data-doc-blank]').attributes('disabled')).toBeUndefined()
  })

  it('закрытая панель не грузит; открытие и смена клиента — грузят', async () => {
    await mountDrawer({ open: false })
    expect(api.listDocuments).not.toHaveBeenCalled()
    await w.setProps({ open: true })
    await flushPromises()
    expect(api.listDocuments).toHaveBeenCalledTimes(1)
    await w.setProps({ client: { ...client, id: 'c2' } })
    await flushPromises()
    expect(api.listDocuments).toHaveBeenLastCalledWith('c2', undefined, { silent: true })
  })
})
