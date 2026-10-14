import { defineStore } from 'pinia'
import { ref } from 'vue'
import { referencesApi } from '@/api/references'
import type { ClassifierItem } from '@/types/api'

// Кэш классификаторов на сессию: одна ДТ трогает 8+ классификаторов,
// дёргать API на каждый селект не нужно.
const LOAD_CONCURRENCY = 4

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

  // Не больше LOAD_CONCURRENCY запросов сразу: страница ДТ просит ~30 классификаторов, и пачка из 30 параллельных
  // запросов на мобильной сети частично отбивалась по дороге (503 не от нашего сервера, 14.10.2026). Каждый
  // упавший запрос клиент сам повторяет (GET), здесь — только очередь. Ошибка одного кода не отменяет остальные.
  const loadMany = async (codes: string[]): Promise<void> => {
    const queue = [...new Set(codes)].filter((c) => !cache.value[c])
    let failed: unknown = null
    const worker = async () => {
      for (let code = queue.shift(); code !== undefined; code = queue.shift()) {
        try {
          await load(code)
        } catch (e) {
          failed ??= e
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(LOAD_CONCURRENCY, queue.length) }, worker))
    if (failed) throw failed
  }

  const compareByCode = (a: ClassifierItem, b: ClassifierItem) => {
    const na = Number(a.code)
    const nb = Number(b.code)
    if (!Number.isNaN(na) && !Number.isNaN(nb) && a.code.trim() !== '' && b.code.trim() !== '') {
      return na - nb
    }
    return a.code.localeCompare(b.code)
  }

  const options = (code: string) =>
    [...(cache.value[code] ?? [])]
      .sort(compareByCode)
      .map((c) => ({ value: c.code, label: `${c.code} — ${c.nameRu}` }))

  const invalidate = (code?: string) => {
    if (code) delete cache.value[code]
    else cache.value = {}
  }

  return { cache, load, loadMany, options, invalidate }
})
