import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { DocumentCheck, DocumentCheckRow } from '@/api/documentChecks'

const api = vi.hoisted(() => ({ list: vi.fn(), link: vi.fn(), recheck: vi.fn(), addMarks: vi.fn(), removeMarks: vi.fn(), apply: vi.fn() }))
vi.mock('@/api/documentChecks', () => ({ documentChecksApi: api, DOC_CHECK_CHANGED: 'Import40.DocumentCheckChanged' }))
vi.mock('@/api/import40', () => ({ import40Api: { downloadFile: vi.fn() } }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: msg }))

import CaseDocumentCheck from '../CaseDocumentCheck.vue'

// Новый вид сверки (01.11.2026): документы одной поставки → «Исправить в ДТ» → «Проверить вручную» → «Совпадает»;
// прежние сверки — свёрнуто; без права на ДТ блок не запрашивается.

const row = (p: Partial<DocumentCheckRow> & Pick<DocumentCheckRow, 'field' | 'result'>): DocumentCheckRow => ({
  fieldLabel: p.field, box: '44', valueKind: 'text', key: false, documents: [], declarationValue: null,
  declarationNote: null, documentsNote: null, markKey: `row:${p.field}`, fingerprint: `fp-${p.field}`, mark: null,
  section: p.result === 'match' ? 'match' : p.result === 'mismatch' || p.result === 'docsDiffer' ? 'fix' : 'manual', ...p,
})

const rows: DocumentCheckRow[] = [
  row({ field: 'invoiceNumber', result: 'mismatch', key: true, declarationValue: '11111', applyValue: 'HZSN-PIT-CI-100901',
    documents: [
      { value: 'HZSN-PIT-CI-100901', fileName: 'invoice.xlsx', kind: 'invoice', result: 'mismatch' },
      { value: 'HZSN-PIT-CI-100901', fileName: 'packing.xlsx', kind: 'packing', result: 'mismatch' },
    ] }),
  row({ field: 'gross', result: 'mismatch', key: true, box: '35', valueKind: 'number', declarationValue: '900',
    documents: [{ value: '1000', fileName: '179随车.pdf · p3', kind: 'invoice' }] }),
  row({ field: 'contractNumber', result: 'notInDocument', key: true, declarationValue: 'K-15' }),
  row({ field: 'sender', result: 'checkName', box: '2', declarationValue: 'ТОО ТЕСТ',
    documents: [{ value: 'TEST LLP', fileName: 'invoice.xlsx', kind: 'invoice', result: 'checkName' }] }),
  row({ field: 'currency', result: 'match', box: '22', declarationValue: 'CNY',
    documents: [{ value: 'CNY', fileName: 'invoice.xlsx', kind: 'invoice', result: 'match' }] }),
]

const check = (p: Partial<DocumentCheck> = {}): DocumentCheck => ({
  id: 'k1', declarationId: 'd1', declarationNumber: '50408/011126/0001', createdAtUtc: '2026-11-01T09:30:00Z',
  sourceFileNames: ['invoice.xlsx', 'packing.xlsx', '179随车.pdf'], sourceDocumentTypes: [],
  contractNumber: null, invoiceNumber: null, transportDocument: null, transportPlates: [], discrepancies: [],
  verdict: 'mismatch', unrecognized: false, mismatchCount: 2, notComparedCount: 1, warningCount: 1,
  rows,
  documents: [
    { fileName: 'invoice.xlsx', kind: 'invoice', recognized: true, reason: null, itemsCount: 3, key: 'sha:a|', fileId: 'f1', shipmentGroup: 0 },
    { fileName: 'packing.xlsx', kind: 'packing', recognized: true, reason: null, itemsCount: 3, key: 'sha:b|', fileId: 'f2', shipmentGroup: 0 },
    { fileName: '179随车.pdf', sheet: 'p3', kind: 'invoice', recognized: true, reason: null, itemsCount: 3, key: 'sha:c|p3', fileId: 'f3', shipmentGroup: 1 },
    { fileName: '179随车.pdf', sheet: 'p4', kind: 'other', recognized: false, reason: 'noFields', itemsCount: 0, key: 'sha:c|p4', fileId: 'f3' },
  ],
  itemConflicts: [], caseDiscrepancies: [],
  declarationUpdatedAtUtc: '2026-11-01T10:00:00Z', parsedAtUtc: '2026-11-01T09:30:00Z', legacy: false, canRecheck: true,
  fixCount: 2, acceptedCount: 0, manualCount: 2, manualCheckedCount: 0, matchCount: 1,
  shipment: {
    main: { invoice: 'HZSN-PIT-CI-100901', value: 512929.17, currency: 'CNY', sourceKeys: ['sha:a|', 'sha:b|'], fileNames: ['invoice.xlsx', 'packing.xlsx'] },
    foreign: [{ invoice: 'HZSN-PIT-CI-100804', value: 475870.83, currency: 'CNY', sourceKeys: ['sha:c|p3'], fileNames: ['179随车.pdf · p3'] }],
  },
  unresolved: true, canApply: true, openDeclarationId: 'd1',
  ...p,
})

let w: VueWrapper
let router: Router
const mountIt = async (props: Record<string, unknown> = {}) => {
  w = mountWithI18n(CaseDocumentCheck, {
    attachTo: document.body,
    props: { caseId: 'c1', stamp: 'a', canManage: true, declarations: [{ id: 'd1', declarationNumber: '50408/011126/0001' }], ...props },
    global: { plugins: [router] },
  })
  await flushPromises()
}
beforeEach(async () => {
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  await router.push('/import-40/c1')
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('CaseDocumentCheck (новый вид)', () => {
  it('без права на ДТ блок не запрашивается и не показывается', async () => {
    api.list.mockResolvedValue([check()])
    await mountIt({ canManage: false })
    expect(api.list).not.toHaveBeenCalled()
    expect(w.find('[data-case-doccheck]').exists()).toBe(false)
  })

  it('порядок: шапка со счётчиками → одна поставка → исправить → проверить вручную → совпадает', async () => {
    api.list.mockResolvedValue([check()])
    await mountIt()
    expect(w.get('[data-case-doccheck] h2').text()).toBe('Сверка документов с ДТ')
    expect(w.findAll('[data-doccheck-counter]').map((c) => c.text())).toEqual(['Исправить — 2', 'Проверить вручную — 2', 'Совпадает — 1'])
    expect(w.findAll('[data-doccheck-block]').map((b) => b.attributes('data-doccheck-block'))).toEqual(['docs', 'fix', 'manual', 'match'])

    // Многостраничный файл — одной плашкой; нераспознанная страница — тихой пометкой.
    expect(w.findAll('[data-doccheck-file]').map((f) => f.attributes('data-doccheck-file'))).toEqual(['invoice.xlsx', 'packing.xlsx', '179随车.pdf'])
    expect(w.get('[data-doccheck-file="179随车.pdf"] [data-doccheck-unrec]').text()).toBe('не распознано частей: 1')
    expect(w.get('[data-doccheck-shipment]').text().replace(/[\u00a0\u202f]/g, ' ')).toContain(
      '179随车.pdf · p3, похоже, от другой поставки: инвойс HZSN-PIT-CI-100804 на 475 870,83 CNY, в остальных — HZSN-PIT-CI-100901 на 512 929,17 CNY')

    // «Исправить»: ДТ → документ, значение одно на все документы; «Совпадает» свёрнуто.
    const inv = w.get('[data-doccheck-fix="invoiceNumber"]')
    expect(inv.get('[data-doccheck-change]').text()).toContain('11111')
    expect(inv.get('[data-doccheck-change]').text()).toContain('HZSN-PIT-CI-100901')
    expect(inv.get('[data-doccheck-source]').text()).toBe('во всех 2 документах одинаково')
    expect(inv.find('[data-doccheck-apply]').exists()).toBe(true)
    expect(w.get('[data-doccheck-fix="gross"] [data-doccheck-source]').text()).toBe('источник: 179随车.pdf · p3')
    expect(w.get('[data-doccheck-fix="gross"] [data-doccheck-open-dt]').attributes('href')).toBe('/import-40/c1/dt/d1?s=goods')
    expect(w.find('[data-doccheck-fix="gross"] [data-doccheck-apply]').exists()).toBe(false)
    expect(w.get('[data-doccheck-manual="sender"]').text()).toContain('в ДТ «ТОО ТЕСТ», в документе «TEST LLP»')
    expect(w.get('[data-doccheck-manual="contractNumber"]').text()).toContain('K-15')
    expect(w.find('[data-doccheck-match]').exists()).toBe(false)
    await w.get('[data-doccheck-match-toggle]').trigger('click')
    expect(w.get('[data-doccheck-match]').text()).toContain('Валюта: CNY')
  })

  it('«Исключить из сверки», «В ДТ верно», «Проверил», «Поставить в ДТ» — запросы с ключом и отпечатком', async () => {
    api.list.mockResolvedValue([check()])
    api.addMarks.mockResolvedValue(check())
    api.apply.mockResolvedValue(check())
    await mountIt()
    await w.get('[data-doccheck-exclude]').trigger('click')
    await flushPromises()
    expect(api.addMarks).toHaveBeenLastCalledWith('c1', 'k1', 'exclude', [{ key: 'sha:c|p3' }])

    await w.get('[data-doccheck-fix="gross"] [data-doccheck-accept]').trigger('click')
    await flushPromises()
    expect(api.addMarks).toHaveBeenLastCalledWith('c1', 'k1', 'accept', [{ key: 'row:gross', fingerprint: 'fp-gross' }])

    await w.get('[data-doccheck-checked]').trigger('click')
    await flushPromises()
    expect(api.addMarks).toHaveBeenLastCalledWith('c1', 'k1', 'manual', [
      { key: 'row:contractNumber', fingerprint: 'fp-contractNumber' }, { key: 'row:sender', fingerprint: 'fp-sender' },
    ])

    await w.get('[data-doccheck-fix="invoiceNumber"] [data-doccheck-apply]').trigger('click')
    await flushPromises()
    expect(api.apply).toHaveBeenCalledWith('c1', 'k1', 'invoiceNumber', 'fp-invoiceNumber', '2026-11-01T10:00:00Z')
    expect(msg.success).toHaveBeenCalledWith('Поставлено в ДТ')
  })

  it('значения изменились (409) — тост и перечитывание', async () => {
    api.list.mockResolvedValue([check()])
    api.addMarks.mockRejectedValue({ response: { status: 409, data: { title: 'Import40.DocumentCheckChanged' } } })
    await mountIt()
    await w.get('[data-doccheck-fix="gross"] [data-doccheck-accept]').trigger('click')
    await flushPromises()
    expect(msg.error).toHaveBeenCalledWith('Значения изменились — сверка обновлена, посмотрите ещё раз.')
    expect(api.list).toHaveBeenCalledTimes(2)
  })

  it('исключённый файл — строкой «исключён — Вернуть»; принятое — свёрнуто «Принято: N»; расхождений нет — коротко', async () => {
    const excludedBy = { kind: 'exclude' as const, byName: 'Айгерим', atUtc: '2026-11-01T11:00:00Z' }
    const accepted = { kind: 'accept' as const, byName: 'Айгерим', atUtc: '2026-11-01T11:05:00Z' }
    api.list.mockResolvedValue([check({
      shipment: null, unresolved: false, fixCount: 0, acceptedCount: 1, manualCount: 0, manualCheckedCount: 0, matchCount: 1,
      rows: [row({ field: 'gross', result: 'mismatch', valueKind: 'number', declarationValue: '900', mark: accepted,
        documents: [{ value: '1000', fileName: 'invoice.xlsx', kind: 'invoice' }] }), rows[4]],
      documents: [
        { fileName: 'invoice.xlsx', kind: 'invoice', recognized: true, reason: null, itemsCount: 3, key: 'sha:a|', shipmentGroup: 0 },
        { fileName: '179随车.pdf', sheet: 'p3', kind: 'invoice', recognized: true, reason: null, itemsCount: 3, key: 'sha:c|p3', excluded: excludedBy },
      ],
    })])
    api.removeMarks.mockResolvedValue(check())
    await mountIt()
    expect(w.get('[data-case-doccheck]').attributes('data-unresolved')).toBe('false')
    expect(w.get('[data-doccheck-fix-empty]').text()).toBe('Расхождений с документами нет.')
    expect(w.find('[data-doccheck-block="manual"]').exists()).toBe(false)
    expect(w.get('[data-doccheck-excluded]').text()).toContain('179随车.pdf · p3')
    expect(w.get('[data-doccheck-accepted]').text()).toContain('Принято: 1')
    await w.get('[data-doccheck-restore]').trigger('click')
    await flushPromises()
    expect(api.removeMarks).toHaveBeenCalledWith('c1', 'k1', 'exclude', 'sha:c|p3')
  })

  it('на ДТ — самая новая сверка; сверка без ДТ при одной ДТ — её; прежние свёрнуты, старым видом', async () => {
    api.list.mockResolvedValue([
      check({ id: 'new', parsedAtUtc: '2026-11-01T09:30:00Z' }),
      check({ id: 'mid', parsedAtUtc: '2026-10-31T09:30:00Z' }),
      check({ id: 'old', declarationId: null, legacy: true, parsedAtUtc: '2026-10-19T09:30:00Z' }),
    ])
    await mountIt()
    expect(w.findAll('[data-doccheck]').map((a) => a.attributes('data-doccheck'))).toEqual(['new'])
    expect(w.find('[data-doccheck-legacy]').exists()).toBe(false)   // «прежней версией» — только у самой новой
    expect(w.get('[data-doccheck-older-toggle]').text()).toBe('Прежние сверки: 31.10, 19.10')
    expect(w.find('[data-doccheck-legacy-view]').exists()).toBe(false)
    await w.get('[data-doccheck-older-toggle]').trigger('click')
    expect(w.findAll('[data-doccheck-legacy-view]').map((x) => x.attributes('data-doccheck-legacy-view'))).toEqual(['mid', 'old'])
    expect(w.find('[data-doccheck-older] [data-doccheck-recheck]').exists()).toBe(false)
  })

  it('несколько ДТ: сверка без ДТ — отдельным блоком «Разбор без ДТ» с выбором ДТ', async () => {
    api.list.mockResolvedValue([check({ id: 'free', declarationId: null, declarationNumber: null, verdict: 'noDt', shipment: null })])
    api.link.mockResolvedValue(undefined)
    await mountIt({ declarations: [{ id: 'd1', declarationNumber: '1' }, { id: 'd2', declarationNumber: '' }] })
    expect(w.get('[data-doccheck-dt]').text()).toBe('Разбор без ДТ')
    expect(w.find('[data-doccheck-nodt]').exists()).toBe(true)
    const select = w.findComponent({ name: 'ZSelect' })
    select.vm.$emit('update:value', 'd2')
    await flushPromises()
    expect(api.link).toHaveBeenCalledWith('c1', 'free', 'd2')
  })

  it('«Сверить заново»: вызов, сверка заменена, тост; 409 «файлы удалены»', async () => {
    api.list.mockResolvedValue([check()])
    api.recheck.mockResolvedValueOnce(check({ fixCount: 0, unresolved: false, shipment: null }))
    await mountIt()
    await w.get('[data-doccheck-recheck]').trigger('click')
    await flushPromises()
    expect(api.recheck).toHaveBeenCalledWith('c1', 'k1')
    expect(msg.success).toHaveBeenCalledWith('Сверено заново')
    expect(w.get('[data-doccheck-counter="fix"]').text()).toBe('Исправить — 0')

    api.recheck.mockRejectedValueOnce({ response: { status: 409, data: { title: 'Import40.DocumentCheckFilesMissing' } } })
    await w.get('[data-doccheck-recheck]').trigger('click')
    await flushPromises()
    expect(msg.error).toHaveBeenLastCalledWith('Файлы этой сверки удалены из заявки — сверьте по новым документам')
  })
})
