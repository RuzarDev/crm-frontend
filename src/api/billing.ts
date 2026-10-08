import apiClient from './client'

// Исходящие документы брокера: счёт на услуги и акт выполненных работ
// (бэк: Features/Billing/BillingEndpoints.cs).

export type BrokerInvoiceKind = 'invoice' | 'act'

/** 0 черновик, 1 выставлен, 2 оплачен, 3 аннулирован. */
export type BrokerInvoiceStatus = 0 | 1 | 2 | 3

export interface BrokerInvoiceLine {
  id: string
  sortOrder: number
  name: string
  unit: string
  quantity: number
  unitPrice: number
  amount: number
}

export interface PaymentCheckFile {
  id: string
  fileName: string
  sizeBytes: number
  createdAtUtc: string
}

export interface BrokerInvoice {
  id: string
  clientId: string
  clientName: string
  caseId: string | null
  caseNumber: string | null
  kind: BrokerInvoiceKind
  status: BrokerInvoiceStatus
  number: string
  year: number
  issuedAtUtc: string | null
  dueDateUtc: string | null
  paidAtUtc: string | null
  vatRate: number
  subtotal: number
  vatAmount: number
  total: number
  note: string
  createdAtUtc: string
  lines: BrokerInvoiceLine[]
  /** Чеки оплаты, загруженные клиентом (бэк: payment-check). */
  paymentChecks: PaymentCheckFile[]
}

export interface BrokerInvoiceUpsert {
  clientId: string
  caseId?: string | null
  kind: BrokerInvoiceKind
  vatRate?: number | null
  dueDateUtc?: string | null
  note?: string | null
  lines: Array<{ name: string; unit?: string | null; quantity: number; unitPrice: number }>
}

export interface OrganizationSettings {
  companyName: string
  shortName: string
  bin: string
  legalAddress: string
  bank: string
  iik: string
  bik: string
  kbe: string
  directorName: string
  directorBasis: string
  accountantName: string
  phone: string
  email: string
  vatPayer: boolean
  vatRate: number
  updatedAtUtc: string | null
}

/** Реквизиты организации для клиента: куда платить (GET /billing/requisites). */
export interface BillingRequisites {
  companyName: string
  shortName: string
  bin: string
  bank: string
  iik: string
  bik: string
  kbe: string
}

export const billingApi = {
  list: async (params?: {
    clientId?: string
    caseId?: string
    kind?: BrokerInvoiceKind
    status?: number
  }, opts?: { silent?: boolean }): Promise<BrokerInvoice[]> =>
    // silent — экран «Счета» клиента сам рисует ошибку с «Повторить», без тоста перехватчика.
    (await apiClient.get<BrokerInvoice[]>('/billing/invoices', opts?.silent ? { params, silent: true } : { params })).data,

  get: async (id: string): Promise<BrokerInvoice> =>
    (await apiClient.get<BrokerInvoice>(`/billing/invoices/${id}`)).data,

  create: async (data: BrokerInvoiceUpsert): Promise<BrokerInvoice> =>
    (await apiClient.post<BrokerInvoice>('/billing/invoices', data)).data,

  update: async (id: string, data: BrokerInvoiceUpsert): Promise<BrokerInvoice> =>
    (await apiClient.put<BrokerInvoice>(`/billing/invoices/${id}`, data)).data,

  issue: async (id: string): Promise<BrokerInvoice> =>
    (await apiClient.post<BrokerInvoice>(`/billing/invoices/${id}/issue`, {})).data,

  // Напоминание об оплате: письмо клиенту + уведомление в CRM + запись в журнал.
  remind: async (id: string): Promise<{ ok: boolean; emailSent: boolean; to: string | null }> =>
    (await apiClient.post<{ ok: boolean; emailSent: boolean; to: string | null }>(`/billing/invoices/${id}/remind`, {})).data,

  markPaid: async (id: string): Promise<BrokerInvoice> =>
    (await apiClient.post<BrokerInvoice>(`/billing/invoices/${id}/mark-paid`, {})).data,

  cancel: async (id: string): Promise<BrokerInvoice> =>
    (await apiClient.post<BrokerInvoice>(`/billing/invoices/${id}/cancel`, {})).data,

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/billing/invoices/${id}`)
  },

  pdf: async (id: string): Promise<Blob> =>
    (await apiClient.get(`/billing/invoices/${id}/pdf`, { responseType: 'blob' })).data,

  requisites: async (opts?: { silent?: boolean }): Promise<BillingRequisites> =>
    (opts?.silent
      ? await apiClient.get<BillingRequisites>('/billing/requisites', { silent: true })
      : await apiClient.get<BillingRequisites>('/billing/requisites')).data,

  // Клиент прикладывает чек об оплате счёта (multipart, поле file); в ответ — счёт с обновлённым paymentChecks.
  uploadPaymentCheck: async (id: string, file: File): Promise<BrokerInvoice> => {
    const form = new FormData()
    form.append('file', file)
    return (await apiClient.post<BrokerInvoice>(
      `/billing/invoices/${id}/payment-check`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )).data
  },

  downloadPaymentCheck: async (id: string, fileId: string): Promise<Blob> =>
    (await apiClient.get(`/billing/invoices/${id}/files/${fileId}/download`, { responseType: 'blob' })).data,

  organization: async (): Promise<OrganizationSettings> =>
    (await apiClient.get<OrganizationSettings>('/settings/organization')).data,

  saveOrganization: async (data: OrganizationSettings): Promise<OrganizationSettings> =>
    (await apiClient.put<OrganizationSettings>('/settings/organization', data)).data,
}
