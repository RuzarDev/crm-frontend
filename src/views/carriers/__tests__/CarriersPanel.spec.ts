import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import { confirmState } from '@/ui/confirm'
import type { CargoInsurance, Carrier, CarrierCard as CarrierCardDto, CarrierInvoice } from '@/api/carriers'

const api = vi.hoisted(() => ({
  list: vi.fn(), card: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn(), restore: vi.fn(), cases: vi.fn(),
  addInvoice: vi.fn(), updateInvoice: vi.fn(), deleteInvoice: vi.fn(), replaceInvoiceFile: vi.fn(), invoiceFile: vi.fn(),
  caseCarriers: vi.fn(), caseFreight: vi.fn(), insurance: vi.fn(), saveInsurance: vi.fn(), uploadInsuranceFile: vi.fn(),
  deleteInsuranceFile: vi.fn(), insuranceFile: vi.fn(),
}))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
const save = vi.hoisted(() => vi.fn())
vi.mock('@/api/carriers', async (orig) => ({ ...(await orig<typeof import('@/api/carriers')>()), carriersApi: api }))
vi.mock('@/api/references', () => ({ referencesApi: { listCountries: vi.fn().mockResolvedValue([{ id: 1, code: '398', name: 'Казахстан', isActive: true, alpha2: 'KZ' }]) } }))
vi.mock('@/api/tnved', () => ({ tnvedApi: { currencies: vi.fn().mockResolvedValue({ data: [{ codeLat: 'USD', name: 'Доллар США', rate: 500, updatedAtUtc: '' }] }) } }))
vi.mock('@/api/clientRegistry', async (orig) => ({ ...(await orig<typeof import('@/api/clientRegistry')>()), clientRegistryApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn() } }))
vi.mock('@/ui/message', () => ({ message: msg }))
vi.mock('@/ui/download', () => ({ saveBlob: save }))

import CarriersPanel from '../CarriersPanel.vue'
import CarrierCard from '../CarrierCard.vue'
import ShipmentTransportBlock from '../ShipmentTransportBlock.vue'

const nbsp = (s: string) => s.replace(/[  ]/g, ' ')
const carrier = (p: Partial<Carrier> = {}): Carrier => ({
  id: 'k1', clientId: 'c1', name: 'Trans Asia LLP', countryCode: '398', regNumber: '123456789012', contactName: 'Иван', phone: '+7 701',
  email: 'ops@trans.kz', address: 'Алматы',
  contractDocument: { id: 'd1', number: 'ДП-7', title: null, issuedOn: null, validUntil: '2026-10-31', status: 'expiring', daysLeft: 10, isArchived: false, fileCount: 1 },
  note: null, isArchived: false, createdAtUtc: '', updatedAtUtc: '', addedByClient: true, invoiceCount: 2, unpaidCount: 1, ...p,
})
const invoice = (p: Partial<CarrierInvoice> = {}): CarrierInvoice => ({
  id: 'i1', carrierId: 'k1', carrierName: 'Trans Asia LLP', caseId: 'case1', caseNumber: 'ИМ-2026-0001', number: 'FR-77', invoiceDate: '2026-09-12',
  amount: 1000, currency: 'USD', isPaid: false, paidOn: null, note: null, file: { fileName: 'fr.pdf', contentType: 'application/pdf', sizeBytes: 10 },
  rate: 500, amountKzt: 500000, rateOfficial: true, createdAtUtc: '', addedByClient: true, ...p,
})
const insurance = (p: Partial<CargoInsurance> = {}): CargoInsurance => ({
  caseId: 'case1', insurer: null, policyNumber: null, insuredAmount: null, insuredCurrency: null, premiumAmount: null, premiumCurrency: null,
  file: null, updatedAtUtc: null, canEdit: true, ...p,
})

let w: VueWrapper
let router: Router
beforeEach(async () => {
  setActivePinia(createPinia())
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  await router.push('/')
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})
const mount = async (component: unknown, props: Record<string, unknown>) => {
  w = mountWithI18n(component as never, { props, attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
}

describe('CarriersPanel', () => {
  it('список: название, срок договора, страна и БИН, счета; ссылка на карточку; архив', async () => {
    api.list.mockResolvedValue([carrier(), carrier({ id: 'k2', name: 'Old', contractDocument: null, isArchived: true, invoiceCount: 0, unpaidCount: 0 })])
    await mount(CarriersPanel, { clientId: 'c1', href: (id: string) => `/carriers/${id}` })
    expect(api.list).toHaveBeenCalledWith('c1', { includeArchived: false, silent: true })
    const row = w.get('[data-carrier-row="k1"]')
    expect(row.text()).toContain('Trans Asia LLP')
    expect(row.get('[data-carrier-contract-tag]').text()).toBe('договор истекает через 10 дн.')
    expect(row.text()).toContain('Казахстан · 123456789012 · счетов: 2 · не оплачено: 1')
    expect(row.attributes('href')).toBe('/carriers/k1')
    expect(w.get('[data-carrier-row="k2"]').text()).toContain('В архиве')
  })

  it('ошибка с «Повторить», пусто; только чтение — без «Добавить»', async () => {
    api.list.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce([])
    await mount(CarriersPanel, { clientId: 'c1', href: (id: string) => id, readonly: true })
    expect(w.find('[data-carriers-error]').exists()).toBe(true)
    expect(w.find('[data-carriers-add]').exists()).toBe(false)
    await w.get('[data-carriers-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-carriers-empty]').exists()).toBe(true)
  })
})

describe('CarrierCard', () => {
  const dto = (p: Partial<CarrierCardDto> = {}): CarrierCardDto => ({
    carrier: carrier(), invoices: [invoice(), invoice({ id: 'i2', number: 'FR-78', isPaid: true, paidOn: '2026-09-20', amountKzt: null, file: null, caseId: null, caseNumber: null })], ...p,
  })

  it('реквизиты, договор, счета: сумма в валюте и ≈ тенге, оплата, поставка, нет курса', async () => {
    api.card.mockResolvedValue(dto())
    await mount(CarrierCard, { clientId: 'c1', carrierId: 'k1', backTo: '/carriers' })
    expect(w.get('[data-carrier-title]').text()).toBe('Trans Asia LLP')
    expect(w.get('[data-detail="reg"]').text()).toContain('БИН/ИИН')
    expect(w.get('[data-carrier-contract-status]').text()).toBe('договор истекает через 10 дн.')
    const first = w.get('[data-invoice="i1"]')
    expect(nbsp(first.text())).toContain('№ FR-77 от 12.09.2026')
    expect(first.get('[data-invoice-status]').text()).toBe('не оплачен')
    expect(nbsp(first.get('[data-invoice-kzt]').text())).toBe('≈ 500 000 ₸')
    expect(first.get('[data-invoice-case]').attributes('href')).toBe('/import-40/case1')
    const second = w.get('[data-invoice="i2"]')
    expect(second.get('[data-invoice-status]').text()).toBe('оплачен 20.09.2026')
    expect(second.get('[data-invoice-kzt]').text()).toContain('нет курса')
    expect(nbsp(w.get('[data-invoice-totals]').text())).toContain('Всего: 500 000 ₸')
    expect(w.find('[data-invoices-no-rate]').exists()).toBe(true)
  })

  it('скачать файл счёта; удалить счёт после подтверждения', async () => {
    api.card.mockResolvedValue(dto())
    api.invoiceFile.mockResolvedValue(new Blob(['x']))
    api.deleteInvoice.mockResolvedValue(dto({ invoices: [] }))
    await mount(CarrierCard, { clientId: 'c1', carrierId: 'k1', backTo: '/carriers' })
    await w.get('[data-invoice="i1"] [data-invoice-download]').trigger('click')
    await flushPromises()
    expect(api.invoiceFile).toHaveBeenCalledWith('c1', 'k1', 'i1')
    expect(save).toHaveBeenCalledWith(expect.any(Blob), 'fr.pdf')

    await w.get('[data-invoice="i1"] [data-invoice-delete]').trigger('click')
    await flushPromises()
    confirmState.resolve(true)
    await flushPromises()
    expect(api.deleteInvoice).toHaveBeenCalledWith('c1', 'k1', 'i1')
    expect(w.find('[data-invoices-empty]').exists()).toBe(true)
  })

  it('только чтение и архив — без правки', async () => {
    api.card.mockResolvedValue(dto({ carrier: carrier({ isArchived: true }) }))
    await mount(CarrierCard, { clientId: 'c1', carrierId: 'k1', backTo: null })
    expect(w.find('[data-carrier-edit]').exists()).toBe(false)
    expect(w.find('[data-invoice-add]').exists()).toBe(false)
    expect(w.find('[data-invoice-delete]').exists()).toBe(false)
    expect(w.get('[data-carrier-archive]').text()).toContain('Вернуть')
  })
})

describe('ShipmentTransportBlock', () => {
  it('фрахт по поставке и пустая страховка; сохранение страховки', async () => {
    api.caseFreight.mockResolvedValue([invoice()])
    api.insurance.mockResolvedValue(insurance())
    api.saveInsurance.mockResolvedValue(insurance({ insurer: 'АО Страховая', policyNumber: 'POL-1', premiumAmount: 150000, premiumCurrency: 'KZT' }))
    await mount(ShipmentTransportBlock, { caseId: 'case1', clientId: 'c1', carrierHref: (id: string) => `/carriers/${id}` })
    expect(api.caseFreight).toHaveBeenCalledWith('case1')
    expect(w.get('[data-freight-carrier]').attributes('href')).toBe('/carriers/k1')
    expect(nbsp(w.get('[data-freight="i1"]').text())).toContain('1 000,00 USD')
    expect(w.find('[data-insurance-empty]').exists()).toBe(true)

    await w.get('[data-insurance-edit]').trigger('click')
    await flushPromises()
    const insurer = document.querySelector('[data-insurance-insurer] input, input[data-insurance-insurer]') as HTMLInputElement
    insurer.value = 'АО Страховая'
    insurer.dispatchEvent(new Event('input'))
    const ok = [...document.querySelectorAll('[data-insurance-modal] button')].find((b) => b.textContent?.trim() === 'Сохранить') as HTMLButtonElement
    ok.click()
    await flushPromises()
    expect(api.saveInsurance).toHaveBeenCalledWith('case1', expect.objectContaining({ insurer: 'АО Страховая' }))
    expect(w.get('[data-insurance-row="policy"]').text()).toContain('POL-1')
    expect(nbsp(w.get('[data-insurance-row="premium"]').text())).toContain('150 000,00 KZT')
  })

  it('без права менять — без кнопок', async () => {
    api.caseFreight.mockResolvedValue([])
    api.insurance.mockResolvedValue(insurance({ canEdit: false, insurer: 'X', file: { fileName: 'p.pdf', contentType: 'application/pdf', sizeBytes: 1 } }))
    await mount(ShipmentTransportBlock, { caseId: 'case1', clientId: 'c1', carrierHref: (id: string) => id })
    expect(w.find('[data-freight-empty]').exists()).toBe(true)
    expect(w.find('[data-insurance-edit]').exists()).toBe(false)
    expect(w.find('[data-insurance-upload]').exists()).toBe(false)
    expect(w.get('[data-insurance-download]').text()).toContain('p.pdf')
  })
})
