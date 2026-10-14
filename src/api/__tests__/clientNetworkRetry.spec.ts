import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosAdapter, AxiosRequestConfig } from 'axios'

const toast = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))

import apiClient from '@/api/client'

// Повтор чтения при сбое сети/502/503/504 (мобильная сеть отбивала часть пачки запросов страницы ДТ).
type Step = number | 'network' | 'timeout'
const script = (steps: Step[]) => {
  const calls: string[] = []
  apiClient.defaults.adapter = ((config: AxiosRequestConfig) => {
    calls.push(String(config.method))
    const step = steps.shift() ?? 200
    if (step === 200) return Promise.resolve({ status: 200, data: { ok: true }, headers: {}, config, statusText: 'OK' })
    if (step === 'network') return Promise.reject(Object.assign(new Error('Network Error'), { config, code: 'ERR_NETWORK', request: {} }))
    if (step === 'timeout') return Promise.reject(Object.assign(new Error('timeout'), { config, code: 'ECONNABORTED', request: {} }))
    return Promise.reject(Object.assign(new Error(String(step)), { config, response: { status: step, data: {}, headers: {}, config } }))
  }) as AxiosAdapter
  return calls
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

const run = async <T>(p: Promise<T>) => { const settled = p.then((v) => v, (e) => e); await vi.runAllTimersAsync(); return settled }

describe('перехватчик: повтор чтения при сбое сети', () => {
  it('GET: 503, обрыв, затем успех — данные без тоста', async () => {
    const calls = script([503, 'network', 200])
    const res = await run(apiClient.get('/x'))
    expect((res as { data: unknown }).data).toEqual({ ok: true })
    expect(calls).toHaveLength(3)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('GET: три сбоя подряд — отказ и один тост', async () => {
    const calls = script([503, 503, 503])
    const err = await run(apiClient.get('/x'))
    expect(err).toBeInstanceOf(Error)
    expect(calls).toHaveLength(3)
    expect(toast.error).toHaveBeenCalledTimes(1)
  })

  it('запись (PUT/POST) не повторяется', async () => {
    const calls = script([503])
    await run(apiClient.put('/x', {}))
    expect(calls).toHaveLength(1)
    const calls2 = script(['network'])
    await run(apiClient.post('/x', {}))
    expect(calls2).toHaveLength(1)
  })

  it('500, 404 и таймаут не повторяются; retry:false — тоже', async () => {
    for (const step of [500, 404, 'timeout'] as Step[]) {
      const calls = script([step])
      await run(apiClient.get('/x'))
      expect(calls).toHaveLength(1)
    }
    const calls = script([503])
    await run(apiClient.get('/x', { retry: false }))
    expect(calls).toHaveLength(1)
  })
})
