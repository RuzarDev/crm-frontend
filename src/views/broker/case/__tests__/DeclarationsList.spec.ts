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
  copySources: vi.fn(), copyDeclaration: vi.fn(),
}))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
const dl = vi.hoisted(() => ({ saveBlob: vi.fn() }))
const checks = vi.hoisted(() => ({ link: vi.fn() }))
vi.mock('@/api/import40', () => ({ import40Api: api }))
vi.mock('@/api/documentChecks', () => ({ documentChecksApi: checks }))
vi.mock('@/ui/message', () => ({ message: msg }))
vi.mock('@/ui/download', () => dl)

import ExtractDocsModal from '../steps/ExtractDocsModal.vue'
import CopyDtModal from '../steps/CopyDtModal.vue'
import DeclarationsList from '../steps/DeclarationsList.vue'

const DropdownStub = {
  props: ['items'], emits: ['select'],
  template: '<div data-dropdown><slot /><button v-for="it in items" :key="it.key" type="button" :data-menu-item="it.key" :disabled="it.disabled" :title="it.hint" @click="$emit(\'select\', it.key)">{{ it.label }}</button></div>',
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
    expect(m.get('[data-dt-missing-text]').classes()).toContain('line-clamp-2')
    expect(m.attributes('title')).toBe('не хватает: гр. 31 (поз. 3), гр. 33, гр. 44 — сертификат, гр. 47, гр. 8')
    await m.get('[data-dt-missing-more]').trigger('click')
    expect(row('d1').get('[data-dt-missing]').text()).toContain('гр. 47, гр. 8')
    expect(row('d1').get('[data-dt-missing-more]').attributes('aria-expanded')).toBe('true')
    expect(row('d2').get('[data-dt-ready]').text()).toBe('готова к выгрузке')
  })

  it('номер или «ДТ i» ссылкой на страницу ДТ, теги разделения, «товаров: N»', () => {
    const dts = [
      declaration({ id: 'd0', isSplitReplaced: true, declarationNumber: 'SRC-1', goodsItems: [{}, {}, {}] as never }),
      declaration({ id: 'd1', splitRole: 'ETT', splitSourceDeclarationId: 'd0' }),
      declaration({ id: 'd2', splitRole: 'VTO', goodsItems: [{}, {}] as never, totalInvoiceValue: 25000, currency: 'USD' }),
      declaration({ id: 'd3', rateType: 'EATT' }),
      declaration({ id: 'd4', rateType: 'ETT' }),
    ]
    mount(USERS.declarant, { kase: { declarations: dts } })
    expect(row('d0').get('[data-dt-link]').text()).toBe('SRC-1')
    expect(row('d1').get('[data-dt-link]').text()).toBe('ДТ 2')
    expect(row('d1').get('[data-dt-link]').attributes('href')).toBe('/import-40/c1/dt/d1')
    // Исходная ДТ разделения — «Исходная ДТ», «все товары: N», не приглушена.
    expect(row('d0').get('[data-dt-split]').text()).toBe('Исходная ДТ')
    expect(tipOf(row('d0').get('[data-dt-split]').element)).toContain('Все товары до разделения на ЕТТ/ВТО')
    expect(row('d0').get('[data-dt-meta]').text()).toBe('все товары: 3')
    expect(row('d0').find('.opacity-55').exists()).toBe(false)
    expect(row('d1').get('[data-dt-split]').text()).toBe('ЕТТ')
    expect(tipOf(row('d1').get('[data-dt-split]').element)).toBe('Часть разделения исходной ДТ «SRC-1»')
    expect(row('d2').get('[data-dt-split]').text()).toBe('ВТО')
    expect(row('d3').get('[data-dt-split]').text()).toBe('ВТО')
    expect(row('d4').find('[data-dt-split]').exists()).toBe(false)
    expect(row('d2').get('[data-dt-meta]').text()).toBe(`товаров: 2 · стоимость ${formatMoney(25000, 'USD')}`)
  })

  // Решение владельца 16.10.2026: исходная ДТ — первой в своей группе, её части — под ней со сдвигом (ЕТТ, затем ВТО).
  it('разделение: исходная ДТ, под ней её части; повторно разделённая часть — «Разделена повторно» и свои части ниже', () => {
    const dts = [
      declaration({ id: 'other', declarationNumber: 'OTHER' }),
      declaration({ id: 'v1', splitRole: 'VTO', splitSourceDeclarationId: 'src', isSplitReplaced: true }),
      declaration({ id: 'e1', splitRole: 'ETT', splitSourceDeclarationId: 'src' }),
      declaration({ id: 'src', isSplitReplaced: true, declarationNumber: 'SRC' }),
      declaration({ id: 'v2', splitRole: 'VTO', splitSourceDeclarationId: 'v1' }),
      declaration({ id: 'orphan', splitRole: 'VTO', splitSourceDeclarationId: 'gone' }),
    ]
    mount(USERS.declarant, { kase: { declarations: dts } })
    const rows = w.findAll('[data-dt-row]')
    expect(rows.map((r) => r.attributes('data-dt-row'))).toEqual(['other', 'src', 'e1', 'v1', 'v2', 'orphan'])
    expect(rows.map((r) => r.attributes('data-dt-depth'))).toEqual(['0', '0', '1', '1', '2', '0'])
    expect(row('src').attributes('data-dt-kind')).toBe('source')
    expect(row('v1').attributes('data-dt-kind')).toBe('part')
    // Промежуточная часть — роль, а не «Разделена»; отдельный тег «Разделена повторно».
    expect(row('v1').get('[data-dt-split]').text()).toBe('ВТО')
    expect(row('v1').get('[data-dt-resplit]').text()).toBe('Разделена повторно')
    expect(row('e1').find('[data-dt-resplit]').exists()).toBe(false)
    // Бывшая часть (исходной нет) — обычная строка: тег роли, «Заполнить» и XML.
    expect(row('orphan').attributes('data-dt-kind')).toBe('plain')
    expect(tipOf(row('orphan').get('[data-dt-split]').element)).toBe('Бывшая часть разделения — исходная ДТ удалена. Подаётся как обычная ДТ, повторно не делится.')
    expect(row('orphan').find('[data-dt-fill]').exists()).toBe(true)
    expect(row('orphan').find('[data-dt-xml]').exists()).toBe(true)
    // Исходная и повторно разделённая часть — «Открыть» вместо «Заполнить»; XML есть (16.10, вечер: подают её или части).
    for (const id of ['src', 'v1']) {
      expect(row(id).find('[data-dt-fill]').exists()).toBe(false)
      expect(row(id).find('[data-dt-xml]').exists()).toBe(true)
      expect(row(id).get('[data-dt-open]').attributes('href')).toBe(`/import-40/c1/dt/${id}`)
    }
    expect(row('e1').find('[data-dt-fill]').exists()).toBe(true)
  })

  // 16.10 (вечер): исходную с частями удалить можно — подтверждение говорит, что части останутся отдельными ДТ.
  it('исходная ДТ с частями удаляется с подтверждением «части останутся отдельными ДТ»; часть — обычным', async () => {
    api.deleteDeclaration.mockResolvedValue(undefined)
    const dts = [
      declaration({ id: 'src', isSplitReplaced: true, declarationNumber: 'SRC' }),
      declaration({ id: 'e1', splitRole: 'ETT', splitSourceDeclarationId: 'src' }),
    ]
    mount(USERS.declarant, { kase: { declarations: dts } })
    const item = row('src').get('[data-menu-item="delete"]')
    expect(item.text()).toBe('Удалить исходную ДТ')
    expect(item.attributes('disabled')).toBeUndefined()
    expect(item.attributes('title')).toBe('Части ЕТТ/ВТО останутся отдельными ДТ')
    await item.trigger('click')
    expect(confirmState.title).toBe('Удалить исходную ДТ?')
    expect(confirmState.content).toBe('SRC. Части ЕТТ и ВТО останутся отдельными ДТ и подаются как обычно; изменить разделение после этого будет нельзя.')
    expect(confirmState.danger).toBe(true)
    confirmState.resolve(true)
    await flushPromises()
    expect(api.deleteDeclaration).toHaveBeenCalledWith('c1', 'src')

    api.deleteDeclaration.mockClear()
    await row('e1').get('[data-menu-item="delete"]').trigger('click')
    expect(confirmState.title).toBe('Удалить ДТ?')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.deleteDeclaration).toHaveBeenCalledWith('c1', 'e1')
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

  // Ревью I3: вид строки — по полному списку. Раньше поиск по номеру исходной убирал её части, и исходная становилась
  // обычной ДТ с «Заполнить» и XML (выгрузка всех товаров второй раз).
  it('поиск по номеру исходной ДТ — она остаётся «Исходной ДТ» без «Заполнить»', async () => {
    const dts = [
      declaration({ id: 'src', isSplitReplaced: true, declarationNumber: 'SRC-777' }),
      declaration({ id: 'e1', splitRole: 'ETT', splitSourceDeclarationId: 'src', declarationNumber: 'E-1' }),
      declaration({ id: 'v1', splitRole: 'VTO', splitSourceDeclarationId: 'src', declarationNumber: 'V-1' }),
    ]
    mount(USERS.declarant, { kase: { declarations: dts } })
    await w.get('[data-dt-search]').setValue('777')
    expect(w.findAll('[data-dt-row]').map((r) => r.attributes('data-dt-row'))).toEqual(['src'])
    expect(row('src').attributes('data-dt-kind')).toBe('source')
    expect(row('src').get('[data-dt-split]').text()).toBe('Исходная ДТ')
    expect(row('src').find('[data-dt-fill]').exists()).toBe(false)
    expect(row('src').find('[data-dt-open]').exists()).toBe(true)
    // Найдена только часть — она остаётся частью (со сдвигом), с «Заполнить».
    await w.get('[data-dt-search]').setValue('V-1')
    expect(w.findAll('[data-dt-row]').map((r) => r.attributes('data-dt-row'))).toEqual(['v1'])
    expect(row('v1').attributes('data-dt-kind')).toBe('part')
    expect(row('v1').attributes('data-dt-depth')).toBe('1')
    expect(row('v1').find('[data-dt-fill]').exists()).toBe(true)
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

  // 16.10 (вечер): в КЕДЕН подаётся один вариант — исходная целиком или части. Предупреждение, не запрет.
  it('XML исходной ДТ с частями — предупреждение «один вариант»; отмена — без запроса, «Выгрузить XML» — запрос', async () => {
    const blob = new Blob(['<x/>'])
    api.downloadKedenXml.mockResolvedValue({ blob, fileName: 'SRC.xml' })
    const dts = [
      declaration({ id: 'src', isSplitReplaced: true, declarationNumber: 'SRC' }),
      declaration({ id: 'e1', splitRole: 'ETT', splitSourceDeclarationId: 'src' }),
      declaration({ id: 'v1', splitRole: 'VTO', splitSourceDeclarationId: 'src', uploadedToKeden: true }),
    ]
    mount(USERS.declarant, { kase: { declarations: dts } })
    await row('src').get('[data-dt-xml]').trigger('click')
    expect(confirmState.title).toBe('В КЕДЕН подаётся один вариант')
    expect(confirmState.content).toBe('У этой ДТ есть части ЕТТ/ВТО. В КЕДЕН подаётся один вариант: либо эта ДТ целиком, либо части. ' +
      'После выбора удалите лишнее. Части ЕТТ/ВТО уже выгружались в КЕДЕН.')
    expect(confirmState.okText).toBe('Выгрузить XML')
    expect(confirmState.danger).toBe(false)
    confirmState.resolve(false)
    await flushPromises()
    expect(api.downloadKedenXml).not.toHaveBeenCalled()
    await row('src').get('[data-dt-xml]').trigger('click')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.downloadKedenXml).toHaveBeenCalledWith('c1', 'src')
    expect(dl.saveBlob).toHaveBeenCalledWith(blob, 'SRC.xml')
  })

  it('XML части — предупреждение, только если исходная уже выгружалась; бывшая часть и обычная ДТ — без него', async () => {
    api.downloadKedenXml.mockResolvedValue({ blob: new Blob(['<x/>']), fileName: 'E.xml' })
    mount(USERS.declarant, { kase: { declarations: [
      declaration({ id: 'src', isSplitReplaced: true, declarationNumber: 'SRC' }),
      declaration({ id: 'e1', splitRole: 'ETT', splitSourceDeclarationId: 'src' }),
      declaration({ id: 'gone', splitRole: 'VTO', splitSourceDeclarationId: 'deleted' }),
    ] } })
    await row('e1').get('[data-dt-xml]').trigger('click')
    await flushPromises()
    expect(confirmState.open).toBe(false)
    expect(api.downloadKedenXml).toHaveBeenCalledWith('c1', 'e1')
    await row('gone').get('[data-dt-xml]').trigger('click')
    await flushPromises()
    expect(confirmState.open).toBe(false)
    expect(api.downloadKedenXml).toHaveBeenCalledWith('c1', 'gone')
    w.unmount()

    api.downloadKedenXml.mockClear()
    mount(USERS.declarant, { kase: { declarations: [
      declaration({ id: 'src', isSplitReplaced: true, declarationNumber: 'SRC', uploadedToKeden: true }),
      declaration({ id: 'e1', splitRole: 'ETT', splitSourceDeclarationId: 'src' }),
    ] } })
    await row('e1').get('[data-dt-xml]').trigger('click')
    expect(confirmState.content).toBe('Исходная ДТ (все товары) уже выгружалась в КЕДЕН. В КЕДЕН подаётся один вариант: либо исходная ДТ ' +
      'целиком, либо части ЕТТ/ВТО. После выбора удалите лишнее.')
    confirmState.resolve(false)
    await flushPromises()
    expect(api.downloadKedenXml).not.toHaveBeenCalled()
  })

  // C1: после XML исходной флаг «выгружалась» ставится сразу — XML части тут же предупреждает (без ожидания перечитывания).
  it('XML исходной, затем XML части — у части предупреждение «исходная уже выгружалась»', async () => {
    api.downloadKedenXml.mockResolvedValue({ blob: new Blob(['<x/>']), fileName: 'x.xml' })
    mount(USERS.declarant, { kase: { declarations: [
      declaration({ id: 'src', isSplitReplaced: true, declarationNumber: 'SRC' }),
      declaration({ id: 'e1', splitRole: 'ETT', splitSourceDeclarationId: 'src' }),
    ] } })
    await row('src').get('[data-dt-xml]').trigger('click')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.downloadKedenXml).toHaveBeenCalledWith('c1', 'src')
    await row('e1').get('[data-dt-xml]').trigger('click')
    await flushPromises()
    expect(confirmState.open).toBe(true)
    expect(confirmState.content).toContain('Исходная ДТ (все товары) уже выгружалась в КЕДЕН')
  })

  // C2: «XML готовых» при исходной с частями — то же окно «один вариант» (+ строка, если исходная выгружалась).
  it('«XML готовых» при исходной с частями — предупреждение; отмена — без запроса; без разделения — без окна', async () => {
    api.downloadKedenBatch.mockResolvedValue({ blob: new Blob(['zip']), fileName: 'k.zip' })
    const dts = [
      declaration({ id: 'src', isSplitReplaced: true, declarationNumber: 'SRC', uploadedToKeden: true }),
      declaration({ id: 'e1', splitRole: 'ETT', splitSourceDeclarationId: 'src' }),
    ]
    mount(USERS.declarant, { kase: { declarations: dts }, readiness: [rd({ declarationId: 'e1', isReady: true, filled: 22 })] })
    await w.get('[data-dt-xml-batch]').trigger('click')
    expect(confirmState.title).toBe('В КЕДЕН подаётся один вариант')
    expect(confirmState.content).toBe('В заявке есть исходная ДТ и её части ЕТТ/ВТО. В пакет войдут только части (исходная пропускается). ' +
      'В КЕДЕН подаётся один вариант: если подаёте исходную целиком, части не выгружайте и удалите. Исходная ДТ уже выгружалась в КЕДЕН.')
    confirmState.resolve(false)
    await flushPromises()
    expect(api.downloadKedenBatch).not.toHaveBeenCalled()
    await w.get('[data-dt-xml-batch]').trigger('click')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.downloadKedenBatch).toHaveBeenCalledWith('c1')
    w.unmount()
    api.downloadKedenBatch.mockClear()
    mount(USERS.declarant, { kase: { declarations: two }, readiness: [rd({ declarationId: 'd1', isReady: true, filled: 22 })] })
    await w.get('[data-dt-xml-batch]').trigger('click')
    await flushPromises()
    expect(confirmState.open).toBe(false)
    expect(api.downloadKedenBatch).toHaveBeenCalledWith('c1')
  })

  // C3: удаляемая ДТ уже выгружалась — подтверждение напоминает удалить черновик в КЕДЕН.
  it('удаление выгружавшейся ДТ (исходной или части) — строка про черновик в КЕДЕН', async () => {
    api.deleteDeclaration.mockResolvedValue(undefined)
    mount(USERS.declarant, { kase: { declarations: [
      declaration({ id: 'src', isSplitReplaced: true, declarationNumber: 'SRC', uploadedToKeden: true }),
      declaration({ id: 'e1', splitRole: 'ETT', splitSourceDeclarationId: 'src', declarationNumber: 'E-1', uploadedToKeden: true }),
    ] } })
    await row('src').get('[data-menu-item="delete"]').trigger('click')
    expect(confirmState.content).toBe('SRC. Части ЕТТ и ВТО останутся отдельными ДТ и подаются как обычно; изменить разделение после этого будет нельзя. ' +
      'Эта ДТ уже выгружалась в КЕДЕН — удалите её черновик там.')
    confirmState.resolve(false)
    await flushPromises()
    await row('e1').get('[data-menu-item="delete"]').trigger('click')
    expect(confirmState.title).toBe('Удалить ДТ?')
    expect(confirmState.content).toBe('E-1. Эта ДТ уже выгружалась в КЕДЕН — удалите её черновик там.')
  })

  // M3: промежуточная часть старой цепочки — «Удалить ДТ» (не «исходную»), окно — про её части; подсказка цепочки согласована.
  it('промежуточная часть старой цепочки — «Удалить ДТ», её части останутся отдельными ДТ', async () => {
    mount(USERS.declarant, { kase: { declarations: [
      declaration({ id: 'src', isSplitReplaced: true, declarationNumber: 'SRC' }),
      declaration({ id: 'v1', splitRole: 'VTO', splitSourceDeclarationId: 'src', isSplitReplaced: true, declarationNumber: 'V-1' }),
      declaration({ id: 'v2', splitRole: 'VTO', splitSourceDeclarationId: 'v1' }),
    ] } })
    expect(tipOf(row('v1').get('[data-dt-resplit]').element)).toContain('удалите эту часть — они останутся отдельными ДТ')
    const item = row('v1').get('[data-menu-item="delete"]')
    expect(item.text()).toBe('Удалить ДТ')
    await item.trigger('click')
    expect(confirmState.title).toBe('Удалить ДТ?')
    expect(confirmState.content).toBe('V-1. Её части останутся отдельными ДТ и подаются как обычно.')
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

  it('после шага 3 (mode done) без права править — только «Открыть», без готовности и действий правки', () => {
    mount(USERS.kpp, { kase: { status: 4, declarations: two }, readiness: [rd({ declarationId: 'd1', missing: ['гр. 8'] })], mode: 'done' })
    expect(w.findAll('[data-dt-open]')).toHaveLength(2)
    expect(w.find('[data-dt-missing]').exists()).toBe(false)
    for (const sel of ['[data-dt-fill]', '[data-dt-xml]', '[data-dt-more]', '[data-dt-toolbar]']) expect(w.find(sel).exists()).toBe(false)
  })

  // Решение владельца 09.10: правка после выпуска остаётся (как на сервере); РОП и админ правят любую ДТ.
  it.each([
    ['админ', USERS.admin, 8, 'other'],
    ['РОП при чужом назначении', USERS.rop, 9, 'other'],
    ['назначенный декларант после выпуска', USERS.declarant, 4, 'me'],
    ['декларант при пустом назначении (Done)', USERS.declarant, 8, null],
  ] as const)('после шага 3 (mode done): %s — «Заполнить» и XML, без полосы и готовности', (_, user, status, assigned) => {
    mount(user, { kase: { status, assignedDeclarantId: assigned, declarations: two }, readiness: [rd({ declarationId: 'd1', missing: ['гр. 8'] })], mode: 'done' })
    expect(row('d1').get('[data-dt-fill]').attributes('disabled')).toBeUndefined()
    expect(row('d1').find('[data-dt-xml]').exists()).toBe(true)
    expect(w.find('[data-dt-open]').exists()).toBe(false)
    for (const sel of ['[data-dt-toolbar]', '[data-dt-missing]']) expect(w.find(sel).exists()).toBe(false)
  })

  // Решение владельца 09.10: после выпуска ДТ удаляет только администратор; остальным пункт выключен с причиной.
  it('после выпуска: админ удаляет ДТ, РОП и декларант видят «После выпуска ДТ удалить нельзя» выключенным', async () => {
    api.deleteDeclaration.mockResolvedValue(undefined)
    mount(USERS.rop, { kase: { status: 4, assignedDeclarantId: 'other', declarations: two }, mode: 'done' })
    const blocked = row('d1').get('[data-menu-item="delete-blocked"]')
    expect(blocked.text()).toBe('После выпуска ДТ удалить нельзя')
    expect(row('d1').find('[data-menu-item="delete"]').exists()).toBe(false)
    w.unmount()

    mount(USERS.declarant, { kase: { status: 8, assignedDeclarantId: 'me', declarations: two }, mode: 'done' })
    expect(row('d1').find('[data-menu-item="delete-blocked"]').exists()).toBe(true)
    w.unmount()

    mount(USERS.admin, { kase: { status: 8, declarations: two }, mode: 'done' })
    expect(row('d1').find('[data-menu-item="delete-blocked"]').exists()).toBe(false)
    await row('d1').get('[data-menu-item="delete"]').trigger('click')
    await flushPromises()
    confirmState.resolve(true)
    await flushPromises()
    expect(api.deleteDeclaration).toHaveBeenCalledWith('c1', 'd1')
  })

  it('после шага 3: ДТ ведёт другой декларант — только «Открыть»', () => {
    mount(USERS.declarant, { kase: { status: 4, assignedDeclarantId: 'other', declarations: two }, mode: 'done' })
    expect(w.findAll('[data-dt-open]')).toHaveLength(2)
    expect(w.find('[data-dt-fill]').exists()).toBe(false)
  })

  it('шаг 3: ДТ ведёт коллега — «Заполнить» выключена с его именем, удаления нет', () => {
    mount(USERS.declarant, { kase: { status: 2, assignedDeclarantId: 'other', assignedDeclarantName: 'Асель', declarations: two } })
    const fill = row('d1').get('[data-dt-fill]')
    expect(fill.attributes('disabled')).toBeDefined()
    expect(tipOf(fill.element)).toContain('Асель')
    expect(w.find('[data-dt-more]').exists()).toBe(false)
  })

  it('шаг 3: РОП при чужом назначении правит и удаляет', () => {
    mount(USERS.rop, { kase: { status: 3, assignedDeclarantId: 'other', declarations: two } })
    expect(row('d1').get('[data-dt-fill]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-dt-more]').exists()).toBe(true)
  })
})

describe('DeclarationsList: «Из документов»', () => {
  // 19.10.2026: файлы выбирают в окне ExtractDocsModal (документы заявки и/или с компьютера) — его ответ.
  const pick = async (names = ['inv.pdf', 'cmr.jpg'], fileIds: string[] = []) => {
    const files = names.map((n) => new File(['x'], n))
    w.findComponent(ExtractDocsModal).vm.$emit('submit', { fileIds, uploads: files })
    await flushPromises()
    return files
  }
  const result = (o: Partial<Import40ExtractionResult> = {}): Import40ExtractionResult =>
    ({ declaration: { declarationNumber: null, currency: 'USD', goodsItems: [{ description: 'Ноутбук', quantity: 10 }] }, warnings: [], conflicts: [], ...o })

  it('документы заявки из окна уходят номерами, файлы с компьютера — файлами', async () => {
    api.extractBatch.mockResolvedValue(result())
    api.createDeclaration.mockResolvedValue(declaration({ id: 'n1' }))
    mount(USERS.declarant)
    const files = await pick(['new.xlsx'], ['f1', 'f2'])
    expect(api.extractBatch).toHaveBeenCalledWith('c1', files, ['f1', 'f2'])
  })

  it('без замечаний: извлечение, создание ДТ из предпросмотра, тост и сразу переход к ДТ', async () => {
    api.extractBatch.mockResolvedValue(result())
    api.createDeclaration.mockResolvedValue(declaration({ id: 'n1' }))
    mount(USERS.declarant)
    const files = await pick()
    expect(api.extractBatch).toHaveBeenCalledWith('c1', files, [])
    expect(api.createDeclaration).toHaveBeenCalledWith('c1', expect.objectContaining({
      currency: 'USD', declarationNumber: null,
      goodsItems: [expect.objectContaining({ description: 'Ноутбук', quantity: 10, tnvedDescription: null, unit: null })],
    }))
    expect(msg.success).toHaveBeenCalledWith('Пакет обработан — откройте ДТ, чтобы проверить предзаполненные поля')
    expect(router.currentRoute.value.path).toBe('/import-40/c1/dt/n1')
  })

  it('сверка документов разбора привязывается к созданной ДТ; сбой привязки не мешает перейти к ДТ', async () => {
    api.extractBatch.mockResolvedValue(result({ documentCheckId: 'chk1' }))
    api.createDeclaration.mockResolvedValue(declaration({ id: 'n9' }))
    checks.link.mockRejectedValueOnce(new Error('x'))
    mount(USERS.declarant)
    await pick()
    expect(checks.link).toHaveBeenCalledWith('c1', 'chk1', 'n9')
    expect(router.currentRoute.value.path).toBe('/import-40/c1/dt/n9')
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

describe('DeclarationsList: «Копировать ДТ»', () => {
  it('окно со списком ДТ клиента; выбор — копия с товарами, тост и переход к новой ДТ', async () => {
    api.copySources.mockResolvedValue([
      { id: 'old', caseId: 'c0', caseNumber: 'ИМ-2026-0001', caseCreatedAtUtc: '2026-10-01T00:00:00Z', declarationNumber: '55301/011026/0000001',
        rateType: 'ETT', splitRole: null, senderName: 'YIWU', goodsCount: 3, firstGoodsDescription: 'Сушилка', totalInvoiceValue: 100, currency: 'USD', updatedAtUtc: '2026-10-02T00:00:00Z' },
    ])
    api.copyDeclaration.mockResolvedValue(declaration({ id: 'copy1' }))
    const m = mount(USERS.declarant)
    await w.get('[data-dt-copy]').trigger('click')
    await flushPromises()
    expect(api.copySources).toHaveBeenCalledWith('c1')
    const src = w.get('[data-copy-source="old"]')
    expect(src.text()).toContain('55301/011026/0000001')
    expect(src.text()).toContain('ИМ-2026-0001')
    expect(src.text()).toContain('товаров: 3 — Сушилка')
    // прошлая заявка выбрана сразу
    expect((src.get('input').element as HTMLInputElement).checked).toBe(true)
    w.findComponent(CopyDtModal).vm.$emit('submit', { sourceDeclarationId: 'old', includeGoods: true })
    await flushPromises()
    expect(api.copyDeclaration).toHaveBeenCalledWith('c1', { sourceDeclarationId: 'old', includeGoods: true })
    expect(msg.success).toHaveBeenCalledWith('ДТ скопирована — измените, что отличается')
    expect(m.reload).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/import-40/c1/dt/copy1')
  })

  it('без права декларанта кнопка выключена; статус 3 — кнопки нет', () => {
    mount(USERS.kpp)
    expect(w.get('[data-dt-copy]').attributes('disabled')).toBeDefined()
    w.unmount()
    mount(USERS.declarant, { kase: { status: 3 } })
    expect(w.find('[data-dt-copy]').exists()).toBe(false)
  })
})
