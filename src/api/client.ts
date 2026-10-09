import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import { message } from '@/ui/message'
import { i18n } from '@/i18n'

// Флаг для отдельного запроса: перехватчик не покажет свой тост об ошибке —
// экран сам рисует ошибку (свой Result/Alert, форма «ссылка недействительна» и т.п.).
// Без этого пользователь видел одно и то же сообщение дважды (аудит 2026-09-28, п.1.1).
declare module 'axios' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  export interface AxiosRequestConfig<D = any> {
    silent?: boolean
    /** Без тоста только для этих кодов ответа (экран сам показывает именно эту ошибку), остальные — как обычно. */
    silentStatuses?: number[]
    /** Запрос уже повторён с новым токеном после 401 (см. перехватчик) — второй раз не повторяем. */
    _replayed?: boolean
  }
}

const t = (key: string) => i18n.global.t(key)

// Сервер закрыл все адреса, пока не сменён временный пароль: 403 с этим кодом. Роутер и стор берём лениво —
// они сами импортируют клиент (цикл). Тоста нет: экран профиля сам объясняет, что делать.
const MUST_CHANGE_PASSWORD = 'Auth.MustChangePassword'
const PASSWORD_TARGET = '/profile?tab=password'
const goChangePassword = async () => {
  try {
    const [{ useAuthStore }, { default: router }] = await Promise.all([import('@/stores/auth'), import('@/router')])
    useAuthStore().setMustChangePassword(true)
    if (router.currentRoute.value.path !== '/profile') await router.push(PASSWORD_TARGET)
  } catch { /* перехват не должен ломать исходный отказ запроса */ }
}

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
export const extractServerText = (data: unknown): string | null => {
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

// Токен, с которым запрос ушёл на сервер (заголовок мог быть AxiosHeaders или обычным объектом).
const sentToken = (config: InternalAxiosRequestConfig | undefined): string | null => {
  const h = config?.headers as { get?: (name: string) => unknown; Authorization?: unknown } | undefined
  const raw = typeof h?.get === 'function' ? h.get('Authorization') : h?.Authorization
  return typeof raw === 'string' && raw.startsWith('Bearer ') ? raw.slice(7) : null
}

apiClient.interceptors.response.use(
  (response) => {
    // Скользящая сессия: бэк присылает свежий токен, когда у текущего осталось < половины срока.
    // Принимаем его только если запрос ушёл с тем токеном, что лежит сейчас: поздний ответ на запрос со старым токеном
    // (после смены пароля уже выдан новый) иначе затёр бы новый токен старой версии, и следующий запрос дал бы 401.
    const refreshed = response.headers?.['x-refreshed-token']
    if (typeof refreshed === 'string' && refreshed) {
      try {
        const sent = sentToken(response.config)
        if (sent && sent === localStorage.getItem('authToken')) localStorage.setItem('authToken', refreshed)
      } catch { /* private mode */ }
    }
    return response
  },
  (error) => {
    const silent = error.config?.silent === true
      || (error.response != null && (error.config?.silentStatuses ?? []).includes(error.response.status))

    if (error.response) {
      const status = error.response.status
      const serverText = extractServerText(error.response.data)
      const requestUrl = error.config?.url || ''
      const isLoginRequest = requestUrl.includes('/auth/login')

      // Смена пароля (и скользящее обновление) выдаёт новый токен, а старый сразу перестаёт действовать: запрос,
      // ушедший со старым до получения нового, получает 401 — это не конец сессии. Повторяем его один раз с
      // нынешним токеном (запрос отклонён, ничего не выполнялось); повтор снова 401 — уже настоящий обрыв.
      if (status === 401 && !isLoginRequest && error.config && !error.config._replayed) {
        const sent = sentToken(error.config)
        const current = localStorage.getItem('authToken')
        if (sent && current && sent !== current) {
          error.config._replayed = true
          return apiClient.request(error.config)
        }
      }

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
          localStorage.removeItem('mustChangePassword')
          if (!silent) errorToast('session-expired', t('errors.sessionExpired'))
          window.location.href = '/login'
        }
      } else if (status === 403) {
        if (error.response.data?.title === MUST_CHANGE_PASSWORD) void goChangePassword()
        else if (!silent) errorToast('forbidden', serverText || t('errors.forbidden'))
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
