import apiClient from './client'

// Импорт 40 глазами логиста (экспедитора), только чтение (17.10): свои клиенты со статусом договора и доверенности и их
// поставки — статус груза без денег и внутренних заметок. Файлы и содержимое договора логисту не отдаются (раунд 1,
// решение владельца 30.10.2026): сервер отвечает 403 на договор и файлы клиента.

/** Текущий договор или доверенность клиента — только статус. */
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
}

export interface ExpeditorClient {
  clientId: string
  name: string
  innBin: string
  contract: ExpeditorContract | null
  /** Текущая доверенность (раунд 1, 30.10.2026). */
  poa?: ExpeditorContract | null
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

export const expeditorImport40Api = {
  // silent — экран показывает свою ошибку с «Повторить».
  overview: async (): Promise<ExpeditorImport40> =>
    (await apiClient.get<ExpeditorImport40>('/import40/expeditor/overview', { silent: true })).data,
}
