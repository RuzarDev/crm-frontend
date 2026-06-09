import apiClient from './client'
import type { TnvedNodeDto, TnvedTransitionDto } from '@/types/api'

export const tnvedApi = {
  exportSections: () =>
    apiClient.get<TnvedNodeDto[]>('/tnved/export/sections'),

  exportChildren: (parentId: number) =>
    apiClient.get<TnvedNodeDto[]>('/tnved/export/children', { params: { parentId } }),

  exportSearch: (q: string, limit = 30) =>
    apiClient.get<TnvedNodeDto[]>('/tnved/export/search', { params: { q, limit } }),

  exportBreadcrumb: (code: string) =>
    apiClient.get<TnvedNodeDto[]>(`/tnved/export/breadcrumb/${encodeURIComponent(code)}`),

  getTransition: (code: string) =>
    apiClient.get<TnvedTransitionDto>(`/tnved/transition/${encodeURIComponent(code)}`),
}
