import apiClient from './client'

// Восстановление пароля по ссылке из письма (бэк: Features/Auth/PasswordReset.cs).
// silent: true — все три экрана сами рисуют текст ошибки (alert/inline-текст), общий
// тост перехватчика был бы дублем (аудит 1.11: «503 не настроено» + «Ошибка сервера»).
export const authApi = {
  forgotPassword: async (login: string): Promise<void> => {
    await apiClient.post('/auth/forgot-password', { login }, { silent: true })
  },

  checkResetToken: async (token: string): Promise<{ email: string }> =>
    (await apiClient.get<{ email: string }>(`/auth/reset-password/${encodeURIComponent(token)}`, { silent: true })).data,

  resetPassword: async (token: string, password: string): Promise<void> => {
    await apiClient.post('/auth/reset-password', { token, password }, { silent: true })
  },
}
