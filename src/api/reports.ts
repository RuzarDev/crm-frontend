import apiClient from './client'

// Отчёт таможенного представителя (право analytics.read), см. сервер Features/Reports/CustomsRepresentativeReport.cs.
// Code органа = null — «Орган не указан» (в ДТ нет органа подачи и номера). Сводка и итоги — без отменённых заявок.
export interface RepProcedureCount { procedure: string; count: number }
export interface RepCounters {
  declarations: number
  released: number
  paymentsKzt: number
  customsValueKzt: number
  procedures: RepProcedureCount[]
}
export interface RepPost extends RepCounters { code: string | null; name: string }
export interface RepAuthority extends RepCounters { code: string | null; name: string; posts: RepPost[] }
export type RepStatus = 'released' | 'submitted' | 'cancelled'
export interface RepDeclarationRow {
  declarationId: string
  caseId: string
  caseNumber: string
  number: string
  date: string
  /** submission — дата подачи; number — из номера ДТ; caseSubmitted — номера нет, дата перехода заявки в «ДТ подана». */
  dateSource: 'submission' | 'number' | 'caseSubmitted'
  clientId: string
  clientName: string
  clientBin: string | null
  dgdCode: string | null
  dgdName: string
  postCode: string | null
  postName: string
  procedure: string
  status: RepStatus | string
  splitRole: string | null
  paymentsKzt: number
  customsValueKzt: number
}
export interface CustomsRepresentativeReport {
  from: string
  to: string
  organizationName: string
  organizationBin: string
  generatedAtUtc: string
  totals: RepCounters
  authorities: RepAuthority[]
  /** Перечень: все ДТ периода, включая ДТ отменённых заявок (status = cancelled). */
  declarations: RepDeclarationRow[]
  /** ДТ отменённых заявок: в перечне есть, в сводку и итоги не входят. */
  cancelledExcluded: number
}

const base = '/reports/customs-representative'

export const reportsApi = {
  // silent — экран сам рисует «не удалось загрузить» с «Повторить», без тоста перехватчика.
  customsRepresentative: async (from: string, to: string, opts?: { silent?: boolean }): Promise<CustomsRepresentativeReport> =>
    (await apiClient.get<CustomsRepresentativeReport>(base, { params: { from, to }, ...(opts?.silent ? { silent: true } : {}) })).data,
  customsRepresentativeXlsx: async (from: string, to: string): Promise<Blob> =>
    (await apiClient.get<Blob>(`${base}/xlsx`, { params: { from, to }, responseType: 'blob' })).data,
}
