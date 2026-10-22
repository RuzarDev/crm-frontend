import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AxiosAdapter, AxiosRequestConfig } from 'axios'

const toast = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))

import apiClient, { extractServerText } from '@/api/client'
import { setLocale } from '@/i18n'

// Сервер не перевёл фото HEIC (fix-wave-2, e2e-1): ответ { error: '<по-русски>', code: 'heic', name } — тост на языке
// интерфейса (z.heicFailed), а не русский текст сервера.
const failWith = (status: number, data: unknown) => {
  apiClient.defaults.adapter = ((config: AxiosRequestConfig) =>
    Promise.reject(Object.assign(new Error(String(status)), { config, response: { status, data, headers: {}, config } }))) as AxiosAdapter
}
const heicError = { error: 'Не удалось перевести фото «IMG_1.HEIC» из HEIC в JPEG: служба недоступна', code: 'heic', name: 'IMG_1.HEIC' }

afterEach(async () => {
  vi.clearAllMocks()
  await setLocale('ru')
})

describe('перехватчик: отказ по фото HEIC', () => {
  it('400/503 с code=heic — текст z.heicFailed на языке интерфейса', async () => {
    failWith(400, heicError)
    await expect(apiClient.post('/x', {})).rejects.toBeTruthy()
    const content = (toast.error.mock.calls[0][0] as { content: string }).content
    expect(content).toContain('Не удалось перевести фото IMG_1.HEIC из HEIC в JPEG')
    expect(content).toContain('Наиболее совместимый')

    await setLocale('en')
    failWith(503, heicError)
    await expect(apiClient.post('/x', {})).rejects.toBeTruthy()
    expect((toast.error.mock.calls[1][0] as { content: string }).content).toContain('Could not convert the photo IMG_1.HEIC from HEIC to JPEG')

    await setLocale('kk')
    expect(extractServerText(heicError)).toContain('IMG_1.HEIC фотосын HEIC-тен JPEG-ке айналдыру мүмкін болмады')
  })

  it('прочие ошибки — текст сервера, как раньше', () => {
    expect(extractServerText({ error: 'Файл «a.pdf» пустой' })).toBe('Файл «a.pdf» пустой')
    expect(extractServerText({ error: 'Слишком часто', code: 'limit' })).toBe('Слишком часто')
  })
})
