import { defineStore } from 'pinia'
import { ref } from 'vue'
import { referencesApi } from '@/api/references'
import type { ClassifierItem } from '@/types/api'

// Кэш классификаторов на сессию: одна ДТ трогает 8+ классификаторов,
// дёргать API на каждый селект не нужно.
export const useClassifiersStore = defineStore('classifiers', () => {
  const cache = ref<Record<string, ClassifierItem[]>>({})
  const inFlight = new Map<string, Promise<ClassifierItem[]>>()

  const load = async (code: string): Promise<ClassifierItem[]> => {
    const cached = cache.value[code]
    if (cached) return cached
    const pending = inFlight.get(code)
    if (pending) return pending
    const request = referencesApi
      .listClassifiers(code)
      .then((items) => {
        cache.value[code] = items
        return items
      })
      .finally(() => inFlight.delete(code))
    inFlight.set(code, request)
    return request
  }

  const loadMany = async (codes: string[]): Promise<void> => {
    await Promise.all(codes.map(load))
  }

  const options = (code: string) =>
    (cache.value[code] ?? []).map((c) => ({ value: c.code, label: `${c.code} — ${c.nameRu}` }))

  const invalidate = (code?: string) => {
    if (code) delete cache.value[code]
    else cache.value = {}
  }

  return { cache, load, loadMany, options, invalidate }
})
