import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { RecipientLink, TruckCard } from '@/api/autoTransit'
import { linkUrl, partyLink, rights, truckLink } from '../truckView'
import { card, file, httpError, party } from './truckFixtures'

// Ссылки с назначением и «Вернуть с причиной» (очередь 3, этап 2).
const api = vi.hoisted(() => ({
  getTruck: vi.fn(), listLinks: vi.fn(), createLink: vi.fn(), createTruckLink: vi.fn(), revokeLink: vi.fn(), returnFile: vi.fn(),
}))
vi.mock('@/api/autoTransit', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api/autoTransit')>()), ...api }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: msg }))
vi.mock('@/composables/useCountryAlpha2Options', () => ({ useCountryAlpha2Options: () => ref([{ value: 'KZ', label: 'KZ — Казахстан' }]) }))
vi.mock('@/api/clientsOnboarding', () => ({ clientsOnboardingApi: { list: vi.fn().mockResolvedValue([]) } }))

import TruckPage from '../TruckPage.vue'
import { confirmState } from '@/ui/confirm'
import { useAuthStore } from '@/stores/auth'

const link = (o: Partial<RecipientLink> = {}): RecipientLink => ({
  id: 'l1', partyId: 'p1', token: 'tok', expiresAtUtc: '2026-12-16T10:00:00Z', revokedAtUtc: null, lastOpenedAtUtc: null, ...o,
})

describe('truckView: ссылки с назначением', () => {
  const now = new Date('2026-11-25T10:00:00Z')
  it('ссылка партии — по назначению; без purpose — просмотр', () => {
    const links = [link({ id: 'v' }), link({ id: 'u', purpose: 'uploadCargo', token: 'up' }), link({ id: 'm', partyId: null, purpose: 'uploadVehicle' })]
    expect(partyLink(links, 'p1', now).link?.id).toBe('v')
    expect(partyLink(links, 'p1', now, 'uploadCargo').link?.id).toBe('u')
    expect(truckLink(links, now).link?.id).toBe('m')
    expect(truckLink([], now).state).toBe('none')
  })
  it('адрес: просмотр — /t/, загрузка — /u/', () => {
    expect(linkUrl('https://z.kz', 'a b')).toBe('https://z.kz/t/a%20b')
    expect(linkUrl('https://z.kz', 'x', 'uploadCargo')).toBe('https://z.kz/u/x')
    expect(linkUrl('https://z.kz', 'x', 'uploadVehicle')).toBe('https://z.kz/u/x')
  })
  it('права: просмотр — declare/manage, груз — declare, машина — border; возврат — border или declare', () => {
    const r = (can: TruckCard['can'], status: TruckCard['status'] = 'inWork') => rights(card({ can, status }))
    expect(r({ border: true, declare: false, manage: false })).toMatchObject({ links: false, uploadCargoLink: false, uploadVehicleLink: true, anyLinks: true, returnFile: true })
    expect(r({ border: false, declare: true, manage: false })).toMatchObject({ links: true, uploadCargoLink: true, uploadVehicleLink: false, returnFile: true })
    expect(r({ border: false, declare: false, manage: true })).toMatchObject({ links: true, uploadCargoLink: false, uploadVehicleLink: false, returnFile: false })
    expect(r({ border: true, declare: true, manage: true }, 'archived')).toMatchObject({ anyLinks: false, returnFile: false })
  })
})

let w: VueWrapper
let pinia: Pinia
let router: Router
const App = defineComponent({ render: () => h(RouterView) })
const text = (s: string) => s.replace(/\s+/g, ' ').trim()
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel)
const $$ = (sel: string) => Array.from(document.body.querySelectorAll<HTMLElement>(sel))
const mountWith = async (c: TruckCard, perms: string[]) => {
  const auth = useAuthStore()
  auth.role = 'manager'
  auth.permissions = perms
  api.getTruck.mockResolvedValue(c)
  await router.push('/auto-transit/t1')
  await router.isReady()
  w = mountWithI18n(App, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
}
const openLinks = async () => {
  await w.get('[data-truck-links]').trigger('click')
  await flushPromises()
}
const writeText = vi.fn()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(new Date('2026-11-25T10:00:00Z'))
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  writeText.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  pinia = createPinia()
  setActivePinia(pinia)
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/auto-transit', name: 'auto-transit', component: { template: '<div/>' } },
      { path: '/auto-transit/:id', name: 'auto-transit-truck', component: TruckPage },
    ],
  })
  api.listLinks.mockResolvedValue([])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('LinksModal: назначение ссылки', () => {
  it('декларант: у партии — просмотр и загрузка груза; «Создать» загрузки шлёт uploadCargo и копирует /u/', async () => {
    await mountWith(card({ can: { border: false, declare: true, manage: false } }), ['autotransit.read', 'autotransit.declare'])
    await openLinks()
    const rows = $$('[data-link-row="p1"] [data-link-purpose]')
    expect(rows.map((r) => r.dataset.linkPurpose)).toEqual(['view', 'uploadCargo'])
    expect($('[data-link-vehicle]')).toBeNull()
    api.createLink.mockResolvedValue(link({ id: 'l2', token: 'up1', purpose: 'uploadCargo' }))
    ;(rows[1]!.querySelector('[data-link-create]') as HTMLElement).click()
    await flushPromises()
    expect(api.createLink).toHaveBeenCalledWith('t1', 'p1', 'uploadCargo')
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/u/up1`)
  })

  it('КПП (только border): кнопка «Ссылки» есть, в окне — только ссылка на машину', async () => {
    api.listLinks.mockResolvedValue([link({ id: 'm', partyId: null, purpose: 'uploadVehicle', token: 'veh' })])
    await mountWith(card({ can: { border: true, declare: false, manage: false } }), ['autotransit.read', 'autotransit.border'])
    await openLinks()
    expect($('[data-link-row]')).toBeNull()
    const row = $('[data-link-vehicle] [data-link-purpose="uploadVehicle"]')!
    expect(text(row.querySelector('[data-link-state]')!.textContent!)).toBe('Активна до 16.12.2026')
    expect(row.querySelector('[data-link-url]')!.textContent).toBe(`${window.location.origin}/u/veh`)
    api.createTruckLink.mockResolvedValue(link({ id: 'm2', partyId: null, purpose: 'uploadVehicle', token: 'veh2' }))
    ;(row.querySelector('[data-link-renew]') as HTMLElement).click()
    await flushPromises()
    confirmState.resolve(true)
    await flushPromises()
    expect(api.createTruckLink).toHaveBeenCalledWith('t1')
  })

  it('без прав ссылок кнопки нет', async () => {
    await mountWith(card({ can: { border: false, declare: false, manage: false } }), ['autotransit.read'])
    expect(w.find('[data-truck-links]').exists()).toBe(false)
  })
})

describe('Файл по ссылке: метка и «Вернуть с причиной»', () => {
  const viaLink = file('f1', { partyId: 'p1', kind: 'invoice', uploadedVia: 'link', linkId: 'l1', uploadedBy: null, fileName: 'inv.jpg' })
  const openMenu = async () => {
    await w.find('[data-file-chip="f1"] [data-file-menu]').trigger('keydown', { key: 'Enter' })
    await vi.waitFor(() => expect(document.body.querySelectorAll('[role^="menuitem"]').length).toBeGreaterThan(0))
  }
  const item = (label: string) => $$('[role^="menuitem"]').find((x) => x.textContent?.trim() === label)

  it('метка «по ссылке»; у файла сотрудника пункта возврата нет', async () => {
    await mountWith(card({ can: { border: true, declare: false, manage: false }, files: [viaLink, file('f2', { partyId: 'p1' })] }), ['autotransit.read', 'autotransit.border'])
    expect(w.find('[data-file-chip="f1"] [data-file-via-link]').exists()).toBe(true)
    expect(w.find('[data-file-chip="f2"] [data-file-via-link]').exists()).toBe(false)
    await w.find('[data-file-chip="f2"] [data-file-menu]').trigger('keydown', { key: 'Enter' })
    await vi.waitFor(() => expect(document.body.querySelectorAll('[role^="menuitem"]').length).toBeGreaterThan(0))
    expect(item('Вернуть с причиной')).toBeUndefined()
  })

  it('«Вернуть с причиной»: без причины не уходит; с причиной — returnFile, файл помечен возвращённым', async () => {
    await mountWith(card({ can: { border: true, declare: false, manage: false }, files: [viaLink] }), ['autotransit.read', 'autotransit.border'])
    await openMenu()
    item('Вернуть с причиной')!.click()
    await flushPromises()
    const ok = () => $$('[data-return-modal] button').find((b) => b.textContent?.trim() === 'Вернуть')!
    ok().click()
    await flushPromises()
    expect(api.returnFile).not.toHaveBeenCalled()
    expect($('[data-return-modal]')!.textContent).toContain('Укажите причину')
    const ta = $('[data-return-reason]') as HTMLTextAreaElement
    ta.value = ' Нет печати на инвойсе '
    ta.dispatchEvent(new Event('input'))
    api.returnFile.mockResolvedValue({ ...viaLink, returned: true, returnReason: 'Нет печати на инвойсе', returnedAtUtc: '2026-11-25T10:00:00Z' })
    ok().click()
    await flushPromises()
    expect(api.returnFile).toHaveBeenCalledWith('t1', 'f1', 'Нет печати на инвойсе')
    const chip = w.get('[data-file-chip="f1"]')
    expect(chip.get('[data-file-returned]').attributes('title')).toContain('Нет печати на инвойсе')
    expect(msg.success).toHaveBeenCalledWith('Файл возвращён: причина видна на странице ссылки')
  })

  it('400 причины — текст сервера под полем', async () => {
    await mountWith(card({ can: { border: false, declare: true, manage: false }, files: [viaLink] }), ['autotransit.read', 'autotransit.declare'])
    await openMenu()
    item('Вернуть с причиной')!.click()
    await flushPromises()
    const ta = $('[data-return-reason]') as HTMLTextAreaElement
    ta.value = 'x'
    ta.dispatchEvent(new Event('input'))
    api.returnFile.mockRejectedValue(httpError(400, { errors: { reason: ['Укажите причину возврата: до 300 знаков.'] } }))
    $$('[data-return-modal] button').find((b) => b.textContent?.trim() === 'Вернуть')!.click()
    await flushPromises()
    expect($('[data-return-modal]')!.textContent).toContain('Укажите причину возврата: до 300 знаков.')
  })
})
