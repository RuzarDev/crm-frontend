import apiClient from './client'
import type { Import40DocumentDto } from './import40Contract'

// Файл заявки клиента в общем списке «Документы» (бэк: GET /import40/client/documents).
export interface ClientCaseFile {
  id: string
  caseId: string
  caseNumber: string
  cargo: string
  section: string
  docKind: string | null
  fileName: string
  sizeBytes: number
  createdAtUtc: string
  /** true — загрузил сам клиент, false — выдал брокер/декларант. */
  fromClient: boolean
}

export interface ClientDocuments {
  /** Договор и доверенности компании (включая отозванные, статус 4). */
  company: Import40DocumentDto[]
  files: ClientCaseFile[]
}

export const clientDocumentsApi = {
  list: async (): Promise<ClientDocuments> =>
    (await apiClient.get<ClientDocuments>('/import40/client/documents')).data,
}
