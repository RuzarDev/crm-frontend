import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ExtractionResultDto } from '@/types/api'

const api = vi.hoisted(() => ({ uploadDocument: vi.fn(), getExtraction: vi.fn() }))
vi.mock('@/api/reestr', () => ({ reestrApi: api }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))

import InvoiceAutofill from '../InvoiceAutofill.vue'

// Окно проверки — заглушка: показывает, что ему передали, и умеет «применить».
const ReviewStub = defineComponent({
  name: 'ExtractionReviewModal',
  props: ['open', 'reestrId', 'documentId', 'result', 'errorMessage'],
  emits: ['update:open', 'applied', 'cancel'],
  setup: (p, { emit }) => () => p.open
    ? h('div', { 'data-review': '', 'data-doc': p.documentId, 'data-error': p.errorMessage },
      h('button', { type: 'button', 'data-apply': '', onClick: () => emit('applied', 3) }))
    : null,
})

const extraction = (o: Partial<ExtractionResultDto> = {}): ExtractionResultDto => ({
  status: 'templateHit', matchResult: 'templateHitGlobal', aiUsed: false, confidence: 1, source: 'template', runId: 'x',
  header: { consignee: null, shipper: null, currencyCode: null }, items: [], ...o,
})

let w: VueWrapper
const mount = async (props: Record<string, unknown> = {}) => {
  w = mountWithI18n(InvoiceAutofill, {
    props: { reestrId: 'r1', ...props },
    attachTo: document.body,
    global: { stubs: { ExtractionReviewModal: ReviewStub } },
  })
  await flushPromises()
}
const pick = async (file: File) => {
  const input = w.get('[data-autofill-upload]').element.parentElement!.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change'))
  await flushPromises()
}
const pdf = (name = 'inv.pdf', size = 10) => new File([new Uint8Array(size)], name, { type: 'application/pdf' })
/** Дать отработать очередной паузе опроса (2 с) и всем промисам после неё. */
const tick = async () => {
  await vi.advanceTimersByTimeAsync(2000)
  await flushPromises()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  api.uploadDocument.mockResolvedValue({ id: 'doc1' })
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('InvoiceAutofill', () => {
  it('загружает файл как invoice клиентской секции, опрашивает до готовности и открывает окно проверки с результатом', async () => {
    api.getExtraction.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(extraction())
    await mount()
    const f = pdf()
    await pick(f)
    expect(api.uploadDocument).toHaveBeenCalledWith('r1', 'client', f, undefined, 'invoice')
    expect(w.emitted('uploaded')).toHaveLength(1)
    expect(toast.info).toHaveBeenCalledWith('Документ загружен, распознаём...')
    expect(w.find('[data-review]').exists()).toBe(false)
    await tick()
    await tick()
    expect(api.getExtraction).toHaveBeenCalledTimes(3)
    expect(api.getExtraction).toHaveBeenCalledWith('r1', 'doc1')
    expect(w.get('[data-review]').attributes('data-doc')).toBe('doc1')
    expect(w.get('[data-review]').attributes('data-error')).toBe('')
  })

  it('«применить» в окне проверки закрывает его и шлёт applied(n)', async () => {
    api.getExtraction.mockResolvedValue(extraction())
    await mount()
    await pick(pdf())
    await w.get('[data-apply]').trigger('click')
    expect(w.emitted('applied')?.[0]).toEqual([3])
    expect(w.find('[data-review]').exists()).toBe(false)
  })

  it('результат needsManualEntry: вариант с ошибкой; не цифровой документ — отдельный текст', async () => {
    api.getExtraction.mockResolvedValue(extraction({ status: 'needsManualEntry', matchResult: 'notDigital' }))
    await mount()
    await pick(pdf())
    expect(w.get('[data-review]').attributes('data-error')).toContain('не в цифровом формате')
    w.unmount()
    api.getExtraction.mockResolvedValue(extraction({ status: 'error', matchResult: 'noMatch' as never }))
    await mount()
    await pick(pdf())
    expect(w.get('[data-review]').attributes('data-error')).toContain('Не удалось распознать документ')
  })

  it('результата нет 30 попыток подряд — «Превышено время ожидания распознавания»', async () => {
    api.getExtraction.mockResolvedValue(null)
    await mount()
    await pick(pdf())
    for (let i = 0; i < 30; i++) await tick()
    expect(api.getExtraction).toHaveBeenCalledTimes(30)
    expect(toast.error).toHaveBeenCalledWith('Превышено время ожидания распознавания')
    expect(w.find('[data-review]').exists()).toBe(false)
  })

  it('ошибка опроса и ошибка загрузки — прежние тексты', async () => {
    api.getExtraction.mockRejectedValue(new Error('x'))
    await mount()
    await pick(pdf())
    expect(toast.error).toHaveBeenCalledWith('Ошибка при получении результата распознавания')
    api.uploadDocument.mockRejectedValue(new Error('x'))
    await pick(pdf())
    expect(toast.error).toHaveBeenCalledWith('Не удалось загрузить документ')
  })

  it('только PDF и XLSX до 10 МБ: иначе тост и без загрузки', async () => {
    await mount()
    await pick(new File(['x'], 'photo.jpg'))
    await pick(pdf('big.pdf', 10 * 1024 * 1024 + 1))
    expect(api.uploadDocument).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Размер файла не должен превышать 10 МБ')
  })

  it('disabled выключает кнопку', async () => {
    await mount({ disabled: true })
    expect(w.get('[data-autofill-upload]').attributes('disabled')).toBeDefined()
  })

  it('при размонтировании опрос прекращается', async () => {
    api.getExtraction.mockResolvedValue(null)
    await mount()
    await pick(pdf())
    w.unmount()
    await tick()
    await tick()
    expect(api.getExtraction).toHaveBeenCalledTimes(1)
  })
})
