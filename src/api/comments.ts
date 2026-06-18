import apiClient from './client'
import type { ReestrComment } from '@/types/api'

export const commentsApi = {
  getAll: async (reestrId: string): Promise<ReestrComment[]> => {
    const response = await apiClient.get<ReestrComment[]>(`/reestr/${reestrId}/comments`)
    return response.data
  },

  create: async (reestrId: string, text: string): Promise<ReestrComment> => {
    const response = await apiClient.post<ReestrComment>(`/reestr/${reestrId}/comments`, { text })
    return response.data
  },

  delete: async (reestrId: string, commentId: string): Promise<void> => {
    await apiClient.delete(`/reestr/${reestrId}/comments/${commentId}`)
  },
}
