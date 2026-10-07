import apiClient from './client'
import type { ProfileDto, UpdateProfileRequest } from '@/types/api'

export const profileApi = {
  // silent — фоновая загрузка (имя в шапке): ошибку не показываем тостом.
  get: (opts?: { silent?: boolean }) => apiClient.get<ProfileDto>('/profile', { silent: opts?.silent }),

  update: (data: UpdateProfileRequest) => apiClient.put<ProfileDto>('/profile', data),
}
