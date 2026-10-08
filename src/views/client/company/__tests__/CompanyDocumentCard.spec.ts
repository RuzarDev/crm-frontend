import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { Import40DocumentDto } from '@/api/import40Contract'

const api = vi.hoisted(() => ({
  generateDocument: vi.fn(),
  downloadDocument: vi.fn(),
  signDocument: vi.fn(),
  sigexStartSigningDocument: vi.fn(),
  sigexPollDocument: vi.fn(),
  sigexCompleteDocument: vi.fn(),
}))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
const save = vi.hoisted(() => vi.fn())
vi.mock('@/api/import40Contract', async (orig) => ({ ...(await orig<object>()), import40ContractApi: api }))
vi.mock('@/ui/message', () => ({ message: msg }))
vi.mock('@/views/client/shipment/util', async (orig) => ({ ...(await orig<object>()), saveBlob: save }))

import CompanyDocumentCard from '../CompanyDocumentCard.vue'

const doc = (o: Partial<Import40DocumentDto>): Import40DocumentDto => ({
  id: 'd1', clientId: 'cl1', kind: 'contract', number: '12', year: 2026, generatedAtUtc: '2026-10-08T06:00:00Z',
  status: 1, clientSigned: false, clientSignedAtUtc: null, providerSigned: false, providerSignedAtUtc: null,
  clientSignMethod: null, providerSignMethod: null, isSingleUse: false, validUntilUtc: null,
  consumedByCaseId: null, files: [],
  ...o,
})
const ACTIVE = doc({ id: 'c0', status: 2, clientSigned: true, providerSigned: true, clientSignedAtUtc: '2026-10-01T06:00:00Z', providerSignedAtUtc: '2026-10-02T06:00:00Z', clientSignMethod: 'upload' })

let w: VueWrapper
const mountCard = async (props: Partial<{ kind: 'contract' | 'poa'; docs: Import40DocumentDto[]; profileComplete: boolean }>) => {
  w = mountWithI18n(CompanyDocumentCard, {
    attachTo: document.body,
    props: { kind: 'contract', docs: [], clientId: 'cl1', profileComplete: true, ...props },
  })
  await flushPromises()
}

afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('CompanyDocumentCard', () => {
  it('409 на второй многоразовый — текст сервера на месте, без changed', async () => {
    api.generateDocument.mockRejectedValue({ response: { status: 409, data: { error: 'Уже есть действующий договор' } } })
    await mountCard({ docs: [] })
    await w.get('[data-doc-generate]').trigger('click')
    await flushPromises()
    expect(w.get('[data-generate-error]').text()).toContain('Уже есть действующий договор')
    expect(w.emitted('changed')).toBeUndefined()
  })

  it('разовый и срок из details уходят в generateDocument', async () => {
    api.generateDocument.mockResolvedValue(doc({}))
    await mountCard({ docs: [] })
    const details = w.get('[data-doc-options]')
    ;(details.element as HTMLDetailsElement).open = true
    await details.trigger('toggle')
    // Календарь подгружается лениво — только после раскрытия параметров.
    await vi.waitFor(() => w.get('[data-opt-until]'))
    await w.get('[data-opt-single]').trigger('click')
    const date = w.get('[data-opt-until]')
    await date.setValue('31.12.2027')
    await date.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(w.get('[data-doc-generate]').text()).toBe('Сформировать разовый')
    await w.get('[data-doc-generate]').trigger('click')
    await flushPromises()
    const [, req, opts] = api.generateDocument.mock.calls[0]
    expect(req.kind).toBe('contract')
    expect(req.isSingleUse).toBe(true)
    expect(new Date(req.validUntilUtc).getDate()).toBe(31)
    expect(opts).toEqual({ silent: true })
    expect(w.emitted('changed')).toHaveLength(1)
  })

  it('действует многоразовый договор: разовый включён и закреплён, сформировать — разовый', async () => {
    api.generateDocument.mockResolvedValue(doc({ id: 'd2', isSingleUse: true }))
    await mountCard({ docs: [ACTIVE] })
    expect(w.get('[data-plate="client"]').text()).toContain('Подписано 01.10 файлом')
    expect(w.get('[data-plate="provider"]').text()).toContain('Подписано 02.10')
    expect(w.get('[data-opt-single]').attributes('aria-checked')).toBe('true')
    expect(w.get('[data-opt-single]').attributes('disabled')).toBeDefined()
    await w.get('[data-doc-generate-more]').trigger('click')
    await flushPromises()
    expect(api.generateDocument).toHaveBeenCalledWith('cl1', { kind: 'contract', isSingleUse: true, validUntilUtc: null }, { silent: true })
  })

  it('история: прежние документы со статусами; актуальный — ждущий подписи', async () => {
    const revoked = doc({ id: 'r', number: '3', status: 4, generatedAtUtc: '2026-01-01T06:00:00Z' })
    const expired = doc({ id: 'e', number: '7', status: 2, validUntilUtc: '2026-02-01T06:00:00Z', generatedAtUtc: '2026-01-05T06:00:00Z' })
    await mountCard({ docs: [revoked, doc({}), expired] })
    expect(w.get('[data-doc-title]').text()).toBe('Договор № 12/2026 на таможенное оформление')
    expect(w.get('[data-doc-history] summary').text()).toBe('История документов (2)')
    expect(w.get('[data-history-doc="e"]').text()).toContain('Истёк')
    expect(w.get('[data-history-doc="r"]').text()).toContain('Отозван')
  })

  it('доверенность: нет плашки AQNIET; израсходованная разовая — в истории, «Действующей доверенности нет»', async () => {
    const consumed = doc({ id: 'p0', kind: 'poa', status: 2, isSingleUse: true, consumedByCaseId: 'case1', clientSigned: true })
    await mountCard({ kind: 'poa', docs: [consumed] })
    expect(w.get('[data-doc-empty] h2').text()).toBe('Действующей доверенности нет')
    expect(w.get('[data-history-doc="p0"]').text()).toContain('Использован')
    await w.setProps({ docs: [doc({ id: 'p1', kind: 'poa' })] })
    expect(w.find('[data-plate="client"]').exists()).toBe(true)
    expect(w.find('[data-plate="provider"]').exists()).toBe(false)
  })

  it('реквизиты не заполнены — вместо «Сформировать» переход к реквизитам', async () => {
    await mountCard({ docs: [], profileComplete: false })
    expect(w.find('[data-doc-generate]').exists()).toBe(false)
    expect(w.find('[data-doc-options]').exists()).toBe(false)
    await w.get('[data-doc-go-profile]').trigger('click')
    expect(w.emitted('goProfile')).toHaveLength(1)
  })

  it('«Скачать .docx» — файл «Договор-12-2026.docx»', async () => {
    const blob = new Blob(['x'])
    api.downloadDocument.mockResolvedValue(blob)
    await mountCard({ docs: [doc({})] })
    await w.get('[data-doc-download]').trigger('click')
    await flushPromises()
    expect(api.downloadDocument).toHaveBeenCalledWith('cl1', 'd1')
    expect(save).toHaveBeenCalledWith(blob, 'Договор-12-2026.docx')
  })

  it('ошибка загрузки подписанного файла — на месте', async () => {
    api.signDocument.mockRejectedValue({ response: { status: 400, data: { error: 'Подпись не подходит к документу' } } })
    await mountCard({ docs: [doc({})] })
    const input = w.get('[data-sign-file]')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'a.cms')], configurable: true })
    await input.trigger('change')
    await flushPromises()
    expect(w.get('[data-upload-error]').text()).toBe('Подпись не подходит к документу')
    expect(w.emitted('changed')).toBeUndefined()
  })
})
