import { referencesApi } from '@/api/references'
import type { DtGuideEntry } from '@/types/api'

// Справка КТС 257 по графам (GET /ref/dt-guide/{graph}): кэш на сессию, один запрос на графу.
// Идущий запрос делят все подписи этой графы; неудачный — не кэшируется (следующее открытие повторит).
const cache = new Map<string, Promise<DtGuideEntry>>()

export const loadDtGuide = (graph: string): Promise<DtGuideEntry> => {
  const hit = cache.get(graph)
  if (hit) return hit
  const request = referencesApi.getDtGuideGraph(graph)
  cache.set(graph, request)
  request.catch(() => { if (cache.get(graph) === request) cache.delete(graph) })
  return request
}

/** Для тестов: забыть закэшированное. */
export const resetDtGuideCache = () => cache.clear()
