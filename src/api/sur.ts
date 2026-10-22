import apiClient from './client'

// Прогноз СУР (очередь 4, задача 4): статистика коридоров по нашим ДТ и «цена ниже типичной» (GET /api/sur/stats).
// Статистика по нашим ДТ, не прогноз таможни. Клиенту сервер отдаёт только доли, N и признак low; p25Kzt — сотрудникам.
// Клиенту (аудит 22.10): свои ДТ в выборку не входят; при «мало данных» n и total — null; признак low — только для своего
// товара своей ДТ (declarationId + goodsIndex), стоимость и вес сервер берёт из ДТ, а valueKzt/netKg/quantity игнорирует.

export interface SurCorridorStatsDto {
  postCode: string | null
  /** ДТ с известным коридором (КЕДЕН или отметка сотрудника). Клиенту при enough = false — null. */
  n: number | null
  /** Все ДТ с этим кодом за период. Клиенту при enough = false — null. */
  total: number | null
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
  n: number | null
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
  /** Позиция товара в ДТ (с 0, по порядку товаров): клиенту — по ней сервер берёт стоимость и вес своего товара. */
  goodsIndex?: number | null
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
