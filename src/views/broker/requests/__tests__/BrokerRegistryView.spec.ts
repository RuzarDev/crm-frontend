import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { RegistryRowDto } from '@/api/registry'

const api = vi.hoisted(() => ({ list: vi.fn(), exportXlsx: vi.fn() }))
vi.mock('@/api/registry', () => ({ registryApi: { list: api.list } }))
vi.mock('@/views/broker/list', async (orig) => ({ ...(await orig<typeof import('@/views/broker/list')>()), exportXlsx: api.exportXlsx }))

import BrokerRegistryView from '../BrokerRegistryView.vue'

const r = (o: Partial<RegistryRowDto>): RegistryRowDto => ({
  id: 'i1', serviceType: 'import40', number: 'ИМ-2026-0001', title: 'кабель силовой', clientName: 'ТОО Альфа',
  statusLabel: 'Декларирование', isProblem: false, createdAtUtc: '2026-10-01T08:00:00Z', updatedAtUtc: '2026-10-08T08:00:00Z',
  ...o,
})
const ITEMS = [
  r({}),
  r({ id: 't1', serviceType: 'transit', number: null, title: 'MSKU1234567', clientName: 'transit-client', statusLabel: 'В работе' }),
  r({ id: 'i2', number: 'ИМ-2026-0002', isProblem: true, statusLabel: 'Проблема' }),
]

let w: VueWrapper
let router: Router
const mountView = async () => {
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  await router.push('/requests-registry')
  await router.isReady()
  w = mountWithI18n(BrokerRegistryView, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
}
const lastQuery = () => api.list.mock.calls.at(-1)![0]
const pickType = async (label: string) => {
  await w.findAll('[data-registry-type] button').find((b) => b.text() === label)!.trigger('click')
  await flushPromises()
}

beforeEach(() => {
  api.list.mockImplementation(async (q: { page: number }) => ({ items: ITEMS, totalCount: 60, page: q.page, pageSize: 25 }))
  api.exportXlsx.mockResolvedValue(undefined)
})
afterEach(() => {
  vi.useRealTimers()
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('BrokerRegistryView', () => {
  it('первый запрос: страница 1 по 25, без фильтров, тихо; заголовок и общее число', async () => {
    await mountView()
    expect(api.list).toHaveBeenCalledTimes(1)
    expect(api.list).toHaveBeenCalledWith({ type: undefined, status: undefined, search: undefined, from: undefined, to: undefined, page: 1, pageSize: 25 }, { silent: true })
    expect(w.get('h1').text()).toBe('Сводный реестр')
    expect(w.get('[data-registry-count]').text()).toBe('60')
  })

  it('строки: тип, номер, груз, клиент, статус (проблема — тегом), создана', async () => {
    await mountView()
    const rows = w.findAll('tbody tr')
    expect(rows).toHaveLength(3)
    expect(rows[0].text()).toContain('Импорт 40')
    expect(rows[0].text()).toContain('ИМ-2026-0001')
    expect(rows[0].text()).toContain('кабель силовой')
    expect(rows[0].text()).toContain('ТОО Альфа')
    expect(rows[0].text()).toContain('Декларирование')
    expect(rows[0].text()).toContain('01.10.2026')
    expect(rows[1].text()).toContain('Транзит')
    expect(rows[1].text()).toContain('—') // у транзита нет номера
    expect(rows[2].text()).toContain('Проблема')
    expect(rows[2].find('[class*="bg-tone-danger-bg"]').exists()).toBe(true)
    expect(rows[0].find('[class*="bg-tone-info-bg"]').exists()).toBe(true)
    expect(rows[1].find('[class*="bg-tone-pay-bg"]').exists()).toBe(true)
  })

  it('фильтр типа: «Статус» появляется только при выбранном типе; смена типа сбрасывает статус и страницу', async () => {
    await mountView()
    const statusChip = () => w.findAll('button').find((b) => b.text() === 'Статус')
    expect(statusChip()).toBeUndefined()
    await pickType('Импорт 40')
    expect(lastQuery()).toMatchObject({ type: 'import40', status: undefined, page: 1 })
    expect(statusChip()).toBeDefined()
    await statusChip()!.trigger('click')
    await flushPromises()
    const opt = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.includes('Декларирование'))!
    opt.click()
    await flushPromises()
    expect(lastQuery()).toMatchObject({ type: 'import40', status: 'import40:2', page: 1 })
    await w.findAll('button').find((b) => b.text() === '2')!.trigger('click')
    await flushPromises()
    expect(lastQuery()).toMatchObject({ status: 'import40:2', page: 2 })
    await pickType('Транзит')
    expect(lastQuery()).toMatchObject({ type: 'transit', status: undefined, page: 1 })
    await pickType('Все')
    expect(lastQuery().type).toBeUndefined()
    expect(statusChip()).toBeUndefined()
  })

  it('статус уходит в запрос и сбрасывается на страницу 1', async () => {
    await mountView()
    await pickType('Транзит')
    await w.findAll('button').find((b) => b.text() === 'Статус')!.trigger('click')
    await flushPromises()
    const opts = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')]
    expect(opts.map((o) => o.textContent?.trim())).toContain('Выпущена')
    opts.find((o) => o.textContent?.includes('Выпущена'))!.click()
    await flushPromises()
    expect(lastQuery()).toMatchObject({ type: 'transit', status: 'transit:2', page: 1 })
  })

  it('поиск уходит в запрос после debounce 400 мс, с обрезкой пробелов; до этого — нет', async () => {
    await mountView()
    vi.useFakeTimers()
    const input = w.get('[data-registry-search]')
    await input.setValue('  альфа ')
    vi.advanceTimersByTime(399)
    await flushPromises()
    expect(api.list).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    await flushPromises()
    expect(api.list).toHaveBeenCalledTimes(2)
    expect(lastQuery()).toMatchObject({ search: 'альфа', page: 1 })
  })

  it('смена страницы — запрос с номером страницы; фильтр после этого — снова страница 1', async () => {
    await mountView()
    const next = w.findAll('button').find((b) => b.text() === '2')!
    await next.trigger('click')
    await flushPromises()
    expect(lastQuery().page).toBe(2)
    await pickType('Импорт 40')
    expect(lastQuery()).toMatchObject({ type: 'import40', page: 1 })
  })

  it('клик по строке: Импорт 40 — в карточку, транзит — в /reestr', async () => {
    await mountView()
    await w.findAll('tbody tr')[0].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/import-40/i1')
    await w.findAll('tbody tr')[1].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/reestr')
  })

  it('«Excel» выгружает строки текущей страницы; без строк кнопка выключена', async () => {
    await mountView()
    await w.get('[data-registry-excel]').trigger('click')
    await flushPromises()
    const [file, sheet, rows] = api.exportXlsx.mock.calls[0]
    expect(file).toBe('Сводный_реестр')
    expect(sheet).toBe('Сводный реестр')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ Тип: 'Импорт 40', '№': 'ИМ-2026-0001', 'Груз / описание': 'кабель силовой', Клиент: 'ТОО Альфа', Статус: 'Декларирование', Создана: '01.10.2026' })
    expect(rows[1]['№']).toBe('')
    w.unmount()
    api.list.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 25 })
    await mountView()
    expect(w.get('[data-registry-excel]').attributes('disabled')).toBeDefined()
  })

  it('пусто: «Заявок не нашлось»; с фильтром — «Сбросить фильтры» возвращает всё', async () => {
    await mountView()
    api.list.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 25 })
    await pickType('Транзит')
    expect(w.text()).toContain('Заявок не нашлось')
    api.list.mockImplementation(async () => ({ items: ITEMS, totalCount: 3, page: 1, pageSize: 25 }))
    await w.get('[data-registry-reset]').trigger('click')
    await flushPromises()
    expect(lastQuery().type).toBeUndefined()
    expect(w.findAll('tbody tr')).toHaveLength(3)
  })

  it('ошибка: блок с «Повторить» вместо таблицы; повтор перезагружает', async () => {
    api.list.mockRejectedValueOnce(new Error('500'))
    await mountView()
    expect(w.find('[data-registry-error]').exists()).toBe(true)
    expect(w.find('[data-registry-table]').exists()).toBe(false)
    await w.get('[data-registry-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-registry-error]').exists()).toBe(false)
    expect(w.findAll('tbody tr')).toHaveLength(3)
  })
})
