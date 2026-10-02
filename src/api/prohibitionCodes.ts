import apiClient from './client'

// Гр.33: справочник кодов запретов/ограничений (Приказ МФ РК № 259, прил.1) и подсказки по ТН ВЭД из KEDEN.
export interface ProhibitionCodeItem {
  code: string
  name: string
  categoryCode: string
  categoryName: string
  kind: string
  /** XX00 — «не подпадает / не является». */
  isNegative: boolean
}

export interface SuggestedProhibitionCode {
  code: string
  name: string | null
  isNegative: boolean
  inReference: boolean
  sourceResolution: string | null
}

export interface ProhibitionSuggestResult {
  tnved: string
  codes: SuggestedProhibitionCode[]
  fetchedAtUtc: string | null
  /** Данные из старого кэша (KEDEN не ответил). */
  stale: boolean
  warning: string | null
}

let referencePromise: Promise<ProhibitionCodeItem[]> | null = null
const suggestCache = new Map<string, Promise<ProhibitionSuggestResult>>()

export const prohibitionCodesApi = {
  /** Весь справочник (164 кода) — один раз на сессию. */
  list: (): Promise<ProhibitionCodeItem[]> => {
    referencePromise ??= apiClient.get('/ref/prohibition-codes', { silent: true }).then((r) => r.data as ProhibitionCodeItem[])
      .catch((e) => { referencePromise = null; throw e })
    return referencePromise
  },
  /** Подсказки по 10-значному коду ТН ВЭД; ответ кэшируется на сессию (ошибки — нет). */
  suggest: (tnved: string): Promise<ProhibitionSuggestResult> => {
    let p = suggestCache.get(tnved)
    if (!p) {
      p = apiClient.get('/ref/prohibition-codes/suggest', { params: { tnved }, timeout: 30000, silent: true })
        .then((r) => r.data as ProhibitionSuggestResult)
        .catch((e) => { suggestCache.delete(tnved); throw e })
      suggestCache.set(tnved, p)
    }
    return p
  },
}
