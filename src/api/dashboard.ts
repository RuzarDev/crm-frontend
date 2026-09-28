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
  // Задача 2.4 (3.10/3.11): у руководителя (rop / import40.assign без своего шага) KPI «Ждут
  // меня» показывается как «Без назначения / Проблемные», а не общий счёт активных заявок.
  unassignedCases: number
  isManagerView: boolean
}

// Клиентский дашборд (аудит 5.7) — свои плитки вместо метрик сотрудника.
export interface Import40ClientRecentCase { id: string; number: string; status: number; step: number; isProblem: boolean }
export interface Import40ClientDashboardDto {
  needsAction: number
  inProgress: number
  done: number
  unpaidInvoicesCount: number
  unpaidInvoicesTotal: number
  recentCases: Import40ClientRecentCase[]
}

export const dashboardApi = {
  // транзит (требует reestr.read)
  get: () => apiClient.get<DashboardDto>('/dashboard'),
  // импорт 40 (сотрудники/админ; видимость как у списка заявок)
  import40: () => apiClient.get<Import40DashboardDto>('/dashboard/import40'),
  // импорт 40 — клиент
  client: () => apiClient.get<Import40ClientDashboardDto>('/dashboard/client'),
}
