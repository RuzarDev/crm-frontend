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

  it('неизвестный код (сервер отдал пустой массив) кэшируется пустым списком без второго запроса', async () => {
    api.listClassifiersBatch.mockResolvedValue({ a: item('a'), nope: [] })
    const store = useClassifiersStore()
    await store.loadMany(['a', 'nope'])
    expect(store.cache.nope).toEqual([])
    expect(api.listClassifiers).not.toHaveBeenCalled()
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

  it('старый сервер: /batch отвечает как код «batch» — 200 и [] → коды догружаются по одному, [] не кэшируется', async () => {
    api.listClassifiersBatch.mockResolvedValue([])
    api.listClassifiers.mockImplementation(async (code: string) => item(code))
    const store = useClassifiersStore()
    await store.loadMany(['2004', 'pref-fee', 'tax-modes'])
    expect(api.listClassifiers).toHaveBeenCalledTimes(3)
    expect(store.cache['2004']).toEqual(item('2004'))
    expect(store.cache['pref-fee']).toEqual(item('pref-fee'))
  })

  it('чужая форма ответа (строка, null, не массив у кода) и неполный объект → недостающие по одному', async () => {
    api.listClassifiers.mockImplementation(async (code: string) => item(code))
    const store = useClassifiersStore()
    api.listClassifiersBatch.mockResolvedValueOnce('<!doctype html>')
    await store.loadMany(['h1', 'h2'])
    expect(api.listClassifiers).toHaveBeenCalledTimes(2)
    expect(store.cache.h1).toEqual(item('h1'))

    api.listClassifiers.mockClear()
    api.listClassifiersBatch.mockResolvedValueOnce({ a: item('a'), c: 'oops' })
    await store.loadMany(['a', 'b', 'c'])
    expect(api.listClassifiers.mock.calls.map((c) => c[0]).sort()).toEqual(['b', 'c'])
    expect(store.cache.a).toEqual(item('a'))
    expect(store.cache.b).toEqual(item('b'))
    expect(store.cache.c).toEqual(item('c'))
  })

  it('одна часть пачки упала — по одному догружается только она', async () => {
    let call = 0
    api.listClassifiersBatch.mockImplementation(async (codes: string[]) => {
      call++
      if (call === 2) throw new Error('chunk 2 down')
      return batchOf(codes)
    })
    api.listClassifiers.mockImplementation(async (code: string) => item(code))
    const store = useClassifiersStore()
    const codes = Array.from({ length: 70 }, (_, i) => `c${i}`)
    await store.loadMany(codes)
    expect(api.listClassifiersBatch).toHaveBeenCalledTimes(2)
    expect(api.listClassifiers).toHaveBeenCalledTimes(6)
    expect(api.listClassifiers.mock.calls.map((c) => c[0])).toEqual(codes.slice(64))
    expect(codes.every((c) => store.cache[c])).toBe(true)
  })

  it('invalidate во время пачки: устаревший ответ не ложится в кэш, новый load шлёт свой запрос', async () => {
    let release!: (v: Record<string, unknown>) => void
    api.listClassifiersBatch.mockReturnValue(new Promise((r) => { release = r }))
    api.listClassifiers.mockResolvedValue([{ code: 'NEW', nameRu: 'после добавления' }])
    const store = useClassifiersStore()
    const many = store.loadMany(['goods-locations', 'x'])
    store.invalidate('goods-locations')
    const fresh = await store.load('goods-locations')
    expect(api.listClassifiers).toHaveBeenCalledWith('goods-locations')
    release({ 'goods-locations': [{ code: 'OLD', nameRu: 'до добавления' }], x: item('x') })
    await many
    expect(fresh).toEqual([{ code: 'NEW', nameRu: 'после добавления' }])
    expect(store.cache['goods-locations']).toEqual([{ code: 'NEW', nameRu: 'после добавления' }])
    expect(store.cache.x).toEqual(item('x'))

    // invalidate() целиком — тоже снимает запросы в полёте.
    api.listClassifiersBatch.mockReturnValue(new Promise((r) => { release = r }))
    const again = store.loadMany(['y', 'z'])
    store.invalidate()
    release(batchOf(['y', 'z']))
    await again
    expect(store.cache.y).toBeUndefined()
    expect(store.cache.z).toBeUndefined()
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
