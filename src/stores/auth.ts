import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@/api/auth'
import type { LoginRequest, RegisterClientRequest } from '@/types/api'
import { message } from 'ant-design-vue'

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
  const userId = ref<string | null>(localStorage.getItem('userId'))
  const permissions = ref<string[]>(JSON.parse(localStorage.getItem('permissions') || '[]'))

  const isAuthenticated = computed(() => !!token.value)
  const hasPermission = (permission: string) => permissions.value.includes(permission)

  const canUseImport40 = computed(() => {
    const systemRole = (role.value || '').trim().toLowerCase()
    return systemRole === 'administrator' || systemRole === 'importer' || systemRole === 'client'
  })
  const canUseSales = computed(() => {
    const systemRole = (role.value || '').trim().toLowerCase()
    return systemRole === 'administrator' || systemRole === 'sales'
  })

  const login = async (credentials: LoginRequest) => {
    try {
      const response = await authApi.login(credentials)
      const resolvedToken = response.accessToken
      token.value = normalizeToken(resolvedToken)
      username.value = credentials.username
      role.value = response.role || null
      businessRole.value = response.businessRole || null
      if (!token.value) {
        message.error('Ошибка входа: в ответе нет токена')
        return false
      }
      localStorage.setItem('authToken', token.value)
      localStorage.setItem('username', credentials.username)
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
      message.success('Вход выполнен')
      return true
    } catch (error) {
      return false
    }
  }

  const registerClient = async (payload: RegisterClientRequest) => {
    try {
      await authApi.registerClient(payload)
      message.success('Регистрация выполнена. Теперь войдите в систему')
      return true
    } catch (error) {
      return false
    }
  }

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
    localStorage.removeItem('userId')
    localStorage.removeItem('permissions')
    permissions.value = []
    message.info('Вы вышли из системы')
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
      localStorage.removeItem('userId')
      localStorage.removeItem('permissions')
      permissions.value = []
    }
  }

  return {
    token,
    username,
    role,
    businessRole,
    userId,
    permissions,
    isAuthenticated,
    hasPermission,
    canUseImport40,
    canUseSales,
    login,
    registerClient,
    logout,
    checkAuth,
  }
})
