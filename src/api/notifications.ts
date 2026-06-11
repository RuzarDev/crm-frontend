import apiClient from './client'
import type { NotificationDto } from '@/types/api'

export const notificationsApi = {
  getUnread: () => apiClient.get<NotificationDto[]>('/notifications'),

  markRead: (id: string) => apiClient.post(`/notifications/${encodeURIComponent(id)}/read`),

  markAllRead: () => apiClient.post('/notifications/read-all'),
}
