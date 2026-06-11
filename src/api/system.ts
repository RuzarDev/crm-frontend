import apiClient from './client'
import type { EndpointRow, PermissionMatrixResponse } from '@/types/api'

export const systemApi = {
  getEndpoints: () =>
    apiClient.get<EndpointRow[]>('/system/endpoints'),

  getPermissionMatrix: () =>
    apiClient.get<PermissionMatrixResponse>('/system/permissions'),
}
