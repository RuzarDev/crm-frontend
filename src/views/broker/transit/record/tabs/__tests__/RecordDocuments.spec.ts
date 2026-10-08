import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import { confirmState } from '@/ui/confirm'
import { useAuthStore } from '@/stores/auth'
import { ReestrBrokerDocumentType as BT, ReestrEntryStatus as S, type ReestrDocumentDto, type ReestrEntryStatus } from '@/types/api'

const api = vi.hoisted(() => ({ listDocuments: vi.fn(), uploadDocument: vi.fn(), deleteDocument: vi.fn(), downloadDocument: vi.fn(), getExtraction: vi.fn() }))
vi.mock('@/api/reestr', () => ({ reestrApi: api }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))
const saved = vi.hoisted(() => ({ saveBlob: vi.fn() }))
vi.mock('@/ui/download', () => saved)

import RecordDocuments from '../RecordDocuments.vue'

const doc = (o: Partial<ReestrDocumentDto> = {}): ReestrDocumentDto => ({
  id: 'd1', reestrEntryId: 'r1', section: 'client', brokerDocumentType: null, clientDocumentType: null, originalFileName: 'invoice.pdf',
  contentType: 'application/pdf', sizeBytes: 2048, uploadedByUserId: 'client-1', uploadedByRole: 'client', createdAtUtc: '2026-10-08T09:14:00', ...o,
})
const DOCS = [
  doc(),
  doc({ id: 'd2', section: 'broker', brokerDocumentType: BT.CustomsDeclaration, originalFileName: 'dt.pdf', uploadedByUserId: 'me', uploadedByRole: 'importer' }),
  doc({ id: 'd3', section: 'broker', brokerDocumentType: BT.PermitsAndLicenses, originalFileName: 'permit.pdf', uploadedByUserId: 'colleague', uploadedByRole: 'importer' }),
  doc({ id: 'd4', section: 'broker', brokerDocumentType: null, originalFileName: 'misc.pdf', uploadedByUserId: 'colleague', uploadedByRole: 'importer' }),
]

type Who = 'client' | 'expeditor' | 'readOnly' | 'writer' | 'admin'
const WHO: Record<Who, [string, string[]]> = {
  client: ['client', ['reestr.read']],
  expeditor: ['expeditor', ['reestr.read']],
  readOnly: ['importer', ['reestr.read']],
  writer: ['importer', ['reestr.read', 'reestr.write']],
  admin: ['administrator', []],
}

let w: VueWrapper
const mount = async (who: Who, o: { status?: ReestrEntryStatus; dirty?: boolean } = {}) => {
  const auth = useAuthStore()
  ;[auth.role, auth.permissions] = WHO[who]
  auth.userId = 'me'
  w = mountWithI18n(RecordDocuments, {
    props: { reestrId: 'r1', status: o.status ?? S.InProgress, dirty: o.dirty ?? false },
    attachTo: document.body,
    global: { stubs: { ExtractionReviewModal: true } },
  })
  await flushPromises()
}
const fileInput = (key: string) => w.get(`[data-upload="${key}"]`).element.parentElement!.querySelector('input[type="file"]') as HTMLInputElement
const pick = async (key: string, files: File[]) => {
  const input = fileInput(key)
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  input.dispatchEvent(new Event('change'))
  await flushPromises()
}
const pdf = (name: string, size = 10) => new File([new Uint8Array(size)], name, { type: 'application/pdf' })
const slot = (type: number) => w.get(`[data-broker-slot="${type}"]`)

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  api.listDocuments.mockResolvedValue(structuredClone(DOCS))
  api.uploadDocument.mockResolvedValue(doc({ id: 'new' }))
  api.deleteDocument.mockResolvedValue(undefined)
  api.downloadDocument.mockResolvedValue(new Blob(['x']))
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
})

describe('RecordDocuments: список', () => {
  it('клиентские файлы в своей секции, брокерские — по местам; без типа — в «Прочее»; строка файла: роль · дата · размер', async () => {
    await mount('writer')
    expect(api.listDocuments).toHaveBeenCalledWith('r1')
    expect(w.get('[data-docs-client]').findAll('[data-doc-file]')).toHaveLength(1)
    expect(slot(BT.CustomsDeclaration).findAll('[data-doc-file]')).toHaveLength(1)
    expect(slot(BT.ConformityCertificates).findAll('[data-doc-file]')).toHaveLength(0)
    expect(slot(BT.PermitsAndLicenses).get('[data-doc-name]').text()).toBe('permit.pdf')
    expect(slot(BT.Other).get('[data-doc-name]').text()).toBe('misc.pdf')
    const meta = w.get('[data-docs-client] [data-doc-meta]').text()
    expect(meta).toBe('Клиент · 08.10.2026 09:14 · 2 КБ')
    expect(w.emitted('count')?.at(-1)).toEqual([4])
  })

  it('обязательная «Таможенная декларация» помечена; пустое место — «Файлов пока нет»', async () => {
    await mount('writer')
    expect(slot(BT.CustomsDeclaration).text()).toContain('*')
    expect(slot(BT.ConformityCertificates).text()).toContain('Файлов пока нет')
    expect(slot(BT.ConformityCertificates).text()).not.toContain('*')
  })

  it('имя файла скачивает через reestrApi.downloadDocument и saveBlob', async () => {
    await mount('writer')
    await w.get('[data-docs-client] [data-doc-name]').trigger('click')
    await flushPromises()
    expect(api.downloadDocument).toHaveBeenCalledWith('r1', 'd1')
    expect(saved.saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'invoice.pdf')
  })

  it('ошибка загрузки списка — пусто, count 0', async () => {
    api.listDocuments.mockRejectedValue(new Error('x'))
    await mount('writer')
    expect(w.findAll('[data-doc-file]')).toHaveLength(0)
    expect(w.emitted('count')?.at(-1)).toEqual([0])
  })
})

describe('RecordDocuments: закрытая секция', () => {
  it.each([S.Released, S.Archived])('статус %s: плашка, нет загрузки брокера и удаления, клиентская загрузка остаётся (администратор)', async (status) => {
    await mount('admin', { status })
    expect(w.get('[data-broker-closed]').text()).toBe('Секция закрыта — статус не допускает загрузку')
    expect(w.find('[data-upload^="broker"]').exists()).toBe(false)
    expect(w.get('[data-docs-broker]').find('[data-doc-remove]').exists()).toBe(false)
    expect(w.get('[data-docs-client] [data-doc-remove]').exists()).toBe(true)
    expect(w.find('[data-upload="client"]').exists()).toBe(true)
  })

  it('в рабочем статусе плашки нет, у брокера — по загрузке на каждое место', async () => {
    await mount('writer')
    expect(w.find('[data-broker-closed]').exists()).toBe(false)
    expect(w.findAll('[data-upload^="broker"]')).toHaveLength(4)
  })
})

describe('RecordDocuments: права на загрузку и удаление', () => {
  it('клиент: грузит свои, брокерских мест и «Заполнить из инвойса» нет, удалять нельзя', async () => {
    await mount('client')
    expect(w.find('[data-upload="client"]').exists()).toBe(true)
    expect(w.find('[data-upload^="broker"]').exists()).toBe(false)
    expect(w.find('[data-autofill-upload]').exists()).toBe(false)
    expect(w.find('[data-doc-remove]').exists()).toBe(false)
  })

  it('сотрудник только с reestr.read: ни загрузки, ни удаления, ни автозаполнения; файлы видны и скачиваются', async () => {
    await mount('readOnly')
    expect(w.find('[data-upload]').exists()).toBe(false)
    expect(w.find('[data-autofill-upload]').exists()).toBe(false)
    expect(w.find('[data-doc-remove]').exists()).toBe(false)
    expect(w.findAll('[data-doc-download]')).toHaveLength(4)
  })

  it('сотрудник с reestr.write: брокерская загрузка, удаляет только свой брокерский документ', async () => {
    await mount('writer')
    expect(w.find('[data-upload="client"]').exists()).toBe(false)
    expect(w.findAll('[data-upload^="broker"]')).toHaveLength(4)
    const removable = w.findAll('[data-doc-remove]').map((b) => b.attributes('aria-label'))
    expect(removable).toEqual(['Удалить dt.pdf'])
  })

  it('экспедитор: клиентская загрузка, без брокерской и удаления', async () => {
    await mount('expeditor')
    expect(w.find('[data-upload="client"]').exists()).toBe(true)
    expect(w.find('[data-upload^="broker"]').exists()).toBe(false)
    expect(w.find('[data-doc-remove]').exists()).toBe(false)
  })

  it('администратор удаляет любой документ', async () => {
    await mount('admin')
    expect(w.findAll('[data-doc-remove]')).toHaveLength(4)
  })
})

describe('RecordDocuments: удаление', () => {
  it('подтверждение прежним текстом, затем deleteDocument, тост и перечитывание', async () => {
    await mount('writer')
    await w.get('[data-doc-remove]').trigger('click')
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Удалить документ?')
    expect(confirmState.danger).toBe(true)
    confirmState.resolve(true)
    await flushPromises()
    expect(api.deleteDocument).toHaveBeenCalledWith('r1', 'd2')
    expect(toast.success).toHaveBeenCalledWith('Документ удалён')
    expect(api.listDocuments).toHaveBeenCalledTimes(2)
  })

  it('отказ в подтверждении ничего не удаляет', async () => {
    await mount('writer')
    await w.get('[data-doc-remove]').trigger('click')
    confirmState.resolve(false)
    await flushPromises()
    expect(api.deleteDocument).not.toHaveBeenCalled()
  })
})

describe('RecordDocuments: загрузка файлов', () => {
  it('одним файлом в место брокера: тип места во втором аргументе, тост «Документ загружен», перечитывание', async () => {
    await mount('writer')
    const f = pdf('cert.pdf')
    await pick(`broker:${BT.ConformityCertificates}`, [f])
    expect(api.uploadDocument).toHaveBeenCalledWith('r1', 'broker', f, BT.ConformityCertificates)
    expect(toast.success).toHaveBeenCalledWith('Документ загружен')
    expect(api.listDocuments).toHaveBeenCalledTimes(2)
  })

  it('клиент грузит без типа документа', async () => {
    await mount('client')
    const f = pdf('a.pdf')
    await pick('client', [f])
    expect(api.uploadDocument).toHaveBeenCalledWith('r1', 'client', f, undefined)
  })

  it('несколько файлов — по очереди; итог «Загружено 3 из 3»', async () => {
    await mount('client')
    const order: string[] = []
    api.uploadDocument.mockImplementation(async (_i: string, _s: string, f: File) => { order.push(f.name); return doc() })
    await pick('client', [pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')])
    expect(order).toEqual(['a.pdf', 'b.pdf', 'c.pdf'])
    expect(toast.success).toHaveBeenCalledWith('Загружено 3 из 3')
  })

  it('частичная ошибка: второй не принят — третий не идёт, «Загружено 1 из 3», список перечитан', async () => {
    await mount('client')
    api.uploadDocument.mockResolvedValueOnce(doc()).mockRejectedValueOnce(new Error('x'))
    await pick('client', [pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')])
    expect(api.uploadDocument).toHaveBeenCalledTimes(2)
    expect(toast.warning).toHaveBeenCalledWith('Загружено 1 из 3')
    expect(toast.success).not.toHaveBeenCalled()
    expect(api.listDocuments).toHaveBeenCalledTimes(2)
  })

  it('первый же файл не принят: тоста частичного успеха нет, список всё равно перечитан', async () => {
    await mount('client')
    api.uploadDocument.mockRejectedValue(new Error('x'))
    await pick('client', [pdf('a.pdf'), pdf('b.pdf')])
    expect(toast.warning).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(api.listDocuments).toHaveBeenCalledTimes(2)
  })

  it('правила файлов: неподходящее расширение и размер больше 10 МБ — прежние тексты, остальные файлы идут', async () => {
    await mount('client')
    const good = pdf('ok.pdf')
    await pick('client', [new File(['x'], 'virus.exe'), pdf('huge.pdf', 10 * 1024 * 1024 + 1), good])
    expect(toast.error).toHaveBeenCalledWith('Допустимы: PDF, JPG, PNG, DOCX, XLSX')
    expect(toast.error).toHaveBeenCalledWith('Размер файла не должен превышать 10 МБ')
    expect(api.uploadDocument).toHaveBeenCalledTimes(1)
    expect(api.uploadDocument).toHaveBeenCalledWith('r1', 'client', good, undefined)
  })
})

describe('RecordDocuments: «Заполнить из инвойса»', () => {
  const autofill = () => w.get('[data-autofill-upload]')

  it('скрыта без reestr.write (клиент, экспедитор, только чтение)', async () => {
    for (const who of ['client', 'expeditor', 'readOnly'] as const) {
      await mount(who)
      expect(w.find('[data-autofill-upload]').exists(), who).toBe(false)
      w.unmount()
    }
  })

  it('с reestr.write видна и активна; при несохранённых правках отключена с подсказкой', async () => {
    await mount('writer')
    expect(autofill().attributes('disabled')).toBeUndefined()
    expect(w.find('[data-autofill-hint]').exists()).toBe(false)
    w.unmount()
    await mount('writer', { dirty: true })
    expect(autofill().attributes('disabled')).toBeDefined()
    expect(w.get('[data-autofill-hint]').text()).toBe('Сначала сохраните изменения на вкладке «Данные»')
    w.unmount()
    await mount('admin')
    expect(autofill().attributes('disabled')).toBeUndefined()
  })

  it('после загрузки инвойса список документов перечитывается', async () => {
    await mount('writer')
    api.getExtraction.mockReturnValue(new Promise(() => {}))
    api.uploadDocument.mockResolvedValue(doc({ id: 'inv' }))
    const input = autofill().element.parentElement!.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [pdf('inv.pdf')], configurable: true })
    input.dispatchEvent(new Event('change'))
    await flushPromises()
    expect(api.uploadDocument).toHaveBeenCalledWith('r1', 'client', expect.any(File), undefined, 'invoice')
    expect(api.listDocuments).toHaveBeenCalledTimes(2)
  })
})
