import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'

const api = vi.hoisted(() => ({ currencies: vi.fn() }))
vi.mock('@/api/tnved', () => ({ tnvedApi: api }))

import ClientRatesView from '../ClientRatesView.vue'

const RATES = [
  { codeLat: 'AED', name: 'Дирхам ОАЭ', rate: 136.12, updatedAtUtc: '2026-10-07T03:00:00Z' },
  { codeLat: 'CNY', name: 'Юань', rate: 70.5, updatedAtUtc: '2026-10-08T03:00:00Z' },
  { codeLat: 'EUR', name: 'Евро', rate: 560.1234, updatedAtUtc: '2026-10-08T03:00:00Z' },
  { codeLat: 'KRW', name: 'Вона', rate: 0.36789, updatedAtUtc: '2026-10-08T03:00:00Z' },
  { codeLat: 'USD', name: 'Доллар США', rate: 500, updatedAtUtc: '2026-10-08T03:00:00Z' },
]
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } })

let w: VueWrapper
let router: Router
const mountAt = async (path: string) => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(ClientRatesView, { attachTo: document.body, global: { plugins: [createPinia(), router] } })
  await flushPromises()
}
const codes = () => w.findAll('[data-rate-row]').map((r) => r.attributes('data-rate-row'))
const nb = (s: string) => s.replace(/ /g, ' ')

beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  api.currencies.mockResolvedValue({ data: RATES })
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('ClientRatesView', () => {
  it('частые валюты сверху, курс с 2–4 знаками, «Обновлено» по свежему курсу', async () => {
    await mountAt('/tnved/currencies')
    expect(api.currencies).toHaveBeenCalledWith({ silent: true })
    expect(w.get('h1').text()).toBe('Курсы валют')
    expect(w.text()).toContain('Курсы Национального банка РК, ₸ за единицу')
    expect(codes()).toEqual(['USD', 'EUR', 'CNY', 'AED', 'KRW'])
    expect(w.get('[data-rate-row="USD"] [data-rate-value]').text()).toBe('500,00')
    expect(w.get('[data-rate-row="EUR"] [data-rate-value]').text()).toBe('560,1234')
    expect(w.get('[data-rate-row="KRW"] [data-rate-value]').text()).toBe('0,3679')
    expect(w.get('[data-rate-row="USD"] [data-rate-name]').text()).toBe('Доллар США')
    const d = new Date('2026-10-08T03:00:00Z')
    const p = (n: number) => String(n).padStart(2, '0')
    expect(w.get('[data-rates-updated]').text())
      .toBe(`Обновлено ${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`)
  })

  it('поиск по коду и названию фильтрует строки и пишется в ?q=', async () => {
    await mountAt('/tnved/currencies')
    const input = w.get('[data-rates-search]')
    await input.setValue('eur')
    await flushPromises()
    expect(codes()).toEqual(['EUR'])
    expect(router.currentRoute.value.query.q).toBe('eur')
    await input.setValue('юань')
    await flushPromises()
    expect(codes()).toEqual(['CNY'])
    await input.setValue('zzz')
    await flushPromises()
    expect(w.get('[data-rates-nothing]').text()).toContain('По запросу «zzz» ничего не нашлось')
  })

  it('?q= из адреса применяется сразу', async () => {
    await mountAt('/tnved/currencies?q=usd')
    expect(codes()).toEqual(['USD'])
    expect((w.get('[data-rates-search]').element as HTMLInputElement).value).toBe('usd')
  })

  it('пустой список — пустое состояние', async () => {
    api.currencies.mockResolvedValue({ data: [] })
    await mountAt('/tnved/currencies')
    expect(w.get('[data-rates-empty]').text()).toContain('Курсов пока нет')
  })

  it('ошибка — «Повторить»; 429 — про лимит', async () => {
    api.currencies.mockRejectedValueOnce(httpError(500)).mockRejectedValueOnce(httpError(429)).mockResolvedValueOnce({ data: RATES })
    await mountAt('/tnved/currencies')
    expect(w.get('[data-rates-error]').text()).toContain('Не удалось загрузить курсы')
    await w.get('[data-rates-retry]').trigger('click')
    await flushPromises()
    expect(w.get('[data-rates-error]').text()).toContain('Слишком много запросов, попробуйте через минуту')
    await w.get('[data-rates-retry]').trigger('click')
    await flushPromises()
    expect(codes()).toHaveLength(5)
    expect(w.get('[data-rate-row="AED"] [data-rate-value]').text()).toBe(nb('136,12'))
  })
})
