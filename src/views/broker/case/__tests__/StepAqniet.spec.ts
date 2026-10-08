import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type { Import40CaseDto, Import40CaseInvoiceDto } from '@/api/import40'
import type { CaseAuth } from '../casePermissions'
import { USERS } from './caseFixture'
import { mountStep } from './stepHarness'

const api = vi.hoisted(() => ({ pdf: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
const saved = vi.hoisted(() => ({ saveBlob: vi.fn() }))
vi.mock('@/api/billing', () => ({ billingApi: api }))
vi.mock('@/ui/message', () => ({ message: msg }))
vi.mock('@/ui/download', () => saved)

import StepAqniet from '../steps/StepAqniet.vue'

const inv = (o: Partial<Import40CaseInvoiceDto> = {}): Import40CaseInvoiceDto =>
  ({ id: 'i1', kind: 'invoice', status: 1, number: '124', year: 2026, total: 540000.4, issuedAtUtc: '2026-10-05T00:00:00Z', paidAtUtc: null, ...o })

let w: VueWrapper
let router: Router
const mount = (user: CaseAuth, o: { kase?: Partial<Import40CaseDto>; invoices?: Import40CaseInvoiceDto[]; mode?: 'current' | 'done' } = {}) => {
  const m = mountStep(StepAqniet, { user, step: 6, mode: o.mode ?? 'current', kase: { status: 7, ...o.kase }, invoices: o.invoices ?? [], plugins: [router] })
  w = m.w
  return m
}

beforeEach(async () => {
  const stub = { template: '<div/>' }
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: stub }, { path: '/billing', component: stub }] })
  await router.push('/')
  api.pdf.mockResolvedValue(new Blob(['%PDF']))
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('StepAqniet', () => {
  it('счета заявки: «Счёт № …/год», статус, сумма; акт и черновик подписаны', () => {
    mount(USERS.accountant, { invoices: [
      inv(),
      inv({ id: 'i2', kind: 'act', status: 2, number: '31', total: 1200 }),
      inv({ id: 'i3', status: 0, number: '', total: 99 }),
    ] })
    const rows = w.findAll('[data-aqniet-invoice]')
    expect(rows.map((r) => r.get('[data-aqniet-title]').text())).toEqual(['Счёт AQNIET № 124/2026', 'Акт № 31/2026', 'Счёт AQNIET · Черновик'])
    expect(rows.map((r) => r.get('[data-aqniet-status]').text())).toEqual(['Выставлен', 'Оплачен', 'Черновик'])
    expect(rows[0].get('[data-aqniet-total]').text()).toBe('540\u00a0000\u00a0₸')
  })

  it('PDF: billingApi.pdf по id счёта, файл с номером и годом в имени', async () => {
    mount(USERS.accountant, { invoices: [inv(), inv({ id: 'i3', kind: 'act', number: '', status: 0 })] })
    const btns = w.findAll('[data-aqniet-pdf]')
    await btns[0].trigger('click')
    await flushPromises()
    expect(api.pdf).toHaveBeenCalledWith('i1')
    expect(saved.saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'Счёт AQNIET-124-2026.pdf')
    await btns[1].trigger('click')
    await flushPromises()
    expect(api.pdf).toHaveBeenLastCalledWith('i3')
    expect(saved.saveBlob).toHaveBeenLastCalledWith(expect.any(Blob), 'Акт-черновик.pdf')
  })

  it('PDF не скачался без ответа сервера — тост; с ответом — тост даёт перехватчик, второго нет', async () => {
    api.pdf.mockRejectedValueOnce(new Error('Network'))
    mount(USERS.accountant, { invoices: [inv()] })
    await w.get('[data-aqniet-pdf]').trigger('click')
    await flushPromises()
    expect(msg.error).toHaveBeenCalledTimes(1)
    api.pdf.mockRejectedValueOnce(Object.assign(new Error('500'), { response: { status: 500 } }))
    await w.get('[data-aqniet-pdf]').trigger('click')
    await flushPromises()
    expect(msg.error).toHaveBeenCalledTimes(1)
    expect(saved.saveBlob).not.toHaveBeenCalled()
  })

  it('бухгалтер: «Выставить счёт AQNIET» ведёт в «Счета» по заявке; «Завершить без счёта» нет', async () => {
    mount(USERS.accountant)
    expect(w.find('[data-aqniet-complete]').exists()).toBe(false)
    expect(w.find('[data-aqniet-wait]').exists()).toBe(false)
    await w.get('[data-aqniet-issue]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/billing?caseId=c1')
  })

  it('КПП без finance.write: кнопки нет, текст «Ждём оплату — отмечает бухгалтер»', () => {
    mount(USERS.kpp)
    expect(w.find('[data-aqniet-issue]').exists()).toBe(false)
    expect(w.find('[data-aqniet-complete]').exists()).toBe(false)
    expect(w.get('[data-aqniet-wait]').text()).toBe('Ждём оплату — отмечает бухгалтер')
  })

  it('администратор: «Завершить без счёта AQNIET» открывает окно причины', async () => {
    const m = mount(USERS.admin)
    expect(w.get('[data-aqniet-complete]').text()).toBe('Завершить без счёта AQNIET')
    await w.get('[data-aqniet-complete]').trigger('click')
    expect((m.w.vm as unknown as { reasonKind: string }).reasonKind).toBe('completeWithoutInvoice')
  })

  it('счетов нет — пустой текст', () => {
    mount(USERS.accountant)
    expect(w.get('[data-aqniet-empty]').text()).toBe('Счетов ещё нет')
  })

  it('пройденный шаг: список со скачиванием PDF, без кнопок действий', () => {
    mount(USERS.admin, { mode: 'done', kase: { status: 8 }, invoices: [inv({ status: 2 })] })
    expect(w.findAll('[data-aqniet-invoice]')).toHaveLength(1)
    expect(w.find('[data-aqniet-pdf]').exists()).toBe(true)
    expect(w.find('[data-aqniet-issue]').exists()).toBe(false)
    expect(w.find('[data-aqniet-complete]').exists()).toBe(false)
  })
})
