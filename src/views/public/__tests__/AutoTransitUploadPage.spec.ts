import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { PublicUploadView } from '@/api/autoTransit'

const api = vi.hoisted(() => ({ publicUploadGet: vi.fn(), publicUploadFile: vi.fn() }))
vi.mock('@/api/autoTransit', async (orig) => ({ ...(await orig<typeof import('@/api/autoTransit')>()), ...api }))
const setLocale = vi.hoisted(() => vi.fn())
vi.mock('@/i18n', async (orig) => ({ ...(await orig<typeof import('@/i18n')>()), setLocale }))

import AutoTransitUploadPage from '../AutoTransitUploadPage.vue'

// Страница ссылки загрузки (очередь 3, спека 2026-11-25, 5.1). Данные выдуманные.
const CARGO = (o: Partial<PublicUploadView> = {}): PublicUploadView => ({
  purpose: 'uploadCargo', truckPlate: '787 ABD 05', partyNumber: 2, recipientName: 'ТОО «Тест»', expiresAtUtc: '2026-12-25T10:00:00Z',
  kinds: [
    { kind: 'cmr', label: 'CMR', required: true, uploaded: true },
    { kind: 'invoice', label: 'Инвойс', required: true, uploaded: false },
    { kind: 'packingList', label: 'Упаковочный лист', required: true, uploaded: false },
    { kind: 'other', label: 'Прочее', required: false, uploaded: false },
  ],
  files: [
    { id: 'f1', name: 'cmr.jpg', kind: 'cmr', uploadedAtUtc: '2026-11-25T09:00:00Z', returned: false, returnReason: null },
    { id: 'f2', name: 'inv-old.pdf', kind: 'invoice', uploadedAtUtc: '2026-11-25T09:05:00Z', returned: true, returnReason: 'Нет печати' },
  ],
  ...o,
})
const httpError = (status: number, data: unknown = '') => Object.assign(new Error('http'), { response: { status, data, headers: {} }, isAxiosError: true })

let w: VueWrapper
const mount = async (token = 'tok-up') => {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/u/:token', component: AutoTransitUploadPage }] })
  await router.push(`/u/${token}`)
  w = mountWithI18n(AutoTransitUploadPage, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
}
const text = (s: string) => s.replace(/\s+/g, ' ').trim()
const pick = async (...names: string[]) => {
  const input = w.get('[data-upload-camera-input]').element as HTMLInputElement
  Object.defineProperty(input, 'files', { configurable: true, value: names.map((n) => new File(['x'], n, { type: 'application/pdf' })) })
  input.dispatchEvent(new Event('change'))
  await flushPromises()
}

beforeEach(() => {
  localStorage.clear()
  api.publicUploadGet.mockResolvedValue(CARGO())
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
  vi.useRealTimers()
  document.head.querySelectorAll('meta[name="robots"]').forEach((m) => m.remove())
})

describe('AutoTransitUploadPage', () => {
  it('что нужно загрузить: виды по коду (ru), загруженное отмечено; первый незагруженный обязательный выбран', async () => {
    await mount()
    expect(api.publicUploadGet).toHaveBeenCalledWith('tok-up')
    expect(text(w.get('h1').text())).toContain('787 ABD 05')
    expect(text(w.get('[data-upload-meta]').text())).toContain('Партия 2 · ТОО «Тест»')
    expect(text(w.get('[data-upload-meta]').text())).toContain('25.12.2026')
    const kinds = w.findAll('[data-kind]')
    expect(kinds.map((k) => k.attributes('data-kind'))).toEqual(['cmr', 'invoice', 'packingList', 'other'])
    expect(kinds.map((k) => k.attributes('data-kind-state'))).toEqual(['uploaded', 'returned', 'needed', 'optional'])
    expect(text(kinds[2]!.text())).toContain('Упаковочный лист')
    expect((w.get('[data-kind="invoice"] input').element as HTMLInputElement).checked).toBe(true)
  })

  it('подпись вида — по коду на языке страницы, серверная — запасная', async () => {
    api.publicUploadGet.mockResolvedValue(CARGO({
      purpose: 'uploadVehicle', partyNumber: null, recipientName: null,
      kinds: [
        { kind: 'driverPassport', label: 'Паспорт водителя', required: true, uploaded: false },
        { kind: 'other', label: 'Печать перевозчика и прочее', required: false, uploaded: false },
        { kind: 'td' as never, label: 'Серверная подпись', required: false, uploaded: false },
      ],
      files: [],
    }))
    await mount()
    const kinds = w.findAll('[data-kind]')
    expect(text(kinds[1]!.text())).toContain('Печать перевозчика и прочее')
    expect(text(kinds[2]!.text())).toContain('Серверная подпись')
    expect(w.text()).toContain('Пока ничего не загружено')
  })

  it('возвращённый файл виден с причиной', async () => {
    await mount()
    const row = w.get('[data-sent-file="f2"]')
    expect(row.attributes('data-returned')).toBe('true')
    expect(text(row.text())).toContain('Возвращён: Нет печати')
    expect(w.get('[data-sent-file="f1"]').attributes('data-returned')).toBe('false')
  })

  it('загрузка по одному с выбранным видом; после прохода — данные перечитываются', async () => {
    await mount()
    await w.get('[data-kind="packingList"] input').setValue(true)
    api.publicUploadFile.mockResolvedValue({ id: 'f3', name: 'a.pdf', kind: 'packingList', uploadedAtUtc: '2026-11-25T10:00:00Z', returned: false, returnReason: null })
    await pick('a.pdf', 'b.pdf')
    expect(api.publicUploadFile).toHaveBeenCalledTimes(2)
    expect(api.publicUploadFile.mock.calls[0]!.slice(0, 3)).toEqual(['tok-up', expect.any(File), 'packingList'])
    expect(api.publicUploadGet).toHaveBeenCalledTimes(2)
  })

  it('ошибка сети — строка с «Повторить»; повтор загружает', async () => {
    await mount()
    api.publicUploadFile.mockRejectedValueOnce(httpError(0)).mockResolvedValueOnce({ id: 'f3', name: 'a.pdf', kind: 'invoice', uploadedAtUtc: '', returned: false, returnReason: null })
    await pick('a.pdf')
    expect(w.get('[data-upload-row="failed"]').exists()).toBe(true)
    await w.get('[data-upload-retry]').trigger('click')
    await flushPromises()
    expect(api.publicUploadFile).toHaveBeenCalledTimes(2)
    expect(w.find('[data-upload-row="failed"]').exists()).toBe(false)
  })

  it('409 upload_limit — понятный текст без «Повторить»', async () => {
    await mount()
    api.publicUploadFile.mockRejectedValue(httpError(409, { code: 'upload_limit', error: '…' }))
    await pick('a.pdf')
    const row = w.get('[data-upload-row="failed"]')
    expect(text(row.text())).toContain('По этой ссылке уже загружено максимум файлов')
    expect(row.find('[data-upload-retry]').exists()).toBe(false)
  })

  it('пустой 404 — «Ссылка недействительна», и при загрузке тоже', async () => {
    api.publicUploadGet.mockRejectedValueOnce(httpError(404))
    await mount()
    expect(w.find('[data-state="notFound"]').exists()).toBe(true)
    expect(text(w.text())).toContain('Ссылка недействительна')
    w.unmount()
    api.publicUploadGet.mockResolvedValue(CARGO())
    await mount()
    api.publicUploadFile.mockRejectedValue(httpError(404))
    await pick('a.pdf')
    expect(w.find('[data-state="notFound"]').exists()).toBe(true)
  })

  it('429 при открытии — «Слишком много запросов» и «Повторить»', async () => {
    api.publicUploadGet.mockRejectedValueOnce(httpError(429))
    await mount()
    expect(w.find('[data-state="tooMany"]').exists()).toBe(true)
    await w.get('[data-state="tooMany"] button').trigger('click')
    await flushPromises()
    expect(w.find('[data-kind]').exists()).toBe(true)
  })

  it('на телефоне есть «Сфотографировать» (камера)', async () => {
    await mount()
    expect(w.find('[data-upload-camera]').exists()).toBe(true)
    expect(w.get('[data-upload-camera-input]').attributes('capture')).toBe('environment')
  })
})
