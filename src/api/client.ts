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

// Одна сессия истечения — на пачку параллельных 401. Без этого флага каждый из
// нескольких одновременных запросов, поймавших 401, и показывал свою плашку, и
// повторно дёргал window.location.href → очередь нечитаемых тостов + гонка
// редиректов. Флаг живёт до перезагрузки страницы (редирект её и вызовет).
let sessionExpiredHandled = false

// Показ ошибки через ФИКСИРОВАННЫЙ key на статус: AntD заменяет плашку с тем же
// key, а не копит новую. Т.е. десять 500 подряд = одна плашка, а не стопка,
// перекрывающая шапку.
const errorToast = (key: string, content: string) => {
  message.error({ content, key, duration: 4 })
}

apiClient.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    if (error.response) {
      const status = error.response.status
      // Бэк отдаёт либо { error } (minimal endpoints), либо ProblemDetails { title: код, detail: текст }.
      const errorMessage = error.response.data?.error || error.response.data?.detail || error.message
      const requestUrl = error.config?.url || ''
      const isLoginRequest = requestUrl.includes('/auth/login')

      if (status === 401) {
        if (isLoginRequest) {
          // Путь клиента: «заблокирован» / «завершите приглашение» приходят с кодом ≠ InvalidCredentials.
          const code = error.response.data?.title
          const custom = code && code !== 'Auth.InvalidCredentials' ? error.response.data?.detail : null
          errorToast('auth-login', custom || 'Неверный логин или пароль')
        } else if (!sessionExpiredHandled) {
          // первый 401 в пачке: чистим сессию, показываем ОДНУ плашку и один раз
          // уводим на /login; остальные параллельные 401 сюда уже не зайдут.
          sessionExpiredHandled = true
          localStorage.removeItem('authToken')
          localStorage.removeItem('username')
          errorToast('session-expired', 'Сессия истекла — войдите снова')
          window.location.href = '/login'
        }
      } else if (status === 403) {
        errorToast('forbidden', 'Недостаточно прав для этого действия')
      } else if (status === 404) {
        errorToast('not-found', 'Ресурс не найден')
      } else if (status >= 500) {
        errorToast('server-error', 'Ошибка сервера. Попробуйте позже.')
      } else {
        errorToast(`http-${status}`, errorMessage)
      }
    } else if (error.request) {
      errorToast('network', 'Ошибка сети. Проверьте подключение.')
    } else {
      errorToast('unknown', error.message)
    }
    return Promise.reject(error)
  }
)

export default apiClient
