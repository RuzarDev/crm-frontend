import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import { message } from 'ant-design-vue'

const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const requestUrl = config.url ?? ''
    const isAuthRequest = requestUrl.includes('/auth/login')
    const token = localStorage.getItem('authToken')
    if (!isAuthRequest && token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

apiClient.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    if (error.response) {
      const status = error.response.status
      const errorMessage = error.response.data?.error || error.message
      const requestUrl = error.config?.url || ''
      const isLoginRequest = requestUrl.includes('/auth/login')

      if (status === 401) {
        if (isLoginRequest) {
          message.error('Неверный логин или пароль')
        } else {
          localStorage.removeItem('authToken')
          localStorage.removeItem('username')
          window.location.href = '/login'
          message.error('Требуется вход в систему')
        }
      } else if (status === 403) {
        message.error('Недостаточно прав для этого действия')
      } else if (status === 404) {
        message.error('Ресурс не найден')
      } else if (status >= 500) {
        message.error('Ошибка сервера. Попробуйте позже.')
      } else {
        message.error(errorMessage)
      }
    } else if (error.request) {
      message.error('Ошибка сети. Проверьте подключение.')
    } else {
      message.error(error.message)
    }
    return Promise.reject(error)
  }
)

export default apiClient
