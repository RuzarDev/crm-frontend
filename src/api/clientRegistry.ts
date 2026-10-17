import apiClient from './client'
import type { Import40FileDto } from './import40'

// Реестр документов клиента по категориям (волна 17.10, задача 2; бэк: /client-registry/*).
// Договор брокера и доверенность — отдельно (import40Contract): их формирует и подписывает AQNIET.

export type RegistryCategory =
  | 'supplyContract' | 'unk' | 'certificate' | 'conformityDeclaration' | 'permit' | 'license' | 'trois' | 'other'
/** Статус срока: считает сервер по дате «действует до» (сегодня по Казахстану). */
export type RegistryStatus = 'active' | 'expiring' | 'expired' | 'unlimited'

export const REGISTRY_CATEGORIES: RegistryCategory[] = [
  'supplyContract', 'unk', 'certificate', 'conformityDeclaration', 'permit', 'license', 'trois', 'other',
]

export interface RegistryFile {
  id: string
  fileName: string
  contentType: string
  sizeBytes: number
  createdAtUtc: string
}

export interface RegistryDocument {
  id: string
  clientId: string
  /** Только в общем реестре сотрудника (GET /client-registry). */
  clientName: string | null
  category: RegistryCategory
  title: string | null
  number: string
  /** 'YYYY-MM-DD' */
  issuedOn: string | null
  /** 'YYYY-MM-DD'; null — бессрочный. */
  validUntil: string | null
  counterparty: string | null
  tnvedCodes: string | null
  note: string | null
  status: RegistryStatus
  daysLeft: number | null
  isArchived: boolean
  archivedAtUtc: string | null
  /** true — добавил сам клиент, false — сотрудник AQNIET. */
  addedByClient: boolean
  createdAtUtc: string
  updatedAtUtc: string
  files: RegistryFile[]
}

export interface RegistryFields {
  category: RegistryCategory
  title: string
  number: string
  issuedOn: string | null
  validUntil: string | null
  counterparty: string
  tnvedCodes: string
  note: string
}

const base = (clientId: string) => `/client-registry/${encodeURIComponent(clientId)}`
const silentOpt = (silent?: boolean) => (silent ? { silent: true } : {})

export const clientRegistryApi = {
  list: async (clientId: string, opts?: { includeArchived?: boolean; silent?: boolean }): Promise<RegistryDocument[]> =>
    (await apiClient.get<RegistryDocument[]>(base(clientId), {
      params: opts?.includeArchived ? { includeArchived: true } : undefined,
      ...silentOpt(opts?.silent),
    })).data,

  /** Все документы реестра по видимым сотруднику клиентам. */
  listAll: async (opts?: { includeArchived?: boolean; silent?: boolean }): Promise<RegistryDocument[]> =>
    (await apiClient.get<RegistryDocument[]>('/client-registry', {
      params: opts?.includeArchived ? { includeArchived: true } : undefined,
      ...silentOpt(opts?.silent),
    })).data,

  create: async (clientId: string, fields: RegistryFields, files: File[]): Promise<RegistryDocument> => {
    const form = new FormData()
    form.append('category', fields.category)
    form.append('title', fields.title)
    form.append('number', fields.number)
    if (fields.issuedOn) form.append('issuedOn', fields.issuedOn)
    if (fields.validUntil) form.append('validUntil', fields.validUntil)
    form.append('counterparty', fields.counterparty)
    form.append('tnvedCodes', fields.tnvedCodes)
    form.append('note', fields.note)
    files.forEach((f) => form.append('files', f))
    return (await apiClient.post<RegistryDocument>(base(clientId), form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })).data
  },

  update: async (clientId: string, docId: string, fields: RegistryFields): Promise<RegistryDocument> =>
    (await apiClient.put<RegistryDocument>(`${base(clientId)}/${encodeURIComponent(docId)}`, fields)).data,

  addFiles: async (clientId: string, docId: string, files: File[]): Promise<RegistryDocument> => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    return (await apiClient.post<RegistryDocument>(`${base(clientId)}/${encodeURIComponent(docId)}/files`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })).data
  },

  archive: async (clientId: string, docId: string): Promise<RegistryDocument> =>
    (await apiClient.post<RegistryDocument>(`${base(clientId)}/${encodeURIComponent(docId)}/archive`)).data,

  restore: async (clientId: string, docId: string): Promise<RegistryDocument> =>
    (await apiClient.post<RegistryDocument>(`${base(clientId)}/${encodeURIComponent(docId)}/restore`)).data,

  download: async (clientId: string, docId: string, fileId: string): Promise<Blob> =>
    (await apiClient.get(`${base(clientId)}/${encodeURIComponent(docId)}/files/${encodeURIComponent(fileId)}/download`, {
      responseType: 'blob',
    })).data,

  /** «Выбрать из реестра» в заявку: копии файлов документа в раздел documents с видом kind (по умолчанию — по категории). */
  attachToCase: async (caseId: string, documentId: string, kind?: string): Promise<Import40FileDto[]> =>
    (await apiClient.post<Import40FileDto[]>(`/import40/${encodeURIComponent(caseId)}/files/from-registry`, {
      documentId, kind: kind ?? null,
    })).data,

  /** «Сохранить в реестр клиента» у файла заявки (сотрудник). */
  saveCaseFile: async (caseId: string, fileId: string, fields: RegistryFields): Promise<RegistryDocument> =>
    (await apiClient.post<RegistryDocument>(
      `/import40/${encodeURIComponent(caseId)}/files/${encodeURIComponent(fileId)}/to-registry`, fields,
    )).data,
}
