import apiClient from './client'
import type {
  ReestrEntry,
  ReestrListRequest,
  ReestrListResponse,
  UpsertReestrEntryRequest,
  ImportResponse,
  BulkDeleteResponse,
} from '@/types/api'

interface RawReestrEntry {
  id: string
  createdAtUtc: string
  data?: Record<string, string | null>
  fields?: Record<string, string | null>
}

interface RawReestrListResponse {
  items: RawReestrEntry[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

const mapRawEntry = (entry: RawReestrEntry): ReestrEntry => ({
  id: entry.id,
  createdAtUtc: entry.createdAtUtc,
  fields: entry.data ?? entry.fields ?? {},
})

export const reestrApi = {
  getList: async (params: ReestrListRequest): Promise<ReestrListResponse> => {
    const response = await apiClient.get<RawReestrListResponse>('/reestr', { params })
    return {
      ...response.data,
      items: response.data.items.map(mapRawEntry),
    }
  },

  getById: async (id: string): Promise<ReestrEntry> => {
    const response = await apiClient.get<RawReestrEntry>(`/reestr/${id}`)
    return mapRawEntry(response.data)
  },

  create: async (data: UpsertReestrEntryRequest): Promise<{ id: string }> => {
    const response = await apiClient.post<{ id: string }>('/reestr', data)
    return response.data
  },

  update: async (id: string, data: UpsertReestrEntryRequest): Promise<void> => {
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
