import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AxiosAdapter, AxiosRequestConfig } from 'axios'

vi.mock('@/ui/message', () => ({ message: { error: vi.fn() } }))

// 30.10.2026, аудит C-5: истёкшая сессия уводит на вход с адресом возврата — после входа вернёмся туда же.
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  localStorage.clear()
})

const expire = async (path: { pathname: string; search?: string; hash?: string }) => {
  const loc = { pathname: path.pathname, search: path.search ?? '', hash: path.hash ?? '', href: '' }
  vi.stubGlobal('location', loc)
  // Флаг «сессия уже оборвана» живёт в модуле — на каждый случай свой экземпляр.
  const { default: apiClient } = await import('@/api/client')
  localStorage.setItem('authToken', 'tok')
  apiClient.defaults.adapter = ((config: AxiosRequestConfig) =>
    Promise.reject(Object.assign(new Error('401'), { config, response: { status: 401, data: '', headers: {}, config } }))) as AxiosAdapter
  await expect(apiClient.get('/import40/c1')).rejects.toBeTruthy()
  return loc.href
}

describe('перехватчик: 401 — вход с адресом возврата', () => {
  it('рабочая страница — /login?next=<путь с запросом>', async () => {
    expect(await expire({ pathname: '/import-40/c1', search: '?tab=docs' })).toBe('/login?next=%2Fimport-40%2Fc1%3Ftab%3Ddocs')
    expect(localStorage.getItem('authToken')).toBeNull()
  })
  it('Главная — просто /login', async () => {
    expect(await expire({ pathname: '/home' })).toBe('/login')
  })
})
