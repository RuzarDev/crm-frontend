import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AxiosAdapter, AxiosRequestConfig } from 'axios'

const toast = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))

import apiClient from '@/api/client'

// 413 (02.11.2026): Kestrel отвечает пустым телом, nginx — HTML-страницей; пользователю — текст про лимит файла,
// а не «не удалось выполнить запрос» и не разметка nginx.
const failWith = (data: unknown) => {
  apiClient.defaults.adapter = ((config: AxiosRequestConfig) =>
    Promise.reject(Object.assign(new Error('413'), {
      config, response: { status: 413, data, headers: {}, config },
    }))) as AxiosAdapter
}

afterEach(() => vi.clearAllMocks())

describe('перехватчик: 413', () => {
  it('страница nginx — текст про лимит 100 МБ, без разметки', async () => {
    failWith('<html><head><title>413 Request Entity Too Large</title></head><body>nginx</body></html>')
    await expect(apiClient.post('/x', {})).rejects.toBeTruthy()
    expect(toast.error).toHaveBeenCalledWith(expect.objectContaining({ content: 'Файл слишком большой — загрузите файл до 100 МБ' }))
  })

  it('пустое тело Kestrel — тот же текст', async () => {
    failWith('')
    await expect(apiClient.post('/x', {})).rejects.toBeTruthy()
    expect(toast.error).toHaveBeenCalledWith(expect.objectContaining({ content: 'Файл слишком большой — загрузите файл до 100 МБ' }))
  })

  it('JSON сервера с error — как есть', async () => {
    failWith({ error: 'Сервер: слишком много' })
    await expect(apiClient.post('/x', {})).rejects.toBeTruthy()
    expect(toast.error).toHaveBeenCalledWith(expect.objectContaining({ content: 'Сервер: слишком много' }))
  })
})
