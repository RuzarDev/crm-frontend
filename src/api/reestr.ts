import apiClient from './client'
import type {
  ReestrEntry,
  ReestrEntryDto,
  ReestrListRequest,
  ReestrListResponse,
  ReestrUpsertBody,
  ImportResponse,
  BulkDeleteResponse,
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
    }>('/reestr', { params })
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

  uploadFile: async (file: File): Promise<ImportResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient.post<ImportResponse>('/reestr/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },
}
