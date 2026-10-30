import apiClient from './client'
import type { ConditionalReleaseBrief } from './conditionalRelease'
import type { ReworkBrief } from './import40Rework'
import type { PreBorderMissingKey } from './preBorder'

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
  /** Незакрытый условный выпуск (самый срочный); null — нет. */
  conditionalRelease?: ConditionalReleaseBrief | null
  createdAtUtc: string
  updatedAtUtc: string
  /** Возврат на доработку с пунктами (17.10) — «вернули на доработку» и без комментария. */
  reworkRequested?: boolean
  /** Незакрытые пункты доработки — текст «Нужно от вас» на языке клиента. */
  reworkOpen?: ReworkBrief[]
  /** Запрос таможни ждёт ответа клиента — с какого момента (самый ранний); null/нет — не ждёт (волна 17.10, задача 5). */
  customsRequestSinceUtc?: string | null
  /** Поставка до границы (очередь 4): чего не хватает до прибытия; пусто — ничего (не начато, заполнено, уже на границе). */
  preBorderMissing?: PreBorderMissingKey[]
  /** КПП отметил «Машина прибыла» — тег «На границе», иначе «Отправлена» (30.10.2026, аудит C-27). */
  borderArrived?: boolean
  /** Счёт AQNIET за услуги выставлен или оплачен; false — «Ждём счёт AQNIET», нет поля (неизвестно) — «Оплата услуг» (C-27). */
  serviceInvoiceIssued?: boolean
}

export const clientShipmentsApi = {
  list: async (): Promise<ClientShipment[]> =>
    (await apiClient.get<ClientShipment[]>('/import40/client/shipments')).data,
}
