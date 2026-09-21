import apiClient from './client'

// Волна 2 ролей: сотрудники с ролями, панель руководителя, финансы.
export interface StaffMember { id: string; username: string; displayName: string | null; roles: string[] }
export interface ManageCase {
  id: string; clientName: string; cargo: string; post: string; status: number; isProblem: boolean; problemNote: string
  assignedKppId: string | null; assignedDeclarantId: string | null; createdAtUtc: string; updatedAtUtc: string
  daysInWork: number; daysSinceUpdate: number; declarationsCount: number
}
export interface ManageOverview { cases: ManageCase[]; staff: StaffMember[]; unassigned: number; problems: number; stale: number }

export interface FinanceFile { id: string; section: 'svh-invoice' | 'payment-check'; fileName: string; createdAtUtc: string }
export interface FinanceRow {
  caseId: string; clientName: string; cargo: string; status: number; isProblem: boolean
  svhInvoiceNote: string; svhInvoiceAmount: number | null; invoicedAtUtc: string | null
  paymentConfirmed: boolean; paidAtUtc: string | null; hasPaymentCheck: boolean
  customsPaymentsKzt: number; declarationsCount: number; createdAtUtc: string; updatedAtUtc: string
  files: FinanceFile[]
}
export interface FinanceOverview {
  rows: FinanceRow[]; invoicedCount: number; awaitingPaymentCount: number; paidCount: number
  svhInvoicedTotal: number; svhPaidTotal: number; customsPaymentsTotal: number
}

export const manageApi = {
  staff: async (): Promise<StaffMember[]> => (await apiClient.get<StaffMember[]>('/import40/staff')).data,
  overview: async (): Promise<ManageOverview> => (await apiClient.get<ManageOverview>('/import40/manage')).data,
}
export const financeApi = {
  overview: async (from?: string, to?: string): Promise<FinanceOverview> =>
    (await apiClient.get<FinanceOverview>('/finance/overview', { params: { from, to } })).data,
}
