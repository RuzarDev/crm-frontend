import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import { message } from 'ant-design-vue'

const apiClient: AxiosInstance = axios.create({
  baseURL: 'http://localhost:3000/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const requestUrl = config.url ?? ''
    const isAuthRequest = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register')
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
          message.error('Invalid username or password')
        } else {
          localStorage.removeItem('authToken')
          localStorage.removeItem('username')
          window.location.href = '/login'
          message.error('Authentication required. Please login.')
        }
      } else if (status === 403) {
        message.error('You do not have permission to perform this action')
      } else if (status === 404) {
        message.error('Resource not found')
      } else if (status >= 500) {
        message.error('Server error. Please try again later.')
      } else {
        message.error(errorMessage)
      }
    } else if (error.request) {
      message.error('Network error. Please check your connection.')
    } else {
      message.error(error.message)
    }
    return Promise.reject(error)
  }
)

export default apiClient
