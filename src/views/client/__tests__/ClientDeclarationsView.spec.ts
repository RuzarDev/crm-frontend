import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ClientDeclaration } from '@/api/clientDeclarations'

const api = vi.hoisted(() => ({ list: vi.fn() }))
const imp = vi.hoisted(() => ({ blankPdf: vi.fn() }))
const save = vi.hoisted(() => ({ saveBlob: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/clientDeclarations', () => ({ clientDeclarationsApi: api }))
vi.mock('@/api/import40', () => ({ import40Api: imp }))
vi.mock('@/ui/download', () => ({ saveBlob: save.saveBlob }))
vi.mock('@/ui/message', () => ({ message: msg }))

import ClientDeclarationsView from '../ClientDeclarationsView.vue'
import { matchesDecl, passesDeclFilter } from '@/views/client/declarations/declarations'

// 02.11.2026, пакет K: «Мои декларации» клиента.
const decl = (o: Partial<ClientDeclaration>): ClientDeclaration => ({
  id: 'd1', caseId: 'c1', caseNumber: 'ИМ-2026-0166', number: '55302/021125/0012345', goods: 'Серверы',
  status: 'released', date: '2026-10-20T00:00:00Z', releasedAtUtc: '2026-10-21T10:00:00Z', paymentsKzt: 152300,
  ...o,
})
const LIST = [
  decl({}),
  decl({ id: 'd2', caseId: 'c2', caseNumber: 'ИМ-2026-0182', number: '', goods: 'Ноутбуки', status: 'submitted', paymentsKzt: null }),
  decl({ id: 'd3', caseId: 'c3', caseNumber: 'ИМ-2026-0190', number: '55302/011125/0000777', goods: 'Мебель', status: 'refused' }),
  decl({ id: 'd4', caseId: 'c4', caseNumber: 'ИМ-2026-0191', number: '55302/011125/0000888', goods: 'Кабель', status: 'conditionalRelease' }),
  decl({ id: 'd5', caseId: 'c5', caseNumber: 'ИМ-2026-0192', number: '55302/011125/0000999', goods: 'Шины', status: 'withdrawn' }),
]

let w: VueWrapper
let pinia: Pinia
let router: Router
const stub = { template: '<div/>' }

const mountAt = async (path: string) => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(ClientDeclarationsView, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
}
const rowIds = () => w.findAll('[data-decl-row]').map((r) => r.attributes('data-decl-row'))

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: stub }] })
  api.list.mockResolvedValue(LIST)
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('ClientDeclarationsView', () => {
  it('строки: номер моноширинным, без номера — «номер ещё не присвоен», поставка ссылкой, статус, платежи', async () => {
    await mountAt('/declarations')
    expect(rowIds()).toEqual(['d1', 'd2', 'd3', 'd4', 'd5'])
    const r1 = w.get('[data-decl-row="d1"]')
    expect(r1.get('[data-decl-number]').text()).toBe('55302/021125/0012345')
    expect(r1.get('[data-decl-number]').classes()).toContain('font-mono')
    expect(r1.get('[data-decl-goods]').text()).toContain('Серверы')
    expect(r1.get('[data-decl-case]').attributes('href')).toBe('/import-40/c1')
    expect(r1.get('[data-decl-status]').text()).toBe('Выпущена')
    expect(r1.get('[data-decl-payments]').text()).toContain('152')
    const r2 = w.get('[data-decl-row="d2"]')
    expect(r2.get('[data-decl-number]').text()).toBe('ДТ подана · номер ещё не присвоен')
    expect(r2.get('[data-decl-status]').text()).toBe('Подана')
    expect(r2.get('[data-decl-payments]').text()).toBe('—')
    expect(w.get('[data-decl-row="d3"] [data-decl-status]').text()).toBe('Отказ в выпуске')
    expect(w.get('[data-decl-row="d4"] [data-decl-status]').text()).toBe('Условный выпуск')
    expect(w.get('[data-decl-row="d5"] [data-decl-status]').text()).toBe('Отозвана')
    // Телефон: те же строки карточками.
    expect(w.findAll('[data-decl-card]')).toHaveLength(5)
  })

  it('фильтр по статусу — в адресе (?status=), «Отказ и отзыв» — отказ и отозванные', async () => {
    await mountAt('/declarations')
    await w.get('[data-decl-filter="refused"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.status).toBe('refused')
    expect(rowIds()).toEqual(['d3', 'd5'])
    await w.get('[data-decl-filter="released"]').trigger('click')
    await flushPromises()
    expect(rowIds()).toEqual(['d1', 'd4'])
    await w.get('[data-decl-filter="inWork"]').trigger('click')
    await flushPromises()
    expect(rowIds()).toEqual(['d2'])
    await w.get('[data-decl-filter="all"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.status).toBeUndefined()
    expect(rowIds()).toHaveLength(5)
  })

  it('поиск по номеру ДТ, номеру поставки и товару; ничего — «Ничего не нашлось»', async () => {
    await mountAt('/declarations?q=0000777')
    expect(rowIds()).toEqual(['d3'])
    w.unmount()
    await mountAt('/declarations?q=0182')
    expect(rowIds()).toEqual(['d2'])
    w.unmount()
    await mountAt('/declarations?q=ноутб')
    expect(rowIds()).toEqual(['d2'])
    w.unmount()
    await mountAt('/declarations?q=xyz')
    expect(rowIds()).toEqual([])
    expect(w.get('[data-decl-empty]').attributes('data-decl-empty')).toBe('search')
    expect(w.text()).toContain('Ничего не нашлось по «xyz»')
  })

  it('пусто — «Деклараций пока нет — они появятся здесь после подачи в КЕДЕН», без фильтра и поиска', async () => {
    api.list.mockResolvedValue([])
    await mountAt('/declarations')
    expect(w.get('[data-decl-empty]').attributes('data-decl-empty')).toBe('none')
    expect(w.text()).toContain('Деклараций пока нет — они появятся здесь после подачи в КЕДЕН')
    expect(w.find('[data-decl-filter]').exists()).toBe(false)
    expect(w.find('[data-decl-search]').exists()).toBe(false)
  })

  it('«Скачать PDF» — бланк тем же эндпоинтом, что в карточке поставки', async () => {
    const blob = new Blob(['%PDF'])
    imp.blankPdf.mockResolvedValue({ blob, fileName: 'declaration-55302_021125_0012345.pdf' })
    await mountAt('/declarations')
    await w.get('[data-decl-row="d1"] [data-decl-download]').trigger('click')
    await flushPromises()
    expect(imp.blankPdf).toHaveBeenCalledWith('c1', 'd1')
    expect(save.saveBlob).toHaveBeenCalledWith(blob, 'declaration-55302_021125_0012345.pdf')
  })

  it('ошибка загрузки — сообщение и «Повторить»', async () => {
    api.list.mockRejectedValueOnce(new Error('500'))
    await mountAt('/declarations')
    expect(w.find('[data-decl-error]').exists()).toBe(true)
    await w.get('[data-decl-retry]').trigger('click')
    await flushPromises()
    expect(rowIds()).toHaveLength(5)
  })
})

describe('declarations helpers', () => {
  it('фильтр: условный выпуск — во «Выпущены», отзыв — в «Отказ и отзыв»', () => {
    expect(passesDeclFilter({ status: 'conditionalRelease' }, 'released')).toBe(true)
    expect(passesDeclFilter({ status: 'withdrawn' }, 'refused')).toBe(true)
    expect(passesDeclFilter({ status: 'submitted' }, 'released')).toBe(false)
    expect(passesDeclFilter({ status: 'submitted' }, 'all')).toBe(true)
  })
  it('поиск без учёта регистра и ё/е', () => {
    expect(matchesDecl({ number: '', caseNumber: 'ИМ-1', goods: 'Ёлочные игрушки' }, 'елочн')).toBe(true)
    expect(matchesDecl({ number: '55302/021125/1', caseNumber: 'ИМ-1', goods: '' }, '021125')).toBe(true)
    expect(matchesDecl({ number: '', caseNumber: 'ИМ-1', goods: '' }, '  ')).toBe(true)
  })
})
