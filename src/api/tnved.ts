import apiClient from './client'
import type {
  TnvedNodeDto,
  TnvedPathNodeDto,
  TnvedTransitionDto,
  TnvedRateDto,
  TnvedSuggestDto,
  TnvedClassifyResponse,
  TnvedCalculateRequest,
  TnvedCalculateResult,
  TnvedCurrencyDto,
  TnvedNewsDto,
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

  suggest: (q: string) =>
    apiClient.get<TnvedSuggestDto>('/tnved/suggest', { params: { q } }),

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

  calculate: (req: TnvedCalculateRequest) =>
    apiClient.post<TnvedCalculateResult>('/tnved/calculate', req),

  // ── Currencies ──────────────────────────────────────────────────────────────
  currencies: () =>
    apiClient.get<TnvedCurrencyDto[]>('/tnved/currencies'),

  // ── News ────────────────────────────────────────────────────────────────────
  news: (limit = 50) =>
    apiClient.get<TnvedNewsDto[]>('/tnved/news', { params: { limit } }),

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

  seedTransitions: () =>
    apiClient.post<TnvedTransitionSeedResult>('/tnved/transition/seed'),

  seedExplanations: () =>
    apiClient.post<{ upserted: number; failed: number }>('/tnved/explanations/seed'),
}
