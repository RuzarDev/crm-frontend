import apiClient from './client'
import type { AppNotification } from '@/types/api'

export interface NotificationsListParams {
  unreadOnly?: boolean
  limit?: number
  offset?: number
}

export const notificationsApi = {
  // Список уведомлений: без параметров — последние (для колокольчика); с limit/offset и
  // unreadOnly — постраничная лента страницы «Уведомления» (задача волны 3, показывает и
  // прочитанные).
  list: (params?: NotificationsListParams) => apiClient.get<AppNotification[]>('/notifications', { params }),

  getUnreadCount: () => apiClient.get<{ count: number }>('/notifications/unread-count'),

  markRead: (id: string) => apiClient.post(`/notifications/${encodeURIComponent(id)}/read`),

  markAllRead: () => apiClient.post('/notifications/read-all'),
}
