import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { Import40DeclarationDto, Import40FileDto } from '@/api/import40'
import { declaration, fileDto } from '@/views/client/__tests__/caseFixture'

const api = vi.hoisted(() => ({ downloadFile: vi.fn(), blankPdf: vi.fn() }))
vi.mock('@/api/import40', () => ({ import40Api: api }))

import ShipmentDocuments from '../ShipmentDocuments.vue'

const mountWith = (files: Import40FileDto[], declarations: Import40DeclarationDto[] = [], svhInvoiceNumber = '') =>
  mountWithI18n(ShipmentDocuments, { props: { caseId: 'c1', files, declarations, svhInvoiceNumber } })

let click: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  api.downloadFile.mockResolvedValue(new Blob(['x']))
  api.blankPdf.mockResolvedValue({ blob: new Blob(['pdf']), fileName: 'ДТ.pdf' })
})
afterEach(() => {
  click.mockRestore()
  vi.clearAllMocks()
})

describe('ShipmentDocuments', () => {
  it('ДТ — кнопка PDF скачивает бланк (blankPdf)', async () => {
    const w = mountWith([], [declaration({ id: 'd7', declarationNumber: '50612/021025/0012345' })])
    const row = w.get('[data-doc-row="us"]')
    expect(row.text()).toContain('Декларация на товары')
    expect(row.text()).toContain('50612/021025/0012345')
    expect(row.text()).toContain('PDF')
    await row.get('button').trigger('click')
    await flushPromises()
    expect(api.blankPdf).toHaveBeenCalledWith('c1', 'd7')
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('ваш документ подписан видом из чек-листа, без вида — «Документ»; чек — «Чек об оплате»', async () => {
    const w = mountWith([
      fileDto({ id: 'f1', docKind: 'invoice', originalFileName: 'invoice_DE-4471.pdf', createdAtUtc: '2026-09-24T09:10:00' }),
      fileDto({ id: 'f2', docKind: null, originalFileName: 'scan.jpg' }),
      fileDto({ id: 'f3', section: 'payment-check', originalFileName: 'check.pdf' }),
    ])
    const rows = w.findAll('[data-doc-row="yours"]')
    expect(rows.map((r) => r.get('[data-doc-label]').text())).toEqual(['Инвойс (коммерческий счёт)', 'Документ', 'Чек об оплате'])
    expect(rows[0].text()).toContain('invoice_DE-4471.pdf')
    expect(rows[0].text()).toContain('24.09')
    await rows[0].get('button').trigger('click')
    await flushPromises()
    expect(api.downloadFile).toHaveBeenCalledWith('c1', 'f1')
  })

  it('от AQNIET: счёт СВХ с номером и отметка о выпуске', () => {
    const w = mountWith([
      fileDto({ id: 's1', section: 'svh-invoice', originalFileName: 'svh.pdf', uploadedByBusinessRole: 'kpp' }),
      fileDto({ id: 's2', section: 'declaration-stamp', originalFileName: 'stamp.png', uploadedByBusinessRole: 'kpp' }),
    ], [], '1187')
    const rows = w.findAll('[data-doc-row="us"]').map((r) => r.text())
    expect(rows[0]).toContain('Счёт СВХ № 1187')
    expect(rows[0]).toContain('PDF')
    expect(rows[1]).toContain('Отметка о выпуске')
    expect(rows[1]).toContain('PNG')
  })

  it('доверенность — в «Ваших» с подписью «Доверенность»; подписи групп связаны со списками', () => {
    const w = mountWith([
      fileDto({ id: 'poa', section: 'power-of-attorney', originalFileName: 'poa.pdf' }),
    ], [declaration()])
    expect(w.get('[data-doc-row="yours"] [data-doc-label]').text()).toBe('Доверенность')
    for (const ul of w.findAll('ul')) {
      const id = ul.attributes('aria-labelledby')
      expect(id).toBeTruthy()
      expect(w.get(`[id="${id}"]`).text()).toMatch(/От AQNIET|Ваши/)
    }
  })

  it('ошибка загрузки — сообщение и «Повторить» вместо «Документов пока нет»', async () => {
    const w = mountWithI18n(ShipmentDocuments, { props: { caseId: 'c1', files: [], declarations: [], svhInvoiceNumber: '', error: true } })
    expect(w.get('[data-docs-error]').text()).toContain('Не удалось загрузить документы')
    expect(w.find('[data-docs-empty]').exists()).toBe(false)
    await w.get('[data-docs-retry]').trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
  })

  it('пусто — «Документов пока нет»', () => {
    expect(mountWith([]).get('[data-docs-empty]').text()).toBe('Документов пока нет')
  })

  it('на телефоне видны первые две строки, остальные — по «Все документы поставки»', async () => {
    const w = mountWith([fileDto({ id: 'a' }), fileDto({ id: 'b' }), fileDto({ id: 'c' })], [declaration()])
    const hidden = () => w.findAll('li').map((li) => li.classes().includes('max-sm:hidden'))
    expect(hidden()).toEqual([false, false, true, true])
    await w.get('[data-docs-more]').trigger('click')
    expect(hidden()).toEqual([false, false, false, false])
    expect(w.find('[data-docs-more]').exists()).toBe(false)
  })
})
