import apiClient from './client'

// Прогноз СУР (очередь 4, задача 4): статистика коридоров по нашим ДТ и «цена ниже типичной» (GET /api/sur/stats).
// Статистика по нашим ДТ, не прогноз таможни. Клиенту сервер отдаёт только доли, N и признак low; p25Kzt — сотрудникам.

export interface SurCorridorStatsDto {
  postCode: string | null
  /** ДТ с известным коридором (КЕДЕН или отметка сотрудника). */
  n: number
  /** Все ДТ с этим кодом за период. */
  total: number
  enough: boolean
  greenPct: number | null
  yellowPct: number | null
  redPct: number | null
  bluePct: number | null
}

/** basis: «kg» — тенге за 1 кг нетто (гр. 45 / гр. 38); «unit» — за 1 ДЕИ (гр. 45 / гр. 41) того же ОКЕИ. */
export interface SurPriceCheckDto {
  basis: 'kg' | 'unit'
  unitCode: string | null
  n: number
  enough: boolean
  valuePerUnitKzt: number | null
  low: boolean | null
  p25Kzt: number | null
}

export interface SurStatsDto {
  code: string
  months: number
  minN: number
  byCode: SurCorridorStatsDto
  byPost: SurCorridorStatsDto | null
  price: SurPriceCheckDto | null
}

export interface SurStatsQuery {
  code: string
  country?: string | null
  post?: string | null
  declarationId?: string | null
  valueKzt?: number | null
  netKg?: number | null
  quantity?: number | null
  unitCode?: string | null
}

const clean = (q: SurStatsQuery) =>
  Object.fromEntries(Object.entries(q).filter(([, v]) => v !== null && v !== undefined && v !== ''))

export interface DeclarationCorridorDto {
  corridor: string
  setAtUtc: string | null
  setByUserId: string | null
  kedenCorridor: string | null
}

export const surApi = {
  stats: (q: SurStatsQuery) => apiClient.get<SurStatsDto>('/sur/stats', { params: clean(q), silent: true }),
  /** Отметить коридор ДТ (декларант, РОП, админ); null — снять отметку. Только этим действием — PUT ДТ коридор не шлёт. */
  setCorridor: (caseId: string, dtId: string, corridor: 'green' | 'yellow' | 'red' | null) =>
    apiClient.post<DeclarationCorridorDto>(`/import40/${caseId}/declarations/${dtId}/corridor`, { corridor }),
}
