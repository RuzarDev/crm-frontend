import apiClient from './client'

// GET analytics — реальная аналитика (только администратор), см. GetAnalytics.cs.
export interface AnalyticsMonth { month: string; cases: number; declarations: number; paymentsKzt: number; transitEntries: number }
export interface AnalyticsStage { key: string; count: number }
export interface AnalyticsClient { clientId: string; clientName: string; cases: number; paymentsKzt: number }
export interface AnalyticsStaff { userId: string; username: string; role: string; activeCases: number; doneCases: number }
export interface AnalyticsActivity { caseId: string; cargo: string; clientName: string; text: string; role: string; atUtc: string }
export interface AnalyticsDto {
  cases30d: number; casesPrev30d: number
  declarations30d: number; declarationsPrev30d: number
  payments30dKzt: number; paymentsPrev30dKzt: number
  avgDaysToDone: number | null
  activeCases: number; problemCases: number
  months: AnalyticsMonth[]
  stages: AnalyticsStage[]
  topClients: AnalyticsClient[]
  staff: AnalyticsStaff[]
  recentActivity: AnalyticsActivity[]
}

export const analyticsApi = {
  get: async (): Promise<AnalyticsDto> => (await apiClient.get<AnalyticsDto>('/analytics')).data,
}
