import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const api = vi.hoisted(() => ({ listClassifiers: vi.fn() }))
vi.mock('@/api/references', () => ({ referencesApi: api }))

import { useClassifiersStore } from '@/stores/classifiers'

beforeEach(() => {
  setActivePinia(createPinia())
  api.listClassifiers.mockReset()
})

describe('классификаторы: загрузка пачки', () => {
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
