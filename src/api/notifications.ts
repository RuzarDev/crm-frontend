import apiClient from './client'
import type { AppNotification } from '@/types/api'

export const notificationsApi = {
  list: async (): Promise<AppNotification[]> => (await apiClient.get('/notifications')).data,
  unreadCount: async (): Promise<number> =>
    (await apiClient.get('/notifications/unread-count')).data.count,
  markRead: async (id: string): Promise<void> => {
    await apiClient.post(`/notifications/${id}/read`)
  },
}
