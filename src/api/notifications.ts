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
  // silent — ошибку рисует сама страница (состояние ошибки с «Повторить»), общий тост не нужен.
  list: (params?: NotificationsListParams, opts?: { silent?: boolean }) =>
    apiClient.get<AppNotification[]>('/notifications', { params, silent: opts?.silent }),

  getUnreadCount: () => apiClient.get<{ count: number }>('/notifications/unread-count'),

  markRead: (id: string) => apiClient.post(`/notifications/${encodeURIComponent(id)}/read`),

  markAllRead: () => apiClient.post('/notifications/read-all'),
}
