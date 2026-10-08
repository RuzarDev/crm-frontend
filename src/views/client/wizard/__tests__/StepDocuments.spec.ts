import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { Import40FileDto } from '@/api/import40'
import { confirmState } from '@/ui/confirm'
import { fileDto } from '@/views/client/__tests__/caseFixture'

const api = vi.hoisted(() => ({ listFiles: vi.fn(), uploadFile: vi.fn(), deleteFile: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/import40', () => ({ import40Api: api }))
vi.mock('@/ui/message', () => ({ message: msg }))

import StepDocuments from '../StepDocuments.vue'
import { useShipmentFiles, type ShipmentFilesApi } from '../useShipmentFiles'

let w: VueWrapper
let docs: ShipmentFilesApi
const mountStep = async (files: Import40FileDto[] = []) => {
  api.listFiles.mockResolvedValue(files)
  docs = useShipmentFiles(ref('c1'))
  w = mountWithI18n(StepDocuments, { props: { docs }, attachTo: document.body })
  await flushPromises()
}
const row = (kind: string) => w.get(`[data-doc-kind="${kind}"]`)
const pickFiles = async (kind: string, files: File[]) => {
  const input = row(kind).get('[data-doc-input]')
  Object.defineProperty(input.element, 'files', { value: files, configurable: true })
  await input.trigger('change')
  await flushPromises()
}
const pdf = (name: string, size?: number) => {
  const f = new File(['%PDF'], name, { type: 'application/pdf' })
  if (size != null) Object.defineProperty(f, 'size', { value: size })
  return f
}
const lastFiles = () => docs.files.value

beforeEach(() => {
  api.uploadFile.mockImplementation(async (_id: string, _s: string, f: File, kind: string) =>
    fileDto({ id: `up-${f.name}`, originalFileName: f.name, sizeBytes: 312_000, docKind: kind }))
  api.deleteFile.mockResolvedValue(undefined)
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('StepDocuments', () => {
  it('строки чек-листа: названия, необходимость, подсказки; список загружен из раздела documents', async () => {
    await mountStep()
    expect(api.listFiles).toHaveBeenCalledWith('c1', { silent: true })
    expect(w.get('h2').text()).toBe('Документы на груз')
    const rows = w.findAll('[data-doc-kind]')
    expect(rows.map((r) => r.attributes('data-doc-kind'))).toEqual(['invoice', 'transport', 'packing', 'contract', 'origin', 'conformity', 'permit'])
    expect(rows.map((r) => r.get('[data-doc-name]').text())).toEqual([
      'Инвойс (коммерческий счёт)', 'Транспортный документ', 'Упаковочный лист', 'Внешнеторговый контракт',
      'Сертификат происхождения', 'Сертификат или декларация соответствия ЕАЭС', 'Разрешения и лицензии',
    ])
    expect(row('invoice').get('[data-doc-need]').text()).toBe('обязательно')
    expect(row('invoice').get('[data-doc-need]').classes()).toContain('text-gold-ink')
    expect(row('origin').get('[data-doc-need]').text()).toBe('если есть')
    expect(row('origin').get('[data-doc-need]').classes()).toContain('text-muted')
    expect(row('transport').get('[data-doc-hint]').text()).toBe('CMR, ж/д накладная, AWB или коносамент')
    expect(row('invoice').find('[data-doc-hint]').exists()).toBe(false)
    expect(row('invoice').get('[data-doc-attach]').text()).toBe('Приложить: Инвойс (коммерческий счёт)')
    const resp = w.get('[data-docs-resp]')
    expect(resp.attributes('role')).toBe('checkbox')
    expect(resp.element.closest('label')?.textContent).toContain('Подтверждаю, что документы полные и достоверные')
  })

  it('файл в строке «Инвойс» — upload с kind=invoice; галочка, имя файла, «Добавить ещё»', async () => {
    await mountStep()
    expect(row('invoice').find('[data-doc-dot] svg').exists()).toBe(false)
    const f = pdf('invoice_DE-4471.pdf')
    await pickFiles('invoice', [f])
    expect(api.uploadFile).toHaveBeenCalledWith('c1', 'documents', f, 'invoice', { silent: true })
    expect(row('invoice').find('[data-doc-dot] svg').exists()).toBe(true)
    expect(row('invoice').get('[data-doc-dot]').classes()).toContain('bg-tone-done-fg')
    expect(row('invoice').get('[data-doc-file]').text()).toContain('invoice_DE-4471.pdf')
    expect(row('invoice').get('[data-doc-file]').text()).toContain('305 КБ')
    expect(row('invoice').get('[data-doc-need]').classes()).toContain('text-muted')
    expect(row('invoice').get('[data-doc-attach]').text()).toContain('Добавить ещё')
    expect(lastFiles().map((x) => x.id)).toEqual(['up-invoice_DE-4471.pdf'])
    expect(row('invoice').get('[data-doc-done]').text()).toBe('приложено')
    expect(row('transport').find('[data-doc-done]').exists()).toBe(false)
    expect(docs.busy.value).toBe(false)
  })

  it('файл без вида (старый мастер) и вида other — в «Других документах», не в строках', async () => {
    await mountStep([
      fileDto({ id: 'f1', docKind: null, originalFileName: 'scan.jpg' }),
      fileDto({ id: 'f2', docKind: 'other', originalFileName: 'photo.png' }),
      fileDto({ id: 'f3', docKind: 'packing', originalFileName: 'packing.xlsx' }),
      fileDto({ id: 'f4', section: 'payment-check', originalFileName: 'check.pdf' }),
    ])
    const other = w.get('[data-other-files]')
    expect(other.text()).toContain('scan.jpg')
    expect(other.text()).toContain('photo.png')
    expect(other.text()).not.toContain('packing.xlsx')
    expect(row('packing').text()).toContain('packing.xlsx')
    expect(w.text()).not.toContain('check.pdf')
    expect(lastFiles().map((x) => x.id)).toEqual(['f1', 'f2', 'f3'])
  })

  it('файл больше 25 МБ или не того формата — ошибка в строке, upload не вызван', async () => {
    await mountStep()
    await pickFiles('contract', [pdf('contract.pdf', 26 * 1024 * 1024), new File(['x'], 'contract.zip')])
    expect(api.uploadFile).not.toHaveBeenCalled()
    const err = row('contract').get('[data-doc-error]')
    expect(err.attributes('role')).toBe('alert')
    expect(err.text()).toContain('contract.pdf: больше 25 МБ')
    expect(err.text()).toContain('contract.zip: такой формат не подходит')
    // Повтор не поможет — кнопки «Повторить» нет.
    expect(row('contract').find('[data-doc-retry]').exists()).toBe(false)
  })

  it('сбой загрузки — причина от сервера в строке; «Повторить» шлёт тот же файл', async () => {
    await mountStep()
    api.uploadFile.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Файл повреждён' } } })
    const f = pdf('cmr.pdf')
    await pickFiles('transport', [f])
    expect(row('transport').get('[data-doc-error]').text()).toContain('cmr.pdf: Файл повреждён')
    expect(row('transport').find('[data-doc-dot] svg').exists()).toBe(false)

    await row('transport').get('[data-doc-retry]').trigger('click')
    await flushPromises()
    expect(api.uploadFile).toHaveBeenCalledTimes(2)
    expect(api.uploadFile.mock.calls[1][2]).toBe(f)
    expect(row('transport').find('[data-doc-error]').exists()).toBe(false)
    expect(row('transport').text()).toContain('cmr.pdf')
  })

  it('«Удалить» — с вопросом; после — файла нет', async () => {
    await mountStep([fileDto({ id: 'f1', docKind: 'invoice', originalFileName: 'inv.pdf' })])
    await row('invoice').get('[data-doc-remove]').trigger('click')
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Удалить файл «inv.pdf»?')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.deleteFile).toHaveBeenCalledWith('c1', 'f1')
    expect(row('invoice').find('[data-doc-file]').exists()).toBe(false)
    expect(lastFiles()).toEqual([])
    expect(document.activeElement).toBe(row('invoice').get('[data-doc-attach]').element)
  })

  it('«Другие документы» — зона перетаскивания грузит с kind=other', async () => {
    await mountStep()
    const input = w.get('[data-docs-other] input[type="file"]')
    const f = pdf('extra.pdf')
    Object.defineProperty(input.element, 'files', { value: [f], configurable: true })
    await input.trigger('change')
    await flushPromises()
    expect(api.uploadFile).toHaveBeenCalledWith('c1', 'documents', f, 'other', { silent: true })
    expect(w.get('[data-other-files]').text()).toContain('extra.pdf')
  })

  it('пока файл грузится или удаляется — busy', async () => {
    await mountStep([fileDto({ id: 'f1', docKind: 'invoice', originalFileName: 'inv.pdf' })])
    let release!: () => void
    api.uploadFile.mockImplementationOnce(() => new Promise((r) => { release = () => r(fileDto({ id: 'up', docKind: 'packing' })) }))
    await pickFiles('packing', [pdf('packing.pdf')])
    expect(docs.busy.value).toBe(true)
    expect(row('packing').get('[data-doc-uploading]').text()).toContain('packing.pdf')
    expect(row('packing').get('[data-doc-attach]').attributes('disabled')).toBeDefined()
    release()
    await flushPromises()
    expect(docs.busy.value).toBe(false)

    let done!: () => void
    api.deleteFile.mockImplementationOnce(() => new Promise<void>((r) => { done = r }))
    await row('invoice').get('[data-doc-remove]').trigger('click')
    confirmState.resolve(true)
    await flushPromises()
    expect(docs.busy.value).toBe(true)
    done()
    await flushPromises()
    expect(docs.busy.value).toBe(false)
  })

  it('новый выбор не стирает прежние ошибки; «Повторить» — только сбойные, проверка на клиенте — до «Скрыть»', async () => {
    await mountStep()
    api.uploadFile.mockRejectedValueOnce({ response: { status: 500, data: '' } })
    const failed = pdf('cmr.pdf')
    await pickFiles('transport', [failed])
    await pickFiles('transport', [pdf('awb.pdf', 30 * 1024 * 1024)])
    const texts = () => row('transport').findAll('[data-doc-error] p').map((p) => p.text())
    expect(texts()).toEqual([
      'cmr.pdf: не загрузился — проверьте связь и повторите',
      'awb.pdf: больше 25 МБ',
    ])
    await row('transport').get('[data-doc-retry]').trigger('click')
    await flushPromises()
    expect(api.uploadFile).toHaveBeenCalledTimes(2)
    expect(api.uploadFile.mock.calls[1][2]).toBe(failed)
    expect(texts()).toEqual(['awb.pdf: больше 25 МБ'])
    expect(row('transport').find('[data-doc-retry]').exists()).toBe(false)
    await row('transport').get('[data-doc-dismiss]').trigger('click')
    expect(row('transport').find('[data-doc-error]').exists()).toBe(false)
  })

  it('зона «Другие документы»: не тот формат или больше 25 МБ — текст под зоной, без тоста и без загрузки', async () => {
    await mountStep()
    const input = w.get('[data-docs-other] input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'setup.exe'), pdf('huge.pdf', 40 * 1024 * 1024)], configurable: true })
    await input.trigger('change')
    await flushPromises()
    expect(api.uploadFile).not.toHaveBeenCalled()
    expect(msg.error).not.toHaveBeenCalled()
    const err = w.get('[data-docs-other] [data-doc-error]')
    expect(err.text()).toContain('setup.exe: такой формат не подходит')
    expect(err.text()).toContain('huge.pdf: больше 25 МБ')
  })
})
