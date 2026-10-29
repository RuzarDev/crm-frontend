import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Import40CaseDto, Import40DeclarationDto, Import40ExtractionResult, Import40FileDto } from '@/api/import40'
import { mountWithI18n } from '@/test/mountWithI18n'
import { emptyDtForm, type DtFormState } from '../../dtPayload'
import { blankCharacteristic } from '../editor/characteristics'
import { newDtGoodsItem, useDtGoods } from '../useDtGoods'

// «Из документов» в уже созданную ДТ (29.10.2026): весь путь страницы — файлы заявки, extract-batch, сводка, «Применить»
// (форма + сохранение + сверка к ДТ), «Отмена». Данные вымышленные: «ТОО ТЕСТ».
const api = vi.hoisted(() => ({ listFiles: vi.fn(), extractBatch: vi.fn(), downloadFile: vi.fn() }))
const checks = vi.hoisted(() => ({ link: vi.fn(async () => undefined) }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
const tnved = vi.hoisted(() => ({ checkCodes: vi.fn() }))
vi.mock('@/api/import40', () => ({ import40Api: api }))
vi.mock('@/api/documentChecks', () => ({ documentChecksApi: checks }))
vi.mock('@/api/tnved', () => ({ tnvedApi: tnved }))
vi.mock('@/api/partyRefs', () => ({ partyRefsApi: { search: vi.fn(async () => []) } }))
vi.mock('@/api/references', () => ({ referencesApi: { listOkeiUnits: vi.fn(async () => []), listClassifiers: vi.fn(async () => []) } }))
vi.mock('@/api/companyLookup', () => ({ companyLookupApi: { byBin: vi.fn(async () => { throw new Error('404') }) }, isBinLike: () => false }))
vi.mock('@/ui/message', () => ({ message: msg }))

import { useDocsIntoDt, type DocsIntoDt } from '../useDocsIntoDt'

const file = (id: string, at: string): Import40FileDto => ({
  id, section: 'documents', originalFileName: `${id}.pdf`, contentType: 'application/pdf', sizeBytes: 1,
  uploadedByBusinessRole: 'client', createdAtUtc: at, docKind: null,
})
const result = (o: Partial<Import40ExtractionResult> = {}): Import40ExtractionResult => ({
  declaration: {
    currency: 'USD', incoterms: 'FCA',
    goodsItems: [
      { description: 'Ноутбук', tnvedCode: '8471300000', quantity: 10, grossWeightKg: 50, invoiceValue: 1000 },
      { description: 'Мышь', tnvedCode: '8471607000', quantity: 5, grossWeightKg: 1, invoiceValue: 50 },
    ],
  },
  warnings: ['Скан низкого качества'], conflicts: [], documentCheckId: 'chk1', ...o,
})

let form: DtFormState
let ctl: DocsIntoDt
const save = vi.fn(async () => true)
const mount = () => {
  form = reactive({
    ...emptyDtForm(), id: 'd1', currency: 'USD', incoterms: '',
    goodsItems: [{ ...newDtGoodsItem('USD'), description: 'НОУТБУК', tnvedCode: '8471300000', grossWeightKg: 48, characteristics: [blankCharacteristic()] }],
  }) as DtFormState
  const goods = useDtGoods(form, { readiness: () => null, canEdit: true })
  const Host = defineComponent({
    setup() {
      ctl = useDocsIntoDt({
        caseId: 'c1', dtId: 'd1', form, goods,
        kase: () => ({ transportMode: 1, foreignContractId: null } as Import40CaseDto),
        dto: () => ({ createdAtUtc: '2026-10-28T12:00:00Z' } as Import40DeclarationDto),
        enabled: () => true,
        save,
      })
      return () => h('div')
    },
  })
  return mountWithI18n(Host)
}

beforeEach(() => {
  setActivePinia(createPinia())
  api.listFiles.mockResolvedValue([file('old', '2026-10-27T09:00:00Z'), file('new', '2026-10-29T09:00:00Z')])
  api.extractBatch.mockResolvedValue(result())
  tnved.checkCodes.mockImplementation(async (codes: string[]) => ({ data: codes.map((code) => ({
    code, valid: true, name: 'КОД', endDate: null, unitCode: '796', unitName: 'Штука', unitShortName: 'ШТ',
  })) }))
})
afterEach(() => { vi.clearAllMocks() })

describe('useDocsIntoDt', () => {
  it('окно выбора: отмечены документы после создания ДТ; разбор → сводка; «Применить» — форма, сверка к ДТ, сохранение', async () => {
    const w = mount()
    await ctl.open()
    expect(api.listFiles).toHaveBeenCalledWith('c1', { silent: true })
    expect(ctl.pickOpen.value).toBe(true)
    expect(ctl.defaults.value).toMatchObject({ ids: ['new'], newIds: ['new'], known: true })

    await ctl.submit({ fileIds: ['new'], uploads: [] })
    await flushPromises()
    expect(api.extractBatch).toHaveBeenCalledWith('c1', [], ['new'])
    expect(ctl.summaryOpen.value).toBe(true)
    const plan = ctl.plan.value!
    expect(plan.goods.plan).toMatchObject({ added: 1, updated: 1 })
    expect(plan.header.groups).toContain('incoterms')
    expect(ctl.remarks.value).toContain('Скан низкого качества')
    // До «Применить» форма не тронута.
    expect(form.goodsItems).toHaveLength(1)

    await ctl.apply()
    expect(form.goodsItems.map((g) => g.tnvedCode)).toEqual(['8471300000', '8471607000'])
    expect(form.goodsItems[0].grossWeightKg).toBe(48) // заполненное — как было
    expect(form.incoterms).toBe('FCA')
    expect(checks.link).toHaveBeenCalledWith('c1', 'chk1', 'd1')
    expect(save).toHaveBeenCalledTimes(1)
    expect(ctl.summaryOpen.value).toBe(false)
    expect(msg.success).toHaveBeenCalledWith(expect.objectContaining({ action: expect.objectContaining({ label: 'Отменить' }) }))
    w.unmount()
  })

  it('«Отмена» сводки — форма не меняется, не сохраняется; ошибка разбора — тост, сводки нет', async () => {
    const w = mount()
    await ctl.open()
    await ctl.submit({ fileIds: ['new'], uploads: [] })
    await flushPromises()
    ctl.close()
    expect(form.goodsItems).toHaveLength(1)
    expect(save).not.toHaveBeenCalled()
    expect(checks.link).not.toHaveBeenCalled()

    api.extractBatch.mockRejectedValueOnce(new Error('502'))
    await ctl.submit({ fileIds: ['new'], uploads: [] })
    expect(msg.error).toHaveBeenCalledWith('Не удалось распознать пакет документов')
    expect(ctl.summaryOpen.value).toBe(false)
    w.unmount()
  })
})
