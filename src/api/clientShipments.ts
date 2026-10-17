import apiClient from './client'
import type { ReworkBrief } from './import40Rework'

// Лёгкий список поставок клиента (редизайн, волна 2a): всё нужное для списка и «Нужно от вас».
export interface ClientShipment {
  id: string
  number: string
  cargo: string
  post: string
  status: number
  step: number
  isProblem: boolean
  problemClientMessage: string
  returnReason: string
  senderCountryCode: string
  estimatedValue: number | null
  currencyCode: string
  svhInvoiceAmount: number | null
  svhInvoiceNumber: string
  paymentCheckUploaded: boolean
  paymentConfirmed: boolean
  declarationsCount: number
  assignedDeclarantName: string | null
  createdAtUtc: string
  updatedAtUtc: string
  /** Возврат на доработку с пунктами (17.10) — «вернули на доработку» и без комментария. */
  reworkRequested?: boolean
  /** Незакрытые пункты доработки — текст «Нужно от вас» на языке клиента. */
  reworkOpen?: ReworkBrief[]
}

export const clientShipmentsApi = {
  list: async (): Promise<ClientShipment[]> =>
    (await apiClient.get<ClientShipment[]>('/import40/client/shipments')).data,
}
