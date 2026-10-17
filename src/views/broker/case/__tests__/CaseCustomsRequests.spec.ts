import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { CustomsRequestDto } from '@/api/customsRequests'

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), answer: vi.fn(), close: vi.fn(), remindClient: vi.fn() }))
const i40 = vi.hoisted(() => ({ downloadFile: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/customsRequests', () => ({ customsRequestsApi: api }))
vi.mock('@/api/import40', () => ({ import40Api: i40 }))
vi.mock('@/ui/message', () => ({ message: msg }))

import CaseCustomsRequests from '../CaseCustomsRequests.vue'

const req = (p: Partial<CustomsRequestDto> = {}): CustomsRequestDto => ({
  id: 'r1', declarationId: 'd1', declarationNumber: '50408/171026/0001', corridor: 'red', text: 'Нужен сертификат',
  docKinds: ['certificate'], dueAtUtc: '2026-10-20T12:00:00Z', createdAtUtc: new Date(Date.now() - 2 * 3600_000).toISOString(),
  createdByName: 'Иванов', status: 'open', answeredAtUtc: null, answerText: '', answerFiles: [], closedAtUtc: null,
  closedByName: null, closeNote: '', lastReminderAtUtc: null, reminderCount: 0, ...p,
})

let w: VueWrapper
const mountIt = (props: Partial<InstanceType<typeof CaseCustomsRequests>['$props']> = {}) => {
  w = mountWithI18n(CaseCustomsRequests, {
    attachTo: document.body,
    props: { caseId: 'c1', status: 3, list: [], declarations: [{ id: 'd1', declarationNumber: '50408/171026/0001' }], canManage: true, canRemind: true, ...props },
  })
}
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('CaseCustomsRequests', () => {
  it('ждёт клиента: красная метка «N ч без ответа», ДТ, коридор, срок, документы', () => {
    mountIt({ list: [req()] })
    const card = w.get('[data-customs-request="open"]')
    expect(card.get('[data-customs-label]').text()).toBe('Запрос таможни · 2 ч без ответа')
    expect(card.get('[data-customs-meta]').text()).toContain('ДТ 50408/171026/0001 · коридор: красный · срок 20.10.2026 · завёл Иванов')
    expect(card.get('[data-customs-docs]').text()).toBe('Документы: Ветеринарный, фитосанитарный сертификат, СГР')
    expect(card.find('[data-customs-close]').exists()).toBe(true)
    expect(card.find('[data-customs-remind]').exists()).toBe(true)
  })

  it('«Ответить таможне» закрывает запрос с комментарием', async () => {
    api.close.mockResolvedValue(req({ status: 'closed' }))
    mountIt({ list: [req({ status: 'answered', answerText: 'Прикладываю', answeredAtUtc: new Date().toISOString() })] })
    expect(w.get('[data-customs-answer]').text()).toContain('Прикладываю')
    await w.get('[data-customs-close]').trigger('click')
    await flushPromises()
    const note = document.querySelector('[data-customs-close-note]') as HTMLTextAreaElement
    note.value = 'Передано'
    note.dispatchEvent(new Event('input'))
    const ok = [...document.querySelectorAll('[data-customs-close-modal] button')].find((b) => b.textContent?.includes('Закрыть запрос')) as HTMLButtonElement
    ok.click()
    await flushPromises()
    expect(api.close).toHaveBeenCalledWith('c1', 'r1', 'Передано')
    expect(w.emitted('changed')).toHaveLength(1)
  })

  it('новый запрос: текст, виды документов, ДТ → create; на шаге 1 кнопки нет', async () => {
    api.create.mockResolvedValue(req())
    mountIt()
    await w.get('[data-customs-create]').trigger('click')
    await flushPromises()
    const text = document.querySelector('[data-customs-text-input]') as HTMLTextAreaElement
    text.value = 'Инспектор просит инвойс'
    text.dispatchEvent(new Event('input'))
    ;(document.querySelector('[data-customs-kind="invoice"] button, [data-customs-kind="invoice"]') as HTMLElement).click()
    await flushPromises()
    const ok = [...document.querySelectorAll('[data-customs-create-modal] button')].find((b) => b.textContent?.includes('Отправить клиенту')) as HTMLButtonElement
    ok.click()
    await flushPromises()
    expect(api.create).toHaveBeenCalledWith('c1', { text: 'Инспектор просит инвойс', docKinds: ['invoice'], declarationId: 'd1', dueAtUtc: null })
    w.unmount()
    document.body.innerHTML = ''
    mountIt({ status: 1 })
    expect(w.find('[data-customs-create]').exists()).toBe(false)
  })

  it('без права ведения ДТ — только «Напомнить клиенту»; черновик — отдельная кнопка напоминания', async () => {
    api.remindClient.mockResolvedValue({ rule: 'draft-unsent', sent: 1 })
    mountIt({ list: [req()], canManage: false })
    expect(w.find('[data-customs-close]').exists()).toBe(false)
    expect(w.find('[data-customs-create]').exists()).toBe(false)
    expect(w.find('[data-customs-remind]').exists()).toBe(true)
    w.unmount()
    document.body.innerHTML = ''
    mountIt({ status: 0, canManage: false })
    await w.get('[data-customs-remind-case]').trigger('click')
    await flushPromises()
    const ok = [...document.querySelectorAll('[data-customs-remind-modal] button')].find((b) => b.textContent?.trim() === 'Напомнить') as HTMLButtonElement
    ok.click()
    await flushPromises()
    expect(api.remindClient).toHaveBeenCalledWith('c1', '')
  })

  it('на странице ДТ — запросы этой ДТ и всей заявки, чужая ДТ не показывается', () => {
    mountIt({ declarationId: 'd1', list: [req({ id: 'a' }), req({ id: 'b', declarationId: 'd2' }), req({ id: 'c', declarationId: null })] })
    expect(w.findAll('[data-customs-request]')).toHaveLength(2)
  })
})
