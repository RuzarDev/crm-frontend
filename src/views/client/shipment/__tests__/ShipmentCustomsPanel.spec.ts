import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { CustomsRequestDto } from '@/api/customsRequests'

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), answer: vi.fn(), close: vi.fn(), remindClient: vi.fn() }))
const i40 = vi.hoisted(() => ({ uploadFile: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/customsRequests', () => ({ customsRequestsApi: api }))
vi.mock('@/api/import40', () => ({ import40Api: i40 }))
vi.mock('@/ui/message', () => ({ message: msg }))

import ShipmentCustomsPanel from '../ShipmentCustomsPanel.vue'

const req = (p: Partial<CustomsRequestDto> = {}): CustomsRequestDto => ({
  id: 'r1', declarationId: 'd1', declarationNumber: '50408/171026/0001', corridor: null, text: 'Нужен сертификат соответствия',
  docKinds: ['conformity'], dueAtUtc: '2026-10-20T12:00:00Z', createdAtUtc: '2026-10-17T08:00:00Z', createdByName: null,
  status: 'open', answeredAtUtc: null, answerText: '', answerFiles: [], closedAtUtc: null, closedByName: null, closeNote: '',
  lastReminderAtUtc: null, reminderCount: 0, ...p,
})

let w: VueWrapper
const mountIt = (requests: CustomsRequestDto[]) => {
  w = mountWithI18n(ShipmentCustomsPanel, { attachTo: document.body, props: { caseId: 'c1', requests } })
}
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('ShipmentCustomsPanel', () => {
  it('ждёт ответа — gold «Нужно от вас · ответ таможне» с текстом, документами и сроком; закрытые не показываются', () => {
    mountIt([req(), req({ id: 'r2', status: 'closed' })])
    expect(w.findAll('[data-customs-ask]')).toHaveLength(1)
    const p = w.get('[data-customs-ask]')
    expect(p.classes()).toContain('bg-gold-soft')
    expect(p.get('h2').text()).toBe('Нужно от вас · ответ таможне')
    expect(p.get('[data-customs-ask-text]').text()).toContain('Нужен сертификат соответствия')
    expect(p.get('[data-customs-ask-docs]').text()).toContain('Сертификат или декларация соответствия ЕАЭС')
    expect(p.get('[data-customs-ask-due]').text()).toBe('Ответьте до 20.10.2026')
  })

  it('«Загрузить документ» — файл нужного вида сразу уходит ответом', async () => {
    i40.uploadFile.mockResolvedValue({ id: 'f1' })
    api.answer.mockResolvedValue(req({ status: 'answered' }))
    mountIt([req()])
    // ZUpload вешает data-атрибут на кнопку; скрытый input — её сосед.
    const input = w.get('[data-customs-ask-upload]').element.parentElement!.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'cert.pdf', { type: 'application/pdf' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change'))
    await flushPromises()
    expect(i40.uploadFile).toHaveBeenCalledWith('c1', 'documents', file, 'conformity')
    expect(api.answer).toHaveBeenCalledWith('c1', 'r1', { text: '', fileIds: ['f1'] })
    expect(w.emitted('changed')).toHaveLength(1)
  })

  it('«Ответить» — сообщение уходит ответом', async () => {
    api.answer.mockResolvedValue(req({ status: 'answered' }))
    mountIt([req()])
    await w.get('[data-customs-ask-reply]').trigger('click')
    await w.get('[data-customs-ask-reply-text]').setValue('Сертификат будет завтра')
    await w.get('[data-customs-ask-send]').trigger('click')
    await flushPromises()
    expect(api.answer).toHaveBeenCalledWith('c1', 'r1', { text: 'Сертификат будет завтра', fileIds: [] })
  })

  it('клиент ответил — нейтральная плашка «Ответ отправлен» с «Дополнить ответ»', () => {
    mountIt([req({ status: 'answered', answerText: 'x' })])
    expect(w.find('[data-customs-ask]').exists()).toBe(false)
    expect(w.get('[data-customs-answered] h2').text()).toBe('Ответ отправлен')
    expect(w.find('[data-customs-more-reply]').exists()).toBe(true)
  })
})
