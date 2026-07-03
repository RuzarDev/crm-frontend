import apiClient from './client'

export interface KedenDeclarationListItemDto {
  id: string
  kedenId: string
  declarationType: string
  registrationNumber: string | null
  shortName: string | null
  statusCode: string | null
  statusName: string | null
  statusDateTimeUtc: string | null
  registeredDateTimeUtc: string | null
  declarantName: string | null
  customsPost: string | null
}

export interface KedenDeclarationListResponse {
  items: KedenDeclarationListItemDto[]
  total: number
}

export interface KedenDeclarationDetailDto {
  id: string
  kedenId: string
  declarationType: string
  registrationNumber: string | null
  shortName: string | null
  referenceCode: string | null
  statusCode: string | null
  statusName: string | null
  statusDateTimeUtc: string | null
  registeredDateTimeUtc: string | null
  declarantXin: string | null
  declarantName: string | null
  customsPost: string | null
  raw: unknown
  syncedAtUtc: string
}

export const KEDEN_DECLARATION_TYPES = [
  { key: 'PI', label: 'Предварительное информирование' },
  { key: 'DT', label: 'Декларация на товары' },
  { key: 'TD', label: 'Транзитная декларация' },
  { key: 'PTDEG', label: 'Пассажирская декларация (экспресс-грузы)' },
  { key: 'DTEG', label: 'Декларация на товары (экспресс-грузы)' },
] as const

export const kedenApi = {
  list: async (params?: { type?: string; status?: string }): Promise<KedenDeclarationListResponse> => {
    const response = await apiClient.get<KedenDeclarationListResponse>('/keden-declarations', { params })
    return response.data
  },

  get: async (id: string): Promise<KedenDeclarationDetailDto> => {
    const response = await apiClient.get<KedenDeclarationDetailDto>(
      `/keden-declarations/${encodeURIComponent(id)}`,
    )
    return response.data
  },
}
