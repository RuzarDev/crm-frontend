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
  search: async (q: string, opts?: { silent?: boolean }): Promise<SearchHit[]> =>
    (await apiClient.get<SearchHit[]>('/search', { params: { q }, silent: opts?.silent })).data,
}
