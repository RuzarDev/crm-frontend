import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { DeclarationResponse, FromDocumentsResult } from '@/api/autoTransit'
import { good } from '@/views/broker/transit/record/__tests__/recordFixture'
import { card, file } from '../../truck/__tests__/truckFixtures'
import { fullData, httpError, response } from './tdFixture'

// «Заполнить из документов» на странице ПИ / ТД (очередь 3, этап 2).
const api = vi.hoisted(() => ({
  getDeclaration: vi.fn(), saveDeclaration: vi.fn(), listCopySources: vi.fn(), getCopySource: vi.fn(), getTruck: vi.fn(), fromDocuments: vi.fn(),
}))
vi.mock('@/api/autoTransit', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api/autoTransit')>()), ...api }))
const tnved = vi.hoisted(() => ({ node: vi.fn(), rates: vi.fn() }))
vi.mock('@/api/tnved', () => ({ tnvedApi: tnved }))
vi.mock('@/api/references', async () => ({ referencesApi: (await import('@/views/broker/transit/record/sections/__tests__/harness')).refsApi }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))

import TdPage from '../TdPage.vue'
import { confirmState } from '@/ui/confirm'
import { useAuthStore } from '@/stores/auth'
import { ComboStub, SelectStub, primeRefs } from '@/views/broker/transit/record/sections/__tests__/harness'

const App = defineComponent({ render: () => h(RouterView) })
let w: VueWrapper
let pinia: Pinia
let router: Router
const settle = async () => { await flushPromises(); await nextTick(); await flushPromises() }
const open = async (r: DeclarationResponse) => {
  api.getDeclaration.mockResolvedValue(r)
  await router.push('/auto-transit/t1/parties/p1/td')
  await router.isReady()
  w = mountWithI18n(App, { attachTo: document.body, global: { plugins: [pinia, router], stubs: { ZSelect: SelectStub, ZCombobox: ComboStub } } })
  await settle()
}
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel)
const $$ = (sel: string) => Array.from(document.body.querySelectorAll<HTMLElement>(sel))
const text = (s: string) => s.replace(/\s+/g, ' ').trim()
const checked = (id: string) => $(`[data-from-docs-check="${id}"]`)!.getAttribute('data-state') === 'checked'

const FILES = [
  file('cmr1', { partyId: 'p1', kind: 'cmr', fileName: 'cmr.jpg' }),
  file('inv1', { partyId: 'p1', kind: 'invoice', fileName: 'inv.pdf' }),
  file('ret1', { partyId: 'p1', kind: 'invoice', fileName: 'old.pdf', returned: true }),
  file('pass', { partyId: null, kind: 'driverPassport', fileName: 'pass.jpg' }),
  file('pack', { partyId: null, kind: 'packingList', fileName: 'pack.xlsx' }),
  file('other', { partyId: 'p2', kind: 'cmr', fileName: 'other.pdf' }),
]
const RESULT = (o: Partial<FromDocumentsResult> = {}): FromDocumentsResult => ({
  data: { goods: [good({ description: 'Из документа' })], transit: null as never, organizations: null as never, vehicles: null as never, doc44: null as never },
  filled: ['goods'],
  conflicts: [{ field: 'goods[0].grossWeightKg', values: [{ value: '500', source: 'inv.pdf' }, { value: '505', source: 'cmr.jpg' }] }],
  warnings: ['«pass.jpg» не распознаётся (вид документа не поддерживается) — пропущен.'],
  documentsCheck: { places: { cmr: 10, invoice: 12, packing: null }, grossKg: { cmr: 500, invoice: 500, packing: null }, plates: { cmr: null, invoice: null, packing: null } },
  ...o,
})

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.role = 'manager'
  auth.permissions = ['autotransit.read', 'autotransit.declare']
  primeRefs()
  api.listCopySources.mockResolvedValue([])
  api.getTruck.mockResolvedValue(card({ files: FILES }))
  tnved.node.mockResolvedValue({ data: { is10: true, name: 'Ноутбуки' } })
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  Element.prototype.scrollIntoView = vi.fn()
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/auto-transit/:id', name: 'auto-transit-truck', component: { template: '<div />' } },
      { path: '/auto-transit/:id/parties/:partyId/td', name: 'auto-transit-td', component: TdPage },
    ],
  })
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

const openModal = async () => {
  await w.get('[data-td-from-docs]').trigger('click')
  await settle()
}
const runRecognize = async () => {
  $('[data-from-docs-run]')!.click()
  await settle()
}

describe('TdPage: «Заполнить из документов»', () => {
  it('кнопки нет у формы только для чтения', async () => {
    await open(response({ readOnly: true }))
    expect(w.find('[data-td-from-docs]').exists()).toBe(false)
  })

  it('выбор: файлы партии и общие машины, без возвращённых и чужих; по умолчанию — CMR, инвойс, упаковочный', async () => {
    await open(response())
    await openModal()
    expect(api.getTruck).toHaveBeenCalledWith('t1', { silent: true })
    expect($$('[data-from-docs-file]').map((el) => el.dataset.fromDocsFile)).toEqual(['cmr1', 'inv1', 'pass', 'pack'])
    expect(['cmr1', 'inv1', 'pass', 'pack'].map(checked)).toEqual([true, true, false, true])
    expect(text($('[data-from-docs-file="pass"]')!.textContent!)).toContain('не распознаётся')
  })

  it('распознать → заменить товары с подтверждением → плашки «Проверьте» и «Документы не сходятся»; PUT не зовётся', async () => {
    await open(response({ data: fullData() }))
    const before = w.findAll('[data-goods-card]').length
    expect(before).toBeGreaterThan(0)
    await openModal()
    api.fromDocuments.mockResolvedValue(RESULT())
    await runRecognize()
    expect(api.fromDocuments).toHaveBeenCalledWith('t1', 'p1', ['cmr1', 'inv1', 'pack'])
    expect(text($('[data-from-docs-summary]')!.textContent!)).toBe('Распознано: товары (1).')
    ;($('[data-from-docs-mode-option="replace"]') as HTMLInputElement).click()
    await settle()
    $('[data-from-docs-apply]')!.click()
    await settle()
    expect(confirmState.open).toBe(true)
    confirmState.resolve(true)
    await settle()
    expect(w.findAll('[data-goods-card]')).toHaveLength(1)
    expect(api.saveDeclaration).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('Данные из документов подставлены — проверьте и сохраните')
    expect(text(w.get('[data-td-review-conflict]').text())).toBe('Товар 1: вес брутто: 500 (inv.pdf) · 505 (cmr.jpg)')
    expect(text(w.get('[data-td-review-warning]').text())).toContain('pass.jpg')
    expect(text(w.get('[data-td-doccheck-row="places"]').text())).toBe('Места: CMR 10 · инвойс 12')
    expect(w.find('[data-td-doccheck-row="grossKg"]').exists()).toBe(false)
    expect(w.find('[data-record-save-bar], [data-save-bar]').exists() || document.body.textContent!.includes('Сохранить')).toBe(true)
  })

  it('«Добавить» — товары формы остаются, подтверждения нет', async () => {
    await open(response({ data: fullData() }))
    const before = w.findAll('[data-goods-card]').length
    await openModal()
    api.fromDocuments.mockResolvedValue(RESULT({ conflicts: [], warnings: [], documentsCheck: { places: { cmr: null, invoice: null, packing: null }, grossKg: { cmr: null, invoice: null, packing: null }, plates: { cmr: null, invoice: null, packing: null } } }))
    await runRecognize()
    $('[data-from-docs-apply]')!.click()
    await settle()
    expect(confirmState.open).toBe(false)
    expect(w.findAll('[data-goods-card]')).toHaveLength(before + 1)
    expect(w.find('[data-td-review]').exists()).toBe(false)
  })

  it('сервис занят (503) — текст с минутами, выбор файлов остаётся', async () => {
    await open(response())
    await openModal()
    api.fromDocuments.mockRejectedValue(httpError(503, { title: 'AiExtraction.Busy', detail: '…', retryAfterMin: 4 }))
    await runRecognize()
    expect(text($('[data-from-docs-error]')!.textContent!)).toContain('Повторите через 4 мин')
    expect(['cmr1', 'inv1', 'pack'].map(checked)).toEqual([true, true, true])
    expect(($('[data-from-docs-run]') as HTMLButtonElement).disabled).toBe(false)
  })

  it('400 «нечего распознать» — текст сервера и предупреждения', async () => {
    await open(response())
    await openModal()
    api.fromDocuments.mockRejectedValue(httpError(400, { error: 'Среди выбранных нет документов для распознавания (CMR, инвойс, упаковочный).', warnings: ['«pass.jpg» пропущен.'] }))
    await runRecognize()
    const err = text($('[data-from-docs-error]')!.textContent!)
    expect(err).toContain('Среди выбранных нет документов')
    expect(err).toContain('«pass.jpg» пропущен.')
  })
})
