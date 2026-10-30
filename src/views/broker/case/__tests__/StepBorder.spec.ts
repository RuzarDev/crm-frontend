import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import type { Import40CaseDto } from '@/api/import40'
import { confirmState } from '@/ui/confirm'
import type { CaseAuth } from '../casePermissions'
import { USERS, caseDto, fileDto } from './caseFixture'
import { mountStep } from './stepHarness'

const api = vi.hoisted(() => ({ action: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/import40', () => ({ import40Api: api }))
vi.mock('@/ui/message', () => ({ message: msg }))

import StepBorder from '../steps/StepBorder.vue'

let w: VueWrapper
const scan = fileDto({ id: 's1', section: 'border-scans', originalFileName: 'cmr.pdf', docKind: 'cmr', uploadedByBusinessRole: 'kpp' })
// Окна прибытия и контроля — заглушка с кнопкой «ОК» (поля внутри — настоящие Z).
const ModalStub = {
  props: ['open', 'confirmLoading'], emits: ['ok', 'update:open'],
  template: '<div v-if="open" data-modal><slot /><button data-ok type="button" @click="$emit(\'ok\')" /></div>',
}
const mount = (user: CaseAuth, kase: Partial<Import40CaseDto> = {}, mode: 'current' | 'done' = 'current', files = [scan]) => {
  const m = mountStep(StepBorder, { user, step: 2, mode, kase: { status: 1, ...kase }, files, stubs: { ZModal: ModalStub } })
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
    expect(confirmState.content).toBe('Прибытие машины не отмечено — оно будет отмечено тем же временем.')
    expect(confirmState.cancelText).toBe('Отмена')
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

  it('S-24 + ревью I-2: декларант (право import40.kpp) — весь шаг 2 одним правилом: без КПП доступен, при назначенном — нет', () => {
    mount(USERS.declarant)
    expect(w.get('[data-border-arrived]').attributes('disabled')).toBeUndefined()
    expect(w.get('[data-border-passed]').attributes('disabled')).toBeUndefined()
    w.unmount()
    mount(USERS.declarant, { assignedKppId: 'k9', assignedKppName: 'Ерлан Б.' })
    expect(w.get('[data-border-arrived]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-border-passed]').attributes('disabled')).toBeDefined()
    expect(tipOf('[data-border-passed]')).toBe('Заявку ведёт Ерлан Б.')
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

  it('без сканов — мягкое предупреждение «Всё равно продолжить», затем border-passed', async () => {
    mount(USERS.kpp, { borderArrivedAtUtc: '2026-10-18T09:20:00Z', borderArrivalPost: 'Хоргос' }, 'current', [])
    await w.get('[data-border-passed]').trigger('click')
    expect(confirmState.title).toBe('Сканы с границы не загружены — декларант их ждёт?')
    expect(confirmState.okText).toBe('Всё равно продолжить')
    expect(confirmState.content).toBeUndefined()
    confirmState.resolve(true)
    await flushPromises()
    expect(api.action).toHaveBeenCalledWith('c1', 'border-passed', undefined, undefined)
  })

  it('«Машина прибыла»: окно со временем «сейчас» и постом заявки, отправка border-arrived', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 18, 14, 20))
    try {
      mount(USERS.kpp)
      expect(w.get('[data-border-arrival]').attributes('data-arrived')).toBe('no')
      await w.get('[data-border-arrived]').trigger('click')
      const modal = w.get('[data-border-arrival-modal]')
      expect((modal.get('[data-arrival-time] input, input[data-arrival-time]').element as HTMLInputElement).value).toBe('14:20')
      expect((modal.get('[data-arrival-post] input, input[data-arrival-post]').element as HTMLInputElement).value).toBe('Хоргос — ЦТО')
      await modal.get('[data-arrival-comment] input, input[data-arrival-comment]').setValue('очередь')
      await modal.get('[data-ok]').trigger('click')
      await flushPromises()
      expect(api.action).toHaveBeenCalledWith('c1', 'border-arrived', 'очередь',
        { date: new Date(2026, 9, 18, 14, 20).toISOString(), post: 'Хоргос — ЦТО' })
      expect(msg.success).toHaveBeenCalledWith('Прибытие машины отмечено')
    } finally {
      vi.useRealTimers()
    }
  })

  it('«Машина прибыла»: время в будущем — ошибка у поля, запроса нет', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 18, 14, 20))
    try {
      mount(USERS.kpp)
      await w.get('[data-border-arrived]').trigger('click')
      const modal = w.get('[data-border-arrival-modal]')
      await modal.get('[data-arrival-time] input, input[data-arrival-time]').setValue('18:00')
      await modal.get('[data-ok]').trigger('click')
      await flushPromises()
      expect(api.action).not.toHaveBeenCalled()
      expect(modal.text()).toContain('Время не может быть в будущем')
    } finally {
      vi.useRealTimers()
    }
  })

  it('прибытие отмечено: строка «Прибыла … · пост …», комментарий, отмена с подтверждением', async () => {
    const at = new Date(2026, 9, 18, 14, 20).toISOString()
    mount(USERS.kpp, { borderArrivedAtUtc: at, borderArrivalPost: 'Нур Жолы', borderArrivalNote: 'очередь' })
    expect(w.find('[data-border-arrived]').exists()).toBe(false)
    expect(w.get('[data-arrival-text]').text()).toBe('Прибыла 18.10 в 14:20 · пост Нур Жолы')
    expect(w.get('[data-arrival-note]').text()).toBe('очередь')
    await w.get('[data-arrival-cancel]').trigger('click')
    expect(confirmState.title).toBe('Отменить отметку «Машина прибыла»?')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.action).toHaveBeenCalledWith('c1', 'border-arrived-cancel', undefined, undefined)
  })

  it('чек-лист контролей: отмеченный — со временем и удалением, «Отметить» открывает окно и шлёт border-control', async () => {
    const at = new Date(2026, 9, 18, 15, 5).toISOString()
    mount(USERS.kpp, { borderControls: [{ id: 'bc1', kind: 'phyto', text: null, atUtc: at, userName: 'Ерлан Б.' }] })
    const phyto = w.get('[data-control-row="phyto"]')
    expect(phyto.attributes('data-done')).toBe('yes')
    expect(phyto.get('[data-control-done]').text()).toBe('18.10 в 15:05 · Ерлан Б.')
    expect(phyto.find('[data-control-mark]').exists()).toBe(false)
    expect(w.findAll('[data-control-row]')).toHaveLength(6)

    await w.get('[data-control-row="veterinary"] [data-control-mark]').trigger('click')
    await w.get('[data-border-control-modal] [data-ok]').trigger('click')
    await flushPromises()
    expect(api.action).toHaveBeenCalledWith('c1', 'border-control', 'veterinary', expect.objectContaining({ clientMessage: null }))

    // «Другое» без текста — ошибка у поля; с текстом — уходит в clientMessage.
    api.action.mockClear()
    await w.get('[data-control-row="other"] [data-control-mark]').trigger('click')
    const modal = w.get('[data-border-control-modal]')
    await modal.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.action).not.toHaveBeenCalled()
    await modal.get('[data-control-text] input, input[data-control-text]').setValue('радиационный')
    await modal.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.action).toHaveBeenCalledWith('c1', 'border-control', 'other', expect.objectContaining({ clientMessage: 'радиационный' }))

    await phyto.get('[data-control-remove]').trigger('click')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.action).toHaveBeenCalledWith('c1', 'border-control-remove', 'bc1', undefined)
  })

  it('декларант (право import40.kpp) при назначенном КПП не отмечает прибытие и не грузит сканы; КПП без назначения — грузит', () => {
    mount(USERS.declarant, { assignedKppId: 'k9', assignedKppName: 'Ерлан Б.' })
    expect(w.get('[data-border-arrived]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-control-mark]').exists()).toBe(false)
    expect(w.get('[data-docs-slot="border-scans"]').find('[data-slot-upload]').exists()).toBe(false)
    w.unmount()
    mount(USERS.kpp)
    expect(w.get('[data-border-arrived]').attributes('disabled')).toBeUndefined()
    expect(w.get('[data-docs-slot="border-scans"]').find('[data-slot-upload]').exists()).toBe(true)
    expect(w.get('[data-docs-slot="border-scans"] [data-slot-file-kind]').text()).toBe('CMR с отметками')
  })

  it('КПП назначен другой: «Машина прибыла» выключена у прочих КПП, руководителю доступна', () => {
    mount(USERS.kpp, { assignedKppId: 'k9', assignedKppName: 'Ерлан Б.' })
    expect(w.get('[data-border-arrived]').attributes('disabled')).toBeDefined()
    expect(tipOf('[data-border-arrived]')).toBe('Заявку ведёт Ерлан Б.')
    w.unmount()
    mount(USERS.rop, { assignedKppId: 'k9', assignedKppName: 'Ерлан Б.' })
    expect(w.get('[data-border-arrived]').attributes('disabled')).toBeUndefined()
  })

  it('пройденный шаг (mode done): только сводка транспорта, без кнопок', () => {
    mount(USERS.kpp, { status: 2 }, 'done', [])
    expect(w.find('[data-border-passed]').exists()).toBe(false)
    expect(w.get('[data-border-done]').text()).toContain('Авто · 777 KTA 02')
  })

  it('пройденный шаг: прибытие, контроли и сканы — только чтение', () => {
    const at = new Date(2026, 9, 18, 14, 20).toISOString()
    mount(USERS.kpp, {
      status: 2, borderArrivedAtUtc: at, borderArrivalPost: 'Хоргос',
      borderControls: [{ id: 'bc1', kind: 'phyto', text: null, atUtc: at, userName: null }],
    }, 'done')
    expect(w.get('[data-border-done] [data-arrival-text]').text()).toBe('Прибыла 18.10 в 14:20 · пост Хоргос')
    expect(w.get('[data-done-controls]').text()).toBe('Фитосанитарный контроль (18.10 в 14:20)')
    expect(w.get('[data-docs-slot="border-scans"]').find('[data-slot-upload]').exists()).toBe(false)
  })
})
