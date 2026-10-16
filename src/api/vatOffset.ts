import apiClient from './client'

// Перечни РК для уплаты НДС методом зачёта (НК РК ст. 508–509): ПП РК № 1199 (импортируемые товары) и Приказ МСХ РК
// № 302 (запчасти для сельхозтехники). В КЕДЕН их нет — сервер ведёт их из текста актов (ИПС «Әділет»).

/** Строка перечня, покрывающая код: partial — «из …»/сноска «*»: только товары из наименования. */
export interface VatOffsetMatchRow {
  /** Ключ перечня: 'pp-1199', 'msh-302'. */
  list: string
  actNumber: string
  /** Акт в подсказке у 5060: «ПП РК №1199». */
  hintLabel: string
  number: number
  name: string
  partial: boolean
  footnote: string | null
  condition: string | null
  codeText: string
}

export interface VatOffsetMatch {
  items: { code: string; rows: VatOffsetMatchRow[] }[]
}

export interface VatOffsetListRow {
  number: number
  name: string
  footnote: string | null
  condition: string | null
  codeText: string
}

export interface VatOffsetList {
  key: string
  actName: string
  actNumber: string
  actDate: string
  actTitle: string
  actUrl: string
  effectiveFrom: string
  editionDate: string
  amendments: { number: string; date: string | null; url: string | null }[]
  origin: 'seed' | 'network' | 'upload' | string
  sourceUrl: string | null
  loadedAtUtc: string
  checkedAtUtc: string | null
  configuredSourceUrl: string
  rows: VatOffsetListRow[]
}

/** Итог обновления: applied — редакция сохранена; reason — 'same' (та же) или 'older' (в источнике старее). */
export interface VatOffsetSyncResult {
  list: string
  applied: boolean
  reason: 'same' | 'older' | null
  editionDate: string
  rows: number
  origin: string
  source: string | null
}

const quiet = (silent?: boolean) => (silent ? { silent: true } : {})

export const vatOffsetApi = {
  /** Какие из 10-значных кодов в перечнях на дату (гр. А). */
  match: async (codes: string[], onDate: string | null, opts?: { silent?: boolean }): Promise<VatOffsetMatch> =>
    (await apiClient.get('/tnved/vat-offset', { params: { codes: codes.join(','), onDate: onDate || undefined }, ...quiet(opts?.silent) })).data,
  lists: async (opts?: { silent?: boolean }): Promise<VatOffsetList[]> =>
    (await apiClient.get('/ref/vat-offset-lists', quiet(opts?.silent))).data,
  sync: async (key: string): Promise<VatOffsetSyncResult> =>
    (await apiClient.post(`/ref/vat-offset-lists/${encodeURIComponent(key)}/sync`)).data,
  import: async (key: string, file: File): Promise<VatOffsetSyncResult> => {
    const fd = new FormData()
    fd.append('file', file)
    return (await apiClient.post(`/ref/vat-offset-lists/${encodeURIComponent(key)}/import`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data
  },
}
