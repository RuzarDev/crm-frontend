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
  /** Только по редакции Приказа № 259 (после перехода): «order259» — код Приказа, «keden» — есть только у КЕДЕН. */
  source?: 'order259' | 'keden'
}

/** Редакция Приказа № 259 (с 09.10.2026) для гр. 33: загружена; activeFrom — с какой даты гр. А применяется (null — ждёт перехода КЕДЕН). */
export interface Gr33EditionStatus {
  edition: string
  title: string
  validFrom: string
  codes: number
  changed: number
  activeFrom: string | null
  configKey: string
}

/** Расхождение списка КЕДЕН с редакцией Приказа. change: renumbered / meaningChanged / wording / kedenOnly / order259Only. */
export interface Gr33EditionDiffRow {
  kedenCode: string
  kedenName: string | null
  order259Code: string | null
  order259Name: string | null
  change: 'same' | 'wording' | 'renumbered' | 'meaningChanged' | 'kedenOnly' | 'order259Only'
  approximate: boolean
  note: string | null
}

export interface SuggestedProhibitionCode {
  code: string
  name: string | null
  isNegative: boolean
  inReference: boolean
  sourceResolution: string | null
  /** Код КЕДЕН принимает только при вывозе (экспорт): при импорте не предлагаем. */
  exportOnly?: boolean
}

export interface ProhibitionSuggestResult {
  tnved: string
  codes: SuggestedProhibitionCode[]
  fetchedAtUtc: string | null
  /** Данные из старого кэша (KEDEN не ответил). */
  stale: boolean
  warning: string | null
}

/** Сколько кодов ТН ВЭД (по сохранённым ответам КЕДЕН) ссылаются на код; inReference=false — у нас нет названия. */
export interface ProhibitionCodeUsage {
  code: string
  tnvedCount: number
  inReference: boolean
  sampleTnved: string | null
}

// Ключ кэша — дата гр. А (только после перехода на редакцию Приказа № 259; до него date не передаётся — '' ).
const referencePromises = new Map<string, Promise<ProhibitionCodeItem[]>>()
const suggestCache = new Map<string, Promise<ProhibitionSuggestResult>>()
let editionPromise: Promise<Gr33EditionStatus | null> | null = null

export const prohibitionCodesApi = {
  /** Весь справочник (181 код) — один раз на сессию. date (гр. А) — только после перехода на редакцию Приказа № 259. */
  list: (date?: string): Promise<ProhibitionCodeItem[]> => {
    const key = date ?? ''
    let p = referencePromises.get(key)
    if (!p) {
      p = apiClient.get('/ref/prohibition-codes', date ? { params: { date }, silent: true } : { silent: true })
        .then((r) => r.data as ProhibitionCodeItem[])
        .catch((e) => { referencePromises.delete(key); throw e })
      referencePromises.set(key, p)
    }
    return p
  },
  /** Редакция Приказа № 259 для гр. 33 — один раз на сессию, тихо; нет редакции (204) — null. */
  editionStatus: (): Promise<Gr33EditionStatus | null> => {
    editionPromise ??= apiClient.get('/ref/prohibition-codes/edition-status', { silent: true })
      .then((r) => (r.data && typeof r.data === 'object' ? (r.data as Gr33EditionStatus) : null))
      .catch((e) => { editionPromise = null; throw e })
    return editionPromise
  },
  /** Для «Данных системы»: чем список КЕДЕН отличается от редакции Приказа № 259. */
  editionDiff: (): Promise<Gr33EditionDiffRow[]> =>
    apiClient.get('/ref/prohibition-codes/edition-diff', { silent: true }).then((r) => r.data as Gr33EditionDiffRow[]),
  /** Для раздела «Справочники»: какие коды КЕДЕН реально присылает. */
  kedenUsage: (): Promise<ProhibitionCodeUsage[]> =>
    apiClient.get('/ref/prohibition-codes/keden-usage', { silent: true }).then((r) => r.data as ProhibitionCodeUsage[]),
  /** Подсказки по 10-значному коду ТН ВЭД; ответ кэшируется на сессию (ошибки и старый кэш сервера — нет).
   *  date (гр. А) — только после перехода на редакцию Приказа № 259: сервер вернёт коды в её нумерации. */
  suggest: (tnved: string, date?: string): Promise<ProhibitionSuggestResult> => {
    const key = date ? `${tnved}@${date}` : tnved
    let p = suggestCache.get(key)
    if (!p) {
      p = apiClient.get('/ref/prohibition-codes/suggest', { params: date ? { tnved, date } : { tnved }, timeout: 30000, silent: true })
        .then((r) => r.data as ProhibitionSuggestResult)
        // Старый кэш сервера (КЕДЕН не ответил) — не запоминаем: следующий запрос спросит КЕДЕН снова.
        .then((r) => { if (r.stale && suggestCache.get(key) === p) suggestCache.delete(key); return r })
        .catch((e) => { suggestCache.delete(key); throw e })
      suggestCache.set(key, p)
    }
    return p
  },
}
