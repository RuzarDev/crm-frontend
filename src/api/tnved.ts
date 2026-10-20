import apiClient from './client'
import type {
  TnvedTariffOptionDto,
  TnvedNodeDto,
  TnvedPathNodeDto,
  TnvedTransitionDto,
  TnvedRateDto,
  TnvedClassifyResponse,
  TnvedSemanticResponse,
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
  TnvedEttRateDto,
} from '@/types/api'

/**
 * Ставка по стране происхождения. kind — по перечню ЕЭК к соглашению о свободной торговле (Вьетнам, Сербия, Иран):
 * «zero» — товар вне перечня, 0 %; «listedEtt» — в перечне со «ставкой ЕТТ» (rate — ЕТТ, льготы нет); «listedRate» — своя
 * ставка перечня (если по ЕТТ ниже — ЕТТ). Нет kind — строка страны из КЕДЕН. note — пояснение сервера (ВТО РК, квота,
 * «проверьте наименование/сезон»), uncertain — строка перечня зависит от наименования/сезона.
 */
export interface TariffCountryRateDto {
  rate: string
  country: string
  source: string | null
  kind?: 'zero' | 'listedEtt' | 'listedRate' | null
  note?: string | null
  uncertain?: boolean
}

export interface TariffOptionsDto {
  countryRate: TariffCountryRateDto | null
  excise: TnvedTariffOptionDto[]
  antiDumping: TnvedTariffOptionDto[]
  // Действующие ставки пошлины (ЕТТ, ВТО) — по ним видно, нужны ли л / шт / см³ для специфической части.
  dutyRates?: string[]
  /** Ставка ЕТТ на дату onDate: ЕЭК и КЕДЕН рядом, источник действующей. */
  ettRate?: TnvedEttRateDto | null
  /** НДС 5% по перечню ПП РК №1204; null/нет — перечень не загружен (сервер считает по прежним группам). */
  reducedVat?: ReducedVatDto | null
}

/**
 * Код в перечне ПП РК №1204 (НДС 5%): «auto» — 5% ставится сам (вся позиция в перечне), «confirm» — только часть товаров
 * кода, 5% по «Медизделие», «none» — не в перечне. goods — товары перечня по коду (КЕДЕН).
 */
export interface ReducedVatDto {
  status: 'auto' | 'confirm' | 'none'
  goods: string[]
}

// Экран сам показывает ошибку (свой блок, 429 — «слишком много запросов»): перехватчик тост не рисует.
export interface TnvedRequestOptions { silent?: boolean }
const quiet = (o?: TnvedRequestOptions) => (o?.silent ? { silent: true } : {})

export const tnvedApi = {
  // ── Import tree ─────────────────────────────────────────────────────────────
  /** silent — без тоста перехватчика (корень дерева показывает ошибку сам). */
  children: (parentId = 0, opts?: TnvedRequestOptions) =>
    apiClient.get<TnvedNodeDto[]>('/tnved/children', { params: { parentId }, ...quiet(opts) }),

  /** silent — без тоста перехватчика (проверка кода у поля: «кода нет» показывает само поле). */
  node: (code: string, opts?: TnvedRequestOptions) =>
    apiClient.get<TnvedNodeDto>(`/tnved/node/${encodeURIComponent(code)}`, quiet(opts)),

  path: (code: string) =>
    apiClient.get<TnvedPathNodeDto[]>(`/tnved/path/${encodeURIComponent(code)}`),

  search: (q: string, leafOnly = false, limit = 30, opts?: TnvedRequestOptions) =>
    apiClient.get<TnvedNodeDto[]>('/tnved/search', { params: { q, leafOnly, limit }, ...quiet(opts) }),


  classify: (description: string, limit = 10, opts?: TnvedRequestOptions) =>
    apiClient.get<TnvedClassifyResponse>('/tnved/classify', { params: { description, limit }, ...quiet(opts) }),

  /** Смысловой поиск (21.10): мгновенно, по смыслу описания; available = false — модели нет, искать по словам. */
  semantic: (q: string, limit = 10, opts?: TnvedRequestOptions) =>
    apiClient.get<TnvedSemanticResponse>('/tnved/semantic', { params: { q, limit }, ...quiet(opts) }),

  // ── Notes / explanations ────────────────────────────────────────────────────
  notes: (code: string, opts?: TnvedRequestOptions) =>
    apiClient.get<TnvedExplanationDto>(`/tnved/node/${encodeURIComponent(code)}/notes`, quiet(opts)),

  // ── Rates ───────────────────────────────────────────────────────────────────
  rates: (code: string, opts?: TnvedRequestOptions) =>
    opts?.silent
      ? apiClient.get<TnvedRateDto>(`/tnved/node/${encodeURIComponent(code)}/rates`, { silent: true })
      : apiClient.get<TnvedRateDto>(`/tnved/node/${encodeURIComponent(code)}/rates`),

  // ── Reference (нетарифка / справка по товару) ──────────────────────────────
  reference: (code: string, opts?: TnvedRequestOptions) =>
    apiClient.get<TnvedReferenceDto>(`/tnved/node/${encodeURIComponent(code)}/reference`, quiet(opts)),

  // ── Export reference (вывоз: ставка + нетарифка по направлению OUT) ────────
  exportReference: (code: string, opts?: TnvedRequestOptions) =>
    apiClient.get<TnvedExportReferenceDto>(`/tnved/node/${encodeURIComponent(code)}/export-reference`, quiet(opts)),

  rateChanges: (limit = 50, opts?: TnvedRequestOptions) =>
    apiClient.get<TnvedRateChangeDto[]>('/tnved/rate-changes', { params: { limit }, ...quiet(opts) }),

  // GET: сервер принимает калькулятор только как GET с параметрами (POST давал 405).
  calculate: (req: TnvedCalculateRequest, opts?: TnvedRequestOptions) =>
    apiClient.get<TnvedCalculateResult>('/tnved/calculate', { params: req, ...quiet(opts) }),

  // ── Currencies ──────────────────────────────────────────────────────────────
  currencies: (opts?: TnvedRequestOptions) =>
    opts?.silent
      ? apiClient.get<TnvedCurrencyDto[]>('/tnved/currencies', { silent: true })
      : apiClient.get<TnvedCurrencyDto[]>('/tnved/currencies'),


  // ── Regulations ─────────────────────────────────────────────────────────────
  regulations: (opts?: TnvedRequestOptions) =>
    apiClient.get<TnvedRegulationDto[]>('/tnved/regulations', quiet(opts)),

  // ── Timeline ────────────────────────────────────────────────────────────────
  /** limit 0 — все события (сервер держит их в кэше). code — начало кода: только события, где есть такой код (подходящие коды первыми). */
  timeline: (limit = 0, opts?: TnvedRequestOptions & { code?: string }) =>
    apiClient.get<TnvedTimelineDto[]>('/tnved/timeline', { params: { limit, code: opts?.code }, ...quiet(opts) }),

  // ── VTO sections ────────────────────────────────────────────────────────────
  vtoSections: (opts?: TnvedRequestOptions) =>
    apiClient.get<TnvedVtoSectionDto[]>('/tnved/vto-sections', quiet(opts)),

  // ── Analytics ───────────────────────────────────────────────────────────────
  topCodes: (limit = 20, opts?: TnvedRequestOptions) =>
    apiClient.get<TnvedTopCodeDto[]>('/tnved/stats/top-codes', { params: { limit }, ...quiet(opts) }),

  // ── Transition ──────────────────────────────────────────────────────────────
  getTransition: (code: string, opts?: TnvedRequestOptions) =>
    apiClient.get<TnvedTransitionDto>(`/tnved/transition/${encodeURIComponent(code)}`, quiet(opts)),

  // ── Sync (admin) ────────────────────────────────────────────────────────────
  syncHistory: (opts?: TnvedRequestOptions) =>
    apiClient.get<TnvedSyncLogDto[]>('/tnved/sync/history', quiet(opts)),

  // Сервер выполняет синхронизацию в самом запросе (курсы НБ РК + ставки КЕДЕН) и отвечает по её окончании:
  // обычного таймаута 30 с не хватает — запрос обрывался раньше, чем заканчивалась синхронизация.
  syncTrigger: () =>
    apiClient.post('/tnved/sync', null, { timeout: 300000 }),

  // Ставка по стране (ЗСТ), виды акциза и антидемпинг из КЕДЕН по коду и стране происхождения (ОКСМ) на дату
  // (гр. А; пусто — сегодня). silent — подсказка у товара показывает сбой сама, без тоста на каждый товар.
  tariffOptions: (code: string, country?: string | null, onDate?: string | null, opts?: TnvedRequestOptions) =>
    apiClient.get<TariffOptionsDto>('/tnved/tariff-options', { params: { code, country, onDate }, ...quiet(opts) }),

  // Перекачать «Справку по товару» КЕДЕН по всем действующим кодам (в фоне, ~час): новые ставки и меры сразу,
  // без ожидания еженедельного обновления.
  refreshKedenReference: () =>
    apiClient.post('/tnved/sync/reference', null, { params: { full: true } }),

  seedTransitions: () =>
    apiClient.post<TnvedTransitionSeedResult>('/tnved/transition/seed'),

}
