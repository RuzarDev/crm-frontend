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

// Главная сотрудника (GET dashboard/home, пакет G 02.11.2026) — один запрос на все блоки.
/** Строка «Срочно»: срок по Алматы; overdueDays — дней после даты срока (0 — сегодня), past — срок прошёл. */
export interface StaffHomeUrgent {
  kind: 'customsRequest' | 'conditionalRelease' | 'invoice'
  caseId: string | null
  caseNumber: string | null
  invoiceId: string | null
  /** «14/2026» */
  invoiceNumber: string | null
  clientName: string
  amount: number | null
  /** гггг-мм-дд */
  dueDate: string
  /** «18:00», если у срока есть время */
  dueTime: string | null
  overdueDays: number
  past: boolean
}
export interface StaffHomeOwners { declarants: number; kpp: number; clients: number }
/** null — карточка пользователю не положена; stuckMine — «Застряли» только по своим заявкам. */
export interface StaffHomeAttention {
  awaitingMe: number | null
  awaitingClient: number | null
  stuck: number | null
  stuckMine: boolean
  expiringDocs: number | null
}
export type StaffHomeNext = 'customsRequest' | 'customsAnswered' | 'createDt' | 'fill' | 'ready' | 'stage'
export interface StaffHomeTask {
  id: string
  number: string
  clientName: string
  cargo: string
  status: number
  step: number
  isProblem: boolean
  updatedAtUtc: string
  next: StaffHomeNext
  filled: number | null
  total: number | null
  /** fill: незаполненных полей во всех неготовых ДТ, неготовых ДТ и всего ДТ (02.11.2026). Старый сервер — нет. */
  missing?: number | null
  notReady?: number | null
  declarations?: number | null
}
/** Блоки заявок (activeCases, tasks, bySteps) — null у бухгалтера и у тех, кто заявок не видит. */
export interface StaffHomeDto {
  activeCases: number | null
  owners: StaffHomeOwners | null
  urgent: StaffHomeUrgent[]
  urgentTotal: number
  attention: StaffHomeAttention
  tasks: StaffHomeTask[] | null
  tasksTotal: number
  bySteps: Import40StepCount[] | null
}
/** Значок «Главной» в меню: срочное — красным, иначе «Ждут вас» — жёлтым. */
export interface StaffHomeBadgeDto { urgent: number; awaitingMe: number }

export const dashboardApi = {
  // транзит (требует reestr.read)
  get: () => apiClient.get<DashboardDto>('/dashboard'),
  // импорт 40 (сотрудники/админ; видимость как у списка заявок)
  import40: () => apiClient.get<Import40DashboardDto>('/dashboard/import40'),
  // импорт 40 — клиент
  client: () => apiClient.get<Import40ClientDashboardDto>('/dashboard/client'),
  // Главная сотрудника и значок меню (пакет G); silent — ошибки рисует сам экран, опрос значка без тостов.
  home: async (): Promise<StaffHomeDto> => (await apiClient.get<StaffHomeDto>('/dashboard/home', { silent: true })).data,
  homeBadge: async (): Promise<StaffHomeBadgeDto> => (await apiClient.get<StaffHomeBadgeDto>('/dashboard/home/badge', { silent: true })).data,
}
