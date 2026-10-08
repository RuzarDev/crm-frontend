import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ExtractionResultDto } from '@/types/api'

const api = vi.hoisted(() => ({ applyExtraction: vi.fn() }))
vi.mock('@/api/reestr', () => ({ reestrApi: api }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))

import ExtractionReviewModal from '../ExtractionReviewModal.vue'

const result = (o: Partial<ExtractionResultDto> = {}): ExtractionResultDto => ({
  status: 'templateHit', matchResult: 'templateHitGlobal', aiUsed: false, confidence: 0.87, source: 'template', runId: 'run1',
  header: { consignee: 'ТОО Альфа', shipper: 'Shenzhen Ltd', currencyCode: 'USD' },
  items: [
    { commodityCode: '8501100000', customsValue: 1200.5, weightKg: 96, quantity: 4, commodityCodeDeprecation: null },
    { commodityCode: '8501200000', customsValue: 300, weightKg: 12.5, quantity: 1, commodityCodeDeprecation: { deprecatedCode: '8501200000', replacementCodes: ['8501200001', '8501200009'], sourceVersion: null } },
  ],
  ...o,
})

let w: VueWrapper
const mount = async (props: Record<string, unknown> = {}) => {
  w = mountWithI18n(ExtractionReviewModal, {
    props: { open: true, reestrId: 'r1', documentId: 'doc1', result: result(), errorMessage: '', ...props },
    attachTo: document.body,
  })
  await flushPromises()
}
const body = () => document.body
const buttons = (label: string) => [...body().querySelectorAll('button')].filter((b) => b.textContent?.trim() === label)
const rows = () => [...body().querySelectorAll<HTMLElement>('tbody tr')]
const input = (el: Element | null) => el as HTMLInputElement

beforeEach(() => {
  vi.clearAllMocks()
  api.applyExtraction.mockResolvedValue({ entries: [{}, {}] })
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
})

describe('ExtractionReviewModal', () => {
  it('показывает способ распознавания, уверенность, шапку и позиции; код с устаревшим — подсказка', async () => {
    await mount()
    const text = body().textContent ?? ''
    expect(text).toContain('Заполнение из инвойса')
    expect(text).toContain('По шаблону')
    expect(text).toContain('Уверенность: 87%')
    expect(input(body().querySelector('[data-header="consignee"]')).value).toBe('ТОО Альфа')
    expect(input(body().querySelector('[data-header="shipper"]')).value).toBe('Shenzhen Ltd')
    expect(input(body().querySelector('[data-header="currencyCode"]')).value).toBe('USD')
    expect(rows()).toHaveLength(2)
    expect(input(rows()[0].querySelector('[data-item="commodityCode"]')).value).toBe('8501100000')
    expect(rows()[1].textContent).toContain('Код устарел → 8501200001, 8501200009')
  })

  it('«Распознано ИИ» вместо шаблона; уверенность null не показывается', async () => {
    await mount({ result: result({ aiUsed: true, confidence: null }) })
    const text = body().textContent ?? ''
    expect(text).toContain('Распознано ИИ')
    expect(text).not.toContain('Уверенность')
  })

  it('«Применить» отправляет поправленные значения; успех — тост, applied(n) и закрытие', async () => {
    await mount()
    const consignee = input(body().querySelector('[data-header="consignee"]'))
    consignee.value = 'ТОО Бета'
    consignee.dispatchEvent(new Event('input'))
    const code = input(rows()[0].querySelector('[data-item="commodityCode"]'))
    code.value = '8501100001'
    code.dispatchEvent(new Event('input'))
    await flushPromises()
    buttons('Применить')[0].click()
    await flushPromises()
    expect(api.applyExtraction).toHaveBeenCalledWith('r1', 'doc1', {
      header: { consignee: 'ТОО Бета', shipper: 'Shenzhen Ltd', currencyCode: 'USD' },
      items: [
        { commodityCode: '8501100001', customsValue: 1200.5, weightKg: 96, quantity: 4 },
        { commodityCode: '8501200000', customsValue: 300, weightKg: 12.5, quantity: 1 },
      ],
    })
    expect(toast.success).toHaveBeenCalledWith('Применено позиций: 2')
    expect(w.emitted('applied')?.[0]).toEqual([2])
    expect(w.emitted('update:open')?.[0]).toEqual([false])
  })

  it('числа в позициях: запятая как разделитель, правка уходит в запрос', async () => {
    await mount()
    const value = input(rows()[0].querySelector('[data-item="customsValue"]'))
    value.dispatchEvent(new Event('focus'))
    value.value = '99,5'
    value.dispatchEvent(new Event('input'))
    value.dispatchEvent(new Event('blur'))
    await flushPromises()
    buttons('Применить')[0].click()
    await flushPromises()
    expect(api.applyExtraction.mock.calls[0][2].items[0].customsValue).toBe(99.5)
  })

  it('удаление позиции и «Добавить позицию»; без позиций «Применить» не вызывает apply', async () => {
    await mount()
    ;(rows()[1].querySelector('[data-item-remove]') as HTMLElement).click()
    await flushPromises()
    expect(rows()).toHaveLength(1)
    ;(body().querySelector('[data-item-add]') as HTMLElement).click()
    await flushPromises()
    expect(rows()).toHaveLength(2)
    ;(rows()[1].querySelector('[data-item-remove]') as HTMLElement).click()
    ;(rows()[0].querySelector('[data-item-remove]') as HTMLElement).click()
    await flushPromises()
    expect(body().textContent).not.toContain('8501100000')
    buttons('Применить')[0].click()
    await flushPromises()
    expect(api.applyExtraction).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Добавьте хотя бы одну позицию')
    expect(w.emitted('applied')).toBeUndefined()
  })

  it('ошибка сервера: окно остаётся открытым, applied не уходит', async () => {
    await mount()
    api.applyExtraction.mockRejectedValue(new Error('x'))
    buttons('Применить')[0].click()
    await flushPromises()
    expect(w.emitted('applied')).toBeUndefined()
    expect(w.emitted('update:open')).toBeUndefined()
  })

  it('«Закрыть» закрывает окно и шлёт cancel', async () => {
    await mount()
    buttons('Закрыть')[0].click()
    await flushPromises()
    expect(w.emitted('update:open')?.[0]).toEqual([false])
    expect(w.emitted('cancel')).toHaveLength(1)
    expect(api.applyExtraction).not.toHaveBeenCalled()
  })

  it('вариант с ошибкой: предупреждение вместо формы, «Применить» нет, «Закрыть» есть', async () => {
    await mount({ errorMessage: 'Документ не в цифровом виде' })
    expect(body().textContent).toContain('Документ не в цифровом виде')
    expect(body().querySelector('[data-header="consignee"]')).toBeNull()
    expect(buttons('Применить')).toHaveLength(0)
    buttons('Закрыть')[0].click()
    await flushPromises()
    expect(w.emitted('cancel')).toHaveLength(1)
  })

  it('результат приходит позже окна: поля заполняются, когда он появился', async () => {
    await mount({ result: null })
    expect(body().querySelector('[data-header="consignee"]')).toBeNull()
    await w.setProps({ result: result() })
    await flushPromises()
    expect(rows()).toHaveLength(2)
  })
})
