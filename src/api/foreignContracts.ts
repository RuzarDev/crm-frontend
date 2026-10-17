import apiClient from './client'

// Внешнеторговые контракты клиента и валютный контроль (17.10, задача 3; бэк: /client-contracts/*, /import40/{case}/foreign-contract).
// Все суммы баланса — в валюте контракта; пересчёт ДТ и оплат — по курсу НБ РК на дату ДТ (гр. А) / дату оплаты.

export type ContractDeadlineKind = 'repatriation' | 'end' | 'unkRemoval'
/** ok — больше 30 дней; soon — 30 дней и меньше; today; overdue — прошёл; done — исполнен (репатриация, УНК снят, контракт в архиве). */
export type ContractDeadlineState = 'ok' | 'soon' | 'today' | 'overdue' | 'done'
export type ContractCheckCode = 'currencyDiffers' | 'exceedsRemaining' | 'afterContractEnd' | 'noRate'

export interface ContractDocumentRef {
  id: string
  number: string
  issuedOn: string | null
  isArchived: boolean
  fileCount: number
}

export interface ContractBalance {
  amount: number
  /** Выпущенные ДТ. */
  delivered: number
  /** ДТ в оформлении (не выпущены). */
  inProgress: number
  /** Сумма контракта минус поставлено. */
  remaining: number
  paid: number
  /** Оплачено, но не поставлено — под срок репатриации. */
  paidNotDelivered: number
  /** Часть курсов — не НБ РК на дату (своя история / текущий). */
  ratesApproximate: boolean
  /** Есть ДТ или оплата без курса — сумма не учтена. */
  ratesMissing: boolean
}

export interface ContractDeadline {
  kind: ContractDeadlineKind
  /** 'YYYY-MM-DD' */
  date: string
  daysLeft: number
  state: ContractDeadlineState
}

export interface ForeignContract {
  id: string
  clientId: string
  number: string
  contractDate: string
  supplierName: string
  /** Код страны ОКСМ (цифровой). */
  supplierCountryCode: string
  currency: string
  amount: number
  validUntil: string | null
  incoterms: string | null
  incotermsPlace: string | null
  paymentTerms: string | null
  unkNumber: string | null
  unkDate: string | null
  unkBank: string | null
  unkRemovalDeadline: string | null
  unkRemovedOn: string | null
  repatriationDeadline: string | null
  contractDocument: ContractDocumentRef | null
  unkDocument: ContractDocumentRef | null
  note: string | null
  isArchived: boolean
  createdAtUtc: string
  updatedAtUtc: string
  addedByClient: boolean
  balance: ContractBalance
  deadlines: ContractDeadline[]
}

export interface ContractShipment {
  caseId: string
  caseNumber: string
  declarationId: string
  declarationNumber: string
  /** Дата ДТ для курса (гр. А, иначе сегодня). */
  dtDate: string
  released: boolean
  releasedAtUtc: string | null
  currency: string | null
  invoiceValue: number | null
  rate: number | null
  amountInContractCurrency: number | null
  rateOfficial: boolean
}

export interface ContractPayment {
  id: string
  paidOn: string
  amount: number
  currency: string
  rate: number | null
  amountInContractCurrency: number | null
  note: string | null
  createdAtUtc: string
  addedByClient: boolean
  /** Курс НБ РК на дату оплаты (false — своя история / текущий). */
  rateOfficial?: boolean
}

export interface ContractReminder {
  rule: string
  deadline: string
  threshold: number
  sentAtUtc: string
}

export interface ForeignContractCard {
  contract: ForeignContract
  shipments: ContractShipment[]
  payments: ContractPayment[]
  reminders: ContractReminder[]
}

export interface ForeignContractFields {
  number: string
  contractDate: string | null
  supplierName: string
  supplierCountryCode: string | null
  currency: string | null
  amount: number | null
  validUntil: string | null
  incoterms: string | null
  incotermsPlace: string
  paymentTerms: string
  unkNumber: string
  unkDate: string | null
  unkBank: string
  unkRemovalDeadline: string | null
  unkRemovedOn: string | null
  repatriationDeadline: string | null
  contractDocumentId: string | null
  unkDocumentId: string | null
  note: string
}

export interface ContractPaymentFields {
  paidOn: string | null
  amount: number | null
  currency: string | null
  note: string
}

export interface ContractCheck {
  code: ContractCheckCode
  declarationId: string | null
  declarationNumber: string | null
  /** Текст сервера (рус.) — запасной; интерфейс собирает свой по code и числам. */
  text: string
  value: number | null
  currency: string | null
  valueInContractCurrency: number | null
  remaining: number
}

export interface CaseContractCheck {
  contract: ForeignContract | null
  checks: ContractCheck[]
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const base = (clientId: string) => `/client-contracts/${encodeURIComponent(clientId)}`
const one = (clientId: string, id: string) => `${base(clientId)}/${encodeURIComponent(id)}`
// 400 с ошибками полей показывает форма — без общего тоста.
const formOpt = { silentStatuses: [400] }

export const foreignContractsApi = {
  list: async (clientId: string, opts?: { includeArchived?: boolean; silent?: boolean }): Promise<ForeignContract[]> =>
    (await apiClient.get<ForeignContract[]>(base(clientId), {
      params: opts?.includeArchived ? { includeArchived: true } : undefined,
      ...(opts?.silent ? { silent: true } : {}),
    })).data,
  card: async (clientId: string, id: string): Promise<ForeignContractCard> =>
    (await apiClient.get<ForeignContractCard>(one(clientId, id), { silent: true })).data,
  create: async (clientId: string, fields: ForeignContractFields): Promise<ForeignContractCard> =>
    (await apiClient.post<ForeignContractCard>(base(clientId), fields, formOpt)).data,
  update: async (clientId: string, id: string, fields: ForeignContractFields): Promise<ForeignContractCard> =>
    (await apiClient.put<ForeignContractCard>(one(clientId, id), fields, formOpt)).data,
  archive: async (clientId: string, id: string): Promise<ForeignContractCard> =>
    (await apiClient.post<ForeignContractCard>(`${one(clientId, id)}/archive`)).data,
  restore: async (clientId: string, id: string): Promise<ForeignContractCard> =>
    (await apiClient.post<ForeignContractCard>(`${one(clientId, id)}/restore`)).data,
  addPayment: async (clientId: string, id: string, fields: ContractPaymentFields): Promise<ForeignContractCard> =>
    (await apiClient.post<ForeignContractCard>(`${one(clientId, id)}/payments`, fields, formOpt)).data,
  deletePayment: async (clientId: string, id: string, paymentId: string): Promise<ForeignContractCard> =>
    (await apiClient.delete<ForeignContractCard>(`${one(clientId, id)}/payments/${encodeURIComponent(paymentId)}`)).data,
  /** Excel по контракту: листы «Контракт», «Поставки», «Оплаты» на языке интерфейса. */
  xlsx: async (clientId: string, id: string, lang: string): Promise<{ blob: Blob; fileName: string }> => {
    const res = await apiClient.get(`${one(clientId, id)}/xlsx`, { params: { lang }, responseType: 'blob' })
    const cd = String(res.headers['content-disposition'] ?? '')
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(cd)
    return { blob: new Blob([res.data as BlobPart], { type: XLSX_TYPE }), fileName: m ? decodeURIComponent(m[1]) : 'contract.xlsx' }
  },

  /** Контракт заявки и сверка её ДТ (валюта, остаток, срок). */
  caseCheck: async (caseId: string): Promise<CaseContractCheck> =>
    (await apiClient.get<CaseContractCheck>(`/import40/${encodeURIComponent(caseId)}/foreign-contract`, { silent: true })).data,
  linkCase: async (caseId: string, contractId: string | null): Promise<CaseContractCheck> =>
    (await apiClient.put<CaseContractCheck>(`/import40/${encodeURIComponent(caseId)}/foreign-contract`, { contractId })).data,
  /** Контракт ДТ: null или контракт заявки — «как у заявки». */
  linkDeclaration: async (caseId: string, declarationId: string, contractId: string | null):
    Promise<{ foreignContractId: string | null; effectiveContractId: string | null }> =>
    (await apiClient.put(`/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declarationId)}/foreign-contract`,
      { contractId })).data,
}
