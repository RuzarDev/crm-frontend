import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { TruckCard } from '@/api/autoTransit'
import { blockerText, currentBlockers, rights } from '../truckView'
import { card, httpError, party } from './truckFixtures'

// ПИ под авто (очередь 3, этап 1): «ПИ подана», краткий номер, доп. инвойсы, ожидаемый въезд, блокеры ПИ.
const api = vi.hoisted(() => ({
  getTruck: vi.fn(), submitParty: vi.fn(), unsubmitParty: vi.fn(), updateParty: vi.fn(), updateTruck: vi.fn(),
  piSubmitted: vi.fn(), piUnsubmit: vi.fn(), listLinks: vi.fn(),
}))
vi.mock('@/api/autoTransit', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api/autoTransit')>()), ...api }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: msg }))
vi.mock('@/composables/useCountryAlpha2Options', () => ({ useCountryAlpha2Options: () => ref([{ value: 'KZ', label: 'KZ — Казахстан' }]) }))
vi.mock('@/api/clientsOnboarding', () => ({ clientsOnboardingApi: { list: vi.fn().mockResolvedValue([]) } }))

import TruckPage from '../TruckPage.vue'
import TruckEditModal from '../TruckEditModal.vue'
import { confirmState } from '@/ui/confirm'
import { useAuthStore } from '@/stores/auth'

const t = (key: string, p?: Record<string, unknown>) => `${key}${p ? JSON.stringify(p) : ''}`

describe('truckView: блокеры ПИ', () => {
  const c = (o: Partial<TruckCard> = {}) => card({ currentStage: 1, parties: [party('p1', 1)], ...o })
  it('pi_not_submitted и pi_urgent показываются на этапах 1–2 рядом с блокерами этапа', () => {
    const blockers = [{ code: 'no_files', partyId: null }, { code: 'pi_urgent', partyId: 'p1', partyNumber: 1, minutesLeft: 110 }]
    expect(currentBlockers(c({ blockers })).map((b) => b.code)).toEqual(['no_files', 'pi_urgent'])
    expect(currentBlockers(c({ currentStage: 2, blockers: [{ code: 'pi_not_submitted', partyId: 'p1', partyNumber: 1 }] })).map((b) => b.code)).toEqual(['pi_not_submitted'])
  })

  it('текст: минуты до въезда; въезд прошёл — свой текст; партия по номеру, если id нет', () => {
    const cc = c()
    expect(blockerText({ code: 'pi_urgent', partyId: 'p1', partyNumber: 1, minutesLeft: 110 }, cc, t))
      .toBe('broker.autoTransit.blocker.party{"n":1,"text":"broker.autoTransit.blocker.hint.pi_urgent{\\"count\\":0,\\"minutes\\":110}"}')
    expect(blockerText({ code: 'pi_urgent', partyId: null, partyNumber: 2, minutesLeft: -5 }, cc, t))
      .toBe('broker.autoTransit.blocker.party{"n":2,"text":"broker.autoTransit.blocker.hint.pi_urgent_late{\\"count\\":0,\\"minutes\\":-5}"}')
  })

  it('права «ПИ подана» — декларант у машины в работе', () => {
    expect(rights(card({ can: { border: false, declare: true, manage: false } })).pi).toBe(true)
    expect(rights(card({ can: { border: true, declare: false, manage: true } })).pi).toBe(false)
    expect(rights(card({ status: 'archived', can: { border: false, declare: true, manage: false } })).pi).toBe(false)
  })
})

let w: VueWrapper
let pinia: Pinia
let router: Router
const App = defineComponent({ render: () => h(RouterView) })
const text = (s: string) => s.replace(/\s+/g, ' ').trim()
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel)
const $$ = (sel: string) => Array.from(document.body.querySelectorAll<HTMLElement>(sel))
const setInput = (sel: string, v: string) => {
  const el = $(sel) as HTMLInputElement
  el.value = v
  el.dispatchEvent(new Event('input'))
}
const okIn = (modal: string, label: string) => $$(`${modal} button`).find((b) => b.textContent?.trim() === label)!
const DECL = { border: false, declare: true, manage: false }
const mountWith = async (c: TruckCard, perms = ['autotransit.read', 'autotransit.declare']) => {
  const auth = useAuthStore()
  auth.role = 'manager'
  auth.permissions = perms
  api.getTruck.mockResolvedValue(c)
  await router.push('/auto-transit/t1')
  await router.isReady()
  w = mountWithI18n(App, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(new Date('2026-11-16T10:00:00Z'))
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  pinia = createPinia()
  setActivePinia(pinia)
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/auto-transit', name: 'auto-transit', component: { template: '<div/>' } },
      { path: '/auto-transit/:id', name: 'auto-transit-truck', component: TruckPage },
      { path: '/auto-transit/:id/parties/:partyId/td', name: 'auto-transit-td', component: { template: '<div/>' } },
    ],
  })
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('TruckPage: ПИ партии', () => {
  it('«ПИ не подана» → окно с номером → piSubmitted; без номера не уходит', async () => {
    await mountWith(card({ currentStage: 1, can: DECL }))
    expect(text(w.get('[data-party-pi]').text())).toBe('ПИ не подана')
    await w.get('[data-party-pi-submit]').trigger('click')
    await flushPromises()
    okIn('[data-pi-modal]', 'Сохранить').click()
    await flushPromises()
    expect(api.piSubmitted).not.toHaveBeenCalled()
    expect($('[data-pi-modal]')!.textContent).toContain('Введите номер ПИ')
    setInput('[data-pi-number]', ' 50509/251126/П000123 ')
    api.piSubmitted.mockResolvedValue(card({ currentStage: 1, can: DECL, parties: [party('p1', 1, { piNumber: '50509/251126/П000123', piSubmittedAtUtc: '2026-11-16T10:00:00Z' })] }))
    okIn('[data-pi-modal]', 'Сохранить').click()
    await flushPromises()
    expect(api.piSubmitted).toHaveBeenCalledWith('t1', 'p1', '50509/251126/П000123')
    expect(msg.success).toHaveBeenCalledWith('ПИ подана · партия 1')
    expect(text(w.get('[data-party-pi]').text())).toContain('ПИ № 50509/251126/П000123 подана')
    expect(w.find('[data-party-pi-submit]').exists()).toBe(false)
    api.piUnsubmit.mockResolvedValue(card({ currentStage: 1, can: DECL }))
    await w.get('[data-party-pi-unsubmit]').trigger('click')
    await flushPromises()
    expect(api.piUnsubmit).toHaveBeenCalledWith('t1', 'p1')
  })

  it('«ТД подана» без краткого номера выключена с подсказкой; с номером — доступна; 409 short_number_required — понятный тост', async () => {
    await mountWith(card({ currentStage: 5, can: DECL, parties: [party('p1', 1, { shortNumber: null })] }))
    expect(w.get('[data-party-submit]').attributes('disabled')).toBeDefined()
    expect(text(w.get('[data-party-submit-hint]').text())).toBe('Сначала внесите краткий номер от СВХ: «Изменить» партию')
    w.unmount()
    await mountWith(card({ currentStage: 5, can: DECL, parties: [party('p1', 1, { shortNumber: 'K-77' })] }))
    expect(w.get('[data-party-short]').text()).toBe('K-77')
    const btn = w.get('[data-party-submit]')
    expect(btn.attributes('disabled')).toBeUndefined()
    api.submitParty.mockRejectedValue(httpError(409, { code: 'short_number_required', error: '…' }))
    await btn.trigger('click')
    await flushPromises()
    expect(msg.error).toHaveBeenCalledWith('«ТД подана» без краткого номера не отметить: внесите краткий номер от СВХ в партии.')
  })

  it('окно партии: краткий номер, номер ПИ и доп. инвойсы уходят только изменёнными', async () => {
    await mountWith(card({ currentStage: 1, can: DECL, parties: [party('p1', 1, { shortNumber: null, piNumber: null, additionalInvoices: [] })] }))
    await w.get('[data-party-edit]').trigger('click')
    await flushPromises()
    setInput('[data-party-short-number]', 'K-1')
    ;($('[data-party-add-invoice]') as HTMLElement).click()
    await flushPromises()
    setInput('[data-party-extra-invoice="0"]', 'INV-2')
    api.updateParty.mockResolvedValue(card())
    okIn('[data-party-modal]', 'Сохранить').click()
    await flushPromises()
    expect(api.updateParty).toHaveBeenCalledWith('t1', 'p1', { shortNumber: 'K-1', additionalInvoices: [{ number: 'INV-2', date: null }] })
  })

  it('пустая строка доп. инвойса — ошибка под строкой, запрос не уходит', async () => {
    await mountWith(card({ currentStage: 1, can: DECL, parties: [party('p1', 1, { additionalInvoices: [] })] }))
    await w.get('[data-party-edit]').trigger('click')
    await flushPromises()
    ;($('[data-party-add-invoice]') as HTMLElement).click()
    await flushPromises()
    okIn('[data-party-modal]', 'Сохранить').click()
    await flushPromises()
    expect(api.updateParty).not.toHaveBeenCalled()
    expect($('[data-party-modal]')!.textContent).toContain('Введите номер или удалите строку')
  })

  it('доп. инвойсы видны в карточке партии счётчиком', async () => {
    await mountWith(card({ parties: [party('p1', 1, { additionalInvoices: [{ number: 'A', date: null }, { number: 'B', date: null }] })] }))
    expect(text(w.get('[data-party-invoice]').text())).toBe('KT-1 · 15.11.2026 +2')
  })
})

describe('TruckPage: въезд и «Что мешает»', () => {
  it('«ПИ не подана» срочно — красная строка с минутами до въезда', async () => {
    await mountWith(card({ currentStage: 2, expectedEntryAtUtc: '2026-11-16T11:50:00Z', blockers: [{ code: 'pi_urgent', partyId: 'p1', partyNumber: 1, minutesLeft: 110 }] }))
    const line = w.get('[data-blocker="pi_urgent"]')
    expect(line.text()).toBe('Партия 1: ПИ не подана, до въезда 110 мин — подайте сейчас.')
    expect(line.classes()).toContain('text-tone-danger-fg')
    expect(w.get('[data-truck-facts]').text()).toContain('въезд ожидается 16.11')
  })

  it('ожидаемый въезд правится в «Изменить данные машины» (дата и время → UTC)', async () => {
    const DateStub = { props: ['value', 'disabled'], emits: ['update:value'], template: '<input :value="value ?? \'\'" @input="$emit(\'update:value\', $event.target.value || null)" />' }
    const save = vi.fn().mockResolvedValue({ ok: true, card: card() })
    w = mountWithI18n(TruckEditModal, {
      attachTo: document.body,
      props: { open: false, card: card(), save },
      global: { stubs: { ZDate: DateStub } },
    })
    await w.setProps({ open: true })
    await flushPromises()
    setInput('[data-edit-entry-date]', '2026-11-16')
    await flushPromises()
    setInput('[data-edit-entry-time]', '17:30')
    okIn('[data-truck-edit-modal]', 'Сохранить').click()
    await flushPromises()
    expect(save).toHaveBeenCalledWith({ expectedEntryAtUtc: new Date(2026, 10, 16, 17, 30).toISOString() })
  })
})
