import apiClient from './client'
import type { EndpointRow, PermissionMatrixResponse } from '@/types/api'

// Журнал действий и сквозной поиск — см. Features/System/AuditAndSearchEndpoints.cs.

/** Строка поиска по журналу (`system/audit/search`): новые сверху. actorUserId — null у системных действий. */
export interface AuditSearchRow {
  id: string
  atUtc: string
  actorUserId: string | null
  actorName: string
  actorRole: string
  action: string
  entityType: string
  entityId: string
  summary: string
}

export interface AuditSearchResponse { items: AuditSearchRow[]; total: number }

export interface AuditSearchParams {
  days?: number
  action?: string
  actorId?: string
  q?: string
  offset?: number
  /** 1–5000, по умолчанию 50. */
  limit?: number
}

export interface SearchHit {
  type: 'case' | 'declaration' | 'client' | 'document' | 'invoice'
  title: string
  subtitle: string
  url: string
}

/**
 * Состояние фоновых проверок внешних сервисов (09.11.2026, GET /system/service-health — администратору и РОП):
 * ключ ИИ (ai-key) и Zircon AI (zircon-ai). active — сбой подтверждён (2 неудачи подряд). Времена — UTC.
 */
export interface ServiceHealthCheck {
  name: 'ai-key' | 'zircon-ai' | string
  status: 'ok' | 'failing' | 'skipped' | 'unknown' | string
  active: boolean
  consecutiveFailures: number
  failingSinceUtc: string | null
  lastSuccessAtUtc: string | null
  lastCheckedAtUtc: string | null
  errorKind: 'key_rejected' | 'unreachable' | 'server_error' | 'bad_response' | string | null
  error: string | null
  alertSentAtUtc: string | null
}
export interface ServiceHealthResponse { checks: ServiceHealthCheck[]; alertEmailsConfigured: boolean }

export const systemApi = {
  /** silent — без тоста перехватчика: «Каталог API» сам рисует ошибку с «Повторить». */
  getEndpoints: (opts?: { silent?: boolean }) =>
    apiClient.get<EndpointRow[]>('/system/endpoints', opts?.silent ? { silent: true } : undefined),

  getPermissionMatrix: () =>
    apiClient.get<PermissionMatrixResponse>('/system/permissions'),

  /** Журнал действий с фильтрами и страницами; silent — страница сама рисует ошибку с «Повторить». */
  auditSearch: async (params: AuditSearchParams, opts?: { silent?: boolean }): Promise<AuditSearchResponse> =>
    (await apiClient.get<AuditSearchResponse>('/system/audit/search', { params, ...(opts?.silent ? { silent: true } : {}) })).data,

  /** Сотрудники, у которых есть записи в журнале (для фильтра). */
  auditActors: async (opts?: { silent?: boolean }): Promise<{ id: string; name: string }[]> =>
    (await apiClient.get<{ id: string; name: string }[]>('/system/audit/actors', opts?.silent ? { silent: true } : undefined)).data,

  /** silent — без тоста перехватчика: палитра ⌘K сама показывает ошибку поиска. */
  /** Без тоста: плашка на «Главной» молча не показывается, если запрос не прошёл. */
  serviceHealth: async (): Promise<ServiceHealthResponse> =>
    (await apiClient.get<ServiceHealthResponse>('/system/service-health', { silent: true })).data,

  search: async (q: string, opts?: { silent?: boolean }): Promise<SearchHit[]> =>
    (await apiClient.get<SearchHit[]>('/search', { params: { q }, silent: opts?.silent })).data,
}
