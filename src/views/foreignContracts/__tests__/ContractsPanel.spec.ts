import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import { confirmState } from '@/ui/confirm'
import { card, contract } from './contractFixture'

const api = vi.hoisted(() => ({
  list: vi.fn(), card: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn(), restore: vi.fn(), addPayment: vi.fn(),
  deletePayment: vi.fn(), xlsx: vi.fn(), caseCheck: vi.fn(), linkCase: vi.fn(), linkDeclaration: vi.fn(),
}))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
const save = vi.hoisted(() => vi.fn())
vi.mock('@/api/foreignContracts', async (orig) => ({ ...(await orig<typeof import('@/api/foreignContracts')>()), foreignContractsApi: api }))
vi.mock('@/api/references', () => ({ referencesApi: { listCountries: vi.fn().mockResolvedValue([{ id: 1, code: '156', name: 'Китай', isActive: true, alpha2: 'CN' }]) } }))
vi.mock('@/api/tnved', () => ({ tnvedApi: { currencies: vi.fn().mockResolvedValue({ data: [{ codeLat: 'USD', name: 'Доллар США', rate: 500, updatedAtUtc: '' }] }) } }))
vi.mock('@/api/clientRegistry', async (orig) => ({ ...(await orig<typeof import('@/api/clientRegistry')>()), clientRegistryApi: { list: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/ui/message', () => ({ message: msg }))
vi.mock('@/ui/download', () => ({ saveBlob: save }))

import ContractsPanel from '../ContractsPanel.vue'
import ContractCard from '../ContractCard.vue'
import CaseContractBlock from '../CaseContractBlock.vue'
import DtContractBlock from '../DtContractBlock.vue'
import ContractModal from '../ContractModal.vue'
import { fieldsOf } from '../contracts'

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

describe('ContractsPanel', () => {
  it('список: номер и дата, поставщик, остаток, срочный срок; ссылка на карточку', async () => {
    api.list.mockResolvedValue([
      contract(),
      contract({ id: 'k2', number: 'X-2', deadlines: [], unkNumber: null, isArchived: true }),
    ])
    await mount(ContractsPanel, { clientId: 'c1', href: (id: string) => `/contracts/${id}` })
    expect(api.list).toHaveBeenCalledWith('c1', { includeArchived: false, silent: true })
    const row = w.get('[data-contract-row="k1"]')
    expect(row.text()).toContain('№ FC-1 от 15.01.2026')
    expect(row.text()).toContain('Shenzhen Supplier · УНК 26010001/0001/1/1')
    expect(row.get('[data-contract-urgent]').text()).toBe('Срок репатриации · через 15 дн.')
    expect(row.get('[data-contract-remaining]').text()).toMatch(/Остаток 89\s000,00 USD из 100\s000,00 USD/)
    expect(row.attributes('href')).toBe('/contracts/k1')
    expect(w.get('[data-contracts-attention]').text()).toBe('Сроки подходят по контрактам: 1')
    expect(w.get('[data-contract-row="k2"]').text()).toContain('В архиве')
  })

  it('пусто и ошибка с «Повторить»', async () => {
    api.list.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce([])
    await mount(ContractsPanel, { clientId: 'c1', href: (id: string) => id })
    expect(w.find('[data-contracts-error]').exists()).toBe(true)
    await w.get('[data-contracts-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-contracts-empty]').exists()).toBe(true)
  })

  it('только чтение — без «Добавить»', async () => {
    api.list.mockResolvedValue([])
    await mount(ContractsPanel, { clientId: 'c1', href: (id: string) => id, readonly: true })
    expect(w.find('[data-contracts-add]').exists()).toBe(false)
  })
})

describe('ContractCard', () => {
  it('баланс, сроки, поставки, оплаты, напоминания', async () => {
    api.card.mockResolvedValue(card())
    await mount(ContractCard, { clientId: 'c1', contractId: 'k1', backTo: '/contracts' })
    expect(api.card).toHaveBeenCalledWith('c1', 'k1')
    expect(w.get('[data-contract-title]').text()).toBe('№ FC-1 от 15.01.2026')
    expect(w.get('[data-balance="paidNotDelivered"]').text()).toMatch(/Оплачено, но не поставлено\s*20\s100,00 USD/)
    expect(w.get('[data-deadline="repatriation"]').text()).toContain('через 15 дн.')
    expect(w.get('[data-term="country"]').text()).toContain('Китай')
    expect(w.get('[data-shipment="d1"]').text()).toContain('10 000,00 EUR')
    expect(w.get('[data-shipment="d2"]').text()).toContain('ДТ без номера')
    expect(w.get('[data-shipment="d1"] a').attributes('href')).toBe('/import-40/case1')
    expect(w.findAll('[data-payment]')).toHaveLength(2)
    expect(w.get('[data-contract-reminders]').text()).toContain('Срок репатриации 01.11.2026')
  })

  it('удаление оплаты — после подтверждения; Excel — файл с языком интерфейса', async () => {
    api.card.mockResolvedValue(card())
    api.deletePayment.mockResolvedValue(card({ payments: [] }))
    api.xlsx.mockResolvedValue({ blob: new Blob(['x']), fileName: 'contract-FC-1.xlsx' })
    await mount(ContractCard, { clientId: 'c1', contractId: 'k1', backTo: '/contracts' })
    await w.get('[data-payment="p1"] [data-payment-delete]').trigger('click')
    await flushPromises()
    confirmState.resolve(true)
    await flushPromises()
    expect(api.deletePayment).toHaveBeenCalledWith('c1', 'k1', 'p1')
    expect(w.findAll('[data-payment]')).toHaveLength(0)
    await w.get('[data-contract-xlsx]').trigger('click')
    await flushPromises()
    expect(api.xlsx).toHaveBeenCalledWith('c1', 'k1', 'ru')
    expect(save).toHaveBeenCalledWith(expect.any(Blob), 'contract-FC-1.xlsx')
  })

  it('архивный и «только чтение» — без правки и оплат', async () => {
    api.card.mockResolvedValue(card({ contract: contract({ isArchived: true }) }))
    await mount(ContractCard, { clientId: 'c1', contractId: 'k1', backTo: '/contracts' })
    expect(w.find('[data-contract-edit]').exists()).toBe(false)
    expect(w.find('[data-payment-add]').exists()).toBe(false)
    expect(w.get('[data-contract-archive]').text()).toContain('Вернуть из архива')
    w.unmount()
    api.card.mockResolvedValue(card())
    await mount(ContractCard, { clientId: 'c1', contractId: 'k1', backTo: '/x', readonly: true })
    expect(w.find('[data-contract-edit]').exists()).toBe(false)
    expect(w.find('[data-contract-archive]').exists()).toBe(false)
    expect(w.find('[data-contract-xlsx]').exists()).toBe(true)
  })

  it('нет контракта — «не найден»', async () => {
    api.card.mockRejectedValue({ response: { status: 404 } })
    await mount(ContractCard, { clientId: 'c1', contractId: 'zz', backTo: '/contracts' })
    expect(w.find('[data-contract-not-found]').exists()).toBe(true)
  })
})

describe('CaseContractBlock', () => {
  it('контракт заявки, остаток и предупреждения сверки', async () => {
    api.caseCheck.mockResolvedValue({
      contract: contract(),
      checks: [{ code: 'currencyDiffers', declarationId: 'd1', declarationNumber: '123', text: 'srv', value: 10, currency: 'EUR', valueInContractCurrency: 11, remaining: 5 }],
    })
    api.list.mockResolvedValue([contract(), contract({ id: 'k2', number: 'X-2' })])
    await mount(CaseContractBlock, { caseId: 'case1', clientId: 'c1', canEdit: true, href: (id: string) => `/contracts/${id}` })
    expect(w.get('[data-case-contract-link]').attributes('href')).toBe('/contracts/k1')
    expect(w.get('[data-case-contract-checks]').text()).toBe('ДТ 123: валюта EUR не совпадает с валютой контракта № FC-1 (USD)')
  })

  it('без права менять — только подпись; контракта нет — «не выбран»', async () => {
    api.caseCheck.mockResolvedValue({ contract: null, checks: [] })
    await mount(CaseContractBlock, { caseId: 'case1', clientId: 'c1', canEdit: false, href: (id: string) => id })
    expect(api.list).not.toHaveBeenCalled()
    expect(w.find('[data-case-contract-select]').exists()).toBe(false)
    expect(w.text()).toContain('Контракт не выбран')
  })
})

describe('DtContractBlock', () => {
  const props = (over: Record<string, unknown> = {}) => ({
    doc44Items: [] as Record<string, unknown>[], caseId: 'case1', dtId: 'd1', clientId: 'c1', caseContractId: 'k1', dtContractId: null,
    canLink: true, readonly: false, ...over,
  })

  it('«Заполнить из контракта» дописывает 03011 и 03031 в форму; смена контракта ДТ — сразу заполняет', async () => {
    api.list.mockResolvedValue([contract(), contract({ id: 'k2', number: 'X-2', unkNumber: null })])
    const p = props()
    await mount(DtContractBlock, p)
    await w.get('[data-dt-contract-fill]').trigger('click')
    expect(p.doc44Items.map((x) => [x.docTypeCode, x.docNumber])).toEqual([['03011', 'FC-1'], ['03031', '26010001/0001/1/1']])
    api.linkDeclaration.mockResolvedValue({ foreignContractId: 'k2', effectiveContractId: 'k2' })
    w.getComponent({ name: 'ZSelect' }).vm.$emit('update:value', 'k2')
    await flushPromises()
    expect(api.linkDeclaration).toHaveBeenCalledWith('case1', 'd1', 'k2')
    expect(p.doc44Items.find((x) => x.docTypeCode === '03011')?.docNumber).toBe('X-2')
  })

  it('сбой загрузки — ошибка с «Повторить», а не «контракт не выбран»', async () => {
    api.list.mockRejectedValueOnce(new Error('x'))
    await mount(DtContractBlock, props())
    expect(w.find('[data-dt-contract-error]').exists()).toBe(true)
    expect(w.find('[data-dt-contract]').exists()).toBe(false)
  })
})

describe('ContractModal', () => {
  it('УНК стёрли — выключенные поля УНК очищаются и контракт сохраняется', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const initial = { ...fieldsOf(contract()), unkRemovedOn: '2026-05-01', unkRemovalDeadline: '2026-06-01' }
    await mount(ContractModal, { open: true, mode: 'edit', clientId: 'c1', initial, save })
    const unk = document.querySelector('[data-contract-unk] input, input[data-contract-unk]') as HTMLInputElement
    unk.value = ''
    unk.dispatchEvent(new Event('input'))
    await flushPromises()
    ;(document.querySelector('[data-contract-modal] form') as HTMLFormElement).dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ unkNumber: '', unkDate: null, unkBank: '', unkRemovalDeadline: null, unkRemovedOn: null }))
  })
})
