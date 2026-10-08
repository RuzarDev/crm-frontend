import apiClient from './client'
import type { KedenDeclarationStatus } from '@/types/api'

export interface KedenDeclarationListItemDto {
  id: string
  kedenId: string
  declarationType: string
  registrationNumber: string | null
  shortName: string | null
  statusCode: string | null
  statusName: string | null
  statusDateTimeUtc: string | null
  registeredDateTimeUtc: string | null
  declarantName: string | null
  customsPost: string | null
}

export interface KedenDeclarationListResponse {
  items: KedenDeclarationListItemDto[]
  total: number
}

export interface KedenDeclarationDetailDto {
  id: string
  kedenId: string
  declarationType: string
  registrationNumber: string | null
  shortName: string | null
  referenceCode: string | null
  statusCode: string | null
  statusName: string | null
  statusDateTimeUtc: string | null
  registeredDateTimeUtc: string | null
  declarantXin: string | null
  declarantName: string | null
  customsPost: string | null
  raw: unknown
  syncedAtUtc: string
}

export const KEDEN_DECLARATION_TYPES = [
  { key: 'PI', label: 'Предварительное информирование' },
  { key: 'DT', label: 'Декларация на товары' },
  { key: 'TD', label: 'Транзитная декларация' },
  { key: 'PTDEG', label: 'Пассажирская декларация (экспресс-грузы)' },
  { key: 'DTEG', label: 'Декларация на товары (экспресс-грузы)' },
] as const

/** Ключ подписи типа декларации в i18n (короткая подпись — в таблице, `broker.keden.typeFull.<код>` — полная). */
export const kedenTypeLabelKey = (code: string): string => `broker.keden.type.${code}`

export const kedenApi = {
  // opts.silent — экран «КЕДЕН» сам рисует ошибку с «Повторить», без тоста перехватчика.
  list: async (params?: { type?: string; status?: string }, opts?: { silent?: boolean }): Promise<KedenDeclarationListResponse> => {
    const response = await apiClient.get<KedenDeclarationListResponse>(
      '/keden-declarations',
      opts?.silent ? { params, silent: true } : { params },
    )
    return response.data
  },

  get: async (id: string): Promise<KedenDeclarationDetailDto> => {
    const response = await apiClient.get<KedenDeclarationDetailDto>(
      `/keden-declarations/${encodeURIComponent(id)}`,
    )
    return response.data
  },

  // Статусы деклараций КЕДЕН, отфильтрованные по БИН текущего пользователя
  // (broker/declarant/client/admin — раздел «Статусы КЕДЕН»).
  mine: async (opts?: { silent?: boolean }): Promise<KedenDeclarationStatus[]> => {
    const response = await apiClient.get<KedenDeclarationStatus[]>(
      '/keden-declarations/mine',
      opts?.silent ? { silent: true } : undefined,
    )
    return response.data
  },
}
