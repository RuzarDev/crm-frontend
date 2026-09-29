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
}

/** Значение поля гр.30 для записи реестра: номер КЕДЕН, а у старых записей — старый номер. */
export const warehouseValue = (r: WarehouseRegistryItem): string => r.registrationNumber ?? r.legacyNumber ?? ''
