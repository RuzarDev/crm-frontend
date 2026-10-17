import apiClient from './client'

// Импорт 40 глазами логиста (экспедитора), только чтение (17.10): свои клиенты с текущим договором и их поставки —
// статус груза без денег и внутренних заметок. Скачивание договора — те же адреса, что у клиента (сервер пускает
// экспедитора этого клиента на чтение).
export interface ExpeditorContractFile {
  id: string
  /** client-signed | provider-signed */
  section: string
  fileName: string
}

export interface ExpeditorContract {
  id: string
  number: string
  year: number
  /** 0 черновик, 1 ждёт подписи, 2 действует, 3 истёк, 4 отозван. */
  status: number
  clientSigned: boolean
  providerSigned: boolean
  validUntilUtc: string | null
  generatedAtUtc: string
  signedFiles: ExpeditorContractFile[]
}

export interface ExpeditorClient {
  clientId: string
  name: string
  innBin: string
  contract: ExpeditorContract | null
}

export interface ExpeditorShipment {
  id: string
  number: string
  clientId: string
  clientName: string
  cargo: string
  post: string
  status: number
  /** 1–6; 0 — завершена или отменена. */
  step: number
  declarationNumbers: string[]
  releasedAtUtc: string | null
  customsRequestOpen: boolean
  createdAtUtc: string
  updatedAtUtc: string
}

export interface ExpeditorImport40 {
  clients: ExpeditorClient[]
  shipments: ExpeditorShipment[]
}

const company = (clientId: string) => `/import40/company/${encodeURIComponent(clientId)}`

export const expeditorImport40Api = {
  // silent — экран показывает свою ошибку с «Повторить».
  overview: async (): Promise<ExpeditorImport40> =>
    (await apiClient.get<ExpeditorImport40>('/import40/expeditor/overview', { silent: true })).data,
  /** Договор (DOCX, сформированный по текущим реквизитам). */
  downloadContract: async (clientId: string): Promise<Blob> =>
    (await apiClient.get(`${company(clientId)}/contract/download`, { responseType: 'blob' })).data as Blob,
  /** Подписанный файл договора (как загрузили стороны). */
  downloadSignedFile: async (clientId: string, fileId: string): Promise<Blob> =>
    (await apiClient.get(`${company(clientId)}/contract/files/${encodeURIComponent(fileId)}/download`, { responseType: 'blob' })).data as Blob,
}
