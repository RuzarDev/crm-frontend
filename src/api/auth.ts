import apiClient from './client'
import type { ExpeditorOption, LoginRequest, LoginResponse, RegisterClientRequest } from '@/types/api'

export const authApi = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/auth/login', data)
    return response.data
  },

  // Аудит 5.22: бэк теперь отдаёт тот же AuthResponse, что и логин — авто-вход после регистрации.
  registerClient: async (data: RegisterClientRequest): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/auth/register', data)
    return response.data
  },

  listExpeditorsForRegistration: async (): Promise<ExpeditorOption[]> => {
    const response = await apiClient.get<ExpeditorOption[]>('/auth/register/expeditors')
    return response.data
  },

  // Сервер отвечает новым AuthResponse (токен с новой версией сессии) или пустым телом — тогда null.
  changePassword: async (currentPassword: string, newPassword: string): Promise<LoginResponse | null> => {
    const response = await apiClient.post<LoginResponse | '' | null>('/auth/change-password', { currentPassword, newPassword })
    const data = response.data
    return data && typeof data === 'object' && 'accessToken' in data ? data : null
  },
}
