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
vi.mock('@/ui/download', () => ({ saveBlob: save }))
const nca = vi.hoisted(() => ({ sign: vi.fn() }))
vi.mock('@/utils/ncalayer', async (orig) => ({ ...(await orig<object>()), signWithNcaLayer: nca.sign }))

import CompanyDocumentCard from '../CompanyDocumentCard.vue'

// Моменты (сформирован, подписан) показываются по местному времени — строим их местным полднем:
// дата одна и та же в любом часовом поясе машины.
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString()
const doc = (o: Partial<Import40DocumentDto>): Import40DocumentDto => ({
  id: 'd1', clientId: 'cl1', kind: 'contract', number: '12', year: 2026, generatedAtUtc: at(2026, 10, 8),
  status: 1, clientSigned: false, clientSignedAtUtc: null, providerSigned: false, providerSignedAtUtc: null,
  clientSignMethod: null, providerSignMethod: null, isSingleUse: false, validUntilUtc: null,
  consumedByCaseId: null, files: [],
  ...o,
})
const ACTIVE = doc({ id: 'c0', status: 2, clientSigned: true, providerSigned: true, clientSignedAtUtc: at(2026, 10, 1), providerSignedAtUtc: at(2026, 10, 2), clientSignMethod: 'upload' })

let w: VueWrapper
const refresh = vi.fn()
const mountCard = async (props: Partial<{ kind: 'contract' | 'poa'; docs: Import40DocumentDto[]; profileComplete: boolean; needNew: boolean; needNewReason: string | null }>) => {
  refresh.mockResolvedValue(undefined)
  w = mountWithI18n(CompanyDocumentCard, {
    attachTo: document.body,
    props: { kind: 'contract', docs: [], clientId: 'cl1', profileComplete: true, refresh, ...props },
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
    expect(refresh).not.toHaveBeenCalled()
  })

  it('разовый и срок из details уходят в generateDocument', async () => {
    api.generateDocument.mockResolvedValue(doc({}))
    await mountCard({ docs: [] })
    const details = w.get('[data-doc-options]')
    ;(details.element as HTMLDetailsElement).open = true
    await details.trigger('toggle')
    // C-17: у многоразового договора даты нет — только пояснение про 31 декабря; поле появляется у разового.
    expect(w.find('[data-opt-until]').exists()).toBe(false)
    expect(w.get('[data-opt-contract-term]').text()).toContain('до 31 декабря года подписания')
    await w.get('[data-opt-single]').trigger('click')
    // Календарь подгружается лениво — только после раскрытия параметров.
    await vi.waitFor(() => w.get('[data-opt-until]'))
    expect(w.find('[data-opt-contract-term]').exists()).toBe(false)
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
    // Конец выбранного дня по UTC — как сервер ставит сроки по умолчанию; показывается тоже по UTC.
    expect(req.validUntilUtc).toBe('2027-12-31T23:59:59.000Z')
    expect(opts).toEqual({ silent: true })
    expect(refresh).toHaveBeenCalledTimes(1)
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

  it('подсказка срока — по правилам сервера: многоразовый договор (без даты, C-17), разовый (в т.ч. принудительно), доверенность', async () => {
    const help = () => w.get('[data-doc-options] [data-z-field]').text()
    await mountCard({ docs: [] })
    expect(w.find('[data-doc-options] [data-z-field]').exists()).toBe(false)
    expect(w.get('[data-opt-contract-term]').text()).toBe('Многоразовый договор действует до 31 декабря года подписания, затем AQNIET продлевает его на следующий год — дату выбирать не нужно')
    await w.get('[data-opt-single]').trigger('click')
    expect(help()).toContain('Необязательно — без даты разовый договор действует до использования в поставке')
    w.unmount()
    // Действует многоразовый — разовый включён принудительно, подсказка — про разовый.
    await mountCard({ docs: [ACTIVE] })
    expect(w.get('[data-opt-single]').attributes('aria-checked')).toBe('true')
    expect(help()).toContain('без даты разовый договор действует до использования в поставке')
    w.unmount()
    await mountCard({ kind: 'poa', docs: [] })
    expect(help()).toContain('Необязательно — без даты доверенность действует до конца года')
    await w.get('[data-opt-single]').trigger('click')
    expect(help()).toContain('без даты доверенность действует до конца года')
  })

  it('на телефоне заголовок документа — на всю ширину, «Действует» и «Скачать» — строкой ниже', async () => {
    await mountCard({ docs: [ACTIVE] })
    expect(w.get('[data-doc-title]').element.parentElement!.className).toContain('max-sm:basis-full')
    expect(w.find('[data-doc-effective]').exists()).toBe(true)
    expect(w.get('[data-doc-download]').classes()).toContain('max-sm:flex-1')
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
    expect(refresh).not.toHaveBeenCalled()
  })

  it('загрузка .cms занята до конца перечитывания экрана; повторный выбор файла игнорируется', async () => {
    api.signDocument.mockResolvedValue(doc({ clientSigned: true }))
    await mountCard({ docs: [doc({})] })
    let release!: () => void
    refresh.mockReturnValue(new Promise<void>((r) => { release = r }))
    const input = w.get('[data-sign-file]')
    const click = vi.spyOn(input.element as HTMLInputElement, 'click').mockImplementation(() => {})
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'a.cms')], configurable: true })
    await input.trigger('change')
    await flushPromises()
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(w.get('[data-sign-upload]').attributes('aria-busy')).toBe('true')
    await w.get('[data-sign-upload]').trigger('click')
    expect(click).not.toHaveBeenCalled()
    release()
    await flushPromises()
    expect(w.get('[data-sign-upload]').attributes('aria-busy')).toBeUndefined()
  })

  it('действующий, но занятый документ (needNew): статус «Действует» и плашка «Нужен новый документ»', async () => {
    const busy = doc({ id: 'c1', status: 2, isSingleUse: true, clientSigned: true, providerSigned: true, validUntilUtc: '2026-12-31T23:59:59Z' })
    api.generateDocument.mockResolvedValue(doc({ id: 'c2' }))
    await mountCard({ docs: [busy], needNew: true, needNewReason: null })
    expect(w.get('[data-doc-meta]').text()).toBe('Разовый · действует до 31.12.2026 · сформирован 08.10')
    expect(w.text()).toContain('Действует')
    expect(w.get('[data-need-new]').text()).toContain('Этот договор уже используется в открытой поставке')
    await w.get('[data-doc-generate-new]').trigger('click')
    await flushPromises()
    expect(api.generateDocument).toHaveBeenCalledWith('cl1', { kind: 'contract', isSingleUse: false, validUntilUtc: null }, { silent: true })
    await w.setProps({ needNewReason: 'Текст сервера' })
    expect(w.get('[data-need-new]').text()).toContain('Текст сервера')
  })

  it('«Подписать в NCALayer»: подписывается скачанный .docx, CMS уходит как подпись клиента способом ncalayer', async () => {
    api.downloadDocument.mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])]))
    nca.sign.mockResolvedValue(btoa('cms-bytes'))
    api.signDocument.mockResolvedValue(doc({ clientSigned: true }))
    await mountCard({ docs: [doc({})] })
    await w.get('[data-sign-nca]').trigger('click')
    // FileReader (base64 документа) — не микрозадача: ждём загрузку подписи.
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(api.downloadDocument).toHaveBeenCalledWith('cl1', 'd1')
    expect(nca.sign).toHaveBeenCalledWith('AQID')
    const [clientId, docId, side, file, opts] = api.signDocument.mock.calls[0]
    expect([clientId, docId, side]).toEqual(['cl1', 'd1', 'client'])
    expect(file.name).toBe('12-2026-client.cms')
    expect(opts).toEqual({ silent: true, method: 'ncalayer' })
    expect(msg.success).toHaveBeenCalledWith('Документ подписан через NCALayer')
    expect(refresh).toHaveBeenCalled()
  })

  it('NCALayer не запущен — подсказка на месте, подпись не загружается', async () => {
    const { NcaLayerError } = await import('@/utils/ncalayer')
    api.downloadDocument.mockResolvedValue(new Blob([new Uint8Array([1])]))
    nca.sign.mockRejectedValue(new NcaLayerError('unavailable'))
    await mountCard({ docs: [doc({})] })
    await w.get('[data-sign-nca]').trigger('click')
    await vi.waitFor(() => expect(w.get('[data-upload-error]').text()).toContain('NCALayer не отвечает'))
    expect(api.signDocument).not.toHaveBeenCalled()
  })

  it('подписан с QR — ссылка «Проверить подписи по QR» и способ «через NCALayer»', async () => {
    await mountCard({ docs: [doc({ clientSigned: true, clientSignedAtUtc: at(2026, 10, 20), clientSignMethod: 'ncalayer', verifyUrl: 'https://zircon.kz/verify/tok' })] })
    expect(w.get('[data-doc-verify]').attributes('href')).toBe('https://zircon.kz/verify/tok')
    expect(w.get('[data-plate="client"]').text()).toContain('через NCALayer')
  })
})

