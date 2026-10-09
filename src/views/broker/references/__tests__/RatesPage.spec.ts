import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'

const api = vi.hoisted(() => ({ currencies: vi.fn() }))
vi.mock('@/api/tnved', () => ({ tnvedApi: api }))

import RatesPage from '../RatesPage.vue'
import { resetCurrenciesCache } from '@/views/client/tnved/currency'

const RATES = [
  { codeLat: 'AED', name: 'Дирхам ОАЭ', rate: 136.12, updatedAtUtc: '2026-10-07T03:00:00Z' },
  { codeLat: 'CNY', name: 'Юань', rate: 70.5, updatedAtUtc: '2026-10-08T03:00:00Z' },
  { codeLat: 'EUR', name: 'Евро', rate: 560.1234, updatedAtUtc: '2026-10-08T03:00:00Z' },
  { codeLat: 'USD', name: 'Доллар США', rate: 500, updatedAtUtc: '2026-10-08T03:00:00Z' },
]
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } })

let w: VueWrapper
let router: Router
const mountAt = async (path: string) => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(RatesPage, { attachTo: document.body, global: { plugins: [createPinia(), router] } })
  await flushPromises()
}
const codes = () => w.findAll('[data-rate-row]').map((r) => r.attributes('data-rate-row'))

beforeEach(() => {
  resetCurrenciesCache()
  setActivePinia(createPinia())
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  api.currencies.mockResolvedValue({ data: RATES })
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('RatesPage (сотрудник)', () => {
  it('заголовок, «за 1 ед.», частые валюты сверху, «Обновлено»', async () => {
    await mountAt('/tnved/currencies')
    expect(w.get('h1').text()).toBe('Курсы валют')
    expect(w.text()).toContain('₸ за 1 ед.')
    expect(codes()).toEqual(['USD', 'EUR', 'CNY', 'AED'])
    expect(w.get('[data-rate-row="EUR"] [data-rate-value]').text()).toBe('560,1234')
    expect(w.get('[data-rates-updated]').text()).toMatch(/^Обновлено: \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/)
  })

  it('поиск по коду и названию, пишется в ?q=; ничего не нашлось — отдельный текст', async () => {
    await mountAt('/tnved/currencies')
    await w.get('[data-rates-search]').setValue('юань')
    await flushPromises()
    expect(codes()).toEqual(['CNY'])
    expect(router.currentRoute.value.query.q).toBe('юань')
    await w.get('[data-rates-search]').setValue('zzz')
    await flushPromises()
    expect(w.get('[data-rates-nothing]').text()).toContain('По запросу «zzz» ничего не нашлось')
  })

  it('«Обновить» спрашивает сервер заново, а не берёт кэш', async () => {
    await mountAt('/tnved/currencies')
    expect(api.currencies).toHaveBeenCalledTimes(1)
    api.currencies.mockResolvedValueOnce({ data: [{ codeLat: 'USD', name: 'Доллар США', rate: 512.5, updatedAtUtc: '2026-10-09T03:00:00Z' }] })
    await w.get('[data-rates-refresh]').trigger('click')
    await flushPromises()
    expect(api.currencies).toHaveBeenCalledTimes(2)
    expect(codes()).toEqual(['USD'])
    expect(w.get('[data-rate-row="USD"] [data-rate-value]').text()).toBe('512,50')
  })

  it('ошибка — «Повторить»; 429 — про лимит; пусто — отдельный текст', async () => {
    api.currencies.mockRejectedValueOnce(httpError(500)).mockRejectedValueOnce(httpError(429)).mockResolvedValueOnce({ data: [] })
    await mountAt('/tnved/currencies')
    expect(w.get('[data-rates-error]').text()).toContain('Не удалось загрузить')
    await w.get('[data-rates-retry]').trigger('click')
    await flushPromises()
    expect(w.get('[data-rates-error]').text()).toContain('Слишком много запросов')
    await w.get('[data-rates-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-rates-error]').exists()).toBe(false)
    expect(w.get('[data-rates-empty]').text()).toContain('Курсов пока нет')
  })
})
