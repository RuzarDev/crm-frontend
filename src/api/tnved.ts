import apiClient from './client'
import type {
  TnvedTariffOptionDto,
  TnvedNodeDto,
  TnvedPathNodeDto,
  TnvedTransitionDto,
  TnvedRateDto,
  TnvedClassifyResponse,
  TnvedCalculateRequest,
  TnvedCalculateResult,
  TnvedCurrencyDto,
  TnvedRegulationDto,
  TnvedTimelineDto,
  TnvedExplanationDto,
  TnvedVtoSectionDto,
  TnvedTopCodeDto,
  TnvedRateChangeDto,
  TnvedSyncLogDto,
  TnvedTransitionSeedResult,
  TnvedReferenceDto,
  TnvedExportReferenceDto,
} from '@/types/api'

export interface TariffOptionsDto {
  countryRate: { rate: string; country: string; source: string | null } | null
  excise: TnvedTariffOptionDto[]
  antiDumping: TnvedTariffOptionDto[]
}

export const tnvedApi = {
  // ── Import tree ─────────────────────────────────────────────────────────────
  children: (parentId = 0) =>
    apiClient.get<TnvedNodeDto[]>('/tnved/children', { params: { parentId } }),

  node: (code: string) =>
    apiClient.get<TnvedNodeDto>(`/tnved/node/${encodeURIComponent(code)}`),

  path: (code: string) =>
    apiClient.get<TnvedPathNodeDto[]>(`/tnved/path/${encodeURIComponent(code)}`),

  search: (q: string, leafOnly = false, limit = 30) =>
    apiClient.get<TnvedNodeDto[]>('/tnved/search', { params: { q, leafOnly, limit } }),


  classify: (description: string, limit = 10) =>
    apiClient.post<TnvedClassifyResponse>('/tnved/classify', { description, limit }),

  // ── Notes / explanations ────────────────────────────────────────────────────
  notes: (code: string) =>
    apiClient.get<TnvedExplanationDto>(`/tnved/node/${encodeURIComponent(code)}/notes`),

  // ── Rates ───────────────────────────────────────────────────────────────────
  rates: (code: string) =>
    apiClient.get<TnvedRateDto>(`/tnved/node/${encodeURIComponent(code)}/rates`),

  // ── Reference (нетарифка / справка по товару) ──────────────────────────────
  reference: (code: string) =>
    apiClient.get<TnvedReferenceDto>(`/tnved/node/${encodeURIComponent(code)}/reference`),

  // ── Export reference (вывоз: ставка + нетарифка по направлению OUT) ────────
  exportReference: (code: string) =>
    apiClient.get<TnvedExportReferenceDto>(`/tnved/node/${encodeURIComponent(code)}/export-reference`),

  rateChanges: (limit = 50) =>
    apiClient.get<TnvedRateChangeDto[]>('/tnved/rate-changes', { params: { limit } }),

  // GET: сервер принимает калькулятор только как GET с параметрами (POST давал 405).
  calculate: (req: TnvedCalculateRequest) =>
    apiClient.get<TnvedCalculateResult>('/tnved/calculate', { params: req }),

  // ── Currencies ──────────────────────────────────────────────────────────────
  currencies: () =>
    apiClient.get<TnvedCurrencyDto[]>('/tnved/currencies'),


  // ── Regulations ─────────────────────────────────────────────────────────────
  regulations: () =>
    apiClient.get<TnvedRegulationDto[]>('/tnved/regulations'),

  // ── Timeline ────────────────────────────────────────────────────────────────
  timeline: (limit = 60) =>
    apiClient.get<TnvedTimelineDto[]>('/tnved/timeline', { params: { limit } }),

  // ── VTO sections ────────────────────────────────────────────────────────────
  vtoSections: () =>
    apiClient.get<TnvedVtoSectionDto[]>('/tnved/vto-sections'),

  // ── Analytics ───────────────────────────────────────────────────────────────
  topCodes: (limit = 20) =>
    apiClient.get<TnvedTopCodeDto[]>('/tnved/stats/top-codes', { params: { limit } }),

  // ── Transition ──────────────────────────────────────────────────────────────
  getTransition: (code: string) =>
    apiClient.get<TnvedTransitionDto>(`/tnved/transition/${encodeURIComponent(code)}`),

  // ── Sync (admin) ────────────────────────────────────────────────────────────
  syncHistory: () =>
    apiClient.get<TnvedSyncLogDto[]>('/tnved/sync/history'),

  syncTrigger: () =>
    apiClient.post('/tnved/sync'),

  // Ставка по стране (ЗСТ), виды акциза и антидемпинг из КЕДЕН по коду и стране происхождения (ОКСМ).
  tariffOptions: (code: string, country?: string | null, onDate?: string | null) =>
    apiClient.get<TariffOptionsDto>('/tnved/tariff-options', { params: { code, country, onDate } }),

  seedTransitions: () =>
    apiClient.post<TnvedTransitionSeedResult>('/tnved/transition/seed'),

}
