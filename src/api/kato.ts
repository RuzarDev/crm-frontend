import apiClient from './client'

// КАТО — полный официальный классификатор (Бюро нацстатистики, ~15,6 тыс. кодов).
// В селект целиком не грузим: серверный поиск по коду/названию.
export interface KatoDto {
  code: string
  nameRu: string
  nameKk: string
  level: number
  /** Родители через « › »: «Алматы Г.А. › Алмалинский район» */
  path: string
}

export interface KatoStatus {
  total: number
  updatedAtUtc: string | null
  sourceUrl: string
}

export interface KatoSyncResult {
  total: number
  added: number
  updated: number
  removed: number
  source: string
}

export const katoApi = {
  search: async (q: string, limit = 30, opts?: { silent?: boolean }): Promise<KatoDto[]> =>
    (await apiClient.get('/ref/kato', { params: { q, limit }, ...(opts?.silent ? { silent: true } : {}) })).data,
  get: async (code: string): Promise<KatoDto | null> => {
    try {
      return (await apiClient.get(`/ref/kato/${encodeURIComponent(code)}`)).data
    } catch {
      return null
    }
  },
  status: async (opts?: { silent?: boolean }): Promise<KatoStatus> =>
    (await apiClient.get('/ref/kato/status', opts?.silent ? { silent: true } : undefined)).data,
  sync: async (): Promise<KatoSyncResult> => (await apiClient.post('/ref/kato/sync')).data,
  import: async (file: File): Promise<KatoSyncResult> => {
    const fd = new FormData()
    fd.append('file', file)
    return (await apiClient.post('/ref/kato/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data
  },
}

export const katoLabel = (k: KatoDto) => `${k.code} — ${k.nameRu}${k.path ? ` (${k.path})` : ''}`
