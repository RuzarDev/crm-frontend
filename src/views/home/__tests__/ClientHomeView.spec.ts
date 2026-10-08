import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { BrokerInvoice } from '@/api/billing'
import type { ClientShipment } from '@/api/clientShipments'

const api = vi.hoisted(() => ({ list: vi.fn(), invoices: vi.fn() }))
const reg = vi.hoisted(() => ({ loaded: null as unknown, complete: null as unknown }))
vi.mock('@/api/clientShipments', () => ({ clientShipmentsApi: { list: api.list } }))
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
// step — как считает сервер (Import40Steps.StepOf): 0→1, 1→2, 2/3→3, 4/5→4, 6→5, 7→6.
const STEP: Record<number, number> = { 0: 1, 1: 2, 2: 3, 3: 3, 4: 4, 5: 4, 6: 5, 7: 6, 8: 6, 9: 1 }
const kase = (o: Partial<ClientShipment>): ClientShipment => ({
  id: 'c1', number: 'И40-182', cargo: 'Ноутбуки и комплектующие', post: 'Хоргос', status: 2, isProblem: false,
  problemClientMessage: '', returnReason: '', senderCountryCode: 'CN', estimatedValue: null, currencyCode: 'USD',
  svhInvoiceAmount: null, svhInvoiceNumber: '', paymentCheckUploaded: false, paymentConfirmed: false,
  declarationsCount: 0, assignedDeclarantName: null, createdAtUtc: ago(10), updatedAtUtc: ago(1),
  ...o, step: o.step ?? STEP[o.status ?? 2],
})
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
    expect(problem.get('.bg-tone-danger-bg').text()).toBe('Нужен ответ')
    // Полоска — картинка, скрытая от чтения с экрана; этап озвучивается текстом.
    expect(problem.get('[data-seg]').element.parentElement!.getAttribute('aria-hidden')).toBe('true')
    expect(problem.get('[data-step-label]').text()).toBe('Этап 3 из 6 · Оформление декларации и выпуск')
    expect(problem.get('[data-step-label]').classes()).toContain('sr-only')
    expect(problem.findAll('[data-seg].bg-danger')).toHaveLength(1)
    expect(problem.text()).toContain('Нужен ваш ответ')
    // Штатный статус сотрудника клиенту не показываем — только словарь клиента.
    const plain = cards.find((c) => c.text().includes('И40-182'))!
    expect(plain.text()).toContain('Оформляем')
    expect(plain.text()).toContain('Оформление декларации и выпуск')
    expect(plain.text()).not.toContain('Декларирование')

    const panel = w.get('[data-client-asks]')
    expect(panel.attributes('aria-labelledby')).toBe(panel.get('h2').attributes('id'))
    expect(panel.get('h2').text()).toBe('Нужно от вас')
    expect(panel.find('[data-client-asks-count]').exists()).toBe(false)
    const asks = panel.findAll('ul[role="list"] > li[data-client-ask]')
    expect(asks).toHaveLength(1)
    expect(asks[0].text()).toContain('И40-190 · Нужен ваш ответ')
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
    expect(pay.attributes('href')).toBe('/billing?id=i1')
    expect(api.invoices).toHaveBeenCalledWith({ kind: 'invoice' })

    expect(newButton().attributes('disabled')).toBeUndefined()
    await newButton().trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/import-40/new')
  })

  it('черновик — «Продолжить» ведёт в мастер, карточка — тоже', async () => {
    api.list.mockResolvedValue([kase({ id: 'd1', number: 'И40-200', status: 0 })])
    await mountIt()
    const ask = w.get('[data-client-ask]')
    expect(ask.text()).toContain('И40-200 · Черновик не отправлен')
    expect(ask.text()).toContain('Заполните оставшееся и отправьте на оформление')
    expect(w.get('[data-client-shipment]').attributes('href')).toBe('/import-40/new/d1')
    const go = ask.get('a')
    expect(go.text()).toBe('Продолжить')
    expect(go.attributes('href')).toBe('/import-40/new/d1')
    await go.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/import-40/new/d1')
  })

  it('возврат на доработку — причина в строке, «Продолжить» в мастер; карточка ведёт на поставку', async () => {
    api.list.mockResolvedValue([kase({ id: 'r1', number: 'И40-201', status: 0, returnReason: 'Приложите инвойс' })])
    await mountIt()
    const ask = w.get('[data-client-ask]')
    expect(ask.text()).toContain('И40-201 · Вернули на доработку')
    expect(ask.text()).toContain('Приложите инвойс')
    expect(ask.get('a').text()).toBe('Продолжить')
    expect(ask.get('a').attributes('href')).toBe('/import-40/new/r1')
    const card = w.get('[data-client-shipment]')
    expect(card.attributes('href')).toBe('/import-40/r1')
    expect(card.get('.bg-tone-wait-bg').text()).toBe('Вернули на доработку')
  })

  it('черновик с вопросом AQNIET — «Открыть» ведёт на карточку (правило askHref)', async () => {
    api.list.mockResolvedValue([kase({ id: 'p1', number: 'И40-202', status: 0, isProblem: true, problemClientMessage: 'Уточните вес' })])
    await mountIt()
    const ask = w.get('[data-client-ask]')
    expect(ask.text()).toContain('И40-202 · Нужен ваш ответ')
    expect(ask.get('a').text()).toBe('Открыть')
    expect(ask.get('a').attributes('href')).toBe('/import-40/p1')
  })

  it('счёт СВХ: без чека — вопрос с суммой; чек загружен — вопроса нет, «Чек на проверке»', async () => {
    api.list.mockResolvedValue([
      kase({ id: 'v1', number: 'И40-210', status: 6, svhInvoiceAmount: 312400 }),
      kase({ id: 'v2', number: 'И40-211', status: 6, paymentCheckUploaded: true }),
    ])
    await mountIt()
    const asks = w.findAll('[data-client-ask]')
    expect(asks).toHaveLength(1)
    expect(asks[0].text()).toContain('И40-210 · Оплатите склад')
    expect(asks[0].text()).toContain(`Счёт СВХ на ${formatMoney(312400)}`)
    expect(asks[0].get('a').attributes('href')).toBe('/import-40/v1')
    expect(homeAttention.value).toBe(1)
    const reviewed = w.findAll('[data-client-shipment]').find((c) => c.text().includes('И40-211'))!
    expect(reviewed.text()).toContain('Чек на проверке')
    expect(reviewed.findAll('[data-seg].bg-gold')).toHaveLength(0)
    const pay = w.findAll('[data-client-shipment]').find((c) => c.text().includes('И40-210'))!
    expect(pay.findAll('[data-seg].bg-gold')).toHaveLength(1)
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
    expect(rows[1].text()).toContain('И40-302 · Оплатите склад')
    expect(rows[1].text()).toContain('Счёт склада выставлен')
    expect(rows.map((r) => r.get('a').attributes('href'))).toEqual(['/import-40/p1', '/import-40/v1', '/import-40/new/d1'])
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

  it('счёт с приложенным чеком — «Чек на проверке» вместо «Оплатить»; первым — счёт без чека', async () => {
    const check = [{ id: 'f1', fileName: 'check.pdf', sizeBytes: 5, createdAtUtc: ago(0) }]
    api.invoices.mockResolvedValue([invoice({ paymentChecks: check })])
    await mountIt()
    let bill = w.get('[data-client-invoice]')
    expect(bill.get('[data-client-invoice-checked]').text()).toBe('Чек на проверке')
    const link = bill.get('[data-client-invoice-link]')
    expect(link.text()).toBe('Открыть счёт')
    expect(link.attributes('href')).toBe('/billing?id=i1')
    expect(bill.text()).not.toContain('Оплатить')
    w.unmount()

    // Есть счёт без чека (выставлен позже) — он важнее: его и показываем с «Оплатить».
    api.invoices.mockResolvedValue([invoice({ paymentChecks: check }), invoice({ id: 'i2', number: '220', issuedAtUtc: ago(0), paymentChecks: [] })])
    await mountIt()
    bill = w.get('[data-client-invoice]')
    expect(bill.text()).toContain('Счёт № 220')
    expect(bill.get('[data-client-invoice-link]').text()).toBe('Оплатить')
    expect(bill.get('[data-client-invoice-link]').attributes('href')).toBe('/billing?id=i2')
    // Второй счёт уже с чеком — «и ещё к оплате» не показываем.
    expect(bill.text()).not.toContain('к оплате')
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
