import apiClient from './client'

// Лёгкая доска заявок для сотрудников (редизайн, волна 3а): всё нужное списку «Заявки» одним запросом,
// без вложенных деклараций. Клиенту сервер отвечает 403 — он до этого экрана не доходит.
export type Import40BoardView = 'all' | 'my'

export interface Import40BoardRow {
  id: string
  number: string
  clientId: string
  clientName: string
  cargo: string
  post: string | null
  status: number
  step: number
  isProblem: boolean
  hasClientMessage: boolean
  assignedDeclarantId?: string | null
  assignedDeclarantName?: string | null
  assignedKppId?: string | null
  assignedKppName?: string | null
  containerNumbers: string[]
  declarationsCount: number
  /** До 5 кодов, как в базе: 10 цифр без пробелов. */
  tnvedCodes: string[]
  customsPaymentsKzt: number
  createdAtUtc: string
  updatedAtUtc: string
}

export interface Import40BoardResponse {
  items: Import40BoardRow[]
  /** Заявок больше, чем отдал сервер (лимит), — экран показывает «Показаны последние …». */
  truncated: boolean
}

export const import40BoardApi = {
  // silent — экран сам рисует «не удалось загрузить» с «Повторить», без тоста перехватчика.
  list: async (view: Import40BoardView, opts?: { silent?: boolean }): Promise<Import40BoardResponse> =>
    (await apiClient.get<Import40BoardResponse>('/import40/board', { params: { view }, ...(opts?.silent ? { silent: true } : {}) })).data,
}
