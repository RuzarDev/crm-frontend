import apiClient from './client'

// Telegram-бот клиента (очередь 4, задача 3): статус привязки, одноразовая ссылка t.me/<бот>?start=<токен>,
// отвязка и выключатель уведомлений. Все маршруты — только для роли client.
export interface TelegramStatus {
  botConfigured: boolean
  botUsername: string | null
  linked: boolean
  username: string | null
  firstName: string | null
  linkedAtUtc: string | null
  notificationsEnabled: boolean
}

export interface TelegramLink {
  url: string
  expiresAtUtc: string
}

export const telegramApi = {
  status: async (opts?: { silent?: boolean }): Promise<TelegramStatus> =>
    (await apiClient.get<TelegramStatus>('/telegram/me', { silent: opts?.silent })).data,
  createLink: async (): Promise<TelegramLink> => (await apiClient.post<TelegramLink>('/telegram/link')).data,
  unlink: async (): Promise<void> => { await apiClient.delete('/telegram/link') },
  setNotifications: async (notificationsEnabled: boolean): Promise<void> => {
    await apiClient.put('/telegram/settings', { notificationsEnabled })
  },
}
