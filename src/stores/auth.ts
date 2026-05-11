import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@/api/auth'
import type { LoginRequest, RegisterClientRequest } from '@/types/api'
import { message } from 'ant-design-vue'

const normalizeToken = (value: string | null) => {
  if (!value || value === 'undefined' || value === 'null') {
    return null
  }
  return value
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(normalizeToken(localStorage.getItem('authToken')))
  const username = ref<string | null>(localStorage.getItem('username'))
  const permissions = ref<string[]>(JSON.parse(localStorage.getItem('permissions') || '[]'))

  const isAuthenticated = computed(() => !!token.value)
  const hasPermission = (permission: string) => permissions.value.includes(permission)

  const login = async (credentials: LoginRequest) => {
    try {
      const response = await authApi.login(credentials)
      const resolvedToken = response.accessToken
      token.value = normalizeToken(resolvedToken)
      username.value = credentials.username
      if (!token.value) {
        message.error('Ошибка входа: в ответе нет токена')
        return false
      }
      localStorage.setItem('authToken', token.value)
      localStorage.setItem('username', credentials.username)
      permissions.value = response.permissions || []
      localStorage.setItem('permissions', JSON.stringify(permissions.value))
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
    localStorage.removeItem('authToken')
    localStorage.removeItem('username')
    localStorage.removeItem('permissions')
    permissions.value = []
    message.info('Вы вышли из системы')
  }

  const checkAuth = () => {
    const storedToken = normalizeToken(localStorage.getItem('authToken'))
    if (storedToken) {
      token.value = storedToken
      username.value = localStorage.getItem('username')
      permissions.value = JSON.parse(localStorage.getItem('permissions') || '[]')
    } else {
      token.value = null
      username.value = null
      localStorage.removeItem('authToken')
      localStorage.removeItem('username')
      localStorage.removeItem('permissions')
      permissions.value = []
    }
  }

  return {
    token,
    username,
    permissions,
    isAuthenticated,
    hasPermission,
    login,
    registerClient,
    logout,
    checkAuth,
  }
})
