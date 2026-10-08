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
  // Действующие ставки пошлины (ЕТТ, ВТО) — по ним видно, нужны ли л / шт / см³ для специфической части.
  dutyRates?: string[]
}

// Экран сам показывает ошибку (свой блок, 429 — «слишком много запросов»): перехватчик тост не рисует.
export interface TnvedRequestOptions { silent?: boolean }
const quiet = (o?: TnvedRequestOptions) => (o?.silent ? { silent: true } : {})

export const tnvedApi = {
  // ── Import tree ─────────────────────────────────────────────────────────────
  children: (parentId = 0) =>
    apiClient.get<TnvedNodeDto[]>('/tnved/children', { params: { parentId } }),

  node: (code: string) =>
    apiClient.get<TnvedNodeDto>(`/tnved/node/${encodeURIComponent(code)}`),

  path: (code: string) =>
    apiClient.get<TnvedPathNodeDto[]>(`/tnved/path/${encodeURIComponent(code)}`),

  search: (q: string, leafOnly = false, limit = 30, opts?: TnvedRequestOptions) =>
    apiClient.get<TnvedNodeDto[]>('/tnved/search', { params: { q, leafOnly, limit }, ...quiet(opts) }),


  classify: (description: string, limit = 10, opts?: TnvedRequestOptions) =>
    apiClient.get<TnvedClassifyResponse>('/tnved/classify', { params: { description, limit }, ...quiet(opts) }),

  // ── Notes / explanations ────────────────────────────────────────────────────
  notes: (code: string) =>
    apiClient.get<TnvedExplanationDto>(`/tnved/node/${encodeURIComponent(code)}/notes`),

  // ── Rates ───────────────────────────────────────────────────────────────────
  rates: (code: string, opts?: TnvedRequestOptions) =>
    opts?.silent
      ? apiClient.get<TnvedRateDto>(`/tnved/node/${encodeURIComponent(code)}/rates`, { silent: true })
      : apiClient.get<TnvedRateDto>(`/tnved/node/${encodeURIComponent(code)}/rates`),

  // ── Reference (нетарифка / справка по товару) ──────────────────────────────
  reference: (code: string) =>
    apiClient.get<TnvedReferenceDto>(`/tnved/node/${encodeURIComponent(code)}/reference`),

  // ── Export reference (вывоз: ставка + нетарифка по направлению OUT) ────────
  exportReference: (code: string) =>
    apiClient.get<TnvedExportReferenceDto>(`/tnved/node/${encodeURIComponent(code)}/export-reference`),

  rateChanges: (limit = 50) =>
    apiClient.get<TnvedRateChangeDto[]>('/tnved/rate-changes', { params: { limit } }),

  // GET: сервер принимает калькулятор только как GET с параметрами (POST давал 405).
  calculate: (req: TnvedCalculateRequest, opts?: TnvedRequestOptions) =>
    apiClient.get<TnvedCalculateResult>('/tnved/calculate', { params: req, ...quiet(opts) }),

  // ── Currencies ──────────────────────────────────────────────────────────────
  currencies: (opts?: TnvedRequestOptions) =>
    opts?.silent
      ? apiClient.get<TnvedCurrencyDto[]>('/tnved/currencies', { silent: true })
      : apiClient.get<TnvedCurrencyDto[]>('/tnved/currencies'),


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
