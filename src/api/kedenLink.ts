import apiClient from './client'

// Связь ДТ ↔ журнал КЕДЕН (17.10). Сервер: Features/Keden/KedenLinkSync (автосвязь по рег. номеру / EDocId при каждом
// приёме из kedenlogger, статусы, коридор, выпуск, уведомления) и KedenLinkEndpoints (поиск, связать, отвязать).

/** Вид статуса КЕДЕН (KedenStatusMap на сервере); коды КЕДЕН не известны — разбор по названию, прочее — other. */
export type KedenStatusKind = 'registered' | 'released' | 'conditionalRelease' | 'refused' | 'withdrawn' | 'docsRequired' | 'other'

export interface KedenLinkDto {
  linked: boolean
  kedenDeclarationId: string | null
  /** number — по рег. номеру, edoc — по EDocId из XML, fuzzy — по посту, дате гр. А и БИН (21.10), manual — вручную. */
  source: 'number' | 'edoc' | 'fuzzy' | 'manual' | null
  linkedAtUtc: string | null
  registrationNumber: string | null
  statusCode: string | null
  statusName: string | null
  statusKind: KedenStatusKind | null
  statusAtUtc: string | null
  /** green | yellow | red — если КЕДЕН отдаёт коридор. */
  corridor: string | null
  /** Номер ДХТ — только если КЕДЕН его отдаёт; null — не передаётся. */
  dhtNumber: string | null
  /** Рег. номер в КЕДЕН отличается от номера ДТ в карточке (номер не перезаписан). */
  numberConflict: string | null
  /**
   * Номер, к которому вернётся ДТ при отвязке: нестрогая связь (fuzzy) дополнила/заполнила его из КЕДЕН ('' — номер
   * очистится). null/нет — номер при отвязке не изменится (21.10).
   */
  numberOnUnlink?: string | null
}

export interface KedenCandidateDto {
  id: string
  declarationType: string
  registrationNumber: string | null
  statusName: string | null
  statusDateTimeUtc: string | null
  registeredDateTimeUtc: string | null
  declarantXin: string | null
  declarantName: string | null
  customsPost: string | null
  /** Уже связана с другой ДТ. */
  linkedDeclarationId: string | null
  linkedCaseNumber: string | null
}

export interface KedenCandidateQuery {
  q?: string
  bin?: string
  /** 'YYYY-MM-DD' */
  from?: string
  to?: string
  /** Пост подачи (5 цифр) — первые цифры рег. номера КЕДЕН. */
  post?: string
  /** Подсказка у чипа: БИН ДТ/клиента при любых фильтрах, только свободные записи типа DT (21.10). */
  hint?: boolean
}

const base = (caseId: string, dtId: string) =>
  `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(dtId)}`

export const kedenLinkApi = {
  candidates: async (caseId: string, dtId: string, query: KedenCandidateQuery = {}): Promise<KedenCandidateDto[]> => {
    const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v != null && String(v).trim() !== ''))
    const r = await apiClient.get<KedenCandidateDto[]>(`${base(caseId, dtId)}/keden-candidates`, { params })
    return r.data
  },
  link: async (caseId: string, dtId: string, kedenDeclarationId: string): Promise<KedenLinkDto> =>
    (await apiClient.post<KedenLinkDto>(`${base(caseId, dtId)}/keden-link`, { kedenDeclarationId })).data,
  unlink: async (caseId: string, dtId: string): Promise<KedenLinkDto> =>
    (await apiClient.delete<KedenLinkDto>(`${base(caseId, dtId)}/keden-link`)).data,
}
