import { defineStore } from 'pinia'
import { ref } from 'vue'
import { referencesApi } from '@/api/references'
import type { ClassifierItem } from '@/types/api'

// Кэш классификаторов на сессию: одна ДТ трогает 8+ классификаторов,
// дёргать API на каждый селект не нужно.
const LOAD_CONCURRENCY = 4
/** Предел кодов в одном запросе пачки (ClassifierEndpoints.MaxBatchCodes на сервере). */
export const BATCH_MAX_CODES = 64

export const useClassifiersStore = defineStore('classifiers', () => {
  const cache = ref<Record<string, ClassifierItem[]>>({})
  const inFlight = new Map<string, Promise<ClassifierItem[]>>()

  // Запрос кода живёт в inFlight до ответа: второй желающий ждёт тот же промис, а не шлёт свой.
  const track = (code: string, fetch: Promise<ClassifierItem[]>): Promise<ClassifierItem[]> => {
    const request = fetch
      .then((items) => {
        cache.value[code] = items
        return items
      })
      .finally(() => inFlight.delete(code))
    inFlight.set(code, request)
    return request
  }

  const load = async (code: string): Promise<ClassifierItem[]> => {
    const cached = cache.value[code]
    if (cached) return cached
    const pending = inFlight.get(code)
    if (pending) return pending
    return track(code, referencesApi.listClassifiers(code))
  }

  // Запасной путь — по одному коду, не больше LOAD_CONCURRENCY запросов сразу.
  let active = 0
  const waiting: Array<() => void> = []
  const limited = async <T>(run: () => Promise<T>): Promise<T> => {
    if (active < LOAD_CONCURRENCY) active++
    else await new Promise<void>((resume) => waiting.push(resume)) // место передаёт освободивший
    try {
      return await run()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else active--
    }
  }

  // Страница ДТ просит ~30 классификаторов. Пачка из 30 отдельных запросов на мобильной сети частично отбивалась
  // по дороге (503 не от нашего сервера, 14.10.2026), поэтому всё, чего нет в кэше, берём одним запросом
  // (по BATCH_MAX_CODES кодов). Не вышло (сеть, старый сервер без /batch) — каждый код догружается сам
  // по себе через очередь. Ошибка одного кода не отменяет остальные; пачка отклоняется первой ошибкой.
  const loadMany = async (codes: string[]): Promise<void> => {
    const wanted = [...new Set(codes)].filter((c) => !cache.value[c])
    const fresh = wanted.filter((c) => !inFlight.has(c))
    if (fresh.length === 1) {
      load(fresh[0]!).catch(() => { /* ошибку отдаст ожидание ниже */ })
    } else {
      for (let i = 0; i < fresh.length; i += BATCH_MAX_CODES) {
        const chunk = fresh.slice(i, i + BATCH_MAX_CODES)
        const batch = Promise.resolve()
          .then(() => referencesApi.listClassifiersBatch(chunk))
          .catch((e: unknown) => {
            console.warn('Classifiers: batch failed, loading one by one', e)
            return null
          })
        for (const code of chunk) {
          track(
            code,
            batch.then((map) => (map ? (map[code] ?? []) : limited(() => referencesApi.listClassifiers(code)))),
          ).catch(() => { /* ошибку отдаст ожидание ниже */ })
        }
      }
    }
    const results = await Promise.allSettled(wanted.map((c) => inFlight.get(c) ?? load(c)))
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failed) throw failed.reason
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
