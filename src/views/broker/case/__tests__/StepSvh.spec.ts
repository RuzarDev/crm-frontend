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

import StepSvh from '../steps/StepSvh.vue'

const ModalStub = { props: ['open'], template: '<div v-if="open" data-modal><slot /></div>' }

let w: VueWrapper
const mount = (user: CaseAuth, o: { kase?: Partial<Import40CaseDto>; files?: Import40FileDto[]; mode?: 'current' | 'done' } = {}) => {
  const m = mountStep(StepSvh, { user, step: 4, mode: o.mode ?? 'current', kase: { status: 4, ...o.kase }, files: o.files ?? [], stubs: { ZModal: ModalStub } })
  w = m.w
  return m
}
const tipOf = (selector: string) => w.get(selector).element.closest('[data-tip]')!.getAttribute('data-title')

beforeEach(() => { api.action.mockResolvedValue(caseDto({ status: 5 })) })
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('StepSvh', () => {
  it('два места для файлов: штамп и счёт СВХ; КПП видит зоны загрузки и тексты пустых мест', () => {
    mount(USERS.kpp)
    expect(w.get('[data-docs-slot="declaration-stamp"]').text()).toContain('Закрытая ДТ (штамп)')
    expect(w.get('[data-docs-slot="declaration-stamp"]').text()).toContain('Штамп не загружен')
    expect(w.get('[data-docs-slot="svh-invoice"]').text()).toContain('Счёт СВХ')
    expect(w.get('[data-docs-slot="svh-invoice"]').text()).toContain('Счёт не выставлен')
    expect(w.findAll('[data-slot-upload]')).toHaveLength(2)
    expect(w.find('[data-slot-remove]').exists()).toBe(false)
  })

  it('файлы разделов показаны, чужие разделы — нет; удаления нет даже у администратора', () => {
    mount(USERS.admin, { files: [
      fileDto({ id: 'a', section: 'declaration-stamp', originalFileName: 'stamp.pdf' }),
      fileDto({ id: 'b', section: 'svh-invoice', originalFileName: 'svh.pdf' }),
      fileDto({ id: 'c', section: 'documents', originalFileName: 'inv.pdf' }),
    ] })
    expect(w.get('[data-docs-slot="declaration-stamp"]').text()).toContain('stamp.pdf')
    expect(w.get('[data-docs-slot="svh-invoice"]').text()).toContain('svh.pdf')
    expect(w.text()).not.toContain('inv.pdf')
    expect(w.find('[data-slot-remove]').exists()).toBe(false)
  })

  it('без права КПП (бухгалтер): зон загрузки нет, кнопка выключена, подсказка «Действие выполняет КПП»', () => {
    mount(USERS.accountant)
    expect(w.find('[data-slot-upload]').exists()).toBe(false)
    expect(w.get('[data-svh-close]').attributes('disabled')).toBeDefined()
    expect(tipOf('[data-svh-close]')).toBe('Действие выполняет КПП')
  })

  it('загрузка штампа: раздел declaration-stamp, тост и перечитывание', async () => {
    api.uploadFile.mockResolvedValue(fileDto())
    const m = mount(USERS.kpp)
    const input = w.get('[data-docs-slot="declaration-stamp"] input[type="file"]').element as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [new File(['%PDF'], 'stamp.pdf', { type: 'application/pdf' })], configurable: true })
    input.dispatchEvent(new Event('change'))
    await flushPromises()
    expect(api.uploadFile).toHaveBeenCalledWith('c1', 'declaration-stamp', expect.any(File), undefined)
    expect(msg.success).toHaveBeenCalledWith('Файл загружен')
    expect(m.reload).toHaveBeenCalled()
  })

  it('статус 4: «Закрыть ДТ на СВХ» с подтверждением → close-svh, тост', async () => {
    mount(USERS.kpp)
    expect(w.find('[data-svh-issue]').exists()).toBe(false)
    await w.get('[data-svh-close]').trigger('click')
    expect(confirmState.title).toBe('Закрыть ДТ на СВХ?')
    expect(api.action).not.toHaveBeenCalled()
    confirmState.resolve(true)
    await flushPromises()
    expect(api.action).toHaveBeenCalledWith('c1', 'close-svh', undefined, undefined)
    expect(msg.success).toHaveBeenCalledWith('ДТ закрыта на СВХ')
  })

  it('отказ в подтверждении — действия нет', async () => {
    mount(USERS.kpp)
    await w.get('[data-svh-close]').trigger('click')
    confirmState.resolve(false)
    await flushPromises()
    expect(api.action).not.toHaveBeenCalled()
  })

  it('шаг ведёт другой КПП: кнопка выключена с подсказкой, руководитель не блокируется', () => {
    mount(USERS.kpp, { kase: { assignedKppId: 'k9', assignedKppName: 'Ерлан Б.' } })
    expect(w.get('[data-svh-close]').attributes('disabled')).toBeDefined()
    expect(tipOf('[data-svh-close]')).toBe('Заявку ведёт Ерлан Б.')
    w.unmount()
    mount(USERS.rop, { kase: { assignedKppId: 'k9', assignedKppName: 'Ерлан Б.' } })
    expect(w.get('[data-svh-close]').attributes('disabled')).toBeUndefined()
  })

  it('статус 5: вместо закрытия — «Выставить счёт СВХ», открывает окно; без окна запросов нет', async () => {
    mount(USERS.kpp, { kase: { status: 5, svhClosed: true } })
    expect(w.find('[data-svh-close]').exists()).toBe(false)
    expect(w.find('[data-modal]').exists()).toBe(false)
    await w.get('[data-svh-issue]').trigger('click')
    expect(w.find('[data-modal]').exists()).toBe(true)
    expect(api.action).not.toHaveBeenCalled()
  })

  it('пока идёт закрытие, кнопка в загрузке и второй запрос не уходит', async () => {
    mount(USERS.kpp)
    let release!: () => void
    api.action.mockImplementationOnce(() => new Promise((r) => { release = () => r(caseDto()) }))
    await w.get('[data-svh-close]').trigger('click')
    confirmState.resolve(true)
    await flushPromises()
    expect(w.get('[data-svh-close]').attributes('aria-busy')).toBe('true')
    await w.get('[data-svh-close]').trigger('click')
    expect(api.action).toHaveBeenCalledTimes(1)
    release()
    await flushPromises()
  })

  it('пройденный шаг: файлы и сводка «312 400 ₸ · № 1187 · 03.10» без кнопок и зон загрузки', () => {
    mount(USERS.kpp, {
      mode: 'done',
      kase: { status: 6, svhInvoiceAmount: 312400, svhInvoiceNumber: '1187', svhInvoiceDate: '2026-10-03T00:00:00Z', svhInvoiceNote: '' },
      files: [fileDto({ id: 'a', section: 'declaration-stamp', originalFileName: 'stamp.pdf' })],
    })
    expect(w.get('[data-svh-line]').text()).toBe('Счёт выставлен: 312 400 ₸ · № 1187 · 03.10')
    expect(w.get('[data-docs-slot="declaration-stamp"]').text()).toContain('stamp.pdf')
    expect(w.find('[data-slot-upload]').exists()).toBe(false)
    expect(w.find('[data-svh-close]').exists()).toBe(false)
    expect(w.find('[data-svh-issue]').exists()).toBe(false)
  })

  it('без суммы в сводке — пояснение «следующий шаг»', () => {
    mount(USERS.kpp)
    expect(w.find('[data-svh-line]').exists()).toBe(false)
    expect(w.get('[data-svh-note]').text()).toContain('счёт СВХ')
  })
})
