import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ClientShipment } from '@/api/clientShipments'

const api = vi.hoisted(() => ({ list: vi.fn() }))
const reg = vi.hoisted(() => ({ loaded: null as unknown, complete: null as unknown }))
vi.mock('@/api/clientShipments', () => ({ clientShipmentsApi: { list: api.list } }))
vi.mock('@/composables/useClientRegistration', () => ({
  useClientRegistration: () => ({ loaded: reg.loaded, complete: reg.complete }),
}))

import ClientShipmentsView from '../ClientShipmentsView.vue'
import { useAuthStore } from '@/stores/auth'

const now = new Date()
const ago = (days: number) => new Date(now.getTime() - days * 86400_000).toISOString()
const STEP: Record<number, number> = { 0: 1, 1: 2, 2: 3, 3: 3, 4: 4, 5: 4, 6: 5, 7: 6, 8: 6, 9: 1 }
const kase = (o: Partial<ClientShipment>): ClientShipment => ({
  id: 'c1', number: 'ИМ-2026-0166', cargo: 'Серверное оборудование', post: 'Нур-Жолы', status: 2, isProblem: false,
  problemClientMessage: '', returnReason: '', senderCountryCode: 'DE', estimatedValue: null, currencyCode: 'EUR',
  svhInvoiceAmount: null, svhInvoiceNumber: '', paymentCheckUploaded: false, paymentConfirmed: false,
  declarationsCount: 0, assignedDeclarantName: null, createdAtUtc: ago(10), updatedAtUtc: ago(1),
  ...o, step: o.step ?? STEP[o.status ?? 2],
})
// По вкладкам: в работе 2, ждут вас 2, черновики 1, завершённые 1.
const FIXTURE = [
  kase({}),
  kase({ id: 'c2', number: 'ИМ-2026-0170', cargo: 'Ноутбуки', post: 'Хоргос', status: 1 }),
  kase({ id: 'c3', number: 'ИМ-2026-0171', cargo: 'Станки', status: 3, isProblem: true, problemClientMessage: 'Нужен сертификат' }),
  kase({ id: 'c4', number: 'ИМ-2026-0172', cargo: 'Мебель', status: 6, svhInvoiceAmount: 312400 }),
  kase({ id: 'c5', number: 'ИМ-2026-0173', cargo: 'Ткани', status: 0 }),
  kase({ id: 'c6', number: 'ИМ-2026-0150', cargo: 'Посуда', status: 8 }),
]

let w: VueWrapper
let pinia: Pinia
let router: Router

const stub = { template: '<div/>' }
const mountAt = async (path: string) => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(ClientShipmentsView, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
}
const rowNumbers = () => w.findAll('[data-client-row] .font-mono').map((n) => n.text())
const tabCount = (k: string) => w.get(`[data-client-tab="${k}"] [data-client-tab-count]`).text()

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/import-40', component: stub },
      { path: '/import-40/new', component: stub },
      { path: '/import-40/new/:id', component: stub },
      { path: '/:p(.*)*', component: stub },
    ],
  })
  reg.loaded = ref(true)
  reg.complete = ref(true)
  const auth = useAuthStore()
  auth.role = 'Client'
  auth.modules = ['import40']
  api.list.mockResolvedValue(FIXTURE)
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('ClientShipmentsView', () => {
  it('вкладки со счётчиками; по умолчанию — только «В работе»', async () => {
    await mountAt('/import-40')
    expect(api.list).toHaveBeenCalledTimes(1)
    expect(w.get('h1').text()).toBe('Мои поставки')
    expect(w.get('[data-client-summary]').text()).toBe('2 в работе · ждут вашего ответа: 2')
    expect(tabCount('active')).toBe('2')
    expect(tabCount('waiting')).toBe('2')
    expect(tabCount('drafts')).toBe('1')
    expect(tabCount('done')).toBe('1')
    expect(w.get('[data-client-tab="active"]').attributes('aria-current')).toBe('page')
    expect(w.get('[data-client-tab="waiting"]').attributes('aria-current')).toBeUndefined()
    expect(rowNumbers()).toEqual(['ИМ-2026-0166', 'ИМ-2026-0170'])
  })

  it('?tab=waiting — только поставки, где ход клиента; клик по вкладке меняет адрес без новой записи', async () => {
    await mountAt('/import-40?tab=waiting')
    expect(rowNumbers()).toEqual(['ИМ-2026-0171', 'ИМ-2026-0172'])
    expect(w.findAll('[data-client-row]').every((r) => r.attributes('data-ask'))).toBe(true)

    const replace = vi.spyOn(router, 'replace')
    await w.get('[data-client-tab="drafts"]').trigger('click')
    await flushPromises()
    expect(replace).toHaveBeenCalled()
    expect(router.currentRoute.value.query.tab).toBe('drafts')
    expect(rowNumbers()).toEqual(['ИМ-2026-0173'])

    await w.get('[data-client-tab="active"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.tab).toBeUndefined()
    expect(rowNumbers()).toEqual(['ИМ-2026-0166', 'ИМ-2026-0170'])
  })

  it('поиск по номеру оставляет одну строку и пишется в ?q=; по посту — без учёта регистра', async () => {
    await mountAt('/import-40')
    const input = w.get('[data-client-search]')
    await input.setValue('ИМ-2026-0166')
    await flushPromises()
    expect(rowNumbers()).toEqual(['ИМ-2026-0166'])
    expect(router.currentRoute.value.query.q).toBe('ИМ-2026-0166')
    expect(tabCount('waiting')).toBe('0')

    await input.setValue('хоргос')
    await flushPromises()
    expect(rowNumbers()).toEqual(['ИМ-2026-0170'])

    await input.setValue('нет такого')
    await flushPromises()
    expect(w.get('[data-client-empty="search"]').text()).toContain('По запросу «нет такого» ничего не нашлось')
  })

  it('быстрый ввод: промежуточный переход не откатывает поле', async () => {
    await mountAt('/import-40')
    const input = w.get('[data-client-search]')
    void input.setValue('a')
    void input.setValue('ab')
    await flushPromises()
    expect((input.element as HTMLInputElement).value).toBe('ab')
    expect(router.currentRoute.value.query.q).toBe('ab')
  })

  it('на телефоне поиск раньше вкладок в DOM (порядок Tab); цели касания — 44px', async () => {
    api.list.mockRejectedValueOnce(new Error('boom'))
    await mountAt('/import-40')
    const search = w.get('[data-client-search]').element
    const nav = w.get('nav').element
    expect(search.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // ZInput вешает класс на обёртку поля.
    expect(search.closest('.max-sm\\:h-11')).not.toBeNull()
    // Поиск уходит вправо от вкладок только с xl: ниже полоса вкладок целиком, ничем не перекрыта.
    expect(search.closest('.xl\\:order-2')).not.toBeNull()
    expect(w.get('nav').classes()).toContain('xl:order-1')
    expect(w.get('[data-client-tab="active"]').classes()).toContain('max-sm:min-h-11')
    expect(w.get('[data-client-new]').classes()).toContain('max-sm:h-11')
    expect(w.get('[data-client-retry]').classes()).toContain('max-sm:h-11')
  })

  it('поиск читается из адреса при открытии', async () => {
    await mountAt('/import-40?q=0170')
    expect((w.get('[data-client-search]').element as HTMLInputElement).value).toBe('0170')
    expect(rowNumbers()).toEqual(['ИМ-2026-0170'])
  })

  it('старые ссылки: ?new=1 → мастер, ?continueId= → черновик в мастере', async () => {
    await mountAt('/import-40?new=1')
    expect(router.currentRoute.value.fullPath).toBe('/import-40/new')
    expect(api.list).not.toHaveBeenCalled()
    w.unmount()

    await mountAt('/import-40?continueId=x')
    expect(router.currentRoute.value.fullPath).toBe('/import-40/new/x')
  })

  it('ошибка загрузки — «Повторить» перезапрашивает', async () => {
    api.list.mockRejectedValueOnce(new Error('boom'))
    await mountAt('/import-40')
    expect(w.find('[data-client-error]').exists()).toBe(true)
    expect(w.find('[data-client-list]').exists()).toBe(false)
    await w.get('[data-client-retry]').trigger('click')
    await flushPromises()
    expect(api.list).toHaveBeenCalledTimes(2)
    expect(w.find('[data-client-error]').exists()).toBe(false)
    expect(rowNumbers()).toHaveLength(2)
  })

  it('пустая вкладка — своя подпись', async () => {
    api.list.mockResolvedValue([kase({})])
    await mountAt('/import-40?tab=drafts')
    expect(w.get('[data-client-empty="drafts"]').text()).toContain('Черновиков нет')
  })

  it('поставок нет совсем — ZEmpty с «Оформить поставку», ведёт в мастер', async () => {
    api.list.mockResolvedValue([])
    await mountAt('/import-40')
    const empty = w.get('[data-client-empty="none"]')
    expect(empty.text()).toContain('Поставок пока нет')
    const btn = empty.get('[data-client-new]')
    expect(btn.text()).toContain('Оформить поставку')
    await btn.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/import-40/new')
  })

  it('пока регистрация не завершена, «Оформить поставку» выключена', async () => {
    reg.complete = ref(false)
    await mountAt('/import-40')
    expect(w.get('[data-client-new]').attributes('disabled')).toBeDefined()
  })
})
