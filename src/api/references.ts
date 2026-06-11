import apiClient from './client'
import type { RefItem } from '@/types/api'

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
}
