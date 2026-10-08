import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ExtractionResultDto } from '@/types/api'

const invoice = vi.hoisted(() => ({ extractGoods: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/invoice', () => ({ invoiceApi: invoice }))
vi.mock('@/ui/message', () => ({ message: toast }))

import InvoiceImportModal from '../InvoiceImportModal.vue'

const ModalStub = {
  props: ['open', 'title'], emits: ['update:open'],
  template: '<div v-if="open" data-modal :data-title="title"><slot /><slot name="footer" /></div>',
}
const result = (o: Partial<ExtractionResultDto> = {}): ExtractionResultDto => ({
  status: 'done', matchResult: 'matched', aiUsed: true, confidence: 0.87, source: 'ai', runId: 'r1',
  header: { currencyCode: 'CNY' },
  items: [
    { commodityCode: '8471300000', customsValue: 25000, weightKg: 420.5, quantity: 120, commodityCodeDeprecation: null },
    { commodityCode: '8473302008', customsValue: '1800', weightKg: null, quantity: 120, commodityCodeDeprecation: { deprecatedCode: '8473302008', replacementCodes: ['8473302001', '8473302002'] } },
  ],
  ...o,
} as unknown as ExtractionResultDto)

let w: VueWrapper
const mount = (existingCount = 0) => {
  w = mountWithI18n(InvoiceImportModal, {
    props: { clientId: 'u-k', existingCount },
    attachTo: document.body,
    global: { stubs: { ZModal: ModalStub } },
  })
}
const choose = async (file: File) => {
  const input = w.get('[data-import-input]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
}
const pdf = () => new File(['%PDF'], 'invoice.pdf')

beforeEach(() => { invoice.extractGoods.mockResolvedValue(result()) })
afterEach(() => { w?.unmount(); document.body.innerHTML = ''; vi.clearAllMocks() })

describe('InvoiceImportModal', () => {
  it('файл → распознавание с id клиента → окно: тег источника, уверенность, валюта, позиции, устаревший код', async () => {
    mount()
    expect(w.get('[data-import-button]').text()).toBe('Из инвойса')
    expect(w.get('[data-import-input]').attributes('accept')).toBe('.pdf,.xlsx')
    await choose(pdf())
    expect(invoice.extractGoods).toHaveBeenCalledWith(expect.any(File), 'u-k')
    expect(w.get('[data-modal]').attributes('data-title')).toBe('Товары из инвойса')
    expect(w.get('[data-import-source]').text()).toBe('Распознано ИИ')
    expect(w.get('[data-import-confidence]').text()).toBe('Уверенность: 87%')
    expect((w.get('[data-import-currency]').element as HTMLInputElement).value).toBe('CNY')
    expect(w.findAll('[data-import-row]')).toHaveLength(2)
    expect(w.get('[data-import-deprecated]').text()).toBe('Код устарел → 8473302001, 8473302002')
    expect(w.find('[data-import-failed]').exists()).toBe(false)
    // Товаров нет — одно «Применить».
    expect(w.find('[data-import-replace]').exists()).toBe(false)
    expect(w.find('[data-import-append]').exists()).toBe(false)
  })

  it('по шаблону; автораспознавание не удалось — предупреждение; позиции правятся, удаляются, добавляются', async () => {
    invoice.extractGoods.mockResolvedValue(result({ aiUsed: false, confidence: null, status: 'needsManualEntry' } as Partial<ExtractionResultDto>))
    mount()
    await choose(pdf())
    expect(w.get('[data-import-source]').text()).toBe('По шаблону')
    expect(w.find('[data-import-confidence]').exists()).toBe(false)
    expect(w.get('[data-import-failed]').text()).toContain('Автораспознавание не удалось')
    await w.findAll('[data-import-remove]')[1].trigger('click')
    expect(w.findAll('[data-import-row]')).toHaveLength(1)
    await w.get('[data-import-add]').trigger('click')
    await flushPromises()
    expect(w.findAll('[data-import-row]')).toHaveLength(2)
    const name = w.findAll('[data-import-f="description"]')[1]
    expect(document.activeElement).toBe(name.element)
    ;(name.element as HTMLInputElement).value = 'Сумки'
    await name.trigger('input')
    await w.get('[data-import-apply]').trigger('click')
    const [items, mode] = w.emitted('imported')![0] as [unknown[], string]
    expect(mode).toBe('replace')
    expect(items).toEqual([
      {
        description: null, tnvedCode: '8471300000', tnvedDescription: null, countryOfOrigin: null, quantity: 120, unit: null, unitCode: null,
        grossWeightKg: 420.5, netWeightKg: null, packagesCount: null, quantityTypeCode: null, customsValue: 25000, currency: 'CNY',
      },
      {
        description: 'Сумки', tnvedCode: null, tnvedDescription: null, countryOfOrigin: null, quantity: null, unit: null, unitCode: null,
        grossWeightKg: null, netWeightKg: null, packagesCount: null, quantityTypeCode: null, customsValue: null, currency: 'CNY',
      },
    ])
    expect(w.find('[data-modal]').exists()).toBe(false)
  })

  it('товары уже есть — вопрос и выбор: «Заменить товары» / «Добавить к существующим»', async () => {
    mount(3)
    await choose(pdf())
    expect(w.get('[data-import-existing]').text()).toBe('В партии уже 3 товара. Заменить их позициями из инвойса или добавить их к ним?')
    expect(w.find('[data-import-apply]').exists()).toBe(false)
    await w.get('[data-import-replace]').trigger('click')
    expect((w.emitted('imported')![0] as unknown[])[1]).toBe('replace')
    await choose(pdf())
    await w.get('[data-import-append]').trigger('click')
    expect((w.emitted('imported')![1] as unknown[])[1]).toBe('append')
    expect((w.emitted('imported')![1] as unknown[][])[0]).toHaveLength(2)
  })

  it('без позиций применить нельзя', async () => {
    invoice.extractGoods.mockResolvedValue(result({ items: [] }))
    mount(1)
    await choose(pdf())
    expect(w.get('[data-import-empty]').text()).toBe('Позиций нет — добавьте их вручную')
    expect(w.get('[data-import-replace]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-import-append]').attributes('disabled')).toBeDefined()
  })

  it('не PDF/XLSX и больше 10 МБ — ошибка без запроса; ошибка сервера — только тост перехватчика', async () => {
    mount()
    await choose(new File(['x'], 'scan.xls'))
    expect(toast.error).toHaveBeenCalledWith('Допустимы только PDF и XLSX')
    const big = new File(['x'], 'big.pdf')
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 })
    await choose(big)
    expect(toast.error).toHaveBeenLastCalledWith('Файл превышает 10 МБ')
    expect(invoice.extractGoods).not.toHaveBeenCalled()
    toast.error.mockClear()
    invoice.extractGoods.mockRejectedValueOnce(new Error('500'))
    await choose(pdf())
    expect(toast.error).not.toHaveBeenCalled()
    expect(w.find('[data-modal]').exists()).toBe(false)
  })
})
