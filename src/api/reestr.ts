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
  ReestrBrokerDocumentType,
  ReestrClientOption,
  ReestrStatusHistoryDto,
} from '@/types/api'
import { reestrDtoToEntry } from '@/utils/reestrDtoMap'

const brokerDocumentTypeFromApi = (
  value: string | number | null | undefined,
): ReestrBrokerDocumentType | null => {
  if (value == null) {
    return null
  }
  if (typeof value === 'number') {
    return value as ReestrBrokerDocumentType
  }
  const map: Record<string, ReestrBrokerDocumentType> = {
    customsDeclaration: 0,
    conformityCertificates: 1,
    permitsAndLicenses: 2,
    other: 3,
  }
  return map[value] ?? null
}

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

  exportFile: async (params: Omit<ReestrListRequest, 'page' | 'pageSize'>): Promise<Blob> => {
    const response = await apiClient.get('/reestr/export', {
      params: {
        ...(params.search ? { search: params.search } : {}),
        ...(params.status != null ? { status: params.status } : {}),
        ...(params.clientId ? { clientId: params.clientId } : {}),
        ...(params.documentDateFrom ? { documentDateFrom: params.documentDateFrom } : {}),
        ...(params.documentDateTo ? { documentDateTo: params.documentDateTo } : {}),
        ...(params.sortBy ? { sortBy: params.sortBy } : {}),
        sortDescending: params.sortDescending ?? true,
      },
      responseType: 'blob',
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
    const response = await apiClient.get<
      (Omit<ReestrDocumentDto, 'brokerDocumentType'> & {
        brokerDocumentType?: string | number | null
      })[]
    >(`/reestr/${reestrId}/documents`)
    return response.data.map((doc) => ({
      ...doc,
      brokerDocumentType: brokerDocumentTypeFromApi(doc.brokerDocumentType),
    }))
  },

  uploadDocument: async (
    reestrId: string,
    section: ReestrDocumentSection,
    file: File,
    brokerDocumentType?: ReestrBrokerDocumentType,
  ): Promise<ReestrDocumentDto> => {
    const formData = new FormData()
    formData.append('file', file)
    if (section === 'client') {
      const response = await apiClient.post<ReestrDocumentDto>(
        `/reestr/${reestrId}/documents/client`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        },
      )
      return response.data
    }
    const response = await apiClient.post<ReestrDocumentDto>(
      `/reestr/${reestrId}/documents/broker`,
      formData,
      {
        params: { documentType: brokerDocumentType },
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    )
    const doc = response.data as Omit<ReestrDocumentDto, 'brokerDocumentType'> & {
      brokerDocumentType?: string | number | null
    }
    return {
      ...doc,
      brokerDocumentType: brokerDocumentTypeFromApi(doc.brokerDocumentType),
    }
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

  listClientsForCreate: async (): Promise<ReestrClientOption[]> => {
    const response = await apiClient.get<ReestrClientOption[]>('/reestr/clients')
    return response.data
  },

  listFilterClients: async (): Promise<ReestrClientOption[]> => {
    const response = await apiClient.get<ReestrClientOption[]>('/reestr/clients')
    return response.data
  },

  listPortfolioClients: async (): Promise<ReestrClientOption[]> => {
    const response = await apiClient.get<ReestrClientOption[]>('/reestr/clients')
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

  listComments: async (reestrId: string): Promise<import('@/types/api').ReestrCommentDto[]> => {
    const response = await apiClient.get<import('@/types/api').ReestrCommentDto[]>(
      `/reestr/${reestrId}/comments`,
    )
    return response.data
  },

  addComment: async (reestrId: string, text: string): Promise<import('@/types/api').ReestrCommentDto> => {
    const response = await apiClient.post<import('@/types/api').ReestrCommentDto>(
      `/reestr/${reestrId}/comments`,
      { text },
    )
    return response.data
  },

  deleteComment: async (reestrId: string, commentId: string): Promise<void> => {
    await apiClient.delete(`/reestr/${reestrId}/comments/${commentId}`)
  },
}
