import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'

const api = vi.hoisted(() => ({
  sigexStartSigningDocument: vi.fn(),
  sigexPollDocument: vi.fn(),
  sigexCompleteDocument: vi.fn(),
}))
vi.mock('@/api/import40Contract', async (orig) => ({ ...(await orig<object>()), import40ContractApi: api }))

import ClientSigexModal from '../ClientSigexModal.vue'

const START = { qrCode: 'QQ', eGovMobileLaunchLink: 'egov://m', eGovBusinessLaunchLink: 'egov://b', dataUrl: '', qrId: 'q1', expireAt: 0 }
let w: VueWrapper
const $ = (sel: string) => document.body.querySelector(sel) as HTMLElement | null
const mountModal = async () => {
  w = mountWithI18n(ClientSigexModal, { attachTo: document.body, props: { open: true, clientId: 'cl1', docId: 'd1' } })
  await flushPromises()
}

afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('ClientSigexModal', () => {
  it('сессия → QR и ссылки; «ещё не подписан» — на месте; подписан → успех и signed', async () => {
    api.sigexStartSigningDocument.mockResolvedValue(START)
    api.sigexPollDocument.mockResolvedValueOnce({ pending: true, sign: null }).mockResolvedValueOnce({ pending: false, sign: 's' })
    api.sigexCompleteDocument.mockResolvedValue({})
    await mountModal()
    expect(api.sigexStartSigningDocument).toHaveBeenCalledWith('cl1', 'd1')
    expect($('[data-sigex-qr]')?.getAttribute('src')).toBe('data:image/png;base64,QQ')
    expect($('[data-sigex-mobile]')?.getAttribute('href')).toBe('egov://m')
    expect($('[data-sigex-business]')?.getAttribute('href')).toBe('egov://b')

    $('[data-sigex-check]')!.click()
    await flushPromises()
    expect($('[data-sigex-pending]')?.textContent).toContain('Подпись ещё не получена')
    expect(api.sigexCompleteDocument).not.toHaveBeenCalled()

    $('[data-sigex-check]')!.click()
    await flushPromises()
    expect(api.sigexPollDocument).toHaveBeenLastCalledWith('cl1', 'd1', 'q1')
    expect(api.sigexCompleteDocument).toHaveBeenCalledWith('cl1', 'd1', 'q1', 'client')
    expect($('[data-sigex-step="success"]')).not.toBeNull()
    $('[data-sigex-finish]')!.click()
    expect(w.emitted('signed')).toHaveLength(1)
    // Крестик после успеха — тоже signed (документ надо перечитать), а не просто закрытие.
    ;(document.body.querySelector('[role="dialog"] button[aria-label="Закрыть"]') as HTMLButtonElement).click()
    expect(w.emitted('signed')).toHaveLength(2)
    expect(w.emitted('update:open')).toBeUndefined()
  })

  it('ошибка сессии — текст сервера и «Попробовать снова»', async () => {
    api.sigexStartSigningDocument
      .mockRejectedValueOnce({ response: { status: 502, data: { error: 'Sigex недоступен' } } })
      .mockResolvedValueOnce(START)
    await mountModal()
    expect($('[data-sigex-error]')?.textContent).toBe('Sigex недоступен')
    $('[data-sigex-retry]')!.click()
    await flushPromises()
    expect($('[data-sigex-qr]')).not.toBeNull()
  })

  it('ошибка проверки без ответа сервера — общий текст', async () => {
    api.sigexStartSigningDocument.mockResolvedValue(START)
    api.sigexPollDocument.mockRejectedValue(new Error('network'))
    await mountModal()
    $('[data-sigex-check]')!.click()
    await flushPromises()
    expect($('[data-sigex-error]')?.textContent).toBe('Не удалось проверить подпись')
  })
})
