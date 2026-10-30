import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'

const api = vi.hoisted(() => ({ status: vi.fn(), accept: vi.fn() }))
vi.mock('@/api/privacy', () => ({ privacyApi: api }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: msg }))

import PrivacyConsentPrompt from '../PrivacyConsentPrompt.vue'

// Окно согласия для прежних клиентов (30.10.2026): можно отложить, но при новом входе спросит снова.
let w: VueWrapper
const STATUS = { version: '2026-10-30', required: true, acceptedVersion: null, acceptedAtUtc: null }
const mount = async () => {
  w = mountWithI18n(PrivacyConsentPrompt, { attachTo: document.body })
  await flushPromises()
}
const dialog = () => document.querySelector('[role="dialog"]')
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement

beforeEach(() => { localStorage.setItem('authToken', 'header.payload.signature-1') })
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  localStorage.clear()
  sessionStorage.clear()
  vi.clearAllMocks()
})

describe('PrivacyConsentPrompt', () => {
  it('согласия нет — окно; «Принять» неактивна без галочки; с галочкой — согласие сохранено', async () => {
    api.status.mockResolvedValue(STATUS)
    api.accept.mockResolvedValue({ ...STATUS, required: false })
    await mount()
    expect(dialog()?.textContent).toContain('Ознакомьтесь с политикой конфиденциальности')
    expect(button('Принять').disabled).toBe(true)
    ;(document.querySelector('[data-privacy-prompt-consent]') as HTMLElement).click()
    await flushPromises()
    expect(button('Принять').disabled).toBe(false)
    button('Принять').click()
    await flushPromises()
    expect(api.accept).toHaveBeenCalledTimes(1)
    expect(msg.success).toHaveBeenCalledWith('Спасибо, согласие сохранено')
  })

  it('согласие уже дано — окна нет', async () => {
    api.status.mockResolvedValue({ ...STATUS, required: false })
    await mount()
    expect(dialog()).toBeNull()
  })

  it('«Позже» — до конца этого входа не спрашивает; новый вход — спросит снова', async () => {
    api.status.mockResolvedValue(STATUS)
    await mount()
    button('Позже').click()
    await flushPromises()
    expect(api.accept).not.toHaveBeenCalled()
    w.unmount()
    document.body.innerHTML = ''

    await mount()
    expect(api.status).toHaveBeenCalledTimes(1)
    expect(dialog()).toBeNull()
    w.unmount()
    document.body.innerHTML = ''

    localStorage.setItem('authToken', 'header.payload.signature-2')
    await mount()
    expect(api.status).toHaveBeenCalledTimes(2)
    expect(dialog()).not.toBeNull()
  })
})
