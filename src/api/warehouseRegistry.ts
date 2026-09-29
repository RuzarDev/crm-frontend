import apiClient from './client'

// Реестры владельцев СВХ и таможенных складов КГД РК (гр.30): автодополнение номера, импорт — админу.
export type WarehouseKind = 'svh' | 'customs_warehouse'

export interface WarehouseRegistryItem {
  id: number
  kind: WarehouseKind
  /** Номер КЕДЕН KZ##XXX########; у старых записей реестра его нет. */
  registrationNumber: string | null
  legacyNumber: string | null
  ownerName: string
  bin: string | null
  address: string | null
  dgdName: string | null
  includedDate: string | null
  isSuspended: boolean
  numberCorrected: boolean
  /** Таможенный орган места нахождения из НСИ КГД по БИН: однозначный код или null. */
  customsOfficeCode?: string | null
  /** Все органы, найденные в НСИ по БИН (лучшие по адресу — первыми). */
  customsOffices?: WarehouseOfficeSuggestion[]
}

export interface WarehouseOfficeSuggestion {
  customsOfficeCode: string
  ownerName: string
  address: string | null
  kind: WarehouseKind
}

export interface WarehouseKindStatus { kind: WarehouseKind; total: number; importedAtUtc: string | null }
export interface WarehouseImportKindResult {
  kind: WarehouseKind
  total: number
  added: number
  updated: number
  source: string
  asOfDate: string | null
  error: string | null
}

export const warehouseRegistryApi = {
  search: async (q: string, kind?: WarehouseKind): Promise<WarehouseRegistryItem[]> =>
    (await apiClient.get('/ref/warehouse-registry', { params: { q, kind }, silent: true })).data,
  status: async (): Promise<{ kinds: WarehouseKindStatus[] }> =>
    (await apiClient.get('/ref/warehouse-registry/status')).data,
  importFromKgd: async (): Promise<{ kinds: WarehouseImportKindResult[] }> =>
    (await apiClient.post('/ref/warehouse-registry/import', null, { timeout: 180000 })).data,
  /** Основной путь на проде: сервер не достаёт до kgd.gov.kz — xlsx реестра скачивают со страницы КГД. */
  importFile: async (kind: WarehouseKind, file: File): Promise<{ kinds: WarehouseImportKindResult[] }> => {
    const fd = new FormData()
    fd.append('kind', kind)
    fd.append('file', file)
    return (await apiClient.post('/ref/warehouse-registry/import', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 })).data
  },
}

// НСИ КГД по СВХ (tssbx) и таможенным складам (tsstm): БИН → код таможенного органа (гр.30).
export interface WarehouseNsiImportKindResult { kind: WarehouseKind; total: number; source: string; error: string | null }

export const warehouseNsiApi = {
  status: async (): Promise<{ kinds: WarehouseKindStatus[] }> =>
    (await apiClient.get('/ref/warehouse-nsi/status')).data,
  importFromKgd: async (): Promise<{ kinds: WarehouseNsiImportKindResult[] }> =>
    (await apiClient.post('/ref/warehouse-nsi/import', null, { timeout: 180000 })).data,
  /** Запасной путь: xlsx, скачанный кнопкой EXCEL на kgd.gov.kz/ru/nsi/tssbx (или /tsstm). */
  importFile: async (kind: WarehouseKind, file: File): Promise<{ kinds: WarehouseNsiImportKindResult[] }> => {
    const fd = new FormData()
    fd.append('kind', kind)
    fd.append('file', file)
    return (await apiClient.post('/ref/warehouse-nsi/import', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 })).data
  },
}

/** Значение поля гр.30 для записи реестра: номер КЕДЕН, а у старых записей — старый номер. */
export const warehouseValue = (r: WarehouseRegistryItem): string => r.registrationNumber ?? r.legacyNumber ?? ''
