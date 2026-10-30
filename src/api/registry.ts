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
  /** S-28 (30.10.2026): код статуса заявки Импорта 40 — подпись из i18n, как в списке заявок; у транзита нет. */
  statusCode?: number | null
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
  // silent — экран сам рисует «не удалось загрузить» с «Повторить», без тоста перехватчика.
  list: async (params: RegistryQuery, opts?: { silent?: boolean }): Promise<RegistryListResponse> => {
    const { data } = await apiClient.get<RegistryListResponse>('/requests-registry', { params, ...(opts?.silent ? { silent: true } : {}) })
    return data
  },
}
