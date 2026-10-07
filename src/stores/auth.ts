import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@/api/auth'
import type { LoginRequest, LoginResponse, RegisterClientRequest } from '@/types/api'
import { message } from '@/ui/message'
import { i18n } from '@/i18n'

const parseJwtPayload = (token: string): { sub?: string } | null => {
  try {
    const part = token.split('.')[1]
    if (!part) {
      return null
    }
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json) as { sub?: string }
  } catch {
    return null
  }
}

const normalizeToken = (value: string | null) => {
  if (!value || value === 'undefined' || value === 'null') {
    return null
  }
  return value
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(normalizeToken(localStorage.getItem('authToken')))
  const username = ref<string | null>(localStorage.getItem('username'))
  const role = ref<string | null>(localStorage.getItem('role'))
  const businessRole = ref<string | null>(localStorage.getItem('businessRole'))
  // Мультироли: все бизнес-роли пользователя (первая — основная = businessRole).
  const businessRoles = ref<string[]>(JSON.parse(localStorage.getItem('businessRoles') || '[]'))
  const hasBusinessRole = (role: string) => businessRoles.value.includes(role) || businessRole.value === role
  const userId = ref<string | null>(localStorage.getItem('userId'))
  const permissions = ref<string[]>(JSON.parse(localStorage.getItem('permissions') || '[]'))
  // Модули клиента (с логина): меню клиента показывает только то, чем он реально пользуется.
  const modules = ref<string[]>(JSON.parse(localStorage.getItem('modules') || '[]'))
  const clientHasModule = (m: 'import40' | 'transit') => modules.value.length === 0 ? m === 'import40' : modules.value.includes(m)

  const isAuthenticated = computed(() => !!token.value)
  // Администратор имеет все права всегда (в т.ч. при старой сессии без новых прав в списке).
  const hasPermission = (permission: string) =>
    (role.value || '').trim().toLowerCase() === 'administrator' || permissions.value.includes(permission)

  // Доступ к Импорту 40 — по праву из матрицы (администратор и клиент — всегда).
  const canUseImport40 = computed(() => {
    const systemRole = (role.value || '').trim().toLowerCase()
    if (systemRole === 'client') return clientHasModule('import40')
    return systemRole === 'administrator' || permissions.value.includes('import40.read')
  })
  // Финансист (бухгалтер): только платежи и документы — операционные экраны
  // декларанта/КПП и транзита ему не показываем (решение владельца 2026-09-23).
  const isFinanceOnly = computed(() => {
    const systemRole = (role.value || '').trim().toLowerCase()
    if (systemRole === 'administrator' || systemRole === 'client') return false
    if (!permissions.value.includes('finance.read')) return false
    return !['import40.declarant', 'import40.kpp', 'import40.assign', 'reestr.write', 'packages.manage']
      .some((p) => permissions.value.includes(p))
  })

  const canUseSales = computed(() => {
    const systemRole = (role.value || '').trim().toLowerCase()
    return systemRole === 'administrator' || permissions.value.includes('sales.read')
  })

  // Общая часть логина и авто-входа после регистрации/приглашения (аудит 5.22): те и
  // другие эндпоинты отдают один и тот же AuthResponse — раскладываем его по стору одинаково.
  const applyAuthResponse = (response: LoginResponse, resolvedUsername: string): boolean => {
    const resolvedToken = response.accessToken
    token.value = normalizeToken(resolvedToken)
    username.value = resolvedUsername
    role.value = response.role || null
    businessRole.value = response.businessRole || null
    businessRoles.value = response.businessRoles || (response.businessRole ? [response.businessRole] : [])
    localStorage.setItem('businessRoles', JSON.stringify(businessRoles.value))
    modules.value = response.modules || []
    localStorage.setItem('modules', JSON.stringify(modules.value))
    if (!token.value) {
      message.error(i18n.global.t('errors.loginNoToken'))
      return false
    }
    localStorage.setItem('authToken', token.value)
    localStorage.setItem('username', resolvedUsername)
    localStorage.setItem('role', response.role || '')
    localStorage.setItem('businessRole', response.businessRole || '')
    permissions.value = response.permissions || []
    localStorage.setItem('permissions', JSON.stringify(permissions.value))
    const tokenPayload = parseJwtPayload(token.value)
    userId.value = tokenPayload?.sub ?? null
    if (userId.value) {
      localStorage.setItem('userId', userId.value)
    } else {
      localStorage.removeItem('userId')
    }
    return true
  }

  const login = async (credentials: LoginRequest) => {
    try {
      const response = await authApi.login(credentials)
      // Тост «Вход выполнен» убран (аудит 1.12): переход на дашборд сам по себе
      // достаточное подтверждение, отдельное сообщение только мигало на экране.
      return applyAuthResponse(response, credentials.username)
    } catch (error) {
      return false
    }
  }

  const registerClient = async (payload: RegisterClientRequest) => {
    try {
      // Аудит 5.22: бэк сразу отдаёт токен, как логин — авто-вход без повторного ввода пароля.
      const response = await authApi.registerClient(payload)
      return applyAuthResponse(response, payload.email)
    } catch (error) {
      return false
    }
  }

  // Приглашение принято, пароль задан — тот же авто-вход, что и после саморегистрации.
  const loginFromResponse = (response: LoginResponse, resolvedUsername: string) =>
    applyAuthResponse(response, resolvedUsername)

  const logout = () => {
    token.value = null
    username.value = null
    role.value = null
    businessRole.value = null
    userId.value = null
    localStorage.removeItem('authToken')
    localStorage.removeItem('username')
    localStorage.removeItem('role')
    localStorage.removeItem('businessRole')
    localStorage.removeItem('businessRoles')
    localStorage.removeItem('modules')
    modules.value = []
    businessRoles.value = []
    localStorage.removeItem('userId')
    localStorage.removeItem('permissions')
    permissions.value = []
    // Тост «Вы вышли из системы» убран (аудит 1.12): редирект на /login уже
    // сообщает об этом однозначно.
  }

  const checkAuth = () => {
    const storedToken = normalizeToken(localStorage.getItem('authToken'))
    if (storedToken) {
      token.value = storedToken
      username.value = localStorage.getItem('username')
      role.value = localStorage.getItem('role')
      businessRole.value = localStorage.getItem('businessRole')
      userId.value = localStorage.getItem('userId')
      permissions.value = JSON.parse(localStorage.getItem('permissions') || '[]')
    } else {
      token.value = null
      username.value = null
      role.value = null
      businessRole.value = null
      userId.value = null
      localStorage.removeItem('authToken')
      localStorage.removeItem('username')
      localStorage.removeItem('role')
      localStorage.removeItem('businessRole')
      localStorage.removeItem('businessRoles')
      businessRoles.value = []
      localStorage.removeItem('userId')
      localStorage.removeItem('permissions')
      permissions.value = []
    }
  }

  return {
    modules,
    clientHasModule,
    token,
    username,
    role,
    businessRole,
    userId,
    permissions,
    isAuthenticated,
    hasPermission,
    businessRoles,
    hasBusinessRole,
    canUseImport40,
    isFinanceOnly,
    canUseSales,
    login,
    registerClient,
    loginFromResponse,
    logout,
    checkAuth,
  }
})
