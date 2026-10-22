import apiClient from './client'
import { heicQueued, uploadTimeoutFor } from '@/utils/heic'
import type { Import40CaseDto, Import40FileDto } from './import40'

// Доработка заявки по чек-листу документов (17.10): пункты «что догрузить» при возврате заявки клиенту,
// подсказки по нетарифным мерам, закрытие пункта загрузкой файла или вручную сотрудником.

/** Вид документа пункта — как DocKind чек-листа клиента (views/client/docKinds.ts). */
export type ReworkKind = 'invoice' | 'transport' | 'packing' | 'contract' | 'origin' | 'conformity' | 'permit' | 'certificate' | 'other'

export interface ReworkItemInput {
  kind: ReworkKind
  /** Название — только у other (обязательно); остальные подписываются по kind/docKey на языке пользователя. */
  title?: string | null
  note?: string | null
  /** Документ подсказки нетарифных мер (rework.doc.*), код ТН ВЭД и акт. */
  docKey?: string | null
  code?: string | null
  act?: string | null
}

/** Что нужно для подписи пункта: вид, название (только у other), документ подсказки. */
export interface ReworkBrief {
  kind: string
  title: string
  docKey: string | null
}

export interface ReworkItemDto extends ReworkBrief {
  id: string
  note: string
  tnvedCode: string | null
  /** Официальная ссылка на акт(ы) меры — не переводится. */
  actRef: string | null
  createdAtUtc: string
  createdByName: string | null
  resolvedAtUtc: string | null
  /** Файл, которым клиент закрыл пункт; закрыт без файла — вручную сотрудником. */
  resolvedFileId: string | null
  resolvedFileName: string | null
  resolvedByName: string | null
}

export interface ReworkResponse {
  /** Общий комментарий сотрудника; null — не писал. */
  comment: string | null
  /** Возврат с пунктами: «вернули на доработку» и без комментария. */
  reworkRequested: boolean
  items: ReworkItemDto[]
}

export interface ReworkSuggestionDto {
  code: string
  kind: ReworkKind
  /** Документ (rework.doc.*) — подписывается на языке пользователя. */
  docKey: string
  /** Русское название (журнал заявки). */
  title: string
  /** Формулировка меры КЕДЕН. */
  measure: string
  act: string | null
}

/** Временная национальная мера РК на код (запрет/ограничение ввоза на сегодня): предупреждение, не документ. */
export interface ReworkBanDto {
  code: string
  kind: 'ban' | 'restriction' | string
  goods: string
  name: string
  validFrom: string
  validTo: string | null
  /** «Приказ … № … от …» (по-русски, как в акте). */
  act: string
  actUrl: string | null
  exceptions: string | null
  /** Мера на часть кода («из …»). */
  partial: boolean
}

export interface ReworkSuggestionsResponse {
  codes: string[]
  items: ReworkSuggestionDto[]
  bans?: ReworkBanDto[] | null
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
    const timeout = uploadTimeoutFor(file) // исходник HEIC переводит сервер (utils/heic.ts)
    const r = await heicQueued(file, () => apiClient.post<Import40FileDto>(`${base(id)}/files`, formData, {
      params: { section: 'documents', kind: item.kind, reworkItemId: item.id },
      headers: { 'Content-Type': 'multipart/form-data' },
      ...(timeout ? { timeout } : {}),
    }))
    return r.data
  },
}

const ms = (iso: string) => Date.parse(iso)

/** Пункты текущего возврата для клиента: незакрытые + закрытые в последнем возврате (старые закрытые — история). */
export function currentRound(items: ReworkItemDto[]): ReworkItemDto[] {
  if (!items.length) return []
  const last = Math.max(...items.map((x) => ms(x.createdAtUtc)))
  return items.filter((x) => !x.resolvedAtUtc || ms(x.createdAtUtc) === last)
}

type Tr = (key: string, named?: Record<string, unknown>) => string

/**
 * Подпись пункта на языке пользователя: у «Другого» — название сотрудника, у подсказки — документ (rework.doc.*),
 * иначе — вид из чек-листа клиента (client.docKind.*). Русских названий с сервера не показываем.
 */
export const reworkTitle = (t: Tr, x: ReworkBrief): string =>
  x.kind === 'other' ? x.title || t('client.docKind.other.name')
  : x.docKey ? t(`rework.doc.${x.docKey}`)
  : t(`client.docKind.${x.kind}.name`)

/** Пункты через запятую — для строки «Нужно от вас», плашек и предупреждения перед отправкой. */
export const reworkList = (t: Tr, items: ReworkBrief[]): string => items.map((x) => reworkTitle(t, x)).join(', ')

export const openItems = (items: ReworkItemDto[]): ReworkItemDto[] => items.filter((x) => !x.resolvedAtUtc)
