import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { SalesQuoteListItem } from '@/api/sales'

const api = vi.hoisted(() => ({
  listQuotes: vi.fn(), getQuote: vi.fn(), changeStatus: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/sales', async (orig) => ({
  ...(await orig<typeof import('@/api/sales')>()),
  salesApi: { listQuotes: api.listQuotes, getQuote: api.getQuote, changeStatus: api.changeStatus },
}))
vi.mock('@/ui/message', () => ({ message: api.toast }))
// Расчёт на экране «Продажи» здесь не нужен — заглушка.
vi.mock('../SalesCalculator.vue', () => ({ default: { emits: ['saved'], template: '<div data-calc-stub><button type="button" data-calc-saved @click="$emit(\'saved\')" /></div>' } }))

import QuotesList from '../QuotesList.vue'
import QuoteDrawer from '../QuoteDrawer.vue'
import SalesWorkspaceView from '../SalesWorkspaceView.vue'
import FilterChip from '@/components/broker/FilterChip.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import { useAuthStore } from '@/stores/auth'

const DrawerStub = {
  props: ['open'], emits: ['update:open'],
  template: '<div v-if="open" data-drawer><div data-drawer-title><slot name="title" /></div><slot /><div v-if="$slots.footer"><slot name="footer" /></div></div>',
}

const q = (o: Partial<SalesQuoteListItem>): SalesQuoteListItem => ({
  id: 'q', number: '0037', year: 2026, clientName: 'ТОО «Казахмыс Трейд»', status: 1, grandTotal: 1_753_490, createdByName: 'mpp', createdAtUtc: '2026-10-08T05:00:00Z', ...o,
})
const ROWS = [
  q({ id: 'a' }),
  q({ id: 'b', number: '0036', clientName: 'ТОО «Altyn Med»', status: 2, grandTotal: 962_300, createdByName: 'rop', createdAtUtc: '2026-10-01T05:00:00Z' }),
  q({ id: 'c', number: '0035', clientName: 'ТОО «Тұран Кемикал»', status: 0, grandTotal: 418_750 }),
  q({ id: 'd', number: '0034', clientName: 'ТОО «Nomad Build»', status: 3, grandTotal: 2_340_000 }),
]

let w: VueWrapper
const nb = (s: string) => s.replace(/ /g, ' ')
const mountList = async (props: Partial<{ rows: SalesQuoteListItem[]; loading: boolean; error: boolean; loaded: boolean }> = {}) => {
  w = mountWithI18n(QuotesList, {
    props: { rows: ROWS, loading: false, error: false, loaded: true, ...props },
    global: { stubs: { ZDrawer: DrawerStub } },
  })
  await flushPromises()
}
const numbers = () => w.findAll('[data-quote-number]').map((b) => b.text())

beforeEach(() => {
  setActivePinia(createPinia())
  api.getQuote.mockImplementation(async (id: string) => ({
    ...ROWS.find((r) => r.id === id)!, clientContact: '', comment: '', servicesTotal: 0, tpinTotal: 0, serviceLines: [], goodsLines: [],
  }))
  api.changeStatus.mockResolvedValue(undefined)
  api.listQuotes.mockResolvedValue(ROWS)
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('список КП', () => {
  it('колонки и ячейки: номер, клиент, сумма, статус-тег, автор, дата', async () => {
    await mountList()
    expect(w.findAll('thead th').map((th) => th.text())).toEqual(['КП', 'Клиент', 'Сумма', 'Статус', 'Автор', 'Дата'])
    expect(numbers()).toEqual(['0037/КП/2026', '0036/КП/2026', '0035/КП/2026', '0034/КП/2026'])
    expect(nb(w.get('[data-quote-total]').text())).toBe('1 753 490 ₸')
    expect(w.findAll('[data-quote-status]').map((x) => x.text())).toEqual(['Отправлено', 'Принято', 'Черновик', 'Отклонено'])
    // В ячейке есть и подпись для карточки телефона ([data-z-label]) — берём только значение.
    const first = w.findAll('tbody tr')[0].findAll('td').map((td) => td.text().replace(td.find('[data-z-label]').text(), ''))
    expect(first[4]).toBe('mpp')
    expect(first[5]).toBe('08.10.2026')
  })

  it('поиск по клиенту и номеру, фильтр статуса; пусто — сбросить', async () => {
    await mountList()
    w.findComponent(ListSearch).vm.$emit('update:value', 'altyn')
    await flushPromises()
    expect(numbers()).toEqual(['0036/КП/2026'])
    w.findComponent(ListSearch).vm.$emit('update:value', '0035/2026')
    await flushPromises()
    expect(numbers()).toEqual(['0035/КП/2026'])
    w.findComponent(ListSearch).vm.$emit('update:value', '')
    const chip = w.findComponent(FilterChip)
    expect((chip.props('options') as { label: string }[]).map((o) => o.label)).toEqual(['Черновик', 'Отправлено', 'Принято', 'Отклонено'])
    chip.vm.$emit('update:value', '3')
    await flushPromises()
    expect(numbers()).toEqual(['0034/КП/2026'])
    w.findComponent(ListSearch).vm.$emit('update:value', 'altyn')
    await flushPromises()
    expect(w.text()).toContain('Ничего не нашлось')
    await w.get('[data-quotes-reset]').trigger('click')
    expect(numbers()).toHaveLength(4)
  })

  it('клик по строке открывает панель КП; выбранная строка подсвечена', async () => {
    await mountList()
    expect(w.find('[data-drawer]').exists()).toBe(false)
    await w.findAll('tbody tr')[1].findAll('td')[1].trigger('click')
    await flushPromises()
    expect(w.find('[data-drawer]').exists()).toBe(true)
    expect(api.getQuote).toHaveBeenCalledWith('b', { silent: true })
    expect(w.get('[data-quote-title]').text()).toBe('КП № 0036/КП/2026')
    expect(w.findAll('tbody tr')[1].classes()).toContain('bg-zircon-soft')
    expect(w.findAll('tbody tr')[0].classes()).not.toContain('bg-zircon-soft')
    // Номер — кнопка (клавиатура): открывает другой КП.
    await w.findAll('[data-quote-number]')[0].trigger('click')
    await flushPromises()
    expect(w.get('[data-quote-title]').text()).toBe('КП № 0037/КП/2026')
  })

  it('смена статуса в панели — список перечитывается (reload)', async () => {
    await mountList()
    await w.findAll('[data-quote-number]')[2].trigger('click')
    await flushPromises()
    w.findComponent(QuoteDrawer).findAllComponents(ZSelect)[0].vm.$emit('update:value', 1)
    await flushPromises()
    expect(api.changeStatus).toHaveBeenCalledWith('c', 1)
    expect(w.emitted('reload')).toHaveLength(1)
  })

  it('ошибка без данных — блок «Повторить»; с данными — полоса над таблицей', async () => {
    await mountList({ rows: [], error: true, loaded: false })
    expect(w.get('[data-quotes-error]').text()).toContain('Не удалось загрузить список')
    expect(w.find('[data-quotes-table]').exists()).toBe(false)
    await w.get('[data-quotes-retry]').trigger('click')
    expect(w.emitted('reload')).toHaveLength(1)
    w.unmount()
    await mountList({ error: true, loaded: true })
    expect(w.find('[data-quotes-error]').exists()).toBe(true)
    expect(numbers()).toHaveLength(4)
  })

  it('пусто — «КП пока нет» и переход к расчёту', async () => {
    await mountList({ rows: [] })
    expect(w.text()).toContain('КП пока нет')
    await w.get('[data-quotes-new]').trigger('click')
    expect(w.emitted('newCalc')).toHaveLength(1)
  })
})

describe('экран «Продажи»: вкладки', () => {
  let router: Router
  const mountView = async (path = '/sales') => {
    router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
    await router.push(path)
    w = mountWithI18n(SalesWorkspaceView, { global: { plugins: [router], stubs: { ZDrawer: DrawerStub } } })
    await flushPromises()
  }
  const as = (role: string, businessRoles: string[] = []) => {
    const auth = useAuthStore()
    auth.role = role
    vi.spyOn(auth, 'hasBusinessRole').mockImplementation((r: string) => businessRoles.includes(r))
  }

  it('заголовок, вкладки: «Мои КП» менеджеру со счётчиком; список silent; ?tab=quotes', async () => {
    as('broker', ['sales'])
    await mountView()
    expect(api.listQuotes).toHaveBeenCalledWith({ silent: true })
    expect(w.get('h1').text()).toBe('Продажи')
    const opts = w.findComponent(ZSegmented).props('options') as { value: string; label: string; count?: number }[]
    expect(opts).toEqual([{ value: 'calc', label: 'Новый расчёт' }, { value: 'quotes', label: 'Мои КП', count: 4 }])
    expect(w.find('[data-calc-stub]').isVisible()).toBe(true)
    expect(w.find('[data-quotes]').exists()).toBe(false)
    w.findComponent(ZSegmented).vm.$emit('update:value', 'quotes')
    await flushPromises()
    expect(router.currentRoute.value.query.tab).toBe('quotes')
    expect(w.find('[data-quotes]').exists()).toBe(true)
    expect(w.find('[data-calc-stub]').isVisible()).toBe(false)
  })

  it('руководителю и администратору — «Все КП»; сохранение КП ведёт на вкладку КП и перечитывает список', async () => {
    as('broker', ['rop'])
    await mountView('/sales?tab=calc')
    expect((w.findComponent(ZSegmented).props('options') as { label: string }[])[1].label).toBe('Все КП')
    await w.get('[data-calc-saved]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.tab).toBe('quotes')
    expect(api.listQuotes).toHaveBeenCalledTimes(2)
    w.unmount()
    as('Administrator')
    await mountView()
    expect((w.findComponent(ZSegmented).props('options') as { label: string }[])[1].label).toBe('Все КП')
  })
})
