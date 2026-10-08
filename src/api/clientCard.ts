import apiClient from './client'

// Карточка клиента «360» и реестр документов по всем клиентам
// (бэк: Features/Clients/ClientCardEndpoints.cs).

export interface ClientCardProfile {
  companyName: string
  bin: string
  directorName: string
  directorBasis: string
  legalAddress: string
  bank: string
  iik: string
  bik: string
  kbe: string
  phone: string
  email: string
  contactPersonName: string
  contactPersonPosition: string
  contactPhone: string
  contactEmail: string
  isComplete: boolean
  updatedAtUtc: string | null
}

export interface ClientCardDoc {
  id: string
  kind: 'contract' | 'poa'
  number: string
  year: number
  status: number
  clientSigned: boolean
  clientSignedAtUtc: string | null
  clientSignMethod: string | null
  providerSigned: boolean
  providerSignedAtUtc: string | null
  providerSignMethod: string | null
  isSingleUse: boolean
  validUntilUtc: string | null
  daysLeft: number | null
  expiringSoon: boolean
  consumedByCaseId: string | null
  filesCount: number
  generatedAtUtc: string
}

export interface ClientCardCase {
  id: string
  number: string
  cargo: string
  post: string
  status: number
  isProblem: boolean
  createdAtUtc: string
  updatedAtUtc: string
  svhInvoiceAmount: number | null
  paymentConfirmed: boolean
  declarationsCount: number
}

export interface ClientCardTotals {
  casesTotal: number
  casesActive: number
  casesDone: number
  casesCancelled: number
  declarationsTotal: number
  invoicedTotal: number
  paidTotal: number
}

export interface ClientCard {
  id: string
  username: string
  email: string | null
  phone: string | null
  companyName: string | null
  bin: string | null
  status: string
  emailConfirmed: boolean
  createdAtUtc: string
  inviteExpiresAtUtc: string | null
  profile: ClientCardProfile
  documents: ClientCardDoc[]
  cases: ClientCardCase[]
  totals: ClientCardTotals
}

export interface ClientDocumentRow {
  id: string
  clientId: string
  clientName: string
  clientEmail: string
  kind: 'contract' | 'poa'
  number: string
  year: number
  status: number
  clientSigned: boolean
  providerSigned: boolean
  isSingleUse: boolean
  validUntilUtc: string | null
  daysLeft: number | null
  expiringSoon: boolean
  consumedByCaseId: string | null
  generatedAtUtc: string
}

export const clientCardApi = {
  card: async (clientId: string): Promise<ClientCard> =>
    (await apiClient.get<ClientCard>(`/clients/${encodeURIComponent(clientId)}/card`)).data,

  // opts.silent — реестр «Документы клиентов» (редизайн) сам показывает ошибку на месте, без тоста перехватчика.
  documents: async (
    params?: {
      kind?: 'contract' | 'poa'
      status?: number
      expiring?: boolean
    },
    opts?: { silent?: boolean },
  ): Promise<ClientDocumentRow[]> =>
    (await apiClient.get<ClientDocumentRow[]>('/clients/documents', opts?.silent ? { params, silent: true } : { params })).data,
}
