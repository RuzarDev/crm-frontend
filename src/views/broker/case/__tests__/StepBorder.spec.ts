import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import type { Import40CaseDto } from '@/api/import40'
import { confirmState } from '@/ui/confirm'
import type { CaseAuth } from '../casePermissions'
import { USERS, caseDto } from './caseFixture'
import { mountStep } from './stepHarness'

const api = vi.hoisted(() => ({ action: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/import40', () => ({ import40Api: api }))
vi.mock('@/ui/message', () => ({ message: msg }))

import StepBorder from '../steps/StepBorder.vue'

let w: VueWrapper
const mount = (user: CaseAuth, kase: Partial<Import40CaseDto> = {}, mode: 'current' | 'done' = 'current') => {
  const m = mountStep(StepBorder, { user, step: 2, mode, kase: { status: 1, ...kase } })
  w = m.w
  return m
}
const tipOf = (selector: string) => w.get(selector).element.closest('[data-tip]')!.getAttribute('data-title')

beforeEach(() => { api.action.mockResolvedValue(caseDto({ status: 2 })) })
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('StepBorder', () => {
  it('сводка транспорта и контейнеры в теле шага', () => {
    mount(USERS.kpp, { containers: [{ id: 'k1', containerNumber: 'MRSU 488584 9', containerType: '40HC', notes: '' }] })
    expect(w.get('[data-border-transport]').text()).toBe('Авто · 777 KTA 02 / прицеп 12 KZ 3456')
    expect(w.get('[data-draft-container]').text()).toContain('MRSU 488584 9')
  })

  it('«Граница пройдена»: подтверждение, затем действие border-passed с прежним телом и тост', async () => {
    mount(USERS.kpp)
    await w.get('[data-border-passed]').trigger('click')
    expect(confirmState.title).toBe('Отметить, что граница пройдена?')
    expect(api.action).not.toHaveBeenCalled()
    confirmState.resolve(true)
    await flushPromises()
    expect(api.action).toHaveBeenCalledWith('c1', 'border-passed', undefined, undefined)
    expect(msg.success).toHaveBeenCalledWith('Граница отмечена пройденной')
  })

  it('отказ в подтверждении — действия нет', async () => {
    mount(USERS.kpp)
    await w.get('[data-border-passed]').trigger('click')
    confirmState.resolve(false)
    await flushPromises()
    expect(api.action).not.toHaveBeenCalled()
  })

  it('шаг ведёт другой КПП: кнопка выключена, подсказка «Заявку ведёт …»; руководитель не блокируется', async () => {
    mount(USERS.kpp, { assignedKppId: 'k9', assignedKppName: 'Ерлан Б.' })
    expect(w.get('[data-border-passed]').attributes('disabled')).toBeDefined()
    expect(tipOf('[data-border-passed]')).toBe('Заявку ведёт Ерлан Б.')
    w.unmount()
    mount(USERS.rop, { assignedKppId: 'k9', assignedKppName: 'Ерлан Б.' })
    expect(w.get('[data-border-passed]').attributes('disabled')).toBeUndefined()
  })

  it('без права КПП (бухгалтер): кнопки выключены, подсказка «Действие выполняет КПП»', () => {
    mount(USERS.accountant)
    expect(w.get('[data-border-passed]').attributes('disabled')).toBeDefined()
    expect(tipOf('[data-border-passed]')).toBe('Действие выполняет КПП')
    expect(w.get('[data-border-return]').attributes('disabled')).toBeDefined()
    expect(tipOf('[data-border-return]')).toBe('Действие выполняет КПП')
  })

  it('«Вернуть клиенту» открывает окно причины', async () => {
    const m = mount(USERS.kpp)
    await w.get('[data-border-return]').trigger('click')
    expect((m.w.vm as unknown as { reasonKind: string }).reasonKind).toBe('return')
  })

  it('пока идёт действие, кнопка в загрузке и повторное нажатие не шлёт второй запрос', async () => {
    mount(USERS.kpp)
    let release!: () => void
    api.action.mockImplementationOnce(() => new Promise((r) => { release = () => r(caseDto()) }))
    await w.get('[data-border-passed]').trigger('click')
    confirmState.resolve(true)
    await flushPromises()
    expect(w.get('[data-border-passed]').attributes('aria-busy')).toBe('true')
    await w.get('[data-border-passed]').trigger('click')
    expect(api.action).toHaveBeenCalledTimes(1)
    release()
    await flushPromises()
  })

  it('пройденный шаг (mode done): только сводка транспорта, без кнопок', () => {
    mount(USERS.kpp, { status: 2 }, 'done')
    expect(w.find('[data-border-passed]').exists()).toBe(false)
    expect(w.get('[data-border-done]').text()).toContain('Авто · 777 KTA 02')
  })
})
