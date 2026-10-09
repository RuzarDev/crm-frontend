import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosAdapter, AxiosRequestConfig } from 'axios'
import apiClient from '@/api/client'
import { usersApi } from '@/api/users'

const seen: AxiosRequestConfig[] = []
const reply = (status: number, data: unknown): AxiosAdapter => (config) => {
  seen.push(config)
  return Promise.resolve({ status, data, statusText: '', headers: {}, config })
}
beforeEach(() => { seen.length = 0 })
afterEach(() => { vi.clearAllMocks() })

describe('usersApi: команда', () => {
  it('team — GET /users/team, silent по просьбе', async () => {
    apiClient.defaults.adapter = reply(200, [{ id: 'u1' }])
    expect(await usersApi.team({ silent: true })).toEqual([{ id: 'u1' }])
    expect(seen[0].url).toBe('/users/team')
    expect(seen[0].silent).toBe(true)
  })

  it('declarantProfile — GET /users/{id}/declarant-profile; 204 даёт null', async () => {
    apiClient.defaults.adapter = reply(200, { fullName: 'А Б' })
    expect(await usersApi.declarantProfile('u 1')).toEqual({ fullName: 'А Б' })
    expect(seen[0].url).toBe('/users/u%201/declarant-profile')
    apiClient.defaults.adapter = reply(204, '')
    expect(await usersApi.declarantProfile('u1')).toBeNull()
  })

  it('registerStaff — POST /auth/register/staff, ошибку показывает форма (silent)', async () => {
    apiClient.defaults.adapter = reply(200, '')
    await usersApi.registerStaff({ username: 'a', password: 'p', role: 'importer', businessRole: 'kpp' })
    expect(seen[0].url).toBe('/auth/register/staff')
    expect(seen[0].silent).toBe(true)
    expect(JSON.parse(seen[0].data)).toEqual({ username: 'a', password: 'p', role: 'importer', businessRole: 'kpp' })
  })
})
