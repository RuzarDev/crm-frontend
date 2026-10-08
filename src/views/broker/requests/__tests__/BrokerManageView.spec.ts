import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ManageCase, ManageOverview } from '@/api/manage'

const api = vi.hoisted(() => ({
  overview: vi.fn(), update: vi.fn(), action: vi.fn(), toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/manage', () => ({ manageApi: { overview: api.overview } }))
vi.mock('@/api/import40', async (orig) => ({
  ...(await orig<typeof import('@/api/import40')>()),
  import40Api: { update: api.update, action: api.action },
}))
vi.mock('@/ui/message', () => ({ message: api.toast }))

import BrokerManageView from '../BrokerManageView.vue'

const GUID_EMPTY = '00000000-0000-0000-0000-000000000000'
const c = (o: Partial<ManageCase>): ManageCase => ({
  id: 'c1', number: 'ИМ-2026-0001', clientName: 'ТОО Альфа', cargo: 'кабель', post: 'Нур-Жолы', status: 2, isProblem: false, problemNote: '',
  assignedKppId: null, assignedDeclarantId: null, createdAtUtc: '2026-10-01T08:00:00Z', updatedAtUtc: '2026-10-08T08:00:00Z',
  daysInWork: 3, daysSinceUpdate: 0, declarationsCount: 0,
  ...o,
})
const overviewOf = (cases: ManageCase[]): ManageOverview => ({
  cases,
  staff: [
    { id: 'd1', username: 'aigerim', displayName: 'Айгерим Касымова', roles: ['declarant'] },
    { id: 'k1', username: 'erlan', displayName: null, roles: ['kpp'] },
    { id: 'd2', username: 'daniyar', displayName: 'Данияр С.', roles: ['declarant'] },
    { id: 's1', username: 'sales', displayName: 'Продажи', roles: ['sales'] },
  ],
  unassigned: 0, problems: 0, stale: 0, clientDrafts: 4,
})
const CASES = [
  c({ id: 'a', number: 'ИМ-2026-0001', status: 2 }), // нужен декларант
  c({ id: 'b', number: 'ИМ-2026-0002', status: 3, assignedDeclarantId: 'd1', isProblem: true, problemNote: 'нет инвойса', daysSinceUpdate: 6 }),
  c({ id: 'e', number: 'ИМ-2026-0003', status: 1, clientName: 'ТОО Бета', cargo: 'плитка' }), // нужен КПП
  c({ id: 'f', number: 'ИМ-2026-0004', status: 4, assignedKppId: 'k1', assignedDeclarantId: 'd1' }),
]

// Настоящий ZSelect (Reka) тяжёл для проверки назначения — заменяем полем с вариантами и «очистить».
const SelectStub = {
  props: ['value', 'options', 'placeholder'], emits: ['change'],
  template: `<div :data-value="value ?? ''"><span data-ph>{{ placeholder }}</span>
    <button v-for="o in options" :key="o.value" type="button" :data-opt="o.value" @click="$emit('change', o.value)">{{ o.label }}</button>
    <button type="button" data-clear @click="$emit('change', null)">x</button></div>`,
}

let w: VueWrapper
const mountView = async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  await router.push('/import-40/manage')
  await router.isReady()
  w = mountWithI18n(BrokerManageView, { attachTo: document.body, global: { plugins: [router], stubs: { ZSelect: SelectStub } } })
  await flushPromises()
}
const numbers = () => w.findAll('[data-manage-link]').map((n) => n.text())
const segments = () => w.findAll('[data-manage-segments] button').map((b) => b.text())
const pick = async (label: string) => {
  await w.findAll('[data-manage-segments] button').find((b) => b.text().startsWith(label))!.trigger('click')
  await flushPromises()
}
const rowOf = (n: string) => w.findAll('tbody tr').find((r) => r.text().includes(n))!

beforeEach(() => {
  api.overview.mockImplementation(async () => overviewOf(structuredClone(CASES)))
  api.update.mockResolvedValue({})
  api.action.mockResolvedValue({})
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('BrokerManageView', () => {
  it('грузит тихо; заголовок, подзаголовок, черновики клиентов, сегменты со счётчиками', async () => {
    await mountView()
    expect(api.overview).toHaveBeenCalledWith({ silent: true })
    expect(w.get('h1').text()).toBe('Распределение')
    expect(w.text()).toContain('Назначьте декларанта и КПП — заявка попадёт в их «Мои»')
    expect(w.get('[data-manage-drafts]').text()).toBe('У клиентов — черновиков: 4')
    expect(segments()).toEqual(['Без декларанта 1', 'Без КПП 1', 'С проблемой 1', 'Зависли 1', 'Все активные 4'])
  })

  it('сегмент по умолчанию — первый непустой; переключение и поиск', async () => {
    await mountView()
    expect(numbers()).toEqual(['ИМ-2026-0001'])
    await pick('Без КПП')
    expect(numbers()).toEqual(['ИМ-2026-0003'])
    await pick('Все активные')
    expect(numbers()).toHaveLength(4)
    await w.get('[data-manage-search]').setValue('плитка')
    await flushPromises()
    expect(numbers()).toEqual(['ИМ-2026-0003'])
  })

  it('если всё назначено — по умолчанию «Все активные»', async () => {
    api.overview.mockResolvedValue(overviewOf([c({ id: 'x', status: 2, assignedDeclarantId: 'd1' })]))
    await mountView()
    expect(numbers()).toEqual(['ИМ-2026-0001'])
    expect(w.get('[data-manage-segments] [data-state="on"]').text()).toContain('Все активные')
  })

  it('строка: клиент · груз, этап и шаг, проблема с заметкой, «обновлена n дн. назад»', async () => {
    await mountView()
    await pick('Все активные')
    const r = rowOf('ИМ-2026-0002').text()
    expect(r).toContain('ТОО Альфа · кабель')
    expect(r).toContain('3/6')
    expect(r).toContain('проблема')
    expect(r).toContain('нет инвойса')
    expect(r).toContain('обновлена 6 дн. назад')
    expect(rowOf('ИМ-2026-0001').text()).not.toContain('обновлена')
  })

  it('«Назначить» — только у пустого поля, нужного на этом шаге', async () => {
    await mountView()
    await pick('Все активные')
    const ph = (n: string, cell: string) => rowOf(n).get(`[data-manage-${cell}] [data-ph]`).text()
    expect(ph('ИМ-2026-0001', 'declarant')).toBe('Назначить') // шаг 2: декларант нужен
    expect(ph('ИМ-2026-0001', 'kpp')).toBe('—') // КПП на этом шаге не нужен
    expect(ph('ИМ-2026-0003', 'kpp')).toBe('Назначить') // шаг 1: нужен КПП
    expect(ph('ИМ-2026-0003', 'declarant')).toBe('—')
  })

  it('опции — сотрудники по ролям, имя или логин', async () => {
    await mountView()
    const opts = (cell: string) => rowOf('ИМ-2026-0001').findAll(`[data-manage-${cell}] [data-opt]`).map((b) => b.text())
    expect(opts('declarant')).toEqual(['Айгерим Касымова', 'Данияр С.'])
    expect(opts('kpp')).toEqual(['erlan'])
  })

  it('смена декларанта вызывает update с полем, тост, строка и счётчики обновляются на месте', async () => {
    await mountView()
    await rowOf('ИМ-2026-0001').get('[data-manage-declarant] [data-opt="d2"]').trigger('click')
    await flushPromises()
    expect(api.update).toHaveBeenCalledWith('a', { assignedDeclarantId: 'd2' })
    expect(api.toast.success).toHaveBeenCalledWith('Назначение сохранено')
    expect(api.overview).toHaveBeenCalledTimes(1) // без перезагрузки
    expect(segments()[0]).toBe('Без декларанта 0')
    expect(numbers()).toEqual([]) // назначенная заявка ушла из сегмента
    await pick('Все активные')
    expect(rowOf('ИМ-2026-0001').get('[data-manage-declarant]').attributes('data-value')).toBe('d2')
  })

  it('очистка отправляет Guid.Empty; КПП — своё поле', async () => {
    await mountView()
    await pick('Все активные')
    await rowOf('ИМ-2026-0002').get('[data-manage-declarant] [data-clear]').trigger('click')
    await flushPromises()
    expect(api.update).toHaveBeenCalledWith('b', { assignedDeclarantId: GUID_EMPTY })
    await rowOf('ИМ-2026-0003').get('[data-manage-kpp] [data-opt="k1"]').trigger('click')
    await flushPromises()
    expect(api.update).toHaveBeenCalledWith('e', { assignedKppId: 'k1' })
    expect(segments()[1]).toBe('Без КПП 0')
    expect(segments()[0]).toBe('Без декларанта 2') // у «b» декларанта сняли — а шаг его требует
  })

  it('отказ сервера: назначение не меняется, тоста успеха нет', async () => {
    api.update.mockRejectedValueOnce(new Error('403'))
    await mountView()
    await rowOf('ИМ-2026-0001').get('[data-manage-declarant] [data-opt="d1"]').trigger('click')
    await flushPromises()
    expect(api.toast.success).not.toHaveBeenCalled()
    expect(segments()[0]).toBe('Без декларанта 1')
    expect(numbers()).toEqual(['ИМ-2026-0001'])
  })

  it('«Снять» вызывает clear-problem без подтверждения и перезагружает', async () => {
    await mountView()
    await pick('С проблемой')
    await w.get('[data-manage-clear]').trigger('click')
    await flushPromises()
    expect(api.action).toHaveBeenCalledWith('b', 'clear-problem')
    expect(api.toast.success).toHaveBeenCalledWith('Проблема снята')
    expect(api.overview).toHaveBeenCalledTimes(2)
  })

  it('панель «Загрузка»: декларанты и КПП по убыванию, заявка с двумя ролями одного человека — один раз, остальные роли не показываются', async () => {
    await mountView()
    const rows = w.findAll('[data-manage-load-row]').map((r) => r.text())
    // d1: заявки b и f → 2; k1: f → 1; d2: 0; sales — не в панели
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain('Айгерим Касымова')
    expect(rows[0]).toContain('декларант')
    expect(rows[0]).toContain('2')
    expect(rows[1]).toContain('erlan')
    expect(rows[1]).toContain('1')
    expect(rows[2]).toContain('Данияр С.')
    const bars = w.findAll('[data-manage-load-bar]').map((b) => b.attributes('style'))
    expect(bars[0]).toContain('width: 100%')
    expect(bars[2]).toContain('width: 0%')
  })

  it('полоса золотая от 10 активных заявок', async () => {
    const many = Array.from({ length: 10 }, (_, i) => c({ id: `m${i}`, number: `ИМ-${i}`, status: 3, assignedDeclarantId: 'd1' }))
    api.overview.mockResolvedValue(overviewOf(many))
    await mountView()
    expect(w.get('[data-manage-load-bar]').classes()).toContain('bg-gold')
    expect(w.get('[data-manage-load-count]').classes()).toContain('text-gold-ink')
  })

  it('нет сотрудников с рабочими ролями — подсказка', async () => {
    api.overview.mockResolvedValue({ ...overviewOf(CASES), staff: [] })
    await mountView()
    expect(w.get('[data-manage-load-empty]').text()).toBe('Нет сотрудников с ролями декларант/КПП')
  })

  it('ошибка загрузки — блок с «Повторить»; повтор загружает', async () => {
    api.overview.mockRejectedValueOnce(new Error('500'))
    await mountView()
    expect(w.find('[data-manage-error]').exists()).toBe(true)
    expect(w.find('[data-manage-table]').exists()).toBe(false)
    await w.get('[data-manage-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-manage-error]').exists()).toBe(false)
    expect(numbers()).toEqual(['ИМ-2026-0001'])
  })

  it('«Обновить» перезагружает; пустой сегмент — ZEmpty', async () => {
    api.overview.mockResolvedValue(overviewOf([]))
    await mountView()
    expect(w.text()).toContain('Активных заявок нет')
    await w.get('[data-manage-refresh]').trigger('click')
    await flushPromises()
    expect(api.overview).toHaveBeenCalledTimes(2)
  })
})
