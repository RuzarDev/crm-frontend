import apiClient from './client'
import type { RegisterRequest, User } from '@/types/api'

export const usersApi = {
  getUsers: async (): Promise<User[]> => {
    const response = await apiClient.get<User[]>('/users')
    return response.data
  },

  createUser: async (data: RegisterRequest): Promise<void> => {
    await apiClient.post('/auth/register', data)
  },
}
