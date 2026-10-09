import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ClassifierItem } from '@/types/api'

const api = vi.hoisted(() => ({
  listStations: vi.fn(), listCustomsPosts: vi.fn(), listClassifierGroups: vi.fn(), listClassifiers: vi.fn(),
}))
vi.mock('@/api/references', () => ({ referencesApi: api }))
vi.mock('@/api/kato', () => ({ katoApi: { status: vi.fn().mockRejectedValue(new Error('x')) } }))
vi.mock('@/api/prohibitionCodes', () => ({ prohibitionCodesApi: { list: vi.fn().mockResolvedValue([]), kedenUsage: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/api/trois', () => ({ troisApi: { status: vi.fn().mockRejectedValue(new Error('x')) }, troisDate: (s: string) => s }))
vi.mock('@/api/warehouseRegistry', () => ({
  warehouseRegistryApi: { status: vi.fn().mockRejectedValue(new Error('x')) },
  warehouseNsiApi: { status: vi.fn().mockRejectedValue(new Error('x')) },
  kedenRegistriesApi: {},
}))
vi.mock('@/ui/message', () => ({ message: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }))

import ReferencesView from '../ReferencesView.vue'

// Старый экран «Справочники» (AntD): таблица — заглушка со строками, остальное AntD не регистрируется.
const TableStub = { props: ['dataSource'], template: '<div data-table><div v-for="r in dataSource" :key="r.id" data-row>{{ r.code ?? r.name }}</div></div>' }
const item = (classifierCode: string, code: string): ClassifierItem => ({ id: `${classifierCode}-${code}`, classifierCode, code, nameRu: code, sortOrder: 0, isActive: true })
const deferred = <T>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

let w: VueWrapper
const mountView = async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  w = mountWithI18n(ReferencesView, { global: { plugins: [pinia], stubs: { 'a-table': TableStub } } })
  await flushPromises()
}
const navItem = (title: string) => w.findAll('.refs-nav-item').find((a) => a.find('.refs-nav-title').text() === title)!

beforeEach(() => {
  api.listStations.mockResolvedValue([{ id: 's1', name: 'Алтынколь', isActive: true }])
  api.listCustomsPosts.mockResolvedValue([
    { id: 'p1', name: 'Пост 1', isActive: true }, { id: 'p2', name: 'Пост 2', isActive: true }, { id: 'p3', name: 'Пост 3', isActive: true },
  ])
  api.listClassifierGroups.mockResolvedValue([{ classifierCode: '2004', count: 1 }, { classifierCode: '2013', count: 1 }])
  api.listClassifiers.mockImplementation(async (code: string) => [item(code, code === '2004' ? '10' : '20')])
})
afterEach(() => {
  w?.unmount()
  vi.clearAllMocks()
})

describe('ReferencesView (старый экран) — регрессии', () => {
  it('сбой станций не прячет посты: счётчик постов показан', async () => {
    api.listStations.mockRejectedValue(new Error('500'))
    await mountView()
    expect(navItem('Таможенные посты').find('.refs-nav-count').text()).toBe('3')
  })

  it('быстрое переключение классификаторов: поздний ответ прежнего не подменяет строки нового', async () => {
    await mountView()
    const slow = deferred<ClassifierItem[]>()
    api.listClassifiers.mockImplementationOnce(() => slow.promise)
    await navItem('2004 — виды транспорта').trigger('click')
    await navItem('2013 — виды упаковки').trigger('click')
    await flushPromises()
    expect(w.findAll('[data-row]').map((r) => r.text())).toEqual(['20'])
    slow.resolve([item('2004', '10')])
    await flushPromises()
    expect(w.findAll('[data-row]').map((r) => r.text())).toEqual(['20'])
  })
})
