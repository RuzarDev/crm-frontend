import apiClient from './client'

// Запрос таможни / требование инспектора по ДТ (волна 17.10, задача 5) и «Напомнить клиенту».
// status: open — ждёт ответа клиента, answered — клиент ответил (декларант ещё не передал), closed — передано в таможню.
export type CustomsRequestStatus = 'open' | 'answered' | 'closed'

// Момент запроса (17.10): declaration — при проверке ДТ до выпуска (ТК ЕАЭС ст. 325, 4 ч до срока выпуска),
// border — на границе (пункт пропуска: транзит/прибытие, санитарный, ветеринарный, фитосанитарный контроль),
// postRelease — после выпуска / камеральная проверка (Кодекс РК «О таможенном регулировании», гл. 46–47).
export type CustomsRequestStage = 'declaration' | 'border' | 'postRelease'

export interface CustomsRequestFile {
  id: string
  fileName: string
  docKind: string | null
}

export interface CustomsRequestDto {
  id: string
  /** Момент запроса; старый сервер без поля — при проверке ДТ. */
  stage?: CustomsRequestStage
  declarationId: string | null
  declarationNumber: string | null
  /** Коридор ДТ — только сотрудникам (клиенту null). */
  corridor: string | null
  text: string
  docKinds: string[]
  /** Срок ответа. Без времени (dueHasTime ≠ true) — календарная дата: полдень UTC этой даты, дата — по UTC. */
  dueAtUtc: string | null
  /** У срока задано время (срок — момент dueAtUtc); нет поля (старый сервер) — срок только датой. */
  dueHasTime?: boolean
  createdAtUtc: string
  /** Кто завёл — только сотрудникам. */
  createdByName: string | null
  status: CustomsRequestStatus
  answeredAtUtc: string | null
  answerText: string
  answerFiles: CustomsRequestFile[]
  closedAtUtc: string | null
  closedByName: string | null
  closeNote: string
  lastReminderAtUtc: string | null
  reminderCount: number
}

export interface CustomsRequestCreate {
  /** Пусто — сервер выберет по статусу заявки. */
  stage?: CustomsRequestStage
  declarationId?: string | null
  text: string
  docKinds: string[]
  dueAtUtc?: string | null
  /** У срока задано время; false — срок только датой. */
  dueHasTime?: boolean
}

export interface RemindClientResult {
  rule: 'customs-request' | 'svh-unpaid' | 'draft-unsent' | 'manual'
  sent: number
}

const base = (caseId: string) => `/import40/${encodeURIComponent(caseId)}`

export const customsRequestsApi = {
  // silent — блок запроса таможни необязателен на экране: сбой — блок просто не показывается, без тоста.
  list: async (caseId: string, opts?: { silent?: boolean }): Promise<CustomsRequestDto[]> =>
    (await apiClient.get<CustomsRequestDto[]>(`${base(caseId)}/customs-requests`, opts?.silent ? { silent: true } : undefined)).data,
  create: async (caseId: string, body: CustomsRequestCreate): Promise<CustomsRequestDto> =>
    (await apiClient.post<CustomsRequestDto>(`${base(caseId)}/customs-requests`, body)).data,
  answer: async (caseId: string, requestId: string, body: { text: string; fileIds: string[] }): Promise<CustomsRequestDto> =>
    (await apiClient.post<CustomsRequestDto>(`${base(caseId)}/customs-requests/${encodeURIComponent(requestId)}/answer`, body)).data,
  close: async (caseId: string, requestId: string, note?: string): Promise<CustomsRequestDto> =>
    (await apiClient.post<CustomsRequestDto>(`${base(caseId)}/customs-requests/${encodeURIComponent(requestId)}/close`, { note: note ?? null })).data,
  remindClient: async (caseId: string, message?: string): Promise<RemindClientResult> =>
    (await apiClient.post<RemindClientResult>(`${base(caseId)}/remind-client`, { message: message?.trim() || null })).data,
}
