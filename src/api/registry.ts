import apiClient from './client'

export interface RegistryRowDto {
  id: string
  serviceType: 'import40' | 'transit'
  number: string | null
  title: string
  clientName: string
  statusLabel: string
  isProblem: boolean
  createdAtUtc: string
  updatedAtUtc: string
}

export interface RegistryListResponse {
  items: RegistryRowDto[]
  totalCount: number
  page: number
  pageSize: number
}

export interface RegistryQuery {
  type?: string
  status?: string
  clientId?: string
  search?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export const registryApi = {
  list: async (params: RegistryQuery): Promise<RegistryListResponse> => {
    const { data } = await apiClient.get<RegistryListResponse>('/requests-registry', { params })
    return data
  },
}
