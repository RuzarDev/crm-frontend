import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { CarrierCard as CarrierCardDto } from '@/api/carriers'
import { card as contractCard } from './contractFixture'

const api = vi.hoisted(() => ({ contract: vi.fn(), carrier: vi.fn() }))
vi.mock('@/api/foreignContracts', async (orig) => ({ ...(await orig<typeof import('@/api/foreignContracts')>()), foreignContractsApi: { card: api.contract } }))
vi.mock('@/api/carriers', async (orig) => ({ ...(await orig<typeof import('@/api/carriers')>()), carriersApi: { card: api.carrier } }))
vi.mock('@/api/references', () => ({ referencesApi: { listCountries: vi.fn().mockResolvedValue([]) } }))

import ContractCard from '../ContractCard.vue'
import CarrierCard from '@/views/carriers/CarrierCard.vue'

// Решение владельца 05.11.2026: у бухгалтера страницы контракта и перевозчика только для просмотра, номера ДТ и заявок — текстом.
const carrierCard = (): CarrierCardDto => ({
  carrier: {
    id: 'r1', clientId: 'c1', name: 'Trans Asia LLP', countryCode: '398', regNumber: null, contactName: null, phone: null, email: null, address: null,
    contractDocument: null, note: null, isArchived: false, createdAtUtc: '2026-01-01T00:00:00Z', updatedAtUtc: '2026-01-01T00:00:00Z',
    addedByClient: false, invoiceCount: 1, unpaidCount: 1,
  },
  invoices: [{
    id: 'i1', carrierId: 'r1', carrierName: 'Trans Asia LLP', caseId: 'case1', caseNumber: 'ИМ-2026-0001', number: '7', invoiceDate: '2026-09-01', amount: 100, currency: 'KZT',
    isPaid: false, paidOn: null, note: null, file: null, rate: null, amountKzt: 100, rateOfficial: true, createdAtUtc: '2026-09-01T00:00:00Z', addedByClient: false,
  }],
})

let w: VueWrapper
let router: Router
beforeEach(async () => {
  setActivePinia(createPinia())
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  await router.push('/')
  api.contract.mockResolvedValue(contractCard())
  api.carrier.mockResolvedValue(carrierCard())
})
afterEach(() => { w?.unmount() })

const contract = async (props: Record<string, unknown>) => {
  w = mountWithI18n(ContractCard, { props: { clientId: 'c1', contractId: 'k1', backTo: '/x', dtLinks: true, ...props }, global: { plugins: [router] } })
  await flushPromises()
}
const carrier = async (props: Record<string, unknown>) => {
  w = mountWithI18n(CarrierCard, { props: { clientId: 'c1', carrierId: 'r1', backTo: '/x', ...props }, global: { plugins: [router] } })
  await flushPromises()
}

describe('контракт', () => {
  it('просмотр: нет «Изменить», «В архив», оплат; номер ДТ — текст', async () => {
    await contract({ readonly: true, caseLinks: false })
    for (const sel of ['[data-contract-edit]', '[data-contract-archive]', '[data-payment-add]']) expect(w.find(sel).exists()).toBe(false)
    const row = w.get('[data-shipment="d1"]')
    expect(row.find('a').exists()).toBe(false)
    expect(row.get('[data-shipment-plain]').text()).toBe('50101/101026/0000001')
  })

  it('сотрудник Импорта 40: действия на месте, номер ДТ — ссылка на ДТ', async () => {
    await contract({})
    for (const sel of ['[data-contract-edit]', '[data-contract-archive]', '[data-payment-add]']) expect(w.find(sel).exists()).toBe(true)
    expect(w.get('[data-shipment="d1"] a').attributes('href')).toBe('/import-40/case1/dt/d1')
  })
})

describe('перевозчик', () => {
  it('просмотр: нет правки, номер заявки — текст', async () => {
    await carrier({ readonly: true, caseLinks: false })
    for (const sel of ['[data-carrier-edit]', '[data-carrier-archive]', '[data-invoice-add]', '[data-invoice-case]']) expect(w.find(sel).exists()).toBe(false)
    expect(w.get('[data-invoice-case-plain]').text()).toContain('ИМ-2026-0001')
  })

  it('сотрудник Импорта 40: действия на месте, номер заявки — ссылка', async () => {
    await carrier({})
    for (const sel of ['[data-carrier-edit]', '[data-carrier-archive]', '[data-invoice-add]']) expect(w.find(sel).exists()).toBe(true)
    expect(w.get('[data-invoice-case]').attributes('href')).toBe('/import-40/case1')
  })
})
