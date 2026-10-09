import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import type { LoginResponse } from '@/types/api'

const response = (o: Partial<LoginResponse> = {}): LoginResponse => ({
  accessToken: 'h.e30.s', expiresAtUtc: '2026-10-10T00:00:00Z', role: 'Import', businessRole: 'declarant',
  permissions: ['import40.read'], ...o,
})

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('auth: mustChangePassword', () => {
  it('по умолчанию выключен', () => {
    expect(useAuthStore().mustChangePassword).toBe(false)
  })

  it('вход со временным паролем: флаг в сторе и в localStorage', () => {
    const auth = useAuthStore()
    expect(auth.loginFromResponse(response({ mustChangePassword: true }), 'ivan')).toBe(true)
    expect(auth.mustChangePassword).toBe(true)
    expect(localStorage.getItem('mustChangePassword')).toBe('1')
  })

  it('флаг переживает перезагрузку страницы (новый стор читает localStorage)', () => {
    useAuthStore().loginFromResponse(response({ mustChangePassword: true }), 'ivan')
    setActivePinia(createPinia())
    expect(useAuthStore().mustChangePassword).toBe(true)
  })

  it('обычный вход сбрасывает флаг прежней сессии', () => {
    const auth = useAuthStore()
    auth.loginFromResponse(response({ mustChangePassword: true }), 'ivan')
    auth.loginFromResponse(response(), 'ivan')
    expect(auth.mustChangePassword).toBe(false)
    expect(localStorage.getItem('mustChangePassword')).toBeNull()
  })

  it('выход сбрасывает флаг', () => {
    const auth = useAuthStore()
    auth.loginFromResponse(response({ mustChangePassword: true }), 'ivan')
    auth.logout()
    expect(auth.mustChangePassword).toBe(false)
    expect(localStorage.getItem('mustChangePassword')).toBeNull()
  })

  it('setMustChangePassword(true) — от перехватчика 403; passwordChanged без нового токена только снимает флаг', () => {
    const auth = useAuthStore()
    auth.loginFromResponse(response(), 'ivan')
    auth.setMustChangePassword(true)
    expect(auth.mustChangePassword).toBe(true)
    expect(localStorage.getItem('mustChangePassword')).toBe('1')
    auth.passwordChanged(null)
    expect(auth.mustChangePassword).toBe(false)
    expect(auth.token).toBe('h.e30.s')
  })

  it('passwordChanged с новым AuthResponse берёт его токен (старые сессии закрыты сервером)', () => {
    const auth = useAuthStore()
    auth.loginFromResponse(response({ mustChangePassword: true }), 'ivan')
    auth.passwordChanged(response({ accessToken: 'h.new.s', mustChangePassword: false }))
    expect(auth.token).toBe('h.new.s')
    expect(localStorage.getItem('authToken')).toBe('h.new.s')
    expect(auth.mustChangePassword).toBe(false)
    expect(auth.username).toBe('ivan')
  })

  it('checkAuth без токена чистит флаг', () => {
    localStorage.setItem('mustChangePassword', '1')
    const auth = useAuthStore()
    auth.checkAuth()
    expect(auth.mustChangePassword).toBe(false)
    expect(localStorage.getItem('mustChangePassword')).toBeNull()
  })
})
