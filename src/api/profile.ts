import apiClient from './client'
import type { ProfileDto, UpdateProfileRequest } from '@/types/api'

export const profileApi = {
  get: () => apiClient.get<ProfileDto>('/profile'),

  update: (data: UpdateProfileRequest) => apiClient.put<ProfileDto>('/profile', data),
}
