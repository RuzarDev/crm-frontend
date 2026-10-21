// «Похожие коды» в карточке товара без кода (пакет импорта 21.10.2026, №9, В14): до 3 кодов смыслового поиска, без модели —
// подбор по словам. Ответ по описанию — в кэше сессии (повторное открытие товара не спрашивает).
import { tnvedApi } from '@/api/tnved'

export interface SimilarCode { code: string; description: string }

export const SIMILAR_LIMIT = 3
const cache = new Map<string, SimilarCode[]>()

/** Похожие коды по описанию (тихо). Сбой — исключение (вызывающий молчит). */
export async function similarCodes(description: string): Promise<SimilarCode[]> {
  const desc = description.trim()
  const hit = cache.get(desc)
  if (hit) return hit
  let list: SimilarCode[]
  const sem = await tnvedApi.semantic(desc, SIMILAR_LIMIT, { silent: true }).catch(() => null)
  if (sem?.data.available && sem.data.matches.length) {
    list = sem.data.matches.slice(0, SIMILAR_LIMIT).map((m) => ({ code: m.code, description: m.description }))
  } else {
    const cl = await tnvedApi.classify(desc, SIMILAR_LIMIT, { silent: true })
    list = cl.data.matches.slice(0, SIMILAR_LIMIT).map((m) => ({ code: m.code, description: m.description }))
  }
  cache.set(desc, list)
  return list
}

/** Для тестов. */
export function resetSimilarCodes(): void {
  cache.clear()
}
