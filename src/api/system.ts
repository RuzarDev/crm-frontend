import apiClient from './client'
import type { EndpointRow, PermissionMatrixResponse } from '@/types/api'

// Журнал действий и сквозной поиск — см. Features/System/AuditAndSearchEndpoints.cs.

export interface AuditRow {
  id: string
  atUtc: string
  actorName: string
  actorRole: string
  action: string
  entityType: string
  entityId: string
  summary: string
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

  audit: async (params?: { action?: string; entityType?: string; days?: number }): Promise<AuditRow[]> =>
    (await apiClient.get<AuditRow[]>('/system/audit', { params })).data,

  /** silent — без тоста перехватчика: палитра ⌘K сама показывает ошибку поиска. */
  search: async (q: string, opts?: { silent?: boolean }): Promise<SearchHit[]> =>
    (await apiClient.get<SearchHit[]>('/search', { params: { q }, silent: opts?.silent })).data,
}
