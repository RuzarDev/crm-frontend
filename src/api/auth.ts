import apiClient from './client'
import type { LoginRequest, LoginResponse } from '@/types/api'

export const authApi = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/auth/login', data)
    return response.data
  },

  register: async (data: LoginRequest): Promise<void> => {
    await apiClient.post('/auth/register', data)
  },
}
