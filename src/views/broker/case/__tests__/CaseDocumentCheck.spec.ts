import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { DocumentCheck, DocumentCheckRow } from '@/api/documentChecks'

const api = vi.hoisted(() => ({ list: vi.fn(), link: vi.fn(), recheck: vi.fn() }))
vi.mock('@/api/documentChecks', () => ({ documentChecksApi: api }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: msg }))

import CaseDocumentCheck from '../CaseDocumentCheck.vue'

const row = (p: Partial<DocumentCheckRow> & Pick<DocumentCheckRow, 'field' | 'result'>): DocumentCheckRow => ({
  fieldLabel: p.field, box: '44', valueKind: 'text', key: false, documents: [], declarationValue: null,
  declarationNote: null, documentsNote: null, ...p,
})

// Пример №14 декларанта: инвойс и упаковочный распознаны, в ДТ неверные номера и веса.
const mismatchRows: DocumentCheckRow[] = [
  row({ field: 'invoiceNumber', result: 'mismatch', key: true, declarationValue: '11111',
    documents: [{ value: 'UR0910', fileName: 'invoice_UR0910.xlsx', kind: 'invoice', result: 'mismatch' }] }),
  row({ field: 'invoiceDate', result: 'mismatch', valueKind: 'date', declarationValue: '2202-09-10',
    documents: [{ value: '2026-09-10', fileName: 'invoice_UR0910.xlsx', kind: 'invoice', result: 'mismatch' }] }),
  row({ field: 'gross', result: 'mismatch', key: true, box: '35', valueKind: 'number', declarationValue: '22222',
    documents: [{ value: '1198.5', fileName: 'PACKING_LIST_UR0910.xlsx', kind: 'packing' }] }),
  row({ field: 'net', result: 'notInDt', key: true, box: '38', valueKind: 'number', declarationNote: 'dtPartial:2/3',
    documents: [{ value: '1128', fileName: 'PACKING_LIST_UR0910.xlsx', kind: 'packing' }] }),
  row({ field: 'valueTotal', result: 'notInDocument', key: true, box: '22 / 42', valueKind: 'money', declarationValue: '1602.7', currency: 'USD' }),
]

const check = (p: Partial<DocumentCheck> = {}): DocumentCheck => ({
  id: 'k1', declarationId: 'd1', declarationNumber: '50408/171026/0001', createdAtUtc: '2026-10-21T09:30:00Z',
  sourceFileNames: ['invoice_UR0910.xlsx', 'PACKING_LIST_UR0910.xlsx'], sourceDocumentTypes: ['invoice_packing'],
  contractNumber: null, invoiceNumber: 'UR0910', transportDocument: null, transportPlates: [], discrepancies: [],
  verdict: 'mismatch', unrecognized: false, mismatchCount: 3, notComparedCount: 2, warningCount: 0,
  rows: mismatchRows,
  documents: [
    { fileName: 'invoice_UR0910.xlsx', kind: 'invoice', recognized: true, reason: null, itemsCount: 38 },
    { fileName: 'PACKING_LIST_UR0910.xlsx', kind: 'packing', recognized: true, reason: null, itemsCount: 38 },
  ],
  itemConflicts: [], caseDiscrepancies: [],
  declarationLabel: 'ДТ 50408/171026/0001', declarationSplit: false, declarationUpdatedAtUtc: '2026-10-21T10:00:00Z',
  comparedAtUtc: '2026-10-21T10:05:00Z', parsedAtUtc: '2026-10-21T09:30:00Z', legacy: false, canRecheck: true,
  ...p,
})

const unrecognized = (p: Partial<DocumentCheck> = {}) => check({
  verdict: 'unrecognized', unrecognized: true, mismatchCount: 0, notComparedCount: 9,
  rows: [row({ field: 'invoiceNumber', result: 'notInDocument', key: true })],
  documents: [
    { fileName: 'даму констр.pdf', kind: 'other', recognized: false, reason: 'scanNoOcr', itemsCount: 0 },
    { fileName: 'Валютный контракт.pdf', kind: 'contract', recognized: false, reason: 'noFields', itemsCount: 0 },
    { fileName: 'Шаблон.xls', kind: 'invoice', recognized: false, reason: 'browserOnly', itemsCount: 0 },
  ],
  ...p,
})

let w: VueWrapper
const mountIt = async (props: Record<string, unknown> = {}) => {
  w = mountWithI18n(CaseDocumentCheck, { attachTo: document.body, props: { caseId: 'c1', stamp: 'a', canManage: true, ...props } })
  await flushPromises()
}
const title = () => w.get('[data-case-doccheck] h2').text()
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

  it('ничего не распознано — «не удалось сверить», причины по файлам, без таблицы и без «расхождений нет»', async () => {
    api.list.mockResolvedValue([unrecognized()])
    await mountIt()
    expect(title()).toBe('Сверка документов: не удалось сверить')
    const text = w.get('[data-case-doccheck]').text()
    expect(text).not.toContain('расхождений нет')
    expect(text).not.toContain('сходятся')
    expect(w.find('[data-doccheck-unrecognized]').exists()).toBe(true)
    expect(w.find('[data-doccheck-table]').exists()).toBe(false)
    expect(w.findAll('[data-doccheck-reason]').map((r) => r.text())).toEqual([
      'скан без текста — распознавание сканов выключено',
      'текст есть, но реквизиты и таблица товаров не найдены',
      'Excel .xls — прочитан в браузере',
    ])
    expect(w.findAll('[data-doccheck-doc="notRecognized"]')).toHaveLength(2)
    // .xls в Zircon AI не уходит — не «не распознан», а «в сверке не участвует».
    expect(w.get('[data-doccheck-doc="notSent"]').text()).toContain('в сверке не участвует')
  })

  it('частично: «расхождений не найдено · не сверено — 4», строки «не найдено в документе» и «нет в ДТ»', async () => {
    api.list.mockResolvedValue([check({
      verdict: 'partial', mismatchCount: 0, notComparedCount: 4,
      rows: [
        row({ field: 'contractNumber', result: 'notInDt', key: true, declarationNote: 'notInGr44',
          documents: [{ value: 'АКВТ20250513', fileName: 'Валютный контракт.pdf', kind: 'contract' }] }),
        row({ field: 'invoiceNumber', result: 'notInDocument', key: true, declarationValue: '11111' }),
        row({ field: 'gross', result: 'notInDocument', key: true, valueKind: 'number', declarationValue: '22222' }),
        row({ field: 'net', result: 'notInDocument', key: true, valueKind: 'number', declarationValue: '44444' }),
      ],
    })])
    await mountIt()
    expect(title()).toBe('Сверка документов: расхождений не найдено · не сверено — 4')
    const contract = w.get('[data-doccheck-row="contractNumber"]')
    expect(contract.get('[data-doccheck-result]').text()).toBe('нет в ДТ')
    expect(contract.get('[data-doccheck-note]').text()).toBe('в гр. 44 нет')
    expect(w.get('[data-doccheck-row="invoiceNumber"] [data-doccheck-result]').text()).toBe('не найдено в документе')
    expect(w.get('[data-doccheck-row="gross"] [data-doccheck-cell="dt"]').text()).toContain('22 222')
  })

  it('расхождения: документ (значение и файл), ДТ (значение и примечание), итог; числа, даты и деньги по языку', async () => {
    api.list.mockResolvedValue([check()])
    await mountIt()
    expect(title()).toBe('Сверка документов: расхождений — 3 · не сверено — 2')
    expect(w.get('[data-case-doccheck]').attributes('data-verdict')).toBe('mismatch')
    const inv = w.get('[data-doccheck-row="invoiceNumber"]')
    expect(inv.attributes('data-result')).toBe('mismatch')
    expect(inv.get('[data-doccheck-docvalue]').text()).toBe('UR0910 · invoice_UR0910.xlsx')
    expect(inv.get('[data-doccheck-cell="dt"]').text()).toContain('11111')
    expect(inv.get('[data-doccheck-result]').text()).toBe('не совпадает')
    expect(w.get('[data-doccheck-row="invoiceDate"] [data-doccheck-cell="dt"]').text()).toContain('10.09.2202')
    expect(w.get('[data-doccheck-row="invoiceDate"] [data-doccheck-docvalue]').text()).toContain('10.09.2026')
    expect(w.get('[data-doccheck-row="gross"] [data-doccheck-docvalue]').text()).toContain('1 198,5')
    expect(w.get('[data-doccheck-row="gross"] [data-doccheck-cell="dt"]').text()).toContain('22 222')
    expect(w.get('[data-doccheck-row="net"] [data-doccheck-note]').text()).toBe('заполнено у 2 из 3 товаров')
    expect(w.get('[data-doccheck-row="valueTotal"] [data-doccheck-cell="dt"]').text()).toContain('1 602,70 USD')
    // Таблица доступна экранному диктору; чипы файлов — «распознан».
    expect(w.get('[data-doccheck-table] caption').text()).toBe('Сверка полей документов с ДТ')
    expect(w.findAll('[data-doccheck-doc="recognized"]')).toHaveLength(2)
    expect(w.get('[data-doccheck-footer]').text()).toContain('Сверено с ДТ')
  })

  it('«расхождений нет» — только если все сверки ok; ok + partial — partial', async () => {
    const ok = check({ verdict: 'ok', mismatchCount: 0, notComparedCount: 0,
      rows: [row({ field: 'invoiceNumber', result: 'match', key: true, declarationValue: 'UR0910',
        documents: [{ value: 'UR0910', fileName: 'i.xlsx', kind: 'invoice', result: 'match' }] })] })
    api.list.mockResolvedValue([ok])
    await mountIt()
    expect(title()).toBe('Сверка документов: расхождений нет')
    w.unmount()

    api.list.mockResolvedValue([ok, check({ id: 'k2', declarationId: 'd2', verdict: 'partial', mismatchCount: 0, notComparedCount: 1 })])
    await mountIt()
    expect(title()).toBe('Сверка документов: расхождений не найдено · не сверено — 1')
  })

  it('«Сверить заново»: вызов, кнопка занята, сверка заменена, тост', async () => {
    api.list.mockResolvedValue([unrecognized()])
    let resolve!: (c: DocumentCheck) => void
    api.recheck.mockReturnValue(new Promise<DocumentCheck>((r) => { resolve = r }))
    await mountIt()
    await w.get('[data-doccheck-recheck]').trigger('click')
    expect(api.recheck).toHaveBeenCalledWith('c1', 'k1')
    expect(w.get('[data-doccheck-recheck]').attributes('aria-busy')).toBe('true')
    resolve(check())
    await flushPromises()
    expect(title()).toBe('Сверка документов: расхождений — 3 · не сверено — 2')
    expect(w.find('[data-doccheck-table]').exists()).toBe(true)
    expect(msg.success).toHaveBeenCalledWith('Сверено заново')
  })

  it('«Сверить заново»: 502 — тост и пересчёт по текущей ДТ; 409 — «файлы удалены»', async () => {
    api.list.mockResolvedValue([check()])
    api.recheck.mockRejectedValueOnce({ response: { status: 502, data: { title: 'Import40.DocumentCheckReparseFailed' } } })
    await mountIt()
    await w.get('[data-doccheck-recheck]').trigger('click')
    await flushPromises()
    expect(msg.error).toHaveBeenCalledWith(expect.stringContaining('сервис распознавания недоступен'))
    expect(api.list).toHaveBeenCalledTimes(2)

    api.recheck.mockRejectedValueOnce({ response: { status: 409, data: { title: 'Import40.DocumentCheckFilesMissing' } } })
    await w.get('[data-doccheck-recheck]').trigger('click')
    await flushPromises()
    expect(msg.error).toHaveBeenLastCalledWith('Файлы этой сверки удалены из заявки — сверьте по новым документам')
  })

  it('файлы удалены — кнопка недоступна; без права на ДТ — ни кнопки, ни выбора ДТ', async () => {
    api.list.mockResolvedValue([check({ canRecheck: false })])
    await mountIt()
    expect(w.get('[data-doccheck-recheck]').attributes('disabled')).toBeDefined()
    w.unmount()

    api.list.mockResolvedValue([check({ declarationId: null, verdict: 'noDt' })])
    await mountIt({ canManage: false, declarations: [{ id: 'd1', declarationNumber: '1' }, { id: 'd2', declarationNumber: '2' }] })
    expect(w.find('[data-doccheck-recheck]').exists()).toBe(false)
    expect(w.find('[data-doccheck-choose-dt]').exists()).toBe(false)
  })

  it('ДТ не выбрана — подсказка и выбор ДТ; разделённая — одной позицией; выбор связывает и перечитывает', async () => {
    api.list.mockResolvedValue([check({ declarationId: null, declarationNumber: null, verdict: 'noDt', mismatchCount: 0 })])
    api.link.mockResolvedValue(undefined)
    await mountIt({
      declarations: [
        { id: 'd1', declarationNumber: '50408/171026/0001', isSplitReplaced: true },
        { id: 'p1', declarationNumber: '', splitSourceDeclarationId: 'd1' },
        { id: 'p2', declarationNumber: '', splitSourceDeclarationId: 'd1' },
        { id: 'd2', declarationNumber: '' },
      ],
    })
    expect(title()).toBe('Сверка документов: выберите ДТ')
    expect(w.find('[data-doccheck-nodt]').exists()).toBe(true)
    expect(w.get('[data-doccheck-dt]').text()).toBe('Разбор без ДТ')
    const select = w.findComponent({ name: 'ZSelect' })
    expect((select.props('options') as { label: string }[]).map((o) => o.label))
      .toEqual(['ДТ ЕТТ + ВТО · 50408/171026/0001', 'ДТ без номера'])
    select.vm.$emit('update:value', 'd1')
    await flushPromises()
    expect(api.link).toHaveBeenCalledWith('c1', 'k1', 'd1')
    expect(api.list).toHaveBeenCalledTimes(2)
  })

  // Ревью №13: в заявке нет ни одной ДТ — не «выберите ДТ / в заявке несколько ДТ», а «в заявке нет ДТ», без выбора.
  it('в заявке нет ДТ — свой заголовок и подсказка, выбора ДТ нет', async () => {
    api.list.mockResolvedValue([check({ declarationId: null, declarationNumber: null, verdict: 'noDt', mismatchCount: 0, noDeclarationsInCase: true })])
    await mountIt({ declarations: [] })
    expect(title()).toBe('Сверка документов: в заявке нет ДТ')
    expect(w.get('[data-doccheck-nodt]').text()).toContain('В заявке нет ДТ — документы сверены только между собой')
    expect(w.get('[data-doccheck-nodt]').text()).not.toContain('несколько ДТ')
    expect(w.find('[data-doccheck-choose-dt]').exists()).toBe(false)
  })

  // Ревью №13 (design §5.2.3): ключевые поля не найдены, но есть расхождение (номера ТС с заявкой) — предупреждение
  // над таблицей, таблица остаётся.
  it('расхождение при нераспознанных ключевых полях — предупреждение и таблица', async () => {
    api.list.mockResolvedValue([check({
      verdict: 'mismatch', unrecognized: true, mismatchCount: 1,
      rows: [row({ field: 'invoiceNumber', result: 'notInDocument', key: true, declarationValue: '11111' })],
      caseDiscrepancies: [{ scope: 'case', field: 'tractor', fieldLabel: 'Номер тягача', itemIndex: null, itemDescription: null,
        values: [{ value: '184AFR19', sourceKind: 'documents', source: null }, { value: '01AB123', sourceKind: 'case', source: null }] }],
    })])
    await mountIt()
    expect(title()).toBe('Сверка документов: расхождений — 1 · не сверено — 2')
    expect(w.get('[data-doccheck-unrecognized]').text()).toContain('Номера, веса и суммы в документах не найдены')
    expect(w.find('[data-doccheck-table]').exists()).toBe(true)
  })

  // Ревью №13: разделение одного товара — только часть ВТО; подпись по частям, которые есть.
  it('разделённая ДТ только с частью ВТО — «ДТ ВТО» в подписи и в выборе ДТ', async () => {
    api.list.mockResolvedValue([check({ declarationSplit: true, declarationSplitRoles: ['VTO'] })])
    await mountIt({
      declarations: [
        { id: 'd1', declarationNumber: '50408/171026/0001', isSplitReplaced: true },
        { id: 'p1', declarationNumber: '', splitSourceDeclarationId: 'd1', splitRole: 'VTO' },
        { id: 'd2', declarationNumber: '7' },
      ],
    })
    expect(w.get('[data-doccheck-dt]').text()).toBe('ДТ ВТО')
    const select = w.findComponent({ name: 'ZSelect' })
    expect((select.props('options') as { label: string }[]).map((o) => o.label)).toEqual(['ДТ ВТО · 50408/171026/0001', 'ДТ 7'])
  })

  it('«Сверить заново»: таймаут — свой тост; остались только .xls — подсказка «нечего отправить»; вид «сертификат»', async () => {
    api.list.mockResolvedValue([check({
      documents: [{ fileName: 'CT-1.pdf', kind: 'certificate', recognized: true, reason: null, itemsCount: 0 }],
    })])
    api.recheck.mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout of 180000ms exceeded' })
    await mountIt()
    expect(w.get('[data-doccheck-doc="recognized"]').text()).toContain('сертификат')
    await w.get('[data-doccheck-recheck]').trigger('click')
    await flushPromises()
    expect(msg.error).toHaveBeenCalledWith('Разбор не уложился в 3 минуты — документы не разобраны заново. Попробуйте ещё раз.')
    w.unmount()

    api.list.mockResolvedValue([check({ canRecheck: false, recheckBlocked: 'nothingToParse' })])
    await mountIt()
    const button = w.get('[data-doccheck-recheck]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title')).toBe('В сервис распознавания нечего отправить: Excel .xls читается только в браузере')
  })

  it('прежняя сверка — подсказка «Сверить заново»; документы между собой и с заявкой — списком', async () => {
    api.list.mockResolvedValue([check({
      legacy: true, documents: [],
      itemConflicts: [{ scope: 'documents', field: 'gross', fieldLabel: 'Вес брутто, кг', itemIndex: 1, itemDescription: 'Сушилка',
        values: [{ value: '1000', sourceKind: 'document', source: 'invoice.xlsx' }, { value: '1010', sourceKind: 'document', source: 'packing.xlsx' }] }],
      caseDiscrepancies: [{ scope: 'case', field: 'trailer', fieldLabel: 'Номер прицепа', itemIndex: null, itemDescription: null,
        values: [{ value: '48AEU19', sourceKind: 'documents', source: null }, { value: '01AB123', sourceKind: 'case', source: null }] }],
    })])
    await mountIt()
    expect(w.find('[data-doccheck-legacy]').exists()).toBe(true)
    const item = w.get('[data-doccheck-section="docs"] [data-doccheck-item="documents:gross"]')
    expect(item.text()).toContain('строка 1 «Сушилка»')
    expect(item.findAll('[data-doccheck-value]').map((v) => v.text())).toEqual(['invoice.xlsx: 1000', 'packing.xlsx: 1010'])
    expect(w.get('[data-doccheck-section="case"]').findAll('[data-doccheck-value]').map((v) => v.text()))
      .toEqual(['Документы: 48AEU19', 'Заявка: 01AB123'])
    // Без сведений по файлам — имена файлов в строке заголовка.
    expect(w.get('[data-doccheck]').text()).toContain('invoice_UR0910.xlsx, PACKING_LIST_UR0910.xlsx')
  })
})
