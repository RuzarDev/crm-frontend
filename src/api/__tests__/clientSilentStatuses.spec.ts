import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AxiosAdapter, AxiosRequestConfig } from 'axios'

const toast = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))

import apiClient from '@/api/client'

// silentStatuses: экран сам показывает только эту ошибку (редактор ДТ — 409 постоянной плашкой), остальные — тостом.
const failWith = (status: number) => {
  apiClient.defaults.adapter = ((config: AxiosRequestConfig) =>
    Promise.reject(Object.assign(new Error(String(status)), {
      config, response: { status, data: { detail: `ошибка ${status}` }, headers: {}, config },
    }))) as AxiosAdapter
}

afterEach(() => vi.clearAllMocks())

describe('перехватчик: silentStatuses', () => {
  it('код из списка — без тоста', async () => {
    failWith(409)
    await expect(apiClient.put('/x', {}, { silentStatuses: [409] })).rejects.toBeTruthy()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('другой код — тост как обычно', async () => {
    failWith(500)
    await expect(apiClient.put('/x', {}, { silentStatuses: [409] })).rejects.toBeTruthy()
    expect(toast.error).toHaveBeenCalled()
  })
})
