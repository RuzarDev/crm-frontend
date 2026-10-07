import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { BrokerInvoice } from '@/api/billing'
import type { Import40CaseDto } from '@/api/import40'

const api = vi.hoisted(() => ({ list: vi.fn(), invoices: vi.fn() }))
const reg = vi.hoisted(() => ({ loaded: null as unknown, complete: null as unknown }))
vi.mock('@/api/import40', async (orig) => ({
  ...(await orig<typeof import('@/api/import40')>()),
  import40Api: { list: api.list },
}))
vi.mock('@/api/billing', () => ({ billingApi: { list: api.invoices } }))
vi.mock('@/composables/useClientRegistration', () => ({
  useClientRegistration: () => ({ loaded: reg.loaded, complete: reg.complete }),
}))

import ClientHomeView from '../ClientHomeView.vue'
import { useAuthStore } from '@/stores/auth'
import { useProfileStore } from '@/stores/profile'
import { homeAttention } from '@/shell/attention'
import { formatMoney } from '@/ui/number'

const now = new Date()
const ago = (days: number) => new Date(now.getTime() - days * 86400_000).toISOString()
const kase = (o: Partial<Import40CaseDto>): Import40CaseDto => ({
  id: 'c1', number: 'И40-182', cargo: 'Ноутбуки и комплектующие', post: 'Хоргос', status: 2, isProblem: false,
  problemClientMessage: '', returnReason: '', updatedAtUtc: ago(1), ...o,
}) as Import40CaseDto
const invoice = (o: Partial<BrokerInvoice>): BrokerInvoice => ({
  id: 'i1', clientId: 'c', clientName: 'К', caseId: null, caseNumber: 'И40-166', kind: 'invoice', status: 1,
  number: '214', year: 2026, issuedAtUtc: new Date(2026, 9, 1, 12).toISOString(), dueDateUtc: null, paidAtUtc: null,
  vatRate: 0, subtotal: 0, vatAmount: 0, total: 185000, note: '', createdAtUtc: ago(7), lines: [], ...o,
})

let w: VueWrapper
let pinia: Pinia
let router: Router

const mountIt = async () => {
  w = mountWithI18n(ClientHomeView, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
}
const newButton = () => w.get('[data-client-new]')

beforeEach(async () => {
  pinia = createPinia()
  setActivePinia(pinia)
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  await router.push('/home')
  await router.isReady()
  homeAttention.value = null
  reg.loaded = ref(true)
  reg.complete = ref(true)
  const auth = useAuthStore()
  auth.role = 'Client'
  auth.modules = ['import40']
  useProfileStore().profile = {
    userId: 'u', username: 'k', displayName: 'ТОО «Казахмыс Трейд»', phone: null,
    companyName: 'ТОО «Казахмыс Трейд»', innBin: null, role: 'Client',
  }
  api.list.mockResolvedValue([
    kase({}),
    kase({ id: 'c2', number: 'И40-190', cargo: 'Серверное оборудование', isProblem: true, status: 3, problemClientMessage: 'Нужен сертификат соответствия' }),
    kase({ id: 'c3', number: 'И40-100', status: 8 }),
  ])
  api.invoices.mockResolvedValue([invoice({}), invoice({ id: 'i2', number: '220', issuedAtUtc: ago(0) }), invoice({ id: 'i3', status: 2 })])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
  localStorage.clear()
})

describe('ClientHomeView', () => {
  it('поставки в работе, вопрос по проблемной, счёт к оплате', async () => {
    await mountIt()

    // Отображаемое имя клиента = название компании — приветствие без имени.
    expect(w.get('h1').text()).not.toContain('ТОО')
    expect(w.text()).toContain('ТОО «Казахмыс Трейд» · в работе: 2')

    const cards = w.findAll('[data-client-shipment]')
    expect(cards).toHaveLength(2)
    expect(w.text()).not.toContain('И40-100')
    const problem = cards.find((c) => c.text().includes('И40-190'))!
    expect(problem.attributes('href')).toBe('/import-40/c2')
    expect(problem.find('.bg-tone-danger-bg').exists()).toBe(true)
    // Пустые пункты полоски скрыты от чтения с экрана; этап озвучивается текстом.
    expect(problem.get('ol').attributes('aria-hidden')).toBe('true')
    expect(problem.get('ol').attributes('aria-label')).toBeUndefined()
    expect(problem.get('[data-client-step]').text()).toBe('Этап 3 из 6')
    expect(problem.get('[data-client-step]').classes()).toContain('sr-only')
    expect(problem.findAll('li .bg-danger, li.bg-danger')).toHaveLength(1)

    const panel = w.get('[data-client-asks]')
    expect(panel.attributes('aria-labelledby')).toBe(panel.get('h2').attributes('id'))
    expect(panel.get('h2').text()).toBe('Нужно от вас')
    expect(panel.find('[data-client-asks-count]').exists()).toBe(false)
    const asks = panel.findAll('ul[role="list"] > li[data-client-ask]')
    expect(asks).toHaveLength(1)
    expect(asks[0].text()).toContain('И40-190 · вопрос по поставке')
    expect(asks[0].text()).toContain('Нужен сертификат соответствия')
    expect(asks[0].get('.font-mono').text()).toBe('И40-190')
    expect(homeAttention.value).toBe(1)
    const open = asks[0].get('a')
    expect(open.text()).toBe('Открыть')
    expect(open.attributes('href')).toBe('/import-40/c2')
    expect(document.getElementById(open.attributes('aria-describedby')!)?.textContent).toContain('И40-190')
    await open.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/import-40/c2')

    const bill = w.get('[data-client-invoice]')
    expect(bill.text()).toContain('Счёт № 214 от 01.10')
    expect(bill.text()).toContain(formatMoney(185000))
    expect(bill.text()).toContain('и ещё 1 к оплате')
    const pay = bill.findAll('a').find((a) => a.text() === 'Оплатить')!
    expect(pay.attributes('href')).toBe('/billing')
    expect(api.invoices).toHaveBeenCalledWith({ kind: 'invoice' })

    expect(newButton().attributes('disabled')).toBeUndefined()
    await newButton().trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/import-40?new=1')
  })

  it('черновик — «Продолжить» ведёт в мастер по continueId', async () => {
    api.list.mockResolvedValue([kase({ id: 'd1', number: 'И40-200', status: 0, returnReason: 'Приложите инвойс' })])
    await mountIt()
    const ask = w.get('[data-client-ask]')
    expect(ask.text()).toContain('И40-200 · ждёт отправки')
    expect(ask.text()).toContain('Приложите инвойс')
    const go = ask.get('a')
    expect(go.text()).toBe('Продолжить')
    expect(go.attributes('href')).toBe('/import-40?continueId=d1')
    await go.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/import-40?continueId=d1')
  })

  it('больше трёх вопросов — одна панель, три строки, счётчик и «Ещё N»', async () => {
    api.list.mockResolvedValue([
      kase({ id: 'p1', number: 'И40-301', isProblem: true, status: 3, problemClientMessage: '' }),
      kase({ id: 'v1', number: 'И40-302', status: 6, updatedAtUtc: ago(2) }),
      kase({ id: 'd1', number: 'И40-303', status: 0, updatedAtUtc: ago(3) }),
      kase({ id: 'd2', number: 'И40-304', status: 0, updatedAtUtc: ago(4) }),
      kase({ id: 'd3', number: 'И40-305', status: 0, updatedAtUtc: ago(5) }),
    ])
    await mountIt()
    expect(w.findAll('[data-client-asks]')).toHaveLength(1)
    const panel = w.get('[data-client-asks]')
    expect(panel.get('[data-client-asks-count]').text()).toBe('5')
    const rows = panel.findAll('[data-client-ask]')
    expect(rows.map((r) => r.get('.font-mono').text())).toEqual(['И40-301', 'И40-302', 'И40-303'])
    expect(rows[1].text()).toContain('И40-302 · оплатите склад')
    expect(rows[1].text()).toContain('Загрузите чек об оплате счёта СВХ')
    expect(rows.map((r) => r.get('a').attributes('href'))).toEqual(['/import-40/p1', '/import-40/v1', '/import-40?continueId=d1'])
    const more = panel.get('[data-client-asks-more]')
    expect(more.text()).toBe('Ещё 2 — в списке поставок')
    expect(more.attributes('href')).toBe('/import-40')
    expect(homeAttention.value).toBe(5)
  })

  it('регистрация не завершена — «Оформить новую поставку» выключена', async () => {
    reg.complete = ref(false)
    await mountIt()
    expect(newButton().attributes('disabled')).toBeDefined()
  })

  it('пустой список — «Поставок пока нет», счёта нет — карточки нет', async () => {
    api.list.mockResolvedValue([])
    api.invoices.mockResolvedValue([])
    await mountIt()
    expect(w.text()).toContain('Поставок пока нет')
    expect(w.text()).toContain('Оформите первую')
    expect(w.find('[data-client-invoice]').exists()).toBe(false)
    expect(homeAttention.value).toBe(0)
  })

  it('ошибка списка — сообщение и «Повторить» перезапрашивает', async () => {
    api.list.mockRejectedValueOnce(new Error('500'))
    await mountIt()
    expect(w.text()).toContain('Не удалось загрузить поставки')
    await w.findAll('button').find((b) => b.text() === 'Повторить')!.trigger('click')
    await flushPromises()
    expect(api.list).toHaveBeenCalledTimes(2)
    expect(w.findAll('[data-client-shipment]')).toHaveLength(2)
  })

  it('клиент только транзита — плитки разделов, без запросов импорта', async () => {
    useAuthStore().modules = ['transit']
    await mountIt()
    expect(api.list).not.toHaveBeenCalled()
    expect(api.invoices).not.toHaveBeenCalled()
    expect(w.find('[data-client-new]').exists()).toBe(false)
    expect(w.findAll('li a').map((a) => a.attributes('href'))).toEqual(['/reestr', '/keden-status', '/my-documents'])
  })
})
