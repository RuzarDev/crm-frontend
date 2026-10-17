import apiClient from './client'
import type { Import40CaseDto, Import40FileDto } from './import40'

// Доработка заявки по чек-листу документов (17.10): пункты «что догрузить» при возврате заявки клиенту,
// подсказки по нетарифным мерам, закрытие пункта загрузкой файла или вручную сотрудником.

/** Вид документа пункта — как DocKind чек-листа клиента (views/client/docKinds.ts). */
export type ReworkKind = 'invoice' | 'transport' | 'packing' | 'contract' | 'origin' | 'conformity' | 'permit' | 'certificate' | 'other'

export interface ReworkItemInput {
  kind: ReworkKind
  /** Подпись: для other — обязательна; для остальных — по желанию (подсказка нетарифных мер), иначе название вида. */
  title?: string | null
  note?: string | null
}

export interface ReworkItemDto {
  id: string
  kind: string
  title: string
  note: string
  createdAtUtc: string
  createdByName: string | null
  resolvedAtUtc: string | null
  /** Файл, которым клиент закрыл пункт; закрыт без файла — вручную сотрудником. */
  resolvedFileId: string | null
  resolvedFileName: string | null
  resolvedByName: string | null
}

export interface ReworkResponse {
  /** Общий комментарий последнего возврата; null — сотрудник его не писал (причина составлена из пунктов). */
  comment: string | null
  items: ReworkItemDto[]
}

export interface ReworkSuggestionDto {
  code: string
  kind: ReworkKind
  title: string
  /** Формулировка меры КЕДЕН. */
  measure: string
  act: string | null
}

export interface ReworkSuggestionsResponse {
  codes: string[]
  items: ReworkSuggestionDto[]
}

const base = (id: string) => `/import40/${encodeURIComponent(id)}`

export const reworkApi = {
  list: async (id: string, opts?: { silent?: boolean }): Promise<ReworkResponse> => {
    const r = await apiClient.get<ReworkResponse>(`${base(id)}/rework`, opts?.silent ? { silent: true } : undefined)
    return r.data
  },

  /** codes — коды через запятую; dt=false — без кодов товаров ДТ заявки (поле кодов — единственный источник). */
  suggestions: async (id: string, codes: string[], opts?: { dt?: boolean; silent?: boolean }): Promise<ReworkSuggestionsResponse> => {
    const params: Record<string, string> = {}
    if (codes.length) params.codes = codes.join(',')
    if (opts?.dt === false) params.dt = 'false'
    const r = await apiClient.get<ReworkSuggestionsResponse>(`${base(id)}/rework-suggestions`, {
      params,
      ...(opts?.silent ? { silent: true } : {}),
    })
    return r.data
  },

  /** Возврат клиенту: общий комментарий и/или пункты — нужно хотя бы одно из двух. */
  returnToClient: async (id: string, reason: string | null, items: ReworkItemInput[]): Promise<Import40CaseDto> => {
    const r = await apiClient.post<Import40CaseDto>(`${base(id)}/actions/return-to-client`, { value: reason, items })
    return r.data
  },

  resolve: async (id: string, itemId: string): Promise<ReworkItemDto> => {
    const r = await apiClient.post<ReworkItemDto>(`${base(id)}/rework/${encodeURIComponent(itemId)}/resolve`)
    return r.data
  },

  remove: async (id: string, itemId: string): Promise<void> => {
    await apiClient.delete(`${base(id)}/rework/${encodeURIComponent(itemId)}`)
  },

  /** Файл к пункту: раздел documents, вид — из пункта; сервер закрывает именно этот пункт. */
  uploadForItem: async (id: string, item: Pick<ReworkItemDto, 'id' | 'kind'>, file: File): Promise<Import40FileDto> => {
    const formData = new FormData()
    formData.append('file', file)
    const r = await apiClient.post<Import40FileDto>(`${base(id)}/files`, formData, {
      params: { section: 'documents', kind: item.kind, reworkItemId: item.id },
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return r.data
  },
}

/** Пункты текущего возврата для клиента: незакрытые + закрытые в последнем возврате (старые закрытые — история). */
export function currentRound(items: ReworkItemDto[]): ReworkItemDto[] {
  if (!items.length) return []
  const last = items.reduce((m, x) => (x.createdAtUtc > m ? x.createdAtUtc : m), items[0].createdAtUtc)
  return items.filter((x) => !x.resolvedAtUtc || x.createdAtUtc === last)
}

export const openItems = (items: ReworkItemDto[]): ReworkItemDto[] => items.filter((x) => !x.resolvedAtUtc)
