import apiClient from './client'
import type { RegistryStatus } from './clientRegistry'

// Перевозчики клиента, счета перевозчика (фрахт) и страховка груза (очередь 4, задача 2; бэк: /client-carriers/*,
// /import40/{case}/carriers, /import40/{case}/freight, /import40/{case}/insurance).
// Договор перевозки — документ реестра клиента категории carriageContract (файл, срок, напоминания — там).

export interface CarrierContractRef {
  id: string
  number: string
  title: string | null
  issuedOn: string | null
  /** 'YYYY-MM-DD'; null — бессрочный. */
  validUntil: string | null
  status: RegistryStatus
  daysLeft: number | null
  isArchived: boolean
  fileCount: number
}

export interface Carrier {
  id: string
  clientId: string
  name: string
  /** Код страны ОКСМ (цифровой), «398» — Казахстан. */
  countryCode: string
  /** БИН/ИИН (Казахстан) или иностранный рег. номер. */
  regNumber: string | null
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  contractDocument: CarrierContractRef | null
  note: string | null
  isArchived: boolean
  createdAtUtc: string
  updatedAtUtc: string
  addedByClient: boolean
  invoiceCount: number
  unpaidCount: number
}

export interface CarrierFile {
  fileName: string
  contentType: string
  sizeBytes: number
}

export interface CarrierInvoice {
  id: string
  carrierId: string
  carrierName: string
  /** Поставка; null — счёт без поставки (в себестоимость не идёт). */
  caseId: string | null
  caseNumber: string | null
  number: string
  invoiceDate: string
  amount: number
  currency: string
  isPaid: boolean
  paidOn: string | null
  note: string | null
  file: CarrierFile | null
  rate: number | null
  /** По курсу НБ РК на дату счёта; null — курса нет. */
  amountKzt: number | null
  rateOfficial: boolean
  createdAtUtc: string
  addedByClient: boolean
}

export interface CarrierCard {
  carrier: Carrier
  invoices: CarrierInvoice[]
}

export interface CarrierFields {
  name: string
  countryCode: string | null
  regNumber: string
  contactName: string
  phone: string
  email: string
  address: string
  contractDocumentId: string | null
  note: string
}

export interface CarrierInvoiceFields {
  number: string
  invoiceDate: string | null
  amount: number | null
  currency: string | null
  isPaid: boolean
  paidOn: string | null
  caseId: string | null
  note: string
}

export interface CarrierCaseOption {
  id: string
  number: string
  cargo: string
  status: number
  createdAtUtc: string
}

export interface CargoInsurance {
  caseId: string
  insurer: string | null
  policyNumber: string | null
  insuredAmount: number | null
  insuredCurrency: string | null
  /** Стоимость страховки (премия). */
  premiumAmount: number | null
  premiumCurrency: string | null
  file: CarrierFile | null
  updatedAtUtc: string | null
  canEdit: boolean
}

export interface CargoInsuranceFields {
  insurer: string
  policyNumber: string
  insuredAmount: number | null
  insuredCurrency: string | null
  premiumAmount: number | null
  premiumCurrency: string | null
}

const base = (clientId: string) => `/client-carriers/${encodeURIComponent(clientId)}`
const one = (clientId: string, id: string) => `${base(clientId)}/${encodeURIComponent(id)}`
const inv = (clientId: string, id: string, invoiceId: string) => `${one(clientId, id)}/invoices/${encodeURIComponent(invoiceId)}`
const caseUrl = (caseId: string) => `/import40/${encodeURIComponent(caseId)}`
// 400 с ошибками полей показывает форма — без общего тоста.
const formOpt = { silentStatuses: [400] }
const multipart = { headers: { 'Content-Type': 'multipart/form-data' }, silentStatuses: [400] }

/** Форма нового счёта (multipart): те же поля, что у PUT, и необязательный файл. */
export const invoiceForm = (fields: CarrierInvoiceFields, file: File | null): FormData => {
  const form = new FormData()
  form.append('number', fields.number.trim())
  if (fields.invoiceDate) form.append('invoiceDate', fields.invoiceDate)
  if (fields.amount != null) form.append('amount', String(fields.amount))
  if (fields.currency) form.append('currency', fields.currency)
  form.append('isPaid', fields.isPaid ? 'true' : 'false')
  if (fields.isPaid && fields.paidOn) form.append('paidOn', fields.paidOn)
  if (fields.caseId) form.append('caseId', fields.caseId)
  form.append('note', fields.note.trim())
  if (file) form.append('file', file)
  return form
}

const fileForm = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return form
}

export const carriersApi = {
  list: async (clientId: string, opts?: { includeArchived?: boolean; silent?: boolean }): Promise<Carrier[]> =>
    (await apiClient.get<Carrier[]>(base(clientId), {
      params: opts?.includeArchived ? { includeArchived: true } : undefined,
      ...(opts?.silent ? { silent: true } : {}),
    })).data,
  card: async (clientId: string, id: string): Promise<CarrierCard> =>
    (await apiClient.get<CarrierCard>(one(clientId, id), { silent: true })).data,
  create: async (clientId: string, fields: CarrierFields): Promise<CarrierCard> =>
    (await apiClient.post<CarrierCard>(base(clientId), fields, formOpt)).data,
  update: async (clientId: string, id: string, fields: CarrierFields): Promise<CarrierCard> =>
    (await apiClient.put<CarrierCard>(one(clientId, id), fields, formOpt)).data,
  archive: async (clientId: string, id: string): Promise<CarrierCard> =>
    (await apiClient.post<CarrierCard>(`${one(clientId, id)}/archive`)).data,
  restore: async (clientId: string, id: string): Promise<CarrierCard> =>
    (await apiClient.post<CarrierCard>(`${one(clientId, id)}/restore`)).data,
  /** Поставки клиента для выбора в счёте (кроме отменённых). */
  cases: async (clientId: string): Promise<CarrierCaseOption[]> =>
    (await apiClient.get<CarrierCaseOption[]>(`${base(clientId)}/cases`, { silent: true })).data,

  addInvoice: async (clientId: string, id: string, fields: CarrierInvoiceFields, file: File | null): Promise<CarrierCard> =>
    (await apiClient.post<CarrierCard>(`${one(clientId, id)}/invoices`, invoiceForm(fields, file), multipart)).data,
  updateInvoice: async (clientId: string, id: string, invoiceId: string, fields: CarrierInvoiceFields): Promise<CarrierCard> =>
    (await apiClient.put<CarrierCard>(inv(clientId, id, invoiceId), {
      ...fields, number: fields.number.trim(), note: fields.note.trim(), paidOn: fields.isPaid ? fields.paidOn : null,
    }, formOpt)).data,
  deleteInvoice: async (clientId: string, id: string, invoiceId: string): Promise<CarrierCard> =>
    (await apiClient.delete<CarrierCard>(inv(clientId, id, invoiceId))).data,
  replaceInvoiceFile: async (clientId: string, id: string, invoiceId: string, file: File): Promise<CarrierCard> =>
    (await apiClient.post<CarrierCard>(`${inv(clientId, id, invoiceId)}/file`, fileForm(file), multipart)).data,
  invoiceFile: async (clientId: string, id: string, invoiceId: string): Promise<Blob> =>
    (await apiClient.get(`${inv(clientId, id, invoiceId)}/file`, { responseType: 'blob' })).data,

  /** Действующие перевозчики клиента заявки — для выбора перевозчика поставки. */
  caseCarriers: async (caseId: string): Promise<Carrier[]> =>
    (await apiClient.get<Carrier[]>(`${caseUrl(caseId)}/carriers`, { silent: true })).data,
  /** Счета перевозчиков по поставке. */
  caseFreight: async (caseId: string): Promise<CarrierInvoice[]> =>
    (await apiClient.get<CarrierInvoice[]>(`${caseUrl(caseId)}/freight`, { silent: true })).data,

  insurance: async (caseId: string): Promise<CargoInsurance> =>
    (await apiClient.get<CargoInsurance>(`${caseUrl(caseId)}/insurance`, { silent: true })).data,
  saveInsurance: async (caseId: string, fields: CargoInsuranceFields): Promise<CargoInsurance> =>
    (await apiClient.put<CargoInsurance>(`${caseUrl(caseId)}/insurance`, {
      ...fields, insurer: fields.insurer.trim(), policyNumber: fields.policyNumber.trim(),
    }, formOpt)).data,
  uploadInsuranceFile: async (caseId: string, file: File): Promise<CargoInsurance> =>
    (await apiClient.post<CargoInsurance>(`${caseUrl(caseId)}/insurance/file`, fileForm(file), multipart)).data,
  deleteInsuranceFile: async (caseId: string): Promise<CargoInsurance> =>
    (await apiClient.delete<CargoInsurance>(`${caseUrl(caseId)}/insurance/file`)).data,
  insuranceFile: async (caseId: string): Promise<Blob> =>
    (await apiClient.get(`${caseUrl(caseId)}/insurance/file`, { responseType: 'blob' })).data,
}
