import apiClient from './client'
import type {
  ReestrEntry,
  ReestrEntryDto,
  ReestrEntryStatus,
  ReestrListRequest,
  ReestrListResponse,
  ReestrUpsertBody,
  ImportResponse,
  BulkDeleteResponse,
  ReestrDocumentDto,
  ReestrDocumentSection,
  ReestrStatusHistoryDto,
} from '@/types/api'
import { reestrDtoToEntry } from '@/utils/reestrDtoMap'

export const reestrApi = {
  getList: async (params: ReestrListRequest): Promise<ReestrListResponse> => {
    const response = await apiClient.get<{
      items: ReestrEntryDto[]
      totalCount: number
      page: number
      pageSize: number
      totalPages: number
    }>('/reestr', {
      params: {
        page: params.page,
        pageSize: params.pageSize,
        ...(params.search ? { search: params.search } : {}),
        ...(params.status != null ? { status: params.status } : {}),
        ...(params.clientId ? { clientId: params.clientId } : {}),
        ...(params.documentDateFrom ? { documentDateFrom: params.documentDateFrom } : {}),
        ...(params.documentDateTo ? { documentDateTo: params.documentDateTo } : {}),
        ...(params.sortBy ? { sortBy: params.sortBy } : {}),
        sortDescending: params.sortDescending ?? true,
      },
    })
    return {
      ...response.data,
      items: response.data.items.map(reestrDtoToEntry),
    }
  },

  getById: async (id: string): Promise<ReestrEntry> => {
    const response = await apiClient.get<ReestrEntryDto>(`/reestr/${id}`)
    return reestrDtoToEntry(response.data)
  },

  create: async (data: ReestrUpsertBody): Promise<{ id: string }> => {
    const response = await apiClient.post<{ id: string }>('/reestr', data)
    return response.data
  },

  update: async (id: string, data: ReestrUpsertBody): Promise<void> => {
    await apiClient.put(`/reestr/${id}`, data)
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/reestr/${id}`)
  },

  bulkDelete: async (ids: string[]): Promise<BulkDeleteResponse> => {
    const response = await apiClient.delete<BulkDeleteResponse>('/reestr/bulk', {
      data: { ids },
    })
    return response.data
  },

  uploadFile: async (file: File, clientId?: string): Promise<ImportResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    if (clientId) {
      formData.append('clientId', clientId)
    }
    const response = await apiClient.post<ImportResponse>('/reestr/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  listDocuments: async (reestrId: string): Promise<ReestrDocumentDto[]> => {
    const response = await apiClient.get<ReestrDocumentDto[]>(`/reestr/${reestrId}/documents`)
    return response.data
  },

  uploadDocument: async (
    reestrId: string,
    section: ReestrDocumentSection,
    file: File,
  ): Promise<ReestrDocumentDto> => {
    const formData = new FormData()
    formData.append('file', file)
    const path =
      section === 'client'
        ? `/reestr/${reestrId}/documents/client`
        : `/reestr/${reestrId}/documents/broker`
    const response = await apiClient.post<ReestrDocumentDto>(path, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  downloadDocument: async (reestrId: string, documentId: string): Promise<Blob> => {
    const response = await apiClient.get(`/reestr/${reestrId}/documents/${documentId}/download`, {
      responseType: 'blob',
    })
    return response.data
  },

  deleteDocument: async (reestrId: string, documentId: string): Promise<void> => {
    await apiClient.delete(`/reestr/${reestrId}/documents/${documentId}`)
  },

  getStatusHistory: async (reestrId: string): Promise<ReestrStatusHistoryDto[]> => {
    const response = await apiClient.get<ReestrStatusHistoryDto[]>(
      `/reestr/${reestrId}/status-history`,
    )
    return response.data
  },

  changeStatus: async (id: string, status: ReestrEntryStatus): Promise<void> => {
    await apiClient.patch(`/reestr/${encodeURIComponent(id)}/status`, { status })
  },

  listClientsForCreate: async (): Promise<{ id: string; username: string }[]> => {
    const response = await apiClient.get<{ id: string; username: string }[]>('/reestr/clients')
    return response.data
  },

  listFilterClients: async (): Promise<{ id: string; username: string }[]> => {
    const response = await apiClient.get<{ id: string; username: string }[]>('/reestr/clients')
    return response.data
  },

  listMyDocuments: async (params: import('@/types/api').MyReestrDocumentsListRequest) => {
    const response = await apiClient.get<import('@/types/api').MyReestrDocumentsListResponse>(
      '/reestr/my-documents',
      {
        params: {
          page: params.page ?? 1,
          pageSize: params.pageSize ?? 20,
          ...(params.section != null ? { section: params.section } : {}),
          ...(params.search ? { search: params.search } : {}),
        },
      },
    )
    return response.data
  },
}
