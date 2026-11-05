import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import ContractPage from '@/views/foreignContracts/ContractPage.vue'
import CarrierPage from '@/views/carriers/CarrierPage.vue'
import { useAuthStore } from '@/stores/auth'

// 30.10.2026, аудит S-6/C-15: контракт или перевозчик, открытый из заявки (поставки) или ДТ с ?from=, — «Назад» туда.
let w: VueWrapper
let router: Router
const CardStub = { props: ['backTo', 'backLabel', 'clientId', 'readonly', 'caseLinks', 'dtLinks'], template: '<div data-card />' }

beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/clients/:id/contracts/:contractId', component: ContractPage },
      { path: '/clients/:id/carriers/:carrierId', component: CarrierPage },
      { path: '/contracts/:contractId', component: ContractPage },
      { path: '/carriers/:carrierId', component: CarrierPage },
    ],
  })
})
afterEach(() => { w?.unmount() })

const mountAt = async (page: typeof ContractPage, path: string) => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(page, { global: { plugins: [router], stubs: { ContractCard: CardStub, CarrierCard: CardStub } } })
  await flushPromises()
  return w.getComponent(CardStub).props() as { backTo: string | null; backLabel?: string }
}
const as = (role: string, perms: string[]) => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = perms
  auth.userId = 'me'
}

// Решение владельца 05.11.2026: бухгалтеру (isFinanceOnly) — только просмотр и номера простым текстом, заявки ему закрыты.
describe('ContractPage / CarrierPage: бухгалтер', () => {
  const ACCOUNTANT = ['clients.read', 'import40.read', 'finance.read', 'finance.write']
  const DECLARANT = ['clients.read', 'import40.read', 'import40.declarant', 'finance.read']

  it.each([
    ['контракт', ContractPage, '/clients/c1/contracts/k1'],
    ['перевозчик', CarrierPage, '/clients/c1/carriers/r1'],
  ] as const)('%s: бухгалтеру просмотр без ссылок, декларанту правка и ссылки, клиенту правка', async (_, page, path) => {
    as('accountant', ACCOUNTANT)
    expect(await mountAt(page, path)).toMatchObject({ readonly: true, caseLinks: false })
    w.unmount()
    as('declarant', DECLARANT)
    expect(await mountAt(page, path)).toMatchObject({ readonly: false, caseLinks: true })
    w.unmount()
    as('client', [])
    expect(await mountAt(page, path.replace('/clients/c1', ''))).toMatchObject({ readonly: false, caseLinks: true })
  })
})

describe('ContractPage / CarrierPage: «Назад» по ?from=', () => {
  it('сотрудник из заявки — «К заявке» в заявку (а не в карточку клиента)', async () => {
    as('declarant', ['clients.read', 'import40.read'])
    expect(await mountAt(ContractPage, `/clients/c1/contracts/k1?from=${encodeURIComponent('/import-40/case1')}`))
      .toMatchObject({ backTo: '/import-40/case1', backLabel: 'К заявке' })
    w.unmount()
    expect(await mountAt(CarrierPage, `/clients/c1/carriers/r1?from=${encodeURIComponent('/import-40/case1')}`))
      .toMatchObject({ backTo: '/import-40/case1', backLabel: 'К заявке' })
  })

  it('из ДТ — «К декларации»; без ?from= — как раньше (вкладка «Контракты» карточки клиента)', async () => {
    as('declarant', ['clients.read', 'import40.read'])
    expect(await mountAt(ContractPage, `/clients/c1/contracts/k1?from=${encodeURIComponent('/import-40/case1/dt/d1')}`))
      .toMatchObject({ backTo: '/import-40/case1/dt/d1', backLabel: 'К декларации' })
    w.unmount()
    expect(await mountAt(ContractPage, '/clients/c1/contracts/k1')).toMatchObject({ backTo: '/clients/c1?tab=contracts', backLabel: undefined })
  })

  it('клиент из поставки — «К поставке»; без ?from= — список; чужой адрес в ?from= не принимается', async () => {
    as('client', [])
    expect(await mountAt(ContractPage, `/contracts/k1?from=${encodeURIComponent('/import-40/case1')}`))
      .toMatchObject({ backTo: '/import-40/case1', backLabel: 'К поставке' })
    w.unmount()
    expect(await mountAt(CarrierPage, '/carriers/r1')).toMatchObject({ backTo: '/carriers', backLabel: undefined })
    w.unmount()
    expect(await mountAt(ContractPage, `/contracts/k1?from=${encodeURIComponent('https://evil.example/x')}`))
      .toMatchObject({ backTo: '/contracts', backLabel: undefined })
  })
})
