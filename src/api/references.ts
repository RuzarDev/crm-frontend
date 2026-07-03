import apiClient from './client'
import type { RefItem, RefCodeItem } from '@/types/api'

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
}
