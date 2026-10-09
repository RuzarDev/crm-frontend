import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosAdapter, AxiosRequestConfig } from 'axios'

const toast = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))

import apiClient from '@/api/client'

// Запрос ушёл со старым токеном, пока смена пароля выдавала новый: старый уже не действует, 401 — не конец сессии.
const authOf = (config: AxiosRequestConfig): string | undefined => {
  const h = config.headers as { get?: (n: string) => unknown; Authorization?: string } | undefined
  return (typeof h?.get === 'function' ? (h.get('Authorization') as string | undefined) : h?.Authorization) ?? undefined
}

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('перехватчик: 401 для токена, который уже заменён', () => {
  it('не выкидывает на вход и повторяет запрос с новым токеном', async () => {
    localStorage.setItem('authToken', 'old')
    const seen: (string | undefined)[] = []
    apiClient.defaults.adapter = ((config: AxiosRequestConfig) => {
      seen.push(authOf(config))
      if (seen.length === 1) {
        // новый токен появился, пока запрос был в пути
        localStorage.setItem('authToken', 'new')
        return Promise.reject(Object.assign(new Error('401'), { config, response: { status: 401, data: '', headers: {}, config } }))
      }
      return Promise.resolve({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config })
    }) as AxiosAdapter

    const res = await apiClient.get('/notifications')
    expect(res.data).toEqual({ ok: true })
    expect(seen).toEqual(['Bearer old', 'Bearer new'])
    expect(localStorage.getItem('authToken')).toBe('new')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('повтор с новым токеном тоже получил 401 — это настоящий обрыв сессии: один повтор, дальше обычный выход', async () => {
    localStorage.setItem('authToken', 'old')
    let calls = 0
    apiClient.defaults.adapter = ((config: AxiosRequestConfig) => {
      calls++
      localStorage.setItem('authToken', 'new')
      return Promise.reject(Object.assign(new Error('401'), { config, response: { status: 401, data: '', headers: {}, config } }))
    }) as AxiosAdapter

    await expect(apiClient.get('/notifications')).rejects.toBeTruthy()
    expect(calls).toBe(2)
    expect(localStorage.getItem('authToken')).toBeNull()
  })
})

describe('перехватчик: скользящее обновление токена (X-Refreshed-Token)', () => {
  const okWith = (config: AxiosRequestConfig, headers: Record<string, string>) =>
    Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers, config })

  it('запрос ушёл с нынешним токеном — свежий токен сохраняется', async () => {
    localStorage.setItem('authToken', 'cur')
    apiClient.defaults.adapter = ((config: AxiosRequestConfig) => okWith(config, { 'x-refreshed-token': 'cur-2' })) as AxiosAdapter
    await apiClient.get('/notifications')
    expect(localStorage.getItem('authToken')).toBe('cur-2')
  })

  it('поздний ответ на запрос со старым токеном не затирает новый', async () => {
    localStorage.setItem('authToken', 'old')
    apiClient.defaults.adapter = ((config: AxiosRequestConfig) => {
      // пока запрос был в пути, смена пароля выдала новый токен
      localStorage.setItem('authToken', 'new')
      return okWith(config, { 'x-refreshed-token': 'old-refreshed' })
    }) as AxiosAdapter
    await apiClient.get('/notifications')
    expect(localStorage.getItem('authToken')).toBe('new')
  })

  it('запрос без токена (вход) токен из заголовка не принимает', async () => {
    apiClient.defaults.adapter = ((config: AxiosRequestConfig) => okWith(config, { 'x-refreshed-token': 'stray' })) as AxiosAdapter
    await apiClient.get('/ref/anything')
    expect(localStorage.getItem('authToken')).toBeNull()
  })
})
