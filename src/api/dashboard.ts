import apiClient from './client'
import type { DashboardDto } from '@/types/api'

// Сводка Импорта 40 (GET dashboard/import40) — по заявкам, видимым пользователю.
export interface Import40StepCount { step: number; count: number }
export interface Import40TopClient { clientId: string; clientName: string; count: number }
export interface Import40DashboardDto {
  totalCases: number
  casesThisMonth: number
  activeCases: number
  doneCases: number
  problemCases: number
  awaitingMe: number
  bySteps: Import40StepCount[]
  totalDeclarations: number
  declarationsWithNumber: number
  paymentsTotalKzt: number
  avgDaysToDone: number | null
  topClients: Import40TopClient[]
}

export const dashboardApi = {
  // транзит (требует reestr.read)
  get: () => apiClient.get<DashboardDto>('/dashboard'),
  // импорт 40 (любой авторизованный; видимость как у списка заявок)
  import40: () => apiClient.get<Import40DashboardDto>('/dashboard/import40'),
}
