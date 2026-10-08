import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import type { CaseStepProps } from '../caseContext'
import { USERS, caseDto } from './caseFixture'
import { mountStep } from './stepHarness'

const api = vi.hoisted(() => ({ action: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/import40', () => ({ import40Api: api }))
vi.mock('@/ui/message', () => ({ message: msg }))

import SvhInvoiceModal from '../steps/SvhInvoiceModal.vue'

// Окно — заглушка с кнопкой «ОК»: проверяются поля, проверка суммы и тело issue-invoice. Поля — настоящие Z.
const ModalStub = {
  props: ['open', 'confirmLoading'], emits: ['ok', 'update:open'],
  template: '<div v-if="open" data-modal><slot /><button data-ok type="button" :aria-busy="confirmLoading || undefined" @click="$emit(\'ok\')" /><button data-cancel type="button" @click="$emit(\'update:open\', false)" /></div>',
}
const opened = ref(true)
const host = defineComponent({
  props: ['ctx', 'mode'] as unknown as undefined,
  setup: (p: CaseStepProps) => () => h(SvhInvoiceModal, { ctx: p.ctx, open: opened.value, 'onUpdate:open': (v: boolean) => { opened.value = v } }),
})

let w: VueWrapper
const mount = () => { w = mountStep(host, { user: USERS.kpp, step: 4, kase: { status: 5 }, stubs: { ZModal: ModalStub } }).w }
const input = (sel: string) => w.get(`${sel} input, input${sel}`)

beforeEach(() => {
  opened.value = true
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 3, 12, 0, 0))
  api.action.mockResolvedValue(caseDto({ status: 6 }))
})
afterEach(() => {
  vi.useRealTimers()
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('SvhInvoiceModal', () => {
  it('тело issue-invoice как раньше: сумма, номер, дата YYYY-MM-DD, заметка в value; окно закрывается, тост успеха', async () => {
    mount()
    await input('[data-svh-amount]').setValue('312400')
    await input('[data-svh-number]').setValue('1187')
    await input('[data-svh-note-input]').setValue('за октябрь')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.action).toHaveBeenCalledWith('c1', 'issue-invoice', 'за октябрь', { amount: 312400, number: '1187', date: '2026-10-03' })
    expect(msg.success).toHaveBeenCalledWith('Счёт СВХ выставлен')
    expect(opened.value).toBe(false)
  })

  it('без номера и заметки: number null, value не передаётся; дата по умолчанию — сегодня', async () => {
    mount()
    expect((input('[data-svh-date]').element as HTMLInputElement).value).toBe('03.10.2026')
    await input('[data-svh-amount]').setValue('1500.5')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.action).toHaveBeenCalledWith('c1', 'issue-invoice', undefined, { amount: 1500.5, number: null, date: '2026-10-03' })
  })

  it.each(['', '0'])('сумма «%s» — ошибка у поля, запроса нет, окно открыто', async (value) => {
    mount()
    if (value) await input('[data-svh-amount]').setValue(value)
    expect(w.text()).not.toContain('Укажите сумму счёта')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Укажите сумму счёта')
    expect(input('[data-svh-amount]').attributes('aria-invalid')).toBe('true')
    expect(api.action).not.toHaveBeenCalled()
    expect(opened.value).toBe(true)
  })

  it('ошибка исчезает, когда сумма исправлена', async () => {
    mount()
    await w.get('[data-ok]').trigger('click')
    expect(w.text()).toContain('Укажите сумму счёта')
    await input('[data-svh-amount]').setValue('10')
    expect(w.text()).not.toContain('Укажите сумму счёта')
  })

  it('ошибка сервера: окно остаётся с введённым, второго тоста нет', async () => {
    api.action.mockRejectedValueOnce(new Error('409'))
    mount()
    await input('[data-svh-amount]').setValue('500')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(opened.value).toBe(true)
    expect(msg.error).not.toHaveBeenCalled()
    expect((input('[data-svh-amount]').element as HTMLInputElement).value).toContain('500')
  })

  it('повторное открытие — поля чистые', async () => {
    mount()
    await input('[data-svh-amount]').setValue('500')
    await w.get('[data-cancel]').trigger('click')
    opened.value = true
    await flushPromises()
    expect((input('[data-svh-amount]').element as HTMLInputElement).value).toBe('')
  })
})
