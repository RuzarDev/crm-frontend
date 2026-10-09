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
  /** Таможенный орган места нахождения: из самой записи (выгрузка КЕДЕН), иначе из НСИ КГД по БИН; однозначный код или null. */
  customsOfficeCode?: string | null
  /** Все органы, найденные в НСИ по БИН (лучшие по адресу — первыми); у записей КЕДЕН пусто. */
  customsOffices?: WarehouseOfficeSuggestion[]
  /** Только у таможенных складов из КЕДЕН: «Открытый» / «Закрытый». */
  warehouseType?: string | null
  /** Статус из КЕДЕН как есть («Действительный», «Приостановлен», «Возобновлен»). */
  status?: string | null
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
  /** Выгрузка КЕДЕН заменяет вид целиком: сколько прежних записей удалено. */
  removed?: number
  source: string
  asOfDate: string | null
  error: string | null
}

// Обновление СВХ / ТС / ТРОИС одной кнопкой с keden.kgd.gov.kz (публичные xlsx).
export interface KedenRefreshResult {
  /** svh | customs_warehouse | trois */
  registry: string
  total: number
  added: number
  updated: number
  removed: number
  error: string | null
}

export const kedenRegistriesApi = {
  refresh: async (): Promise<{ registries: KedenRefreshResult[] }> =>
    (await apiClient.post('/ref/keden-registries/refresh', null, { timeout: 300000 })).data,
}

export const warehouseRegistryApi = {
  search: async (q: string, kind?: WarehouseKind): Promise<WarehouseRegistryItem[]> =>
    (await apiClient.get('/ref/warehouse-registry', { params: { q, kind }, silent: true })).data,
  status: async (opts?: { silent?: boolean }): Promise<{ kinds: WarehouseKindStatus[] }> =>
    (await apiClient.get('/ref/warehouse-registry/status', opts?.silent ? { silent: true } : undefined)).data,
  importFromKgd: async (): Promise<{ kinds: WarehouseImportKindResult[] }> =>
    (await apiClient.post('/ref/warehouse-registry/import', null, { timeout: 180000 })).data,
  /** Ручной путь: xlsx из КЕДЕН (public-customs-registry-svh/-ts.xlsx) или с сайта КГД — формат определяется автоматически. */
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
  status: async (opts?: { silent?: boolean }): Promise<{ kinds: WarehouseKindStatus[] }> =>
    (await apiClient.get('/ref/warehouse-nsi/status', opts?.silent ? { silent: true } : undefined)).data,
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
