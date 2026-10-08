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

  it('живая область «ещё не подписан» смонтирована сразу, меняется только текст', async () => {
    api.sigexStartSigningDocument.mockResolvedValue(START)
    api.sigexPollDocument.mockResolvedValue({ pending: true, sign: null })
    await mountModal()
    const live = $('[data-sigex-pending]')!
    expect(live.getAttribute('role')).toBe('status')
    expect(live.textContent).toBe('')
    $('[data-sigex-check]')!.click()
    await flushPromises()
    expect($('[data-sigex-pending]')).toBe(live)
    expect(live.textContent).toContain('Подпись ещё не получена')
  })

  it('без документа — сразу ошибка, а не вечная загрузка', async () => {
    w = mountWithI18n(ClientSigexModal, { attachTo: document.body, props: { open: true, clientId: 'cl1', docId: null } })
    await flushPromises()
    expect(api.sigexStartSigningDocument).not.toHaveBeenCalled()
    expect($('[data-sigex-step="error"]')).not.toBeNull()
    expect($('[data-sigex-error]')?.textContent).toBe('Не удалось создать сессию подписания')
  })

  it('закрыли посреди процесса — ответы прежних запросов отбрасываются', async () => {
    let resolveStart!: (v: typeof START) => void
    api.sigexStartSigningDocument.mockReturnValueOnce(new Promise((r) => { resolveStart = r }))
    await mountModal()
    expect($('[data-sigex-step="loading"]')).not.toBeNull()
    await w.setProps({ open: false })
    // Открыли снова: новая сессия ещё грузится, а ответ старой пришёл — QR старой сессии не показываем.
    api.sigexStartSigningDocument.mockReturnValueOnce(new Promise(() => {}))
    await w.setProps({ open: true })
    resolveStart(START)
    await flushPromises()
    expect($('[data-sigex-step="loading"]')).not.toBeNull()
    expect($('[data-sigex-qr]')).toBeNull()
  })

  it('закрыли во время проверки — поздний ответ не переводит окно в «успех»', async () => {
    api.sigexStartSigningDocument.mockResolvedValue(START)
    let resolvePoll!: (v: { pending: boolean; sign: string | null }) => void
    api.sigexPollDocument.mockReturnValueOnce(new Promise((r) => { resolvePoll = r }))
    await mountModal()
    $('[data-sigex-check]')!.click()
    await flushPromises()
    await w.setProps({ open: false })
    resolvePoll({ pending: false, sign: 's' })
    await flushPromises()
    expect(api.sigexCompleteDocument).not.toHaveBeenCalled()
    expect(w.emitted('signed')).toBeUndefined()
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
