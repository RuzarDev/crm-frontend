import apiClient from './client'
import type { LoginRequest, LoginResponse, RegisterClientRequest } from '@/types/api'

export const authApi = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/auth/login', data)
    return response.data
  },

  registerClient: async (data: RegisterClientRequest): Promise<void> => {
    await apiClient.post('/auth/register', data)
  },
}
