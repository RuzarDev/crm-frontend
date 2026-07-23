import apiClient from './client'
import type { RefItem, RefCodeItem, ClassifierItem, ClassifierGroup, DtGuideEntry } from '@/types/api'

export const referencesApi = {
  listStations: async (): Promise<RefItem[]> => (await apiClient.get('/ref/stations')).data,
  createStation: async (name: string): Promise<RefItem> => (await apiClient.post('/ref/stations', { name })).data,
  updateStation: async (id: string, name: string, isActive: boolean): Promise<RefItem> =>
    (await apiClient.put(`/ref/stations/${id}`, { name, isActive })).data,
  deleteStation: async (id: string): Promise<void> => { await apiClient.delete(`/ref/stations/${id}`) },
  listCustomsPosts: async (): Promise<RefItem[]> => (await apiClient.get('/ref/customs-posts')).data,
  createCustomsPost: async (name: string): Promise<RefItem> => (await apiClient.post('/ref/customs-posts', { name })).data,
  updateCustomsPost: async (id: string, name: string, isActive: boolean): Promise<RefItem> =>
    (await apiClient.put(`/ref/customs-posts/${id}`, { name, isActive })).data,
  deleteCustomsPost: async (id: string): Promise<void> => { await apiClient.delete(`/ref/customs-posts/${id}`) },

  listCountries: async (): Promise<RefCodeItem[]> => (await apiClient.get('/ref/countries')).data,
  createCountry: async (code: string, name: string): Promise<RefCodeItem> =>
    (await apiClient.post('/ref/countries', { code, name })).data,
  updateCountry: async (id: string, code: string, name: string, isActive: boolean): Promise<RefCodeItem> =>
    (await apiClient.put(`/ref/countries/${id}`, { code, name, isActive })).data,
  deleteCountry: async (id: string): Promise<void> => { await apiClient.delete(`/ref/countries/${id}`) },

  listOkeiUnits: async (): Promise<RefCodeItem[]> => (await apiClient.get('/ref/okei-units')).data,
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

  getDtGuide: async (): Promise<DtGuideEntry[]> => (await apiClient.get('/ref/dt-guide')).data,
  getDtGuideGraph: async (graph: string): Promise<DtGuideEntry> =>
    (await apiClient.get(`/ref/dt-guide/${graph}`)).data,
}
