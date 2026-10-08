import { describe, expect, it } from 'vitest'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ClientShipment } from '@/api/clientShipments'
import { formatMoney } from '@/ui/number'
import ShipmentTimeline from '../ShipmentTimeline.vue'

const ship = (o: Partial<ClientShipment>): ClientShipment => ({
  id: 's1', number: 'ИМ-2026-0166', cargo: 'Серверное оборудование', post: 'Нур-Жолы', status: 2, step: 3, isProblem: false,
  problemClientMessage: '', returnReason: '', senderCountryCode: '276', estimatedValue: null, currencyCode: 'EUR',
  svhInvoiceAmount: null, svhInvoiceNumber: '', paymentCheckUploaded: false, paymentConfirmed: false,
  declarationsCount: 0, assignedDeclarantName: null, createdAtUtc: '2026-09-24T09:00:00Z', updatedAtUtc: '2026-10-07T09:00:00Z', ...o,
})

const mountWith = (s: Partial<ClientShipment>, extra: { docsCount?: number; dtNumbers?: string[] } = {}) =>
  mountWithI18n(ShipmentTimeline, { props: { shipment: ship(s), docsCount: extra.docsCount ?? 3, dtNumbers: extra.dtNumbers ?? [] } })

const statesOf = (w: ReturnType<typeof mountWith>) => w.findAll('li').map((li) => li.attributes('data-state'))

describe('ShipmentTimeline', () => {
  it('шаг 3 текущий — 1–2 пройдены, 3 текущий, 4–6 впереди', () => {
    const w = mountWith({ status: 2, step: 3 })
    expect(statesOf(w)).toEqual(['done', 'done', 'current', 'todo', 'todo', 'todo'])
    expect(w.findAll('li')[2].attributes('aria-current')).toBe('step')
    expect(w.findAll('li')[2].get('[data-step-now]').text()).toBe('сейчас — работает AQNIET')
    expect(w.findAll('[data-step-title]').map((n) => n.text())).toEqual([
      'Документы', 'Прохождение границы', 'Оформление декларации и выпуск', 'Склад (СВХ) и счёт', 'Оплата склада', 'Оплата услуг AQNIET',
    ])
  })

  it('ход клиента — золотой текущий и «ваш ход»; проблема — красный', () => {
    const pay = mountWith({ status: 6, step: 5 })
    expect(statesOf(pay)[4]).toBe('currentAsk')
    expect(pay.findAll('li')[4].get('[data-step-now]').text()).toBe('сейчас — ваш ход')
    const problem = mountWith({ status: 1, step: 2, isProblem: true })
    expect(statesOf(problem)).toEqual(['done', 'currentProblem', 'todo', 'todo', 'todo', 'todo'])
    expect(problem.findAll('li')[1].get('[data-step-now]').text()).toBe('сейчас — ваш ход')
  })

  it('пояснения: число документов, номера ДТ, сумма счёта СВХ', () => {
    const w = mountWith({ status: 6, step: 5, svhInvoiceAmount: 312400 }, { docsCount: 3, dtNumbers: ['50612/021025/0012345', '50612/021025/0012346'] })
    const li = w.findAll('li')
    expect(li[0].get('[data-step-note]').text()).toBe('Документов: 3')
    expect(li[1].find('[data-step-note]').exists()).toBe(false)
    expect(li[2].get('[data-step-note]').text()).toBe('50612/021025/0012345, 50612/021025/0012346')
    expect(li[3].get('[data-step-note]').text()).toBe(`Счёт СВХ на ${formatMoney(312400)}`)
  })

  it('выполнена — все пройдены; отменена — все впереди, без «сейчас»', () => {
    expect(statesOf(mountWith({ status: 8, step: 0 }))).toEqual(Array(6).fill('done'))
    const cancelled = mountWith({ status: 9, step: 0 })
    expect(statesOf(cancelled)).toEqual(Array(6).fill('todo'))
    expect(cancelled.find('[data-step-now]').exists()).toBe(false)
  })
})
