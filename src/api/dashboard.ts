import apiClient from './client'
import type { DashboardDto } from '@/types/api'

export const dashboardApi = {
  get: () => apiClient.get<DashboardDto>('/dashboard'),
}
