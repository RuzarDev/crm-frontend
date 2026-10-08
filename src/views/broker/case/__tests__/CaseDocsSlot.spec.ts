import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { confirmState } from '@/ui/confirm'
import { USERS, fileDto } from './caseFixture'
import { mountStep } from './stepHarness'
import { defineComponent, h } from 'vue'
import type { CaseStepProps } from '../caseContext'

const api = vi.hoisted(() => ({ uploadFile: vi.fn(), deleteFile: vi.fn(), downloadFile: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/import40', () => ({ import40Api: api }))
vi.mock('@/ui/message', () => ({ message: msg }))
const saved = vi.hoisted(() => ({ saveBlob: vi.fn() }))
vi.mock('@/ui/download', () => saved)

import CaseDocsSlot from '../CaseDocsSlot.vue'

type SlotProps = Partial<InstanceType<typeof CaseDocsSlot>['$props']>
const slotStep = (props: SlotProps) =>
  defineComponent({ props: ['ctx', 'mode'] as unknown as undefined, setup: (p: CaseStepProps) => () => h(CaseDocsSlot, { ctx: p.ctx, section: 'documents', ...props }) })

let w: VueWrapper
let reload: ReturnType<typeof mountStep>['reload']
const mount = (props: SlotProps, files = [fileDto({ id: 'f1', docKind: 'invoice', originalFileName: 'inv.pdf', uploadedByStaffName: 'Айгерим К.' })]) => {
  const m = mountStep(slotStep(props), { user: USERS.declarant, step: 1, kase: { status: 0 }, files })
  w = m.w
  reload = m.reload
}
const pick = async (files: File[]) => {
  const input = w.get('[data-slot-upload]').element.parentElement!.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  input.dispatchEvent(new Event('change'))
  await flushPromises()
}
const pdf = (name: string) => new File(['%PDF'], name, { type: 'application/pdf' })

beforeEach(() => {
  api.uploadFile.mockResolvedValue(fileDto({ id: 'new' }))
  api.deleteFile.mockResolvedValue(undefined)
  api.downloadFile.mockResolvedValue(new Blob(['x']))
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('CaseDocsSlot', () => {
  it('показывает файлы раздела карточками: имя, вид документа, кто загрузил; чужие разделы не видны', () => {
    mount({ withKind: true }, [
      fileDto({ id: 'f1', docKind: 'invoice', originalFileName: 'inv.pdf', uploadedByStaffName: 'Айгерим К.' }),
      fileDto({ id: 'f2', section: 'payment-check', originalFileName: 'check.pdf' }),
    ])
    const rows = w.findAll('[data-slot-file]')
    expect(rows).toHaveLength(1)
    expect(rows[0].get('[data-slot-file-name]').text()).toBe('inv.pdf')
    expect(rows[0].get('[data-slot-file-kind]').text()).toBe('Инвойс (коммерческий счёт)')
    expect(rows[0].text()).toContain('Айгерим К.')
  })

  it('без файлов — текст emptyText; без прав зоны загрузки и кнопки удаления нет', () => {
    mount({ emptyText: 'Штамп не загружен' }, [])
    expect(w.get('[data-slot-empty]').text()).toBe('Штамп не загружен')
    expect(w.find('[data-slot-upload]').exists()).toBe(false)
    expect(w.find('[data-slot-remove]').exists()).toBe(false)
  })

  it('загрузка двух файлов с видом: по очереди, kind во втором аргументе, затем перечитывание файлов и истории и тост', async () => {
    mount({ canUpload: true, multiple: true, withKind: true }, [])
    await w.get('[data-slot-kind] [data-option="packing"]').trigger('click')
    const a = pdf('a.pdf')
    const b = pdf('b.pdf')
    await pick([a, b])
    expect(api.uploadFile).toHaveBeenCalledTimes(2)
    expect(api.uploadFile).toHaveBeenNthCalledWith(1, 'c1', 'documents', a, 'packing')
    expect(api.uploadFile).toHaveBeenNthCalledWith(2, 'c1', 'documents', b, 'packing')
    expect(reload).toHaveBeenCalledTimes(1)
    expect(msg.success).toHaveBeenCalledWith('Файлы загружены')
  })

  it('без выбранного вида kind не отправляется; без withKind выбора вида нет', async () => {
    mount({ canUpload: true, withKind: true }, [])
    const f = pdf('stamp.pdf')
    await pick([f])
    expect(api.uploadFile).toHaveBeenCalledWith('c1', 'documents', f, undefined)
    w.unmount()
    mount({ canUpload: true, section: 'declaration-stamp' as never }, [])
    expect(w.find('[data-slot-kind]').exists()).toBe(false)
    const g = pdf('s.pdf')
    await pick([g])
    expect(api.uploadFile).toHaveBeenLastCalledWith('c1', 'declaration-stamp', g, undefined)
  })

  it('ошибка на втором файле: первый остаётся, файлы перечитываются, тоста успеха нет', async () => {
    mount({ canUpload: true, multiple: true }, [])
    api.uploadFile.mockResolvedValueOnce(fileDto({ id: 'n1' })).mockRejectedValueOnce(new Error('boom'))
    await pick([pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')])
    expect(api.uploadFile).toHaveBeenCalledTimes(2)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(msg.success).not.toHaveBeenCalled()
  })

  it('удаление: подтверждение, затем DELETE и перечитывание; отказ — ничего', async () => {
    mount({ canRemove: true })
    await w.get('[data-slot-remove]').trigger('click')
    expect(confirmState.title).toBe('Удалить файл «inv.pdf»?')
    confirmState.resolve(false)
    await flushPromises()
    expect(api.deleteFile).not.toHaveBeenCalled()
    await w.get('[data-slot-remove]').trigger('click')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.deleteFile).toHaveBeenCalledWith('c1', 'f1')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('скачивание: файл запрашивается и сохраняется под своим именем', async () => {
    mount({})
    await w.get('[data-slot-download]').trigger('click')
    await flushPromises()
    expect(api.downloadFile).toHaveBeenCalledWith('c1', 'f1')
    expect(saved.saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'inv.pdf')
  })
})
