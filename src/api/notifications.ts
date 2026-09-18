import apiClient from './client'
import type { AppNotification } from '@/types/api'

export const notificationsApi = {
  getUnread: () => apiClient.get<AppNotification[]>('/notifications'),

  markRead: (id: string) => apiClient.post(`/notifications/${encodeURIComponent(id)}/read`),

  markAllRead: () => apiClient.post('/notifications/read-all'),
}
