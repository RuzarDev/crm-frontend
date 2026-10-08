import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ClientShipment } from '@/api/clientShipments'
import { formatMoney } from '@/ui/number'
import ClientShipmentRow from '../ClientShipmentRow.vue'

const ship = (o: Partial<ClientShipment>): ClientShipment => ({
  id: 's1', number: 'ИМ-2026-0182', cargo: 'Ноутбуки и комплектующие', post: 'Хоргос', status: 2, step: 3, isProblem: false,
  problemClientMessage: '', returnReason: '', senderCountryCode: 'CN', estimatedValue: null, currencyCode: 'USD',
  svhInvoiceAmount: null, svhInvoiceNumber: '', paymentCheckUploaded: false, paymentConfirmed: false,
  declarationsCount: 0, assignedDeclarantName: null,
  createdAtUtc: '2026-10-01T10:00:00Z', updatedAtUtc: new Date(2026, 9, 4, 12).toISOString(), ...o,
})

let w: VueWrapper
let router: Router
const mountRow = (s: ClientShipment) => {
  w = mountWithI18n(ClientShipmentRow, { props: { shipment: s }, global: { plugins: [router] } })
  return w
}

beforeEach(async () => {
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  await router.push('/import-40')
  await router.isReady()
})
afterEach(() => w?.unmount())

describe('ClientShipmentRow', () => {
  it('поставка в работе — карточка, груз, номер · пост, этап, тег, дата', () => {
    mountRow(ship({}))
    const a = w.get('a')
    expect(a.attributes('href')).toBe('/import-40/s1')
    expect(a.classes()).toContain('bg-surface')
    expect(w.text()).toContain('Ноутбуки и комплектующие')
    expect(w.get('.font-mono').text()).toBe('ИМ-2026-0182')
    expect(w.text()).toContain('ИМ-2026-0182 · Хоргос')
    expect(w.get('[data-row-caption]').text()).toBe('Оформление декларации и выпуск')
    expect(w.text()).toContain('Оформляем')
    expect(w.text()).toContain('04.10')
    expect(w.findAll('[data-seg]').map((s) => s.attributes('data-seg'))).toEqual(['done', 'done', 'current', 'todo', 'todo', 'todo'])
  })

  it('черновик — ссылка в мастер', () => {
    mountRow(ship({ id: 'd1', status: 0, step: 1, cargo: '' }))
    expect(w.get('a').attributes('href')).toBe('/import-40/new/d1')
    expect(w.text()).toContain('Груз не указан')
    expect(w.text()).toContain('Черновик')
    expect(w.get('[data-row-caption]').text()).toBe('Черновик не отправлен')
  })

  it('счёт СВХ без чека — «Ждём оплату склада», золотой фон, пятый сегмент золотой, «Этап 5 из 6»', () => {
    mountRow(ship({ status: 6, step: 5, svhInvoiceAmount: 312400 }))
    const a = w.get('a')
    expect(a.attributes('href')).toBe('/import-40/s1')
    expect(a.classes()).toEqual(expect.arrayContaining(['bg-gold-soft', 'border-gold-line']))
    expect(a.classes()).not.toContain('bg-surface')
    expect(w.get('.bg-tone-wait-bg').text()).toBe('Ждём оплату склада')
    expect(w.get('[data-row-caption]').text()).toBe(`Оплатите склад — счёт СВХ на ${formatMoney(312400)}`)
    expect(w.get('a').classes().join(' ')).toContain('13.5rem')
    expect(w.findAll('[data-seg]')[4].classes()).toContain('bg-gold')
    const label = w.get('[data-step-label]')
    expect(label.classes()).toContain('sr-only')
    expect(label.text()).toBe('Этап 5 из 6 · Оплата склада')
    expect(w.get('[data-seg]').element.parentElement!.getAttribute('aria-hidden')).toBe('true')
    expect(w.text()).toContain(formatMoney(312400))
  })

  it('счёт СВХ без известной суммы — подпись «Оплатите склад»', () => {
    mountRow(ship({ status: 6, step: 5, svhInvoiceAmount: null }))
    expect(w.get('[data-row-caption]').text()).toBe('Оплатите склад')
  })

  it('проблема — красный тег и сегмент', () => {
    mountRow(ship({ status: 1, step: 2, isProblem: true }))
    expect(w.get('.bg-tone-danger-bg').text()).toBe('Нужен ответ')
    expect(w.findAll('[data-seg]')[1].classes()).toContain('bg-danger')
  })

  it('завершённая — все сегменты пройдены, подпись с датой', () => {
    mountRow(ship({ status: 8, step: 6 }))
    expect(w.findAll('[data-seg]').every((s) => s.classes().includes('bg-zircon'))).toBe(true)
    expect(w.get('[data-row-caption]').text()).toBe('Закрыта 04.10')
    expect(w.get('[data-step-label]').text()).toBe('Завершена')
  })
})
