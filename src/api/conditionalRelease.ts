import apiClient from './client'
import { DOC_CHECKLIST, type DocKind } from '@/views/client/docKinds'

// Условный выпуск ДТ (17.10): срок, недостающий документ, загрузка клиентом, закрытие декларантом.
// Сервер: Import40ConditionalReleaseEndpoints, напоминания — ConditionalReleaseNotifier (каждые 2 дня, после срока — ежедневно).

/** Виды недостающего документа — общие виды документов клиента (views/client/docKinds.ts): чек-лист + «Другой». */
export const COND_REL_KINDS: DocKind[] = [...DOC_CHECKLIST.map((d) => d.key), 'other']
export type CondRelKind = DocKind

export interface ConditionalReleaseDto {
  docKind: string | null
  note: string | null
  /** 'YYYY-MM-DD' */
  deadline: string | null
  setAtUtc: string | null
  fileId: string | null
  fileName: string | null
  /** Клиент загрузил документ — ждёт подтверждения декларанта. */
  uploadedAtUtc: string | null
  resolvedAtUtc: string | null
  /** Срок прошёл (по дате Казахстана), условный выпуск не закрыт. */
  overdue: boolean
  /** Дней до срока: 0 — сегодня, меньше нуля — просрочка. */
  daysLeft: number | null
}

/** Краткая метка для списков: самый срочный незакрытый условный выпуск заявки. */
export interface ConditionalReleaseBrief {
  declarationId: string
  declarationNumber: string | null
  docKind: string | null
  note: string | null
  deadline: string | null
  overdue: boolean
  daysLeft: number | null
  uploaded: boolean
  /** Сколько ДТ заявки под незакрытым условным выпуском. */
  openCount: number
}

export interface ConditionalReleaseRequest {
  isConditionalRelease: boolean
  docKind?: string | null
  note?: string | null
  /** 'YYYY-MM-DD'; пусто — дата выпуска + 60 дней. */
  deadline?: string | null
}

const base = (caseId: string, dtId: string) =>
  `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(dtId)}/conditional-release`

export const conditionalReleaseApi = {
  /** Отметить / изменить / снять (isConditionalRelease=false → null). */
  set: async (caseId: string, dtId: string, body: ConditionalReleaseRequest): Promise<ConditionalReleaseDto | null> => {
    const r = await apiClient.put<ConditionalReleaseDto | ''>(base(caseId, dtId), body)
    return r.status === 204 || !r.data ? null : r.data
  },
  upload: async (caseId: string, dtId: string, file: File): Promise<ConditionalReleaseDto> => {
    const form = new FormData()
    form.append('file', file)
    return (await apiClient.post<ConditionalReleaseDto>(`${base(caseId, dtId)}/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })).data
  },
  resolve: async (caseId: string, dtId: string): Promise<ConditionalReleaseDto> =>
    (await apiClient.post<ConditionalReleaseDto>(`${base(caseId, dtId)}/resolve`)).data,
}
