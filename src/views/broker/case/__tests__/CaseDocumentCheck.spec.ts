import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { DocumentCheck } from '@/api/documentChecks'

const api = vi.hoisted(() => ({ list: vi.fn(), link: vi.fn() }))
vi.mock('@/api/documentChecks', () => ({ documentChecksApi: api }))

import CaseDocumentCheck from '../CaseDocumentCheck.vue'

const check = (p: Partial<DocumentCheck> = {}): DocumentCheck => ({
  id: 'k1', declarationId: 'd1', declarationNumber: '50408/171026/0001', createdAtUtc: '2026-10-17T09:30:00Z',
  sourceFileNames: ['invoice.xlsx', 'cmr.pdf'], sourceDocumentTypes: ['invoice', 'cmr'],
  contractNumber: '15/2026-A', invoiceNumber: 'INV 1', transportDocument: null, transportPlates: ['777АВС02', '02XY999'],
  discrepancies: [
    { scope: 'documents', field: 'quantity', fieldLabel: 'Количество', itemIndex: 1, itemDescription: 'Ноутбук',
      values: [{ value: '100', sourceKind: 'document', source: 'invoice.xlsx' }, { value: '90', sourceKind: 'document', source: 'packing.xlsx' }] },
    { scope: 'case', field: 'trailer', fieldLabel: 'Номер прицепа', itemIndex: null, itemDescription: null,
      values: [{ value: '02XY999', sourceKind: 'documents', source: null }, { value: '01AB123', sourceKind: 'case', source: null }] },
    { scope: 'declaration', field: 'brandNew', fieldLabel: 'Новое поле', itemIndex: null, itemDescription: null,
      values: [{ value: '12', sourceKind: 'documents', source: null }, { value: '10', sourceKind: 'declaration', source: '50408/171026/0001' }] },
  ],
  ...p,
})

let w: VueWrapper
const mountIt = async () => {
  w = mountWithI18n(CaseDocumentCheck, { attachTo: document.body, props: { caseId: 'c1', stamp: 'a' } })
  await flushPromises()
}
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('CaseDocumentCheck', () => {
  it('нет разборов — блока нет', async () => {
    api.list.mockResolvedValue([])
    await mountIt()
    expect(api.list).toHaveBeenCalledWith('c1')
    expect(w.find('[data-case-doccheck]').exists()).toBe(false)
  })

  it('расхождения: где и что написано; неизвестное поле — подпись сервера; по ДТ — последний разбор', async () => {
    api.list.mockResolvedValue([check(), check({ id: 'old', createdAtUtc: '2026-10-16T09:30:00Z' })])
    await mountIt()
    expect(w.get('[data-case-doccheck] h2').text()).toBe('Сверка документов: расхождений — 3')
    expect(w.findAll('[data-doccheck]')).toHaveLength(1)
    expect(w.get('[data-doccheck-facts]').text()).toBe('Контракт 15/2026-A · Инвойс INV 1 · Транспорт 777АВС02 / 02XY999')
    const qty = w.get('[data-doccheck-item="documents:quantity"]')
    expect(qty.text()).toContain('Документы между собой')
    expect(qty.text()).toContain('строка 1 «Ноутбук»')
    expect(qty.findAll('[data-doccheck-value]').map((v) => v.text())).toEqual(['invoice.xlsx: 100', 'packing.xlsx: 90'])
    expect(w.get('[data-doccheck-item="case:trailer"]').findAll('[data-doccheck-value]').map((v) => v.text()))
      .toEqual(['Документы: 02XY999', 'Заявка: 01AB123'])
    const dt = w.get('[data-doccheck-item="declaration:brandNew"]')
    expect(dt.text()).toContain('Новое поле')
    expect(dt.findAll('[data-doccheck-value]')[1]!.text()).toBe('ДТ 50408/171026/0001: 10')
  })

  it('без расхождений — «сверено»', async () => {
    api.list.mockResolvedValue([check({ discrepancies: [], declarationId: null, declarationNumber: null })])
    await mountIt()
    expect(w.get('[data-case-doccheck] h2').text()).toBe('Сверка документов: расхождений нет')
    expect(w.get('[data-doccheck]').text()).toContain('Разбор без ДТ')
    expect(w.find('[data-doccheck-ok]').exists()).toBe(true)
  })
})
