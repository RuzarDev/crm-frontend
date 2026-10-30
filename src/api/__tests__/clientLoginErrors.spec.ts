import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AxiosAdapter, AxiosRequestConfig } from 'axios'

const toast = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))

import apiClient from '@/api/client'
import { setLocale } from '@/i18n'

// Ревью M-9 (30.10.2026): известные отказы входа — текстом на языке интерфейса, а не русским detail сервера.
const loginFails = (title: string, detail: string) => {
  apiClient.defaults.adapter = ((config: AxiosRequestConfig) =>
    Promise.reject(Object.assign(new Error('401'), {
      config, response: { status: 401, data: { title, detail }, headers: {}, config },
    }))) as AxiosAdapter
}
const shown = () => {
  const arg = toast.error.mock.calls.at(-1)?.[0] as string | { content: string }
  return typeof arg === 'string' ? arg : arg.content
}

afterEach(async () => {
  vi.clearAllMocks()
  await setLocale('ru')
})

describe('перехватчик: отказ входа по коду', () => {
  it('приглашение не завершено — подсказка про «Забыли пароль» на языке интерфейса', async () => {
    await setLocale('en')
    loginFails('Auth.InviteNotAccepted', 'Завершите регистрацию по ссылке…')
    await expect(apiClient.post('/auth/login', {})).rejects.toBeTruthy()
    expect(shown()).toContain('Forgot password?')
  })

  it('заблокирован — по-казахски', async () => {
    await setLocale('kk')
    loginFails('Auth.Blocked', 'Аккаунт заблокирован. Обратитесь к вашему менеджеру.')
    await expect(apiClient.post('/auth/login', {})).rejects.toBeTruthy()
    expect(shown()).toBe('Аккаунт бұғатталған. Менеджеріңізге хабарласыңыз.')
  })

  it('неизвестный код — текст сервера; неверный пароль — свой текст', async () => {
    loginFails('Auth.Other', 'Особый отказ')
    await expect(apiClient.post('/auth/login', {})).rejects.toBeTruthy()
    expect(shown()).toBe('Особый отказ')
    loginFails('Auth.InvalidCredentials', 'Invalid credentials')
    await expect(apiClient.post('/auth/login', {})).rejects.toBeTruthy()
    expect(shown()).toBe('Неверный логин или пароль')
  })
})
