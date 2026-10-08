import apiClient from './client'
import type {
  RefItem,
  RefCodeItem,
  RefForeignCustomsOfficeDto,
  ClassifierItem,
  ClassifierGroup,
  DtGuideEntry,
  RefExpenseTypeDto,
} from '@/types/api'

export const referencesApi = {
  // silent — страницы, где справочник лишь подсказка (запись транзита): сбой без тоста, поле остаётся свободным вводом.
  listStations: async (opts?: { silent?: boolean }): Promise<RefItem[]> =>
    (await apiClient.get('/ref/stations', opts?.silent ? { silent: true } : undefined)).data,
  createStation: async (name: string): Promise<RefItem> => (await apiClient.post('/ref/stations', { name })).data,
  updateStation: async (id: string, name: string, isActive: boolean): Promise<RefItem> =>
    (await apiClient.put(`/ref/stations/${id}`, { name, isActive })).data,
  deleteStation: async (id: string): Promise<void> => { await apiClient.delete(`/ref/stations/${id}`) },
  listCustomsPosts: async (opts?: { silent?: boolean }): Promise<RefItem[]> =>
    (await apiClient.get('/ref/customs-posts', opts?.silent ? { silent: true } : undefined)).data,
  createCustomsPost: async (name: string): Promise<RefItem> => (await apiClient.post('/ref/customs-posts', { name })).data,
  updateCustomsPost: async (id: string, name: string, isActive: boolean): Promise<RefItem> =>
    (await apiClient.put(`/ref/customs-posts/${id}`, { name, isActive })).data,
  deleteCustomsPost: async (id: string): Promise<void> => { await apiClient.delete(`/ref/customs-posts/${id}`) },

  // silent — экраны, где страна лишь подпись (карточка поставки клиента), без тоста при сбое.
  listCountries: async (opts?: { silent?: boolean }): Promise<RefCodeItem[]> =>
    (await apiClient.get('/ref/countries', opts?.silent ? { silent: true } : undefined)).data,
  createCountry: async (code: string, name: string): Promise<RefCodeItem> =>
    (await apiClient.post('/ref/countries', { code, name })).data,
  updateCountry: async (id: string, code: string, name: string, isActive: boolean): Promise<RefCodeItem> =>
    (await apiClient.put(`/ref/countries/${id}`, { code, name, isActive })).data,
  deleteCountry: async (id: string): Promise<void> => { await apiClient.delete(`/ref/countries/${id}`) },

  listForeignCustomsOffices: async (opts?: { silent?: boolean }): Promise<RefForeignCustomsOfficeDto[]> =>
    (await apiClient.get('/ref/foreign-customs-offices', opts?.silent ? { silent: true } : undefined)).data,

  listOkeiUnits: async (opts?: { silent?: boolean }): Promise<RefCodeItem[]> =>
    (await apiClient.get('/ref/okei-units', opts?.silent ? { silent: true } : undefined)).data,
  createOkeiUnit: async (code: string, name: string): Promise<RefCodeItem> =>
    (await apiClient.post('/ref/okei-units', { code, name })).data,
  updateOkeiUnit: async (id: string, code: string, name: string, isActive: boolean): Promise<RefCodeItem> =>
    (await apiClient.put(`/ref/okei-units/${id}`, { code, name, isActive })).data,
  deleteOkeiUnit: async (id: string): Promise<void> => { await apiClient.delete(`/ref/okei-units/${id}`) },

  listClassifierGroups: async (): Promise<ClassifierGroup[]> =>
    (await apiClient.get('/ref/classifiers')).data,
  listClassifiers: async (classifierCode: string): Promise<ClassifierItem[]> =>
    (await apiClient.get(`/ref/classifiers/${classifierCode}`)).data,
  createClassifier: async (classifierCode: string, code: string, nameRu: string, sortOrder = 0): Promise<ClassifierItem> =>
    (await apiClient.post('/ref/classifiers', { classifierCode, code, nameRu, sortOrder })).data,
  updateClassifier: async (id: string, code: string, nameRu: string, sortOrder: number, isActive: boolean): Promise<ClassifierItem> =>
    (await apiClient.put(`/ref/classifiers/${id}`, { code, nameRu, sortOrder, isActive })).data,
  deleteClassifier: async (id: string): Promise<void> => { await apiClient.delete(`/ref/classifiers/${id}`) },
  // Сверка классификаторов ДТ с НСИ ЕЭК и постов с КЕДЕН (админ). ~20 запросов к ЕЭК — дольше обычного таймаута.
  syncEec: async (): Promise<EecSyncResult[]> =>
    (await apiClient.post('/ref/classifiers/sync-eec', null, { timeout: 180000 })).data,

  // Пополнение расширяемых справочников пользователем (сейчас разрешено только для
  // goods-locations, гр.30) — POST /api/ref/classifiers/{code}/items, allow-list на бэкенде.
  addGoodsLocation: async (code: string, nameRu: string): Promise<ClassifierItem> =>
    (await apiClient.post('/ref/classifiers/goods-locations/items', { code, nameRu })).data,

  getDtGuide: async (): Promise<DtGuideEntry[]> => (await apiClient.get('/ref/dt-guide')).data,
  getDtGuideGraph: async (graph: string): Promise<DtGuideEntry> =>
    (await apiClient.get(`/ref/dt-guide/${graph}`)).data,

  listExpenseTypes: async (): Promise<RefExpenseTypeDto[]> =>
    (await apiClient.get('/ref/expense-types')).data,
}

export interface EecSyncResult {
  target: string
  source: string
  sourceTotal: number
  added: number
  deactivated: number
  error: string | null
}
