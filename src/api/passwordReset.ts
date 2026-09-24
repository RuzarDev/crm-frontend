import apiClient from './client'

// Восстановление пароля по ссылке из письма (бэк: Features/Auth/PasswordReset.cs).
export const authApi = {
  forgotPassword: async (login: string): Promise<void> => {
    await apiClient.post('/auth/forgot-password', { login })
  },

  checkResetToken: async (token: string): Promise<{ email: string }> =>
    (await apiClient.get<{ email: string }>(`/auth/reset-password/${encodeURIComponent(token)}`)).data,

  resetPassword: async (token: string, password: string): Promise<void> => {
    await apiClient.post('/auth/reset-password', { token, password })
  },
}
