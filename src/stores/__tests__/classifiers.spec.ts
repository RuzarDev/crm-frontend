import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const api = vi.hoisted(() => ({ listClassifiers: vi.fn(), listClassifiersBatch: vi.fn() }))
vi.mock('@/api/references', () => ({ referencesApi: api }))

import { useClassifiersStore } from '@/stores/classifiers'

beforeEach(() => {
  setActivePinia(createPinia())
  api.listClassifiers.mockReset()
  api.listClassifiersBatch.mockReset()
  // По умолчанию пачки нет (старый сервер / сбой) — работает запасной путь по одному коду.
  api.listClassifiersBatch.mockRejectedValue(new Error('batch down'))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

const item = (code: string) => [{ code: `${code}-1`, nameRu: code }]
const batchOf = (codes: string[]) => Object.fromEntries(codes.map((c) => [c, item(c)]))

describe('классификаторы: одним запросом', () => {
  it('всё, чего нет в кэше, — один запрос; повтор из кэша без запросов', async () => {
    api.listClassifiersBatch.mockImplementation(async (codes: string[]) => batchOf(codes))
    const store = useClassifiersStore()
    await store.loadMany(['2004', 'pref-fee', 'tax-modes', '2004'])
    expect(api.listClassifiersBatch).toHaveBeenCalledTimes(1)
    expect(api.listClassifiersBatch).toHaveBeenCalledWith(['2004', 'pref-fee', 'tax-modes'])
    expect(api.listClassifiers).not.toHaveBeenCalled()
    expect(store.cache['pref-fee']).toEqual(item('pref-fee'))

    await store.loadMany(['2004', 'tax-modes'])
    await store.load('pref-fee')
    expect(api.listClassifiersBatch).toHaveBeenCalledTimes(1)
    expect(api.listClassifiers).not.toHaveBeenCalled()

    // В пачку уходят только недостающие коды.
    await store.loadMany(['2004', 'x1', 'x2'])
    expect(api.listClassifiersBatch).toHaveBeenLastCalledWith(['x1', 'x2'])
  })

  it('код, которого нет в ответе, кэшируется пустым списком', async () => {
    api.listClassifiersBatch.mockResolvedValue({ a: item('a') })
    const store = useClassifiersStore()
    await store.loadMany(['a', 'nope'])
    expect(store.cache.nope).toEqual([])
  })

  it('больше предела — делит на части', async () => {
    api.listClassifiersBatch.mockImplementation(async (codes: string[]) => batchOf(codes))
    const store = useClassifiersStore()
    const codes = Array.from({ length: 70 }, (_, i) => `c${i}`)
    await store.loadMany(codes)
    expect(api.listClassifiersBatch).toHaveBeenCalledTimes(2)
    expect(api.listClassifiersBatch.mock.calls[0]![0]).toHaveLength(64)
    expect(api.listClassifiersBatch.mock.calls[1]![0]).toHaveLength(6)
    expect(codes.every((c) => store.cache[c])).toBe(true)
  })

  it('одиночный load во время пачки ждёт её, а не шлёт свой запрос', async () => {
    let release!: (v: Record<string, unknown>) => void
    api.listClassifiersBatch.mockReturnValue(new Promise((r) => { release = r }))
    const store = useClassifiersStore()
    const many = store.loadMany(['a', 'b'])
    const single = store.load('a')
    const again = store.loadMany(['a', 'b'])
    release(batchOf(['a', 'b']))
    await Promise.all([many, single, again])
    expect(await single).toEqual(item('a'))
    expect(api.listClassifiersBatch).toHaveBeenCalledTimes(1)
    expect(api.listClassifiers).not.toHaveBeenCalled()
  })

  it('пачка упала — догружает по одному, ожидающий load получает данные', async () => {
    api.listClassifiers.mockImplementation(async (code: string) => item(code))
    const store = useClassifiersStore()
    const many = store.loadMany(['a', 'b', 'c'])
    const single = store.load('b')
    await many
    expect(await single).toEqual(item('b'))
    expect(api.listClassifiersBatch).toHaveBeenCalledTimes(1)
    expect(api.listClassifiers).toHaveBeenCalledTimes(3)
    expect(['a', 'b', 'c'].every((c) => store.cache[c])).toBe(true)
  })

  it('один недостающий код — обычный одиночный запрос', async () => {
    api.listClassifiers.mockImplementation(async (code: string) => item(code))
    const store = useClassifiersStore()
    await store.loadMany(['only'])
    expect(api.listClassifiersBatch).not.toHaveBeenCalled()
    expect(api.listClassifiers).toHaveBeenCalledWith('only')
  })
})

describe('классификаторы: запасной путь по одному коду', () => {
  it('не больше 4 запросов одновременно, все коды загружены', async () => {
    let active = 0
    let peak = 0
    api.listClassifiers.mockImplementation(async (code: string) => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
      return [{ code: `${code}-1`, nameRu: code }]
    })
    const store = useClassifiersStore()
    const codes = Array.from({ length: 12 }, (_, i) => `c${i}`)
    await store.loadMany([...codes, 'c0'])
    expect(peak).toBeLessThanOrEqual(4)
    expect(api.listClassifiers).toHaveBeenCalledTimes(12)
    expect(codes.every((c) => store.cache[c]?.length === 1)).toBe(true)
  })

  it('ошибка одного кода не мешает остальным; пачка отклоняется, упавший код загрузится в следующий раз', async () => {
    api.listClassifiers.mockImplementation(async (code: string) => {
      if (code === 'bad') throw new Error('fail')
      return [{ code: '1', nameRu: code }]
    })
    const store = useClassifiersStore()
    await expect(store.loadMany(['a', 'bad', 'b'])).rejects.toThrow('fail')
    expect(store.cache.a).toBeTruthy()
    expect(store.cache.b).toBeTruthy()
    expect(store.cache.bad).toBeUndefined()
    api.listClassifiers.mockResolvedValue([{ code: '1', nameRu: 'ok' }])
    await store.loadMany(['a', 'bad'])
    expect(store.cache.bad).toBeTruthy()
    expect(api.listClassifiers).toHaveBeenCalledTimes(4)
  })
})
