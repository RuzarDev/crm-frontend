import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import type { Import40CaseDto, Import40FileDto } from '@/api/import40'
import { confirmState } from '@/ui/confirm'
import type { CaseAuth } from '../casePermissions'
import { USERS, caseDto, fileDto } from './caseFixture'
import { mountStep } from './stepHarness'

const api = vi.hoisted(() => ({ action: vi.fn(), uploadFile: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/import40', () => ({ import40Api: api }))
vi.mock('@/ui/message', () => ({ message: msg }))

import StepSvhPayment from '../steps/StepSvhPayment.vue'

let w: VueWrapper
const check = (o: Partial<Import40FileDto> = {}) => fileDto({ id: 'chk', section: 'payment-check', originalFileName: 'check.pdf', ...o })
const mount = (user: CaseAuth, o: { kase?: Partial<Import40CaseDto>; files?: Import40FileDto[]; mode?: 'current' | 'done' } = {}) => {
  const m = mountStep(StepSvhPayment, { user, step: 5, mode: o.mode ?? 'current', kase: { status: 6, ...o.kase }, files: o.files ?? [] })
  w = m.w
  return m
}
const tipOf = (selector: string) => w.get(selector).element.closest('[data-tip]')!.getAttribute('data-title')
const disabled = () => w.get('[data-svh-confirm]').attributes('disabled') !== undefined

beforeEach(() => { api.action.mockResolvedValue(caseDto({ status: 7 })) })
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('StepSvhPayment', () => {
  it('без чека КПП не может подтвердить: кнопка выключена, подсказка «Клиент ещё не загрузил чек»', () => {
    mount(USERS.kpp)
    expect(disabled()).toBe(true)
    expect(tipOf('[data-svh-confirm]')).toBe('Клиент ещё не загрузил чек')
    expect(w.get('[data-docs-slot="payment-check"]').text()).toContain('Клиент ещё не загрузил чек')
    expect(w.find('[data-svh-check-tag]').exists()).toBe(false)
  })

  it('без чека администратор может подтвердить (сервер разрешает)', async () => {
    mount(USERS.admin)
    expect(disabled()).toBe(false)
    await w.get('[data-svh-confirm]').trigger('click')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.action).toHaveBeenCalledWith('c1', 'confirm-svh-payment', undefined, undefined)
  })

  it('с чеком КПП подтверждает: вопрос, затем confirm-svh-payment и тост; тег «на проверке»', async () => {
    mount(USERS.kpp, { files: [check()] })
    expect(disabled()).toBe(false)
    expect(w.get('[data-svh-check-tag]').text()).toBe('на проверке')
    await w.get('[data-svh-confirm]').trigger('click')
    expect(confirmState.title).toBe('Подтвердить оплату СВХ?')
    expect(api.action).not.toHaveBeenCalled()
    confirmState.resolve(true)
    await flushPromises()
    expect(api.action).toHaveBeenCalledWith('c1', 'confirm-svh-payment', undefined, undefined)
    expect(msg.success).toHaveBeenCalledWith('Оплата СВХ подтверждена')
  })

  it('отказ в подтверждении — действия нет', async () => {
    mount(USERS.kpp, { files: [check()] })
    await w.get('[data-svh-confirm]').trigger('click')
    confirmState.resolve(false)
    await flushPromises()
    expect(api.action).not.toHaveBeenCalled()
  })

  it('оплата подтверждена — тег «подтверждена»', () => {
    mount(USERS.kpp, { kase: { paymentConfirmed: true }, files: [check()] })
    expect(w.get('[data-svh-check-tag]').text()).toBe('подтверждена')
  })

  it('шаг ведёт другой КПП: даже с чеком выключена, подсказка «Заявку ведёт …»', () => {
    mount(USERS.kpp, { kase: { assignedKppId: 'k9', assignedKppName: 'Ерлан Б.' }, files: [check()] })
    expect(disabled()).toBe(true)
    expect(tipOf('[data-svh-confirm]')).toBe('Заявку ведёт Ерлан Б.')
  })

  it('бухгалтер: выключена, «Действие выполняет КПП», загрузки чека нет', () => {
    mount(USERS.accountant, { files: [check()] })
    expect(disabled()).toBe(true)
    expect(tipOf('[data-svh-confirm]')).toBe('Действие выполняет КПП')
    expect(w.find('[data-slot-upload]').exists()).toBe(false)
  })

  it('КПП и администратор загружают чек за клиента (раздел payment-check)', async () => {
    api.uploadFile.mockResolvedValue(fileDto())
    mount(USERS.kpp)
    expect(w.find('[data-slot-upload]').exists()).toBe(true)
    const input = w.get('input[type="file"]').element as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [new File(['%PDF'], 'c.pdf', { type: 'application/pdf' })], configurable: true })
    input.dispatchEvent(new Event('change'))
    await flushPromises()
    expect(api.uploadFile).toHaveBeenCalledWith('c1', 'payment-check', expect.any(File), undefined)
    w.unmount()
    mount(USERS.admin)
    expect(w.find('[data-slot-upload]').exists()).toBe(true)
  })

  it('сумма счёта СВХ показана над чеком', () => {
    mount(USERS.kpp, { kase: { svhInvoiceAmount: 312400, svhInvoiceNumber: '1187', svhInvoiceDate: '2026-10-03' } })
    expect(w.get('[data-svh-line]').text()).toBe('Счёт СВХ к оплате: 312\u00a0400\u00a0₸ · № 1187 · 03.10')
  })

  it('пройденный шаг: чек и тег только для чтения', () => {
    mount(USERS.kpp, { mode: 'done', kase: { status: 7, paymentConfirmed: true }, files: [check()] })
    expect(w.get('[data-docs-slot="payment-check"]').text()).toContain('check.pdf')
    expect(w.get('[data-svh-check-tag]').text()).toBe('подтверждена')
    expect(w.find('[data-slot-upload]').exists()).toBe(false)
    expect(w.find('[data-svh-confirm]').exists()).toBe(false)
  })
})
