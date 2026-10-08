import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { SalesQuoteDto, SalesQuoteListItem } from '@/api/sales'

const api = vi.hoisted(() => ({
  getQuote: vi.fn(), changeStatus: vi.fn(), printQuote: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/sales', async (orig) => ({
  ...(await orig<typeof import('@/api/sales')>()),
  salesApi: { getQuote: api.getQuote, changeStatus: api.changeStatus },
}))
vi.mock('@/ui/message', () => ({ message: api.toast }))
vi.mock('../printQuote', () => ({ printQuote: api.printQuote }))

import QuoteDrawer from '../QuoteDrawer.vue'
import ZSelect from '@/components/z/ZSelect.vue'

// Панель — заглушка: проверяется состав, а не механика Reka.
const DrawerStub = {
  props: ['open'], emits: ['update:open'],
  template: '<div v-if="open" data-drawer><div data-drawer-title><slot name="title" /></div><slot /><div v-if="$slots.footer" data-drawer-footer><slot name="footer" /></div></div>',
}

const ROW: SalesQuoteListItem = {
  id: 'q37', number: '0037', year: 2026, clientName: 'ТОО «Казахмыс Трейд»', status: 1, grandTotal: 1_753_490, createdByName: 'mpp', createdAtUtc: '2026-10-08T05:00:00Z',
}
const FULL: SalesQuoteDto = {
  ...ROW, clientContact: 'Арман, +7 701 555 12 40', comment: 'две партии', servicesTotal: 79_500, tpinTotal: 1_673_990,
  serviceLines: [
    { name: 'Оформление ДТ (ИМ 40)', unit: 'за ДТ', unitPrice: 45000, quantity: 1, discountPercent: 0, total: 45000 },
    { name: 'Сопровождение на СВХ', unit: 'за заявку', unitPrice: 25000, quantity: 1, discountPercent: 10, total: 22500 },
  ],
  goodsLines: [{
    description: 'Ноутбуки', code: '8471300000', codeName: null, customsValueKzt: 12_000_000, importDutyKzt: 0, exciseKzt: 0,
    customsFeeKzt: 20000, vatKzt: 1_488_810, tpinTotalKzt: 1_508_810, error: null,
  }],
}

let w: VueWrapper
const nb = (s: string) => s.replace(/ /g, ' ')
const mountDrawer = async (row: SalesQuoteListItem | null = ROW) => {
  w = mountWithI18n(QuoteDrawer, { props: { open: true, row }, global: { stubs: { ZDrawer: DrawerStub } } })
  await flushPromises()
}
const statusSelect = () => w.findAllComponents(ZSelect).find((c) => c.find('[data-quote-status]').exists())!

beforeEach(() => {
  api.getQuote.mockResolvedValue(FULL)
  api.changeStatus.mockResolvedValue(undefined)
})
afterEach(() => {
  w?.unmount()
  vi.clearAllMocks()
})

describe('панель КП', () => {
  it('шапка: номер, статус, клиент · контакт; суммы и комментарий', async () => {
    await mountDrawer()
    expect(api.getQuote).toHaveBeenCalledWith('q37', { silent: true })
    const title = w.get('[data-drawer-title]')
    expect(title.text()).toContain('Коммерческое предложение')
    expect(w.get('[data-quote-title]').text()).toBe('КП № 0037/КП/2026')
    expect(w.get('[data-quote-status-tag]').text()).toBe('Отправлено')
    expect(w.get('[data-quote-client]').text()).toBe('ТОО «Казахмыс Трейд» · Арман, +7 701 555 12 40')
    expect(nb(w.get('[data-quote-services-total]').text())).toBe('79 500 ₸')
    expect(nb(w.get('[data-quote-customs-total]').text())).toBe('1 673 990 ₸')
    expect(nb(w.get('[data-quote-grand-total]').text())).toBe('1 753 490 ₸')
    expect(w.get('[data-quote-comment]').text()).toBe('Комментарий: две партии')
  })

  it('строки услуг и товаров видны в свёрнутых списках', async () => {
    await mountDrawer()
    expect(w.get('[data-quote-services]').text()).toContain('Услуги (2)')
    expect(w.get('[data-quote-goods]').text()).toContain('Товары (1)')
    // Раскрываем оба пункта.
    for (const sel of ['[data-quote-services]', '[data-quote-goods]']) await w.get(`${sel} button`).trigger('click')
    await flushPromises()
    const services = w.findAll('[data-quote-service]').map((li) => nb(li.text()))
    expect(services[0]).toContain('Оформление ДТ (ИМ 40)')
    expect(services[0]).toContain('1 за ДТ × 45 000 ₸')
    expect(services[1]).toContain('скидка 10%')
    expect(services[1]).toContain('22 500 ₸')
    const goods = nb(w.get('[data-quote-goods-line]').text())
    expect(goods).toContain('Ноутбуки')
    expect(goods).toContain('8471300000')
    expect(goods).toContain('НДС 1 488 810 ₸')
    expect(goods).toContain('1 508 810 ₸')
  })

  it('смена статуса — changeStatus, тост, событие; тег следует', async () => {
    await mountDrawer()
    statusSelect().vm.$emit('update:value', 2)
    await flushPromises()
    expect(api.changeStatus).toHaveBeenCalledWith('q37', 2)
    expect(api.toast.success).toHaveBeenCalledWith('Статус обновлён')
    expect(w.emitted('changed')).toHaveLength(1)
    expect(statusSelect().props('value')).toBe(2)
    expect(w.get('[data-quote-status-tag]').text()).toBe('Принято')
  })

  it('ошибка смены статуса — значение откатывается, без тоста успеха', async () => {
    api.changeStatus.mockRejectedValueOnce(new Error('403'))
    await mountDrawer()
    statusSelect().vm.$emit('update:value', 3)
    await flushPromises()
    expect(api.toast.success).not.toHaveBeenCalled()
    expect(w.emitted('changed')).toBeUndefined()
    expect(statusSelect().props('value')).toBe(1)
    expect(w.get('[data-quote-status-tag]').text()).toBe('Отправлено')
  })

  it('PDF для клиента — печать полной карточки; до загрузки неактивна', async () => {
    let resolve!: (v: SalesQuoteDto) => void
    api.getQuote.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    await mountDrawer()
    expect(w.find('[data-quote-skeleton]').exists()).toBe(true)
    expect(w.get('[data-quote-print]').attributes('disabled')).toBeDefined()
    resolve(FULL)
    await flushPromises()
    await w.get('[data-quote-print]').trigger('click')
    expect(api.printQuote).toHaveBeenCalledWith(expect.objectContaining({ id: 'q37', serviceLines: FULL.serviceLines, goodsLines: FULL.goodsLines }))
  })

  it('ошибка загрузки — «Повторить» по месту', async () => {
    api.getQuote.mockRejectedValueOnce(new Error('500'))
    await mountDrawer()
    expect(w.get('[data-quote-error]').text()).toContain('Не удалось загрузить КП')
    await w.get('[data-quote-retry]').trigger('click')
    await flushPromises()
    expect(api.getQuote).toHaveBeenCalledTimes(2)
    expect(w.find('[data-quote-error]').exists()).toBe(false)
    expect(w.find('[data-quote-services]').exists()).toBe(true)
  })

  it('поздний ответ по прежнему КП не подменяет новый', async () => {
    let first!: (v: SalesQuoteDto) => void
    api.getQuote.mockReturnValueOnce(new Promise((r) => { first = r }))
    await mountDrawer()
    api.getQuote.mockResolvedValueOnce({ ...FULL, id: 'q36', number: '0036', clientName: 'ТОО «Altyn Med»', clientContact: '' })
    await w.setProps({ row: { ...ROW, id: 'q36', number: '0036', clientName: 'ТОО «Altyn Med»' } })
    await flushPromises()
    first(FULL)
    await flushPromises()
    expect(w.get('[data-quote-title]').text()).toBe('КП № 0036/КП/2026')
    expect(w.get('[data-quote-client]').text()).toBe('ТОО «Altyn Med»')
  })
})
