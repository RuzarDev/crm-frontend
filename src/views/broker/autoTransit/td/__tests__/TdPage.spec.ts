import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { DeclarationResponse } from '@/api/autoTransit'
import { httpError, response } from './tdFixture'

const api = vi.hoisted(() => ({ getDeclaration: vi.fn(), saveDeclaration: vi.fn() }))
vi.mock('@/api/autoTransit', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api/autoTransit')>()), ...api }))
const tnved = vi.hoisted(() => ({ node: vi.fn(), rates: vi.fn() }))
vi.mock('@/api/tnved', () => ({ tnvedApi: tnved }))
vi.mock('@/api/references', async () => ({ referencesApi: (await import('@/views/broker/transit/record/sections/__tests__/harness')).refsApi }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))

import TdPage from '../TdPage.vue'
import { confirmState } from '@/ui/confirm'
import { useAuthStore } from '@/stores/auth'
import { ComboStub, SelectStub, primeRefs } from '@/views/broker/transit/record/sections/__tests__/harness'

const App = defineComponent({ render: () => h(RouterView) })
let w: VueWrapper
let pinia: Pinia
let router: Router
const settle = async () => { await flushPromises(); await nextTick(); await flushPromises() }
const open = async (r: DeclarationResponse) => {
  api.getDeclaration.mockResolvedValue(r)
  await router.push('/auto-transit/t1/parties/p1/td')
  await router.isReady()
  w = mountWithI18n(App, { attachTo: document.body, global: { plugins: [pinia, router], stubs: { ZSelect: SelectStub, ZCombobox: ComboStub } } })
  await settle()
}
const has = (sel: string) => w.find(sel).exists()
const text = (s: string) => s.replace(/\s+/g, ' ').trim()
const typeInto = async (sel: string, value: string) => {
  const el = w.get(sel)
  const input = el.element.tagName === 'INPUT' ? el : el.get('input')
  ;(input.element as HTMLInputElement).value = value
  await input.trigger('input')
  await nextTick()
}

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.role = 'manager'
  auth.permissions = ['autotransit.read', 'autotransit.declare']
  primeRefs()
  tnved.node.mockResolvedValue({ data: { is10: true, name: 'Ноутбуки' } })
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  Element.prototype.scrollIntoView = vi.fn()
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/auto-transit/:id', name: 'auto-transit-truck', component: { template: '<div data-truck-page />' } },
      { path: '/auto-transit/:id/parties/:partyId/td', name: 'auto-transit-td', component: TdPage },
    ],
  })
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('TdPage', () => {
  it('шапка: госномер, партия, получатель, «Назад к машине»; разделы по порядку, без строки реестра, станций и «Пост»', async () => {
    await open(response())
    expect(api.getDeclaration).toHaveBeenCalledWith('t1', 'p1')
    const head = text(w.get('[data-td-header]').text())
    expect(head).toContain('123ASD12')
    expect(head).toContain('12DS12')
    expect(head).toContain('Партия 1')
    expect(head).toContain('ТОО «Получатель 1»')
    expect(w.get('[data-td-back]').attributes('href')).toBe('/auto-transit/t1')
    expect(w.findAll('[data-td-sections] > section').map((s) => s.attributes('data-record-section'))).toEqual([
      'main', 'organizations', 'carriers', 'transport', 'seals', 'goods', 'doc44', 'packaging', 'preceding', 'guarantees', 'misc',
    ])
    expect(has('[data-record-section="row"]')).toBe(false)
    expect(has('[data-f="post"]')).toBe(false)
    expect(has('[data-f="loadingRailStation"]')).toBe(false)
    expect(has('[data-f="unloadingRailStation"]')).toBe(false)
    expect(has('[data-f="departureCountryCode"]')).toBe(true)
    expect(has('[data-f="destinationCustomsOffice"]')).toBe(true)
    expect(has('[data-td-draft]')).toBe(false)
  })

  it('черновик помечен и сохраняется: плашка сохранения видна сразу', async () => {
    await open(response({ isDraft: true }))
    expect(text(w.get('[data-td-draft]').text())).toContain('Заполнено из машины и партии, не сохранено')
    expect(has('[data-record-savebar]')).toBe(true)
    api.saveDeclaration.mockResolvedValue(response())
    await w.get('[data-td-save]').trigger('click')
    await settle()
    expect(api.saveDeclaration).toHaveBeenCalledTimes(1)
    expect(has('[data-td-draft]')).toBe(false)
  })

  it('«Не заполнено: N» — список, клик ведёт к разделу', async () => {
    await open(response({ missing: [
      { key: 'organizations.consignee', section: 'organizations' },
      { key: 'goods[1].tnvedCode', section: 'goods' },
    ] }))
    expect(text(w.get('[data-td-missing-title]').text())).toBe('Не заполнено: 2')
    const items = w.findAll('[data-td-missing-item]')
    expect(items.map((i) => text(i.text()))).toEqual(['Получатель (организация)', 'Товар 2: код ТН ВЭД'])
    const spy = Element.prototype.scrollIntoView as unknown as ReturnType<typeof vi.fn>
    await items[1].trigger('click')
    expect(spy).toHaveBeenCalled()
    expect((spy.mock.contexts.at(-1) as HTMLElement).id).toBe('sec-goods')
  })

  it('только для чтения: разделы получают readonly, кнопки сохранения нет, причина видна', async () => {
    await open(response({ readOnly: true, party: { id: 'p1', number: 1, recipientName: 'ТОО «Получатель 1»', submitted: true } }))
    expect(has('[data-td-save]')).toBe(false)
    expect(has('[data-record-savebar]')).toBe(false)
    expect(text(w.get('[data-td-readonly]').text())).toContain('ТД подана')
    expect(w.get('[data-f="departureCountryCode"]').attributes('data-disabled')).toBe('true')
    expect(w.findAll('[data-record-section="goods"] [data-section-add]')).toHaveLength(0)
  })

  it('409: сообщение о конфликте, введённое не теряется, «Обновить» перечитывает', async () => {
    await open(response())
    await typeInto('[data-f="transportDocNumber"]', 'CMR-777')
    api.saveDeclaration.mockRejectedValue(httpError(409, { code: 'conflict' }))
    await w.get('[data-td-save]').trigger('click')
    await settle()
    expect(text(w.get('[data-td-save-error]').text())).toContain('другой сотрудник')
    const input = w.get('[data-f="transportDocNumber"]')
    expect(((input.element.tagName === 'INPUT' ? input : input.get('input')).element as HTMLInputElement).value).toBe('CMR-777')
    api.getDeclaration.mockResolvedValue(response({ version: 9 }))
    await w.get('[data-td-reload]').trigger('click')
    await settle()
    expect(has('[data-td-save-error]')).toBe(false)
    expect(((input.element.tagName === 'INPUT' ? input : input.get('input')).element as HTMLInputElement).value).toBe('CMR-777')
  })

  it('уход с несохранённым спрашивает подтверждение; «Остаться» — страница на месте', async () => {
    await open(response())
    await typeInto('[data-f="transportDocNumber"]', 'CMR-1')
    const nav = router.push('/auto-transit/t1')
    await settle()
    expect(confirmState.open).toBe(true)
    confirmState.resolve(false)
    await nav
    await settle()
    expect(router.currentRoute.value.name).toBe('auto-transit-td')
  })

  it('без правок уходит без вопроса', async () => {
    await open(response())
    await router.push('/auto-transit/t1')
    await settle()
    expect(confirmState.open).toBe(false)
    expect(router.currentRoute.value.name).toBe('auto-transit-truck')
  })

  it('контейнеры свёрнуты в конце и раскрываются', async () => {
    await open(response())
    expect(has('[data-record-section="containers"]')).toBe(false)
    await w.get('[data-td-containers-toggle]').trigger('click')
    expect(has('[data-record-section="containers"]')).toBe(true)
  })

  it('ТД не найдена — пустое состояние со ссылкой к машине', async () => {
    api.getDeclaration.mockRejectedValue(httpError(404))
    await router.push('/auto-transit/t1/parties/p1/td')
    await router.isReady()
    w = mountWithI18n(App, { attachTo: document.body, global: { plugins: [pinia, router], stubs: { ZSelect: SelectStub, ZCombobox: ComboStub } } })
    await settle()
    expect(has('[data-td-not-found]')).toBe(true)
  })
})
