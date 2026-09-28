import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import { message } from 'ant-design-vue'
import { i18n } from '@/i18n'

// Флаг для отдельного запроса: перехватчик не покажет свой тост об ошибке —
// экран сам рисует ошибку (свой Result/Alert, форма «ссылка недействительна» и т.п.).
// Без этого пользователь видел одно и то же сообщение дважды (аудит 2026-09-28, п.1.1).
declare module 'axios' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  export interface AxiosRequestConfig<D = any> {
    silent?: boolean
  }
}

const t = (key: string) => i18n.global.t(key)

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

// Текст сервера — по приоритету error › message › detail; сам ответ может быть
// и голой строкой (Results.BadRequest("...")). Общая фраза — только когда сервер
// вообще ничего не прислал: раньше сюда протекало техническое «Request failed
// with status code 400» из самого axios (аудит 2026-09-28, п.1.2/1.4).
const extractServerText = (data: unknown): string | null => {
  if (typeof data === 'string' && data.trim()) {
    return data
  }
  if (data && typeof data === 'object') {
    const candidate = (data as Record<string, unknown>).error
      ?? (data as Record<string, unknown>).message
      ?? (data as Record<string, unknown>).detail
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate
    }
  }
  return null
}

apiClient.interceptors.response.use(
  (response) => {
    // Скользящая сессия: бэк присылает свежий токен, когда у текущего осталось < половины срока.
    const refreshed = response.headers?.['x-refreshed-token']
    if (typeof refreshed === 'string' && refreshed) {
      try { localStorage.setItem('authToken', refreshed) } catch { /* private mode */ }
    }
    return response
  },
  (error) => {
    const silent = error.config?.silent === true

    if (error.response) {
      const status = error.response.status
      const serverText = extractServerText(error.response.data)
      const requestUrl = error.config?.url || ''
      const isLoginRequest = requestUrl.includes('/auth/login')

      if (status === 401) {
        if (isLoginRequest) {
          // Путь клиента: «заблокирован» / «завершите приглашение» приходят с кодом ≠ InvalidCredentials.
          const code = error.response.data?.title
          const custom = code && code !== 'Auth.InvalidCredentials' ? error.response.data?.detail : null
          if (!silent) errorToast('auth-login', custom || t('errors.invalidCredentials'))
        } else if (!sessionExpiredHandled) {
          // первый 401 в пачке: чистим сессию, показываем ОДНУ плашку и один раз
          // уводим на /login; остальные параллельные 401 сюда уже не зайдут.
          // Сама очистка сессии не зависит от silent — это реальный обрыв сессии,
          // а не то, что экран решил показать сам.
          sessionExpiredHandled = true
          localStorage.removeItem('authToken')
          localStorage.removeItem('username')
          if (!silent) errorToast('session-expired', t('errors.sessionExpired'))
          window.location.href = '/login'
        }
      } else if (status === 403) {
        if (!silent) errorToast('forbidden', serverText || t('errors.forbidden'))
      } else if (status === 404) {
        if (!silent) errorToast('not-found', serverText || t('errors.notFound'))
      } else if (status === 429) {
        if (!silent) errorToast('rate-limit', serverText || t('errors.rateLimit'))
      } else if (status >= 500) {
        if (!silent) errorToast('server-error', serverText || t('errors.serverError'))
      } else {
        if (!silent) errorToast(`http-${status}`, serverText || t('errors.generic'))
      }
    } else if (error.request) {
      if (!silent) errorToast('network', t('errors.network'))
    } else {
      if (!silent) errorToast('unknown', error.message || t('errors.generic'))
    }
    return Promise.reject(error)
  }
)

export default apiClient
