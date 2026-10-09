import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AxiosAdapter, AxiosRequestConfig } from 'axios'

const push = vi.hoisted(() => vi.fn())
vi.mock('@/router', () => ({ default: { push, currentRoute: { value: { path: '/home' } } } }))
const toast = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))

import apiClient from '@/api/client'
import { useAuthStore } from '@/stores/auth'

const reply = (status: number, data: unknown): AxiosAdapter => (config: AxiosRequestConfig) =>
  Promise.reject(Object.assign(new Error(`HTTP ${status}`), { config, response: { status, data, headers: {}, config } }))

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('authToken', 'h.e30.s')
  setActivePinia(createPinia())
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('перехватчик: 403 Auth.MustChangePassword', () => {
  it('выставляет флаг, уводит на /profile?tab=password и не показывает общий тост', async () => {
    apiClient.defaults.adapter = reply(403, { title: 'Auth.MustChangePassword', detail: 'Смените временный пароль' })
    await expect(apiClient.get('/reestr')).rejects.toBeTruthy()
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/profile?tab=password'))
    expect(useAuthStore().mustChangePassword).toBe(true)
    expect(localStorage.getItem('mustChangePassword')).toBe('1')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('уже на /profile — повторного перехода нет', async () => {
    const router = (await import('@/router')).default as unknown as { currentRoute: { value: { path: string } } }
    router.currentRoute.value.path = '/profile'
    apiClient.defaults.adapter = reply(403, { title: 'Auth.MustChangePassword' })
    await expect(apiClient.get('/reestr')).rejects.toBeTruthy()
    await vi.waitFor(() => expect(useAuthStore().mustChangePassword).toBe(true))
    expect(push).not.toHaveBeenCalled()
    router.currentRoute.value.path = '/home'
  })

  it('обычный 403 — общий тост с текстом сервера, флаг не трогаем', async () => {
    apiClient.defaults.adapter = reply(403, { detail: 'Нет доступа' })
    await expect(apiClient.get('/reestr')).rejects.toBeTruthy()
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(useAuthStore().mustChangePassword).toBe(false)
    expect(push).not.toHaveBeenCalled()
  })
})
