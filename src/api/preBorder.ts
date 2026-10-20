import apiClient from './client'

// Поставка до границы (очередь 4, задача 1; бэк: /import40/{case}/pre-border*): оплата поставщику → погрузка → в пути →
// прибытие (шаг «Граница»). Ведёт клиент или сотрудник за него; необязательно — у старых заявок записи нет.
// И «Перевести (ИИ)» у файла заявки (/import40/{case}/files/{file}/translate).

export type PreBorderMissingKey = 'payment' | 'loading' | 'transport' | 'eta'

export interface PreBorderPayment {
  id: string
  contractId: string
  contractNumber: string
  supplierName: string
  paidOn: string
  amount: number
  currency: string
  note: string | null
  contractArchived: boolean
}

export interface PreBorderPhoto {
  id: string
  fileName: string
  contentType: string
  sizeBytes: number
  createdAtUtc: string
  canDelete: boolean
}

export interface TransitMark {
  id: string
  atUtc: string
  place: string
  comment: string | null
  byClient: boolean
  canDelete: boolean
}

export interface PreBorder {
  caseId: string
  /** Клиент или сотрудник за него начал заполнять — без этого «Нужно от вас» не спрашивает. */
  started: boolean
  canEdit: boolean
  status: number
  transportMode: number
  supplierPaymentDeferred: boolean
  payments: PreBorderPayment[]
  availablePayments: PreBorderPayment[]
  loadingDate: string | null
  loadingCity: string | null
  loadingWarehouse: string | null
  sealNumbers: string | null
  photos: PreBorderPhoto[]
  serialCount: number
  imeiCount: number
  carrierId: string | null
  carrierName: string | null
  carrierArchived: boolean
  vehicleNumber: string
  trailerNumber: string
  containerNumber: string | null
  wagonNumber: string
  expectedBorderDate: string | null
  marks: TransitMark[]
  borderArrivedAtUtc: string | null
  borderArrivalPost: string | null
  missing: PreBorderMissingKey[]
  updatedAtUtc: string | null
}

export interface PreBorderFields {
  supplierPaymentDeferred: boolean
  paymentIds: string[]
  loadingDate: string | null
  loadingCity: string
  loadingWarehouse: string
  sealNumbers: string
  carrierId: string | null
  vehicleNumber: string
  trailerNumber: string
  containerNumber: string
  wagonNumber: string
  expectedBorderDate: string | null
}

export type SerialKindMode = 'auto' | 'imei' | 'serial'
export type SerialReason = 'imeiLength' | 'imeiChecksum' | 'format'

export interface SerialIssue {
  /** Номер в присланном списке, с 1. */
  row: number
  value: string
  /** Причина (SerialReason), «row:N» — повтор строки N, «existing» — уже есть в поставке. */
  reason: string
}

export interface SerialNumbersResult {
  added: number
  total: number
  imeiCount: number
  invalid: SerialIssue[]
  duplicatesInList: SerialIssue[]
  duplicatesExisting: SerialIssue[]
}

export interface SerialNumber { value: string; kind: 'imei' | 'serial' }

export interface FileTranslationBrief { fileId: string; sourceLanguage: string; truncated: boolean; createdAtUtc: string }
export interface FileTranslation { fileId: string; fileName: string; sourceLanguage: string; text: string; truncated: boolean; createdAtUtc: string }

const url = (caseId: string) => `/import40/${encodeURIComponent(caseId)}/pre-border`
const formOpt = { silentStatuses: [400] }

export const preBorderApi = {
  get: async (caseId: string): Promise<PreBorder> =>
    (await apiClient.get<PreBorder>(url(caseId), { silent: true })).data,
  save: async (caseId: string, f: PreBorderFields): Promise<PreBorder> =>
    (await apiClient.put<PreBorder>(url(caseId), {
      supplierPaymentDeferred: f.supplierPaymentDeferred,
      paymentIds: f.paymentIds,
      loadingDate: f.loadingDate || null,
      loadingCity: f.loadingCity.trim() || null,
      loadingWarehouse: f.loadingWarehouse.trim() || null,
      sealNumbers: f.sealNumbers.trim() || null,
      carrierId: f.carrierId || null,
      vehicleNumber: f.vehicleNumber.trim(),
      trailerNumber: f.trailerNumber.trim(),
      containerNumber: f.containerNumber.trim() || null,
      wagonNumber: f.wagonNumber.trim(),
      expectedBorderDate: f.expectedBorderDate || null,
    }, formOpt)).data,
  uploadPhotos: async (caseId: string, files: File[]): Promise<PreBorder> => {
    const form = new FormData()
    for (const f of files) form.append('files', f)
    return (await apiClient.post<PreBorder>(`${url(caseId)}/photos`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }, silentStatuses: [400], timeout: 120000,
    })).data
  },
  deletePhoto: async (caseId: string, fileId: string): Promise<PreBorder> =>
    (await apiClient.delete<PreBorder>(`${url(caseId)}/photos/${encodeURIComponent(fileId)}`)).data,
  serials: async (caseId: string): Promise<SerialNumber[]> =>
    (await apiClient.get<SerialNumber[]>(`${url(caseId)}/serials`)).data,
  /** 400 с разбором (result) — ошибки формата/дубли: окно показывает их построчно. */
  saveSerials: async (caseId: string, values: string[], kind: SerialKindMode, replace: boolean): Promise<SerialNumbersResult> =>
    (await apiClient.post<SerialNumbersResult>(`${url(caseId)}/serials`, { values, kind, replace }, { ...formOpt, timeout: 60000 })).data,
  clearSerials: async (caseId: string): Promise<PreBorder> =>
    (await apiClient.delete<PreBorder>(`${url(caseId)}/serials`)).data,
  addMark: async (caseId: string, mark: { atUtc: string | null; place: string; comment: string }): Promise<PreBorder> =>
    (await apiClient.post<PreBorder>(`${url(caseId)}/marks`, {
      atUtc: mark.atUtc, place: mark.place.trim(), comment: mark.comment.trim() || null,
    }, formOpt)).data,
  deleteMark: async (caseId: string, markId: string): Promise<PreBorder> =>
    (await apiClient.delete<PreBorder>(`${url(caseId)}/marks/${encodeURIComponent(markId)}`)).data,
}

const caseUrl = (caseId: string) => `/import40/${encodeURIComponent(caseId)}`

export const translationApi = {
  list: async (caseId: string): Promise<FileTranslationBrief[]> =>
    (await apiClient.get<FileTranslationBrief[]>(`${caseUrl(caseId)}/translations`, { silent: true })).data,
  get: async (caseId: string, fileId: string): Promise<FileTranslation> =>
    (await apiClient.get<FileTranslation>(`${caseUrl(caseId)}/files/${encodeURIComponent(fileId)}/translation`, { silent: true })).data,
  /** Ошибки ({ error, code }) показывает окно: 422 нет текста / уже русский, 429 лимит, 503 ИИ выключен, 502 модель. */
  translate: async (caseId: string, fileId: string, force = false): Promise<FileTranslation> =>
    (await apiClient.post<FileTranslation>(`${caseUrl(caseId)}/files/${encodeURIComponent(fileId)}/translate${force ? '?force=true' : ''}`, null, {
      silent: true, timeout: 150000,
    })).data,
}
