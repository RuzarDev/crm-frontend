import apiClient from './client'

// Национальные перечни РК (17.10): временные меры (запрет ввоза пшеницы, яиц…) — ведёт сотрудник с tnved.manage;
// перечни маркировки (Приказ МТИ № 199-НҚ) и МУЦ (Приказ МФ № 658) — встроены из таблиц владельца; ставки утильсбора
// (прил. 4 Методики № 448) — с отметкой «сверено».

export type NationalMeasureKind = 'ban' | 'restriction'
export type NationalMeasureDirection = 'IN' | 'OUT'
/** active — действует сегодня, upcoming — ещё не началась, expired — срок вышел, removed — снята. */
export type NationalMeasureState = 'active' | 'upcoming' | 'expired' | 'removed'

export interface NationalMeasureExtension {
  actName: string
  actNumber: string
  actDate: string | null
  actUrl: string | null
  previousValidTo: string | null
  validTo: string | null
  atUtc: string
  by: string | null
}

export interface NationalMeasure {
  id: number
  seedKey: string | null
  kind: NationalMeasureKind
  direction: NationalMeasureDirection
  codeText: string
  goods: string
  name: string
  exceptions: string | null
  note: string | null
  actName: string
  actNumber: string
  actDate: string | null
  actUrl: string | null
  validFrom: string
  validTo: string | null
  extensions: NationalMeasureExtension[]
  isActive: boolean
  state: NationalMeasureState
  updatedAtUtc: string
  updatedBy: string | null
}

export interface NationalMeasureRequest {
  kind: NationalMeasureKind
  direction: NationalMeasureDirection
  codeText: string
  goods: string
  name: string
  exceptions: string | null
  note: string | null
  actName: string
  actNumber: string
  actDate: string | null
  actUrl: string | null
  validFrom: string | null
  validTo: string | null
}

export interface NationalMeasureExtendRequest {
  validTo: string | null
  actName: string
  actNumber: string
  actDate: string | null
  actUrl: string | null
}

export interface KzListRow {
  number: number
  codeText: string
  name: string
  /** «из …» — позиция только для части кода. */
  partial: boolean
  /** Маркировка: с какой даты обязательна. */
  startDate: string | null
  /** Маркировка: условие введения (текст акта). */
  condition: string | null
  /** МУЦ: раздел перечня. */
  section: string | null
  /** Позиция под вопросом — что сверить. */
  check: string | null
}

export interface KzList {
  key: 'marking' | 'muc' | string
  actName: string
  actNumber: string
  actDate: string
  actTitle: string
  actUrl: string
  editionDate: string
  effectiveFrom: string
  amendments: { name: string; number: string; date: string; url: string | null }[]
  sourceUrl: string
  note: string
  rows: KzListRow[]
}

export interface MarkingMatchRow {
  number: number
  codeText: string
  name: string
  partial: boolean
  startDate: string
  /** Обязательна на дату (начало не позже даты гр. А). */
  required: boolean
  condition: string | null
  check: string | null
}

export interface MarkingMatch {
  actLabel: string
  actUrl: string
  items: { code: string; rows: MarkingMatchRow[] }[]
}

export interface UtilizationRateRow {
  category: string
  engine: 'ice' | 'electric' | null
  measure: 'cm3' | 't' | 'hp' | null
  over: number | null
  upTo: number | null
  coef1: number | null
  verified1: boolean
  coef2: number | null
  verified2: boolean
  note: string | null
}

export interface UtilizationRates {
  act: string
  actUrl: string
  effectiveFrom: string
  baseMrp: number
  mrp: { year: number; value: number }[]
  rows: UtilizationRateRow[]
}

/**
 * Утильсбор строки (сервер UtilizationFeeDto): ok — сумма по сверенному коэффициенту (amountKzt); unverified — оценка
 * (estimateKzt), в итоги не идёт; needInput — не хватает данных (missing: engineVolume, mass, power, country);
 * noRate — коэффициента нет. text — русская строка расчёта.
 */
export interface UtilizationFee {
  status: 'ok' | 'unverified' | 'needInput' | 'noRate'
  category: string
  measure: string | null
  over: number | null
  upTo: number | null
  fromRbRf: boolean | null
  coefficient: number | null
  baseRateKzt: number | null
  units: number
  amountKzt: number | null
  estimateKzt: number | null
  missing: string[]
  text: string
  note: string | null
}

const quiet = (silent?: boolean) => (silent ? { silent: true } : {})

export const nationalListsApi = {
  measures: async (): Promise<NationalMeasure[]> => (await apiClient.get('/ref/national-measures')).data,
  create: async (body: NationalMeasureRequest): Promise<NationalMeasure> =>
    (await apiClient.post('/ref/national-measures', body, { silentStatuses: [400] })).data,
  update: async (id: number, body: NationalMeasureRequest): Promise<NationalMeasure> =>
    (await apiClient.put(`/ref/national-measures/${id}`, body, { silentStatuses: [400] })).data,
  extend: async (id: number, body: NationalMeasureExtendRequest): Promise<NationalMeasure> =>
    (await apiClient.post(`/ref/national-measures/${id}/extend`, body, { silentStatuses: [400] })).data,
  remove: async (id: number): Promise<NationalMeasure> => (await apiClient.delete(`/ref/national-measures/${id}`)).data,
  restore: async (id: number): Promise<NationalMeasure> => (await apiClient.post(`/ref/national-measures/${id}/restore`)).data,
  lists: async (): Promise<KzList[]> => (await apiClient.get('/ref/kz-lists')).data,
  utilizationRates: async (): Promise<UtilizationRates> => (await apiClient.get('/ref/utilization-rates')).data,
  /** Какие из 10-значных кодов в перечне маркировки и с какой даты обязательна (на дату гр. А). */
  marking: async (codes: string[], onDate: string | null, opts?: { silent?: boolean }): Promise<MarkingMatch> =>
    (await apiClient.get('/tnved/marking', { params: { codes: codes.join(','), onDate: onDate || undefined }, ...quiet(opts?.silent) })).data,
}

/** Ошибки сервера по полям (400 { error, errors: { field: [text] } }) → поле → первый текст. */
export function fieldErrors(e: unknown): Record<string, string> {
  const errors = (e as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors
  const out: Record<string, string> = {}
  if (errors && typeof errors === 'object')
    for (const [k, v] of Object.entries(errors)) if (Array.isArray(v) && typeof v[0] === 'string') out[k] = v[0]
  return out
}
