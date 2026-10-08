import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type { Import40CaseDto, Import40ExtractionResult } from '@/api/import40'
import type { DeclarationReadiness } from '@/types/api'
import { confirmState } from '@/ui/confirm'
import { formatMoney } from '@/ui/number'
import type { CaseAuth } from '../casePermissions'
import { USERS, declaration } from './caseFixture'
import { mountStep } from './stepHarness'

const api = vi.hoisted(() => ({
  createDeclaration: vi.fn(), deleteDeclaration: vi.fn(), downloadKedenXml: vi.fn(), downloadKedenBatch: vi.fn(), extractBatch: vi.fn(),
  caseQuotes: vi.fn(), importQuote: vi.fn(), kedenReadiness: vi.fn(), kedenReadinessSummary: vi.fn(), get: vi.fn(),
}))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
const dl = vi.hoisted(() => ({ saveBlob: vi.fn() }))
vi.mock('@/api/import40', () => ({ import40Api: api }))
vi.mock('@/ui/message', () => ({ message: msg }))
vi.mock('@/ui/download', () => dl)

import DeclarationsList from '../steps/DeclarationsList.vue'

const DropdownStub = {
  props: ['items'], emits: ['select'],
  template: '<div data-dropdown><slot /><button v-for="it in items" :key="it.key" type="button" :data-menu-item="it.key" @click="$emit(\'select\', it.key)">{{ it.label }}</button></div>',
}
const ModalStub = { props: ['open'], emits: ['update:open'], template: '<div v-if="open" data-modal><slot /><slot name="footer" /></div>' }

let w: VueWrapper
let router: Router
const mount = (user: CaseAuth, o: { kase?: Partial<Import40CaseDto>; readiness?: DeclarationReadiness[] | null; mode?: 'current' | 'done' } = {}) => {
  const m = mountStep(DeclarationsList, {
    user, step: 3, mode: o.mode ?? 'current', kase: { status: 2, ...o.kase }, readiness: o.readiness ?? null,
    plugins: [router], stubs: { ZDropdown: DropdownStub, ZModal: ModalStub },
  })
  w = m.w
  return m
}
const row = (id: string) => w.get(`[data-dt-row="${id}"]`)
const tipOf = (el: Element) => el.closest('[data-tip]')!.getAttribute('data-title')
const rd = (o: Partial<DeclarationReadiness> & { declarationId: string }): DeclarationReadiness =>
  ({ declarationNumber: '', isReady: false, missing: [], filled: 0, total: 22, ...o })

const two = [declaration({ id: 'd1' }), declaration({ id: 'd2', declarationNumber: '55210/031026/0012240', splitRole: 'VTO', goodsItems: [{}] as never })]

beforeEach(async () => {
  const stub = { template: '<div/>' }
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/import-40/:id', component: stub }, { path: '/import-40/:id/dt/:dtId', component: stub }] })
  await router.push('/import-40/c1')
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('DeclarationsList: строки и готовность', () => {
  it('«не хватает» — из сводки готовности, без запросов по каждой ДТ; первые 3, остальное — «и ещё N» с раскрытием', async () => {
    const missing = ['гр. 31 (поз. 3)', 'гр. 33', 'гр. 44 — сертификат', 'гр. 47', 'гр. 8']
    mount(USERS.declarant, {
      kase: { declarations: two },
      readiness: [rd({ declarationId: 'd1', filled: 15, missing }), rd({ declarationId: 'd2', isReady: true, filled: 22 })],
    })
    expect(api.kedenReadiness).not.toHaveBeenCalled()
    expect(api.kedenReadinessSummary).not.toHaveBeenCalled()
    expect(row('d1').get('[data-dt-graphs]').text()).toBe('15/22 граф')
    expect(row('d1').get('[role="progressbar"]').attributes('aria-valuenow')).toBe('15')
    const m = row('d1').get('[data-dt-missing]')
    expect(m.text()).toContain('не хватает: гр. 31 (поз. 3), гр. 33, гр. 44 — сертификат')
    expect(m.text()).not.toContain('гр. 47')
    expect(m.get('[data-dt-missing-more]').text()).toBe('и ещё 2')
    await m.get('[data-dt-missing-more]').trigger('click')
    expect(row('d1').get('[data-dt-missing]').text()).toContain('гр. 47, гр. 8')
    expect(row('d1').get('[data-dt-missing-more]').attributes('aria-expanded')).toBe('true')
    expect(row('d2').get('[data-dt-ready]').text()).toBe('готова к выгрузке')
  })

  it('номер или «ДТ i» ссылкой на страницу ДТ, теги разделения, заменённая приглушена, «товаров: N»', () => {
    const dts = [
      declaration({ id: 'd0', isSplitReplaced: true, declarationNumber: 'SRC-1' }),
      declaration({ id: 'd1', splitRole: 'ETT', splitSourceDeclarationId: 'd0' }),
      declaration({ id: 'd2', splitRole: 'VTO', goodsItems: [{}, {}] as never, totalInvoiceValue: 25000, currency: 'USD' }),
      declaration({ id: 'd3', rateType: 'EATT' }),
      declaration({ id: 'd4', rateType: 'ETT' }),
    ]
    mount(USERS.declarant, { kase: { declarations: dts } })
    expect(row('d0').get('[data-dt-link]').text()).toBe('SRC-1')
    expect(row('d1').get('[data-dt-link]').text()).toBe('ДТ 2')
    expect(row('d1').get('[data-dt-link]').attributes('href')).toBe('/import-40/c1/dt/d1')
    expect(row('d0').get('[data-dt-split]').text()).toBe('Разделена')
    expect(tipOf(row('d0').get('[data-dt-split]').element)).toContain('Заменена декларациями ЕТТ/ВТО')
    expect(row('d0').find('.opacity-55').exists()).toBe(true)
    expect(row('d1').get('[data-dt-split]').text()).toBe('ЕТТ')
    expect(tipOf(row('d1').get('[data-dt-split]').element)).toBe('часть разделения ДТ №SRC-1')
    expect(row('d2').get('[data-dt-split]').text()).toBe('ВТО')
    expect(row('d3').get('[data-dt-split]').text()).toBe('ВТО')
    expect(row('d4').find('[data-dt-split]').exists()).toBe(false)
    expect(row('d2').get('[data-dt-meta]').text()).toBe(`товаров: 2 · стоимость ${formatMoney(25000, 'USD')}`)
  })

  it('поиск — только при числе ДТ > 1, по номеру', async () => {
    mount(USERS.declarant, { kase: { declarations: [declaration()] } })
    expect(w.find('[data-dt-search]').exists()).toBe(false)
    w.unmount()
    mount(USERS.declarant, { kase: { declarations: two } })
    await w.get('[data-dt-search]').setValue('0012240')
    expect(w.findAll('[data-dt-row]').map((r) => r.attributes('data-dt-row'))).toEqual(['d2'])
    await w.get('[data-dt-search]').setValue('нет такой')
    expect(w.get('[data-dt-nothing]').text()).toBe('ДТ с таким номером нет')
  })

  it('пусто — «ДТ ещё не создана» с подсказкой', () => {
    mount(USERS.declarant)
    expect(w.get('[data-dt-empty]').text()).toContain('ДТ ещё не создана')
    expect(w.get('[data-dt-count]').text()).toBe('0')
  })
})

describe('DeclarationsList: действия', () => {
  it('«XML для КЕДЕН» с ошибками — список «Для XML не хватает данных» под строкой и предупреждение', async () => {
    api.downloadKedenXml.mockResolvedValue({ errors: ['Графа 8: БИН получателя', 'Графа 31: описание товара'] })
    mount(USERS.declarant, { kase: { declarations: two } })
    await row('d1').get('[data-dt-xml]').trigger('click')
    await flushPromises()
    expect(api.downloadKedenXml).toHaveBeenCalledWith('c1', 'd1')
    const box = row('d1').get('[data-dt-xml-missing]')
    expect(box.text()).toContain('Для XML не хватает данных:')
    expect(box.findAll('li').map((li) => li.text())).toEqual(['Графа 8: БИН получателя', 'Графа 31: описание товара'])
    expect(row('d2').find('[data-dt-xml-missing]').exists()).toBe(false)
    expect(msg.warning).toHaveBeenCalledWith('XML не сформирован: заполните обязательные поля')
    expect(dl.saveBlob).not.toHaveBeenCalled()
  })

  it('«XML для КЕДЕН» сформирован — скачивание, тост с подсказкой про гр.54, перечитывание', async () => {
    const blob = new Blob(['<x/>'])
    api.downloadKedenXml.mockResolvedValue({ blob, fileName: 'DT-1.xml' })
    const m = mount(USERS.declarant, { kase: { declarations: two } })
    await row('d1').get('[data-dt-xml]').trigger('click')
    await flushPromises()
    expect(dl.saveBlob).toHaveBeenCalledWith(blob, 'DT-1.xml')
    expect(msg.success).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('XML сформирован. После загрузки в КЕДЕН'), duration: 8 }))
    expect(m.reload).toHaveBeenCalled()
  })

  it('удаление ДТ спрашивает подтверждение; «Не удалять» — без запроса, «Удалить» — DELETE, тост, перечитывание', async () => {
    api.deleteDeclaration.mockResolvedValue(undefined)
    const m = mount(USERS.declarant, { kase: { declarations: two } })
    await row('d1').get('[data-menu-item="delete"]').trigger('click')
    expect(confirmState.title).toBe('Удалить ДТ?')
    expect(confirmState.danger).toBe(true)
    confirmState.resolve(false)
    await flushPromises()
    expect(api.deleteDeclaration).not.toHaveBeenCalled()
    await row('d1').get('[data-menu-item="delete"]').trigger('click')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.deleteDeclaration).toHaveBeenCalledWith('c1', 'd1')
    expect(msg.success).toHaveBeenCalledWith('ДТ удалена')
    expect(m.reload).toHaveBeenCalled()
  })

  it('«Добавить ДТ» — POST с пустым телом, тост, перечитывание, без перехода', async () => {
    api.createDeclaration.mockResolvedValue(declaration({ id: 'new' }))
    const m = mount(USERS.declarant)
    await w.get('[data-dt-add]').trigger('click')
    await flushPromises()
    expect(api.createDeclaration).toHaveBeenCalledWith('c1', {})
    expect(msg.success).toHaveBeenCalledWith('ДТ добавлена')
    expect(m.reload).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/import-40/c1')
  })

  it('«XML готовых · N»: число готовых из сводки, выключена без готовых; 400 — предупреждение, успех — zip', async () => {
    mount(USERS.declarant, { kase: { declarations: two }, readiness: [rd({ declarationId: 'd1' }), rd({ declarationId: 'd2' })] })
    expect(w.get('[data-dt-xml-batch]').text()).toBe('XML готовых · 0')
    expect(w.get('[data-dt-xml-batch]').attributes('disabled')).toBeDefined()
    expect(tipOf(w.get('[data-dt-xml-batch]').element)).toBe('Готово 0 из 2 ДТ')
    w.unmount()
    mount(USERS.declarant, { kase: { declarations: two }, readiness: [rd({ declarationId: 'd1', isReady: true }), rd({ declarationId: 'd2' })] })
    expect(w.get('[data-dt-xml-batch]').text()).toBe('XML готовых · 1')
    api.downloadKedenBatch.mockResolvedValueOnce({ error: 'Нет готовых ДТ для выгрузки' })
    await w.get('[data-dt-xml-batch]').trigger('click')
    await flushPromises()
    expect(msg.warning).toHaveBeenCalledWith('Нет готовых ДТ для выгрузки')
    const blob = new Blob(['zip'])
    api.downloadKedenBatch.mockResolvedValueOnce({ blob, fileName: 'keden-1.zip' })
    await w.get('[data-dt-xml-batch]').trigger('click')
    await flushPromises()
    expect(dl.saveBlob).toHaveBeenCalledWith(blob, 'keden-1.zip')
    expect(msg.success).toHaveBeenCalledWith('Готовые ДТ выгружены')
  })

  it('без права декларанта: «Заполнить» и XML выключены с подсказкой, удаления нет, полоса выключена', () => {
    mount(USERS.accountant, { kase: { declarations: two } })
    expect(row('d1').get('[data-dt-fill]').attributes('disabled')).toBeDefined()
    expect(tipOf(row('d1').get('[data-dt-fill]').element)).toBe('Действие выполняет декларант')
    expect(row('d1').get('[data-dt-xml]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-dt-more]').exists()).toBe(false)
    expect(w.get('[data-dt-add]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-dt-quote]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-dt-xml-batch]').exists()).toBe(false)
  })

  it('статус 3: без «Добавить ДТ», «Из документов», «Импорт из КП», но с выгрузкой и правкой строк', () => {
    mount(USERS.declarant, { kase: { status: 3, declarations: two } })
    expect(w.find('[data-dt-add]').exists()).toBe(false)
    expect(w.find('[data-dt-from-docs]').exists()).toBe(false)
    expect(w.find('[data-dt-quote]').exists()).toBe(false)
    expect(w.find('[data-dt-xml-batch]').exists()).toBe(true)
    expect(row('d1').find('[data-dt-fill]').exists()).toBe(true)
  })

  it('после шага 3 (mode done) — только «Открыть», без готовности и действий правки', () => {
    mount(USERS.admin, { kase: { status: 4, declarations: two }, readiness: [rd({ declarationId: 'd1', missing: ['гр. 8'] })], mode: 'done' })
    expect(w.findAll('[data-dt-open]')).toHaveLength(2)
    expect(w.find('[data-dt-missing]').exists()).toBe(false)
    for (const sel of ['[data-dt-fill]', '[data-dt-xml]', '[data-dt-more]', '[data-dt-toolbar]']) expect(w.find(sel).exists()).toBe(false)
  })
})

describe('DeclarationsList: «Из документов»', () => {
  const pick = async (names = ['inv.pdf', 'cmr.jpg']) => {
    const input = w.get('[data-dt-batch-input]')
    const files = names.map((n) => new File(['x'], n))
    Object.defineProperty(input.element, 'files', { value: files, configurable: true })
    await input.trigger('change')
    await flushPromises()
    return files
  }
  const result = (o: Partial<Import40ExtractionResult> = {}): Import40ExtractionResult =>
    ({ declaration: { declarationNumber: null, currency: 'USD', goodsItems: [{ description: 'Ноутбук', quantity: 10 }] }, warnings: [], conflicts: [], ...o })

  it('без замечаний: извлечение, создание ДТ из предпросмотра, тост и сразу переход к ДТ', async () => {
    api.extractBatch.mockResolvedValue(result())
    api.createDeclaration.mockResolvedValue(declaration({ id: 'n1' }))
    mount(USERS.declarant)
    const files = await pick()
    expect(api.extractBatch).toHaveBeenCalledWith('c1', files)
    expect(api.createDeclaration).toHaveBeenCalledWith('c1', expect.objectContaining({
      currency: 'USD', declarationNumber: null,
      goodsItems: [expect.objectContaining({ description: 'Ноутбук', quantity: 10, tnvedDescription: null, unit: null })],
    }))
    expect(msg.success).toHaveBeenCalledWith('Пакет обработан — откройте ДТ, чтобы проверить предзаполненные поля')
    expect(router.currentRoute.value.path).toBe('/import-40/c1/dt/n1')
  })

  it('с конфликтами — окно замечаний, переход к ДТ после его закрытия', async () => {
    api.extractBatch.mockResolvedValue(result({
      conflicts: [{ field: 'receiverBin', fieldLabel: 'БИН получателя', value: '160440012345', sourceDocument: 'inv.pdf', alternatives: [{ value: '160440099999', sourceDocument: 'cmr.jpg' }] }],
      warnings: ['Не распознан вес брутто'],
    }))
    api.createDeclaration.mockResolvedValue(declaration({ id: 'n2' }))
    mount(USERS.declarant)
    await pick()
    expect(router.currentRoute.value.path).toBe('/import-40/c1')
    const modal = w.get('[data-issues-conflicts]')
    expect(modal.text()).toContain('БИН получателя: «160440012345» (inv.pdf) — «160440099999» (cmr.jpg)')
    expect(w.get('[data-issues-warnings]').text()).toContain('Не распознан вес брутто')
    await w.get('[data-issues-ok]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/import-40/c1/dt/n2')
  })

  it('ошибка извлечения — тост «не удалось распознать», ДТ не создаётся', async () => {
    api.extractBatch.mockRejectedValue(new Error('502'))
    mount(USERS.declarant)
    await pick()
    expect(api.createDeclaration).not.toHaveBeenCalled()
    expect(msg.error).toHaveBeenCalledWith('Не удалось распознать пакет документов')
  })

  it('ошибка создания ДТ — тост с этим этапом', async () => {
    api.extractBatch.mockResolvedValue(result())
    api.createDeclaration.mockRejectedValue(new Error('500'))
    mount(USERS.declarant)
    await pick()
    expect(msg.error).toHaveBeenCalledWith('Пакет распознан, но ДТ не создана')
    expect(router.currentRoute.value.path).toBe('/import-40/c1')
  })
})
