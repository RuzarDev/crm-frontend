import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { TruckCard } from '@/api/autoTransit'
import { card, event, file, httpError, party } from './truckFixtures'

const api = vi.hoisted(() => ({
  getTruck: vi.fn(), markStage: vi.fn(), undoStage: vi.fn(), submitParty: vi.fn(), unsubmitParty: vi.fn(), setTd: vi.fn(),
  clearProblem: vi.fn(), setProblem: vi.fn(), archiveTruck: vi.fn(), updateParty: vi.fn(), addParty: vi.fn(), deleteParty: vi.fn(),
  uploadFile: vi.fn(), patchFile: vi.fn(), deleteFile: vi.fn(), updateTruck: vi.fn(), downloadBlob: vi.fn(),
  listLinks: vi.fn(), createLink: vi.fn(), revokeLink: vi.fn(),
}))
vi.mock('@/api/autoTransit', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api/autoTransit')>()), ...api }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: msg }))
vi.mock('@/composables/useCountryAlpha2Options', () => ({ useCountryAlpha2Options: () => ref([{ value: 'KZ', label: 'KZ — Казахстан' }]) }))
const clients = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('@/api/clientsOnboarding', () => ({ clientsOnboardingApi: clients }))

import TruckPage from '../TruckPage.vue'
import { confirmState } from '@/ui/confirm'
import { useAuthStore } from '@/stores/auth'

let w: VueWrapper
const App = defineComponent({ render: () => h(RouterView) })
let pinia: Pinia
let router: Router
const text = (s: string) => s.replace(/\s+/g, ' ').trim()
const $ = (sel: string) => document.body.querySelector<HTMLElement>(sel)
const $$ = (sel: string) => Array.from(document.body.querySelectorAll<HTMLElement>(sel))
const mountWith = async (c: TruckCard, perms: string[] = ['autotransit.read', 'autotransit.border']) => {
  const auth = useAuthStore()
  auth.role = 'manager'
  auth.permissions = perms
  api.getTruck.mockResolvedValue(c)
  await router.push('/auto-transit/t1')
  await router.isReady()
  // Под RouterView, как в приложении: иначе охрана ухода (onBeforeRouteLeave/Update) не регистрируется.
  w = mountWithI18n(App, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
}
const CONSOLIDATED = (o: Partial<TruckCard> = {}) => card({
  title: null, partiesCount: 3, currentStage: 5, submittedCount: 2, tdNumberCount: 0,
  parties: [
    party('p1', 1, { submittedAtUtc: '2026-11-16T10:00:00Z' }),
    party('p2', 2, { submittedAtUtc: '2026-11-16T10:05:00Z' }),
    party('p3', 3),
  ],
  ...o,
})

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
    ],
  })
  clients.list.mockResolvedValue([])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('TruckPage: шапка и главная кнопка', () => {
  it('шапка: номер, прицеп, водитель · перевозчик · пост, состояние', async () => {
    await mountWith(card())
    expect(w.find('[data-plate]').text()).toBe('A 318 KZ 19')
    expect(text(w.find('[data-truck-trailer]').text())).toBe('+ прицеп 02 BCA 19')
    expect(w.find('[data-truck-facts]').text()).toContain('Водитель Ван Лэй · перевозчик Khorgos Trans Ltd · заехала')
    expect(w.find('[data-truck-facts]').text()).toContain('пост 50509')
    expect(w.find('[data-truck-consolidation]').exists()).toBe(false)
    expect(w.find('[data-truck-state]').text()).toBe('На контроле')
  })

  it('кнопка подписана следующим этапом; отметка — без подтверждения, тост с «Отменить» вызывает undoStage', async () => {
    await mountWith(card())
    const btn = w.find('[data-primary-action]')
    expect(btn.text()).toBe('Транспортный контроль пройден')
    api.markStage.mockResolvedValue(card({ currentStage: 4, events: [...card().events, event('e3', 3, '2026-11-16T10:00:00Z')] }))
    await btn.trigger('click')
    await flushPromises()
    expect(api.markStage).toHaveBeenCalledWith('t1', 3, undefined)
    expect(confirmState.open).toBe(false)
    expect(w.find('[data-primary-action]').text()).toBe('Осмотр пройден')
    const toast = msg.success.mock.calls.at(-1)![0]
    expect(toast).toMatchObject({ content: 'Отмечено: Транспортный контроль', duration: 6, action: { label: 'Отменить' } })
    api.undoStage.mockResolvedValue(card({ currentStage: 3 }))
    toast.action.onClick()
    await flushPromises()
    expect(api.undoStage).toHaveBeenCalledWith('t1')
    expect(w.find('[data-primary-action]').text()).toBe('Транспортный контроль пройден')
  })

  it('nextAction none — кнопки нет, вместо неё причина «Ждём декларанта: подано 2 из 3»', async () => {
    await mountWith(CONSOLIDATED())
    expect(w.find('[data-primary-action]').exists()).toBe(false)
    expect(w.find('[data-primary-reason]').text()).toBe('Ждём декларанта: подано 2 из 3')
    expect(text(w.find('[data-truck-consolidation]').text())).toBe('Консолидация · 3 партии')
  })

  it('этап 5 у декларанта — «ТД подана · партия 3» для первой неподанной', async () => {
    await mountWith(CONSOLIDATED({ can: { border: false, declare: true, manage: false } }), ['autotransit.read', 'autotransit.declare'])
    const btn = w.find('[data-primary-action]')
    expect(btn.text()).toBe('ТД подана · партия 3')
    api.submitParty.mockResolvedValue(CONSOLIDATED({ submittedCount: 3, currentStage: 6 }))
    await btn.trigger('click')
    await flushPromises()
    expect(api.submitParty).toHaveBeenCalledWith('t1', 'p3')
  })

  it('409 при отметке — тост с текстом кода и перечитывание', async () => {
    await mountWith(card())
    api.markStage.mockRejectedValue(httpError(409, { code: 'stage_order' }))
    await w.find('[data-primary-action]').trigger('click')
    await flushPromises()
    expect(msg.error).toHaveBeenCalledWith('Этапы отмечаются по порядку.')
    expect(api.getTruck).toHaveBeenCalledTimes(2)
  })

  it('крошка ведёт в список с его фильтром', async () => {
    const { rememberListPath } = await import('@/shell/listReturn')
    rememberListPath('autoTransit', '/auto-transit?filter=control')
    await mountWith(card())
    expect(w.find('[data-truck-header] nav a').attributes('href')).toBe('/auto-transit?filter=control')
  })
})

describe('TruckPage: этапы', () => {
  it('пройденные — со временем отметки, текущий — «идёт N мин», 5 и 6 — «N из M»', async () => {
    await mountWith(CONSOLIDATED({ currentStage: 3, tdNumberCount: 1 }))
    const cells = w.findAll('[data-rail-stage]')
    expect(cells).toHaveLength(7)
    expect(cells.map((c) => c.attributes('data-state'))).toEqual(['done', 'done', 'current', 'todo', 'todo', 'todo', 'todo'])
    expect(cells[1]!.find('[data-rail-meta]').text()).toMatch(/^\d\d:31$/)
    expect(cells[2]!.find('[data-rail-meta]').text()).toBe('идёт 15 мин')
    expect(cells[4]!.find('[data-rail-meta]').text()).toBe('2 из 3')
    expect(cells[5]!.find('[data-rail-meta]').text()).toBe('1 из 3')
    expect(cells[2]!.attributes('aria-current')).toBe('step')
  })
})

describe('TruckPage: партии', () => {
  it('факты партии, метка декларации, недостающие файлы пунктиром по блокерам партии', async () => {
    await mountWith(card({
      parties: [party('p1', 1), party('p2', 2, { tdNumber: '50509/161126/0001234', tdDate: '2026-11-16', submittedAtUtc: '2026-11-16T09:00:00Z' })],
      files: [file('f1', { partyId: 'p1', kind: 'invoice', fileName: 'Инвойс.pdf' })],
      blockers: [{ code: 'no_stamped_invoice', partyId: 'p1' }, { code: 'party_no_invoice', partyId: 'p1' }, { code: 'no_td_file', partyId: 'p2' }],
    }))
    const [p1, p2] = w.findAll('[data-party-card]')
    expect(text(p1!.find('[data-party-title]').text())).toBe('1 · ТОО «Получатель 1»')
    expect(p1!.find('[data-party-decl]').text()).toBe('Не подана')
    expect(p1!.find('[data-party-invoice]').text()).toBe('KT-1 · 15.11.2026')
    expect(text(p1!.find('[data-party-places]').text())).toBe('420 / 8 100 кг')
    expect(text(p1!.find('[data-party-value]').text())).toBe('38 400 USD')
    expect(p1!.find('[data-file-chip]').text()).toContain('Инвойс.pdf')
    expect(p1!.findAll('[data-party-missing]').map((m) => m.attributes('data-party-missing'))).toEqual(['no_stamped_invoice'])
    expect(p1!.find('[data-party-missing]').text()).toContain('Нет инвойса с печатью')
    expect(p1!.find('[data-party-missing]').classes()).toContain('border-dashed')
    expect(p2!.find('[data-party-decl]').text()).toBe('ТД № 50509/161126/0001234 от 16.11.2026')
    expect(p2!.find('[data-party-missing]').text()).toContain('Нет файла ТД')
  })

  it('«ТД подана» до этапа 4 — выключена с подсказкой; после — доступна', async () => {
    await mountWith(card({ can: { border: false, declare: true, manage: false } }), ['autotransit.read', 'autotransit.declare'])
    const btn = w.find('[data-party-submit]')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(w.find('[data-party-submit-lock]').exists()).toBe(true)
    expect(w.find('[data-party-submit-hint]').text()).toBe('«ТД подана» отмечается после осмотра (этап 4)')
    w.unmount()
    await mountWith(card({ currentStage: 5, can: { border: false, declare: true, manage: false } }), ['autotransit.read', 'autotransit.declare'])
    expect(w.find('[data-party-submit]').attributes('disabled')).toBeUndefined()
    expect(w.find('[data-party-submit-hint]').exists()).toBe(false)
  })

  it('без права декларанта «ТД подана» нет; номер ТД — у поданной; удалить — только неподанную при 2+ партиях', async () => {
    await mountWith(card({
      currentStage: 6, can: { border: true, declare: false, manage: true },
      parties: [party('p1', 1, { submittedAtUtc: '2026-11-16T09:00:00Z' }), party('p2', 2)],
    }))
    const [p1, p2] = w.findAll('[data-party-card]')
    expect(w.find('[data-party-submit]').exists()).toBe(false)
    expect(p1!.find('[data-party-td]').exists()).toBe(true)
    expect(p2!.find('[data-party-td]').exists()).toBe(false)
    expect(p1!.find('[data-party-delete]').exists()).toBe(false)
    expect(p2!.find('[data-party-delete]').exists()).toBe(true)
  })

  it('метка «Хочет оформить импорт» с контактом', async () => {
    await mountWith(card({ parties: [party('p1', 1, { importInterestAtUtc: '2026-11-16T09:00:00Z', importInterestContact: '+7 701 000 00 00' })] }))
    expect(w.find('[data-party-interest]').text()).toBe('Хочет оформить импорт')
    expect(w.find('[data-party-interest-contact]').text()).toBe('Контакт: +7 701 000 00 00')
  })

  it('номер ТД: окно с датой «сегодня», сохранение отправляет номер и дату', async () => {
    await mountWith(card({ currentStage: 6, parties: [party('p1', 1, { submittedAtUtc: '2026-11-16T09:00:00Z' })] }))
    await w.find('[data-party-td]').trigger('click')
    await flushPromises()
    const input = $('[data-td-number]') as HTMLInputElement
    input.value = '50509/161126/0001234'
    input.dispatchEvent(new Event('input'))
    api.setTd.mockResolvedValue(card({ currentStage: 7 }))
    const ok = $$('[data-td-modal] button').find((b) => b.textContent?.trim() === 'Сохранить')!
    ok.click()
    await flushPromises()
    expect(api.setTd).toHaveBeenCalledWith('t1', 'p1', { tdNumber: '50509/161126/0001234', tdDate: '2026-11-16' })
  })
})

describe('TruckPage: статусы', () => {
  it('«Проблема» — красная плашка с текстом и «Снять проблему», кнопки этапа нет', async () => {
    await mountWith(card({ status: 'problem', problemNote: 'Машину развернули на посту' }))
    const alert = w.find('[data-truck-problem]')
    expect(alert.text()).toContain('Машину развернули на посту')
    expect(w.find('[data-primary-action]').exists()).toBe(false)
    expect(w.find('[data-primary-reason]').text()).toContain('Проблема')
    api.clearProblem.mockResolvedValue(card())
    await alert.find('[data-truck-clear-problem]').trigger('click')
    await flushPromises()
    expect(api.clearProblem).toHaveBeenCalledWith('t1')
    expect(w.find('[data-truck-problem]').exists()).toBe(false)
    expect(w.find('[data-primary-action]').exists()).toBe(true)
  })

  it('выпущена — только чтение: нет правки партий, файлы добавлять можно', async () => {
    await mountWith(card({ status: 'released', currentStage: null }))
    expect(w.find('[data-truck-readonly]').exists()).toBe(true)
    expect(w.find('[data-party-edit]').exists()).toBe(false)
    expect(w.find('[data-truck-add-party]').exists()).toBe(false)
    expect(w.find('[data-upload-files]').exists()).toBe(true)
    expect(w.find('[data-primary-reason]').text()).toBe('Машина выпущена')
    expect(w.findAll('[data-rail-stage]').every((c) => c.attributes('data-state') === 'done')).toBe(true)
  })

  it('архив — ничего не меняется: нет загрузки, меню, ссылок', async () => {
    await mountWith(card({ status: 'archived', can: { border: true, declare: true, manage: true } }), ['autotransit.read', 'autotransit.manage'])
    expect(w.find('[data-upload-files]').exists()).toBe(false)
    expect(w.find('[data-truck-more]').exists()).toBe(false)
    expect(w.find('[data-truck-links]').exists()).toBe(false)
    expect(w.find('[data-party-edit]').exists()).toBe(false)
    expect(w.find('[data-file-menu]').exists()).toBe(false)
  })
})

describe('TruckPage: что мешает, файлы, журнал', () => {
  const EVERY_STAGE = [
    { code: 'party_no_invoice', partyId: 'p1' }, { code: 'no_stamped_invoice', partyId: 'p1' }, { code: 'not_submitted', partyId: 'p1' },
    { code: 'no_td_number', partyId: 'p1' }, { code: 'no_warehouse_receipt', partyId: null },
  ]
  it('«Что мешает» — только текущего этапа, с номером партии; на этапах 3–4 и без блокеров — блока нет', async () => {
    await mountWith(card({ currentStage: 2, blockers: EVERY_STAGE }))
    expect(w.findAll('[data-blocker]').map((l) => l.text())).toEqual(['Партия 1: нет номера инвойса.', 'Партия 1: нет инвойса с печатью — он нужен на этапе 2.'])
    w.unmount()
    await mountWith(card({ currentStage: 7, blockers: EVERY_STAGE }))
    expect(w.findAll('[data-blocker]').map((l) => l.text())).toEqual(['Нет чека СВХ — приложите его до отметки этапа 7.'])
    w.unmount()
    await mountWith(card({ currentStage: 3, blockers: EVERY_STAGE }))
    expect(w.find('[data-blockers]').exists()).toBe(false)
    w.unmount()
    await mountWith(card())
    expect(w.find('[data-blockers]').exists()).toBe(false)
  })

  it('этап 5 с «ТД не подана» — метка «Ждёт декларанта», этап current, а не «препятствие»', async () => {
    await mountWith(card({ currentStage: 5, blockerCode: 'not_submitted', blockers: [{ code: 'not_submitted', partyId: 'p1' }] }))
    expect(w.find('[data-truck-state]').text()).toBe('Ждёт декларанта')
    expect(w.find('[data-rail-stage="5"]').attributes('data-state')).toBe('current')
    w.unmount()
    await mountWith(card({ currentStage: 2, blockerCode: 'no_stamped_invoice', blockers: [{ code: 'no_stamped_invoice', partyId: 'p1' }] }))
    expect(w.find('[data-truck-state]').text()).toBe('Нет инвойса с печатью')
    expect(w.find('[data-rail-stage="2"]').attributes('data-state')).toBe('warn')
  })

  it('«Скачать всё» — только когда у машины есть файлы', async () => {
    await mountWith(card({ files: [] }))
    expect(w.find('[data-truck-zip]').exists()).toBe(false)
    expect(w.find('[data-truck-files-empty]').exists()).toBe(true)
    w.unmount()
    await mountWith(card())
    expect(w.find('[data-truck-zip]').exists()).toBe(true)
  })

  it('клик по файлу — скачивание через blob с входом', async () => {
    const saved: string[] = []
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:x' })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => {} })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { saved.push(this.download) })
    api.downloadBlob.mockResolvedValue({ blob: new Blob(['x']), fileName: 'Паспорт.jpg' })
    await mountWith(card())
    await w.find('[data-file-download]').trigger('click')
    await flushPromises()
    expect(api.downloadBlob).toHaveBeenCalledWith('/auto-transit/t1/files/f1/download', 'f1.jpg')
    expect(saved).toEqual(['Паспорт.jpg'])
  })

  it('журнал — новыми сверху: время, кто, что, партия, комментарий', async () => {
    await mountWith(card({ events: [
      event('e1', 1, '2026-11-16T09:14:00Z'),
      event('e2', 5, '2026-11-16T09:50:00Z', { partyId: 'p1', by: 'Ира', note: 'Подано в КЕДЕН' }),
    ] }))
    const rows = w.findAll('[data-journal-row]')
    expect(text(rows[0]!.element.textContent!)).toMatch(/^\d\d:50 Ира — «Декларация» — отмечено · партия 1 Подано в КЕДЕН$/)
    expect(rows[0]!.find('[data-journal-note]').text()).toBe('Подано в КЕДЕН')
    expect(text(rows[1]!.element.textContent!)).toMatch(/Бакдаулет — «Документы» — отмечено$/)
  })
})

describe('TruckPage: ссылки получателям', () => {
  it('«Скопировать» кладёт в буфер ${origin}/t/${token}; почта получателя — mailto', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    api.listLinks.mockResolvedValue([{ id: 'l1', partyId: 'p1', token: 'tok123', expiresAtUtc: '2026-12-16T10:00:00Z', revokedAtUtc: null, lastOpenedAtUtc: null }])
    await mountWith(card({ can: { border: false, declare: true, manage: false }, parties: [party('p1', 1, { recipientEmail: 'buyer@example.kz' })] }), ['autotransit.read', 'autotransit.declare'])
    await w.find('[data-truck-links]').trigger('click')
    await flushPromises()
    expect(api.listLinks).toHaveBeenCalledWith('t1')
    expect($('[data-link-state]')!.textContent).toBe('Активна до 16.12.2026')
    $('[data-link-copy]')!.click()
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/t/tok123`)
    expect(msg.success).toHaveBeenCalledWith('Ссылка скопирована')
    const mail = $('[data-link-mail]') as HTMLAnchorElement
    expect(mail.getAttribute('href')).toMatch(/^mailto:buyer%40example\.kz\?subject=/)
    expect(decodeURIComponent(mail.getAttribute('href')!)).toContain(`/t/tok123`)
  })

  it('нет ссылки — «Создать ссылку»; у пограничника без прав ссылок кнопки нет', async () => {
    api.listLinks.mockResolvedValue([])
    await mountWith(card({ can: { border: false, declare: true, manage: false } }), ['autotransit.read', 'autotransit.declare'])
    await w.find('[data-truck-links]').trigger('click')
    await flushPromises()
    expect($('[data-link-state]')!.textContent).toBe('Ссылки нет')
    expect($('[data-link-create]')).not.toBeNull()
    w.unmount()
    await mountWith(card())
    expect(w.find('[data-truck-links]').exists()).toBe(false)
  })
})

describe('TruckPage: фоновое перечитывание', () => {
  it('раз в 60 с без тоста; пока открыто окно — нет', async () => {
    api.listLinks.mockResolvedValue([])
    await mountWith(card({ can: { border: true, declare: false, manage: true } }))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.getTruck).toHaveBeenCalledTimes(2)
    expect(api.getTruck).toHaveBeenLastCalledWith('t1', { silent: true })
    await w.find('[data-truck-links]').trigger('click')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(api.getTruck).toHaveBeenCalledTimes(2)
  })
})

describe('TruckPage: окна партии и «Проблемы»', () => {
  const setInput = (sel: string, v: string) => {
    const el = $(sel) as HTMLInputElement
    el.value = v
    el.dispatchEvent(new Event('input'))
  }
  const okIn = (modal: string, label: string) => $$(`${modal} button`).find((b) => b.textContent?.trim() === label)!

  it('правка партии отправляет только изменённые поля; очищенное — null', async () => {
    await mountWith(card({ parties: [party('p1', 1, { recipientEmail: 'old@example.kz' })] }))
    await w.find('[data-party-edit]').trigger('click')
    await flushPromises()
    setInput('[data-party-recipient]', 'ТОО «Новый»')
    setInput('[data-party-email]', '')
    api.updateParty.mockResolvedValue(card())
    okIn('[data-party-modal]', 'Сохранить').click()
    await flushPromises()
    expect(api.updateParty).toHaveBeenCalledWith('t1', 'p1', { recipientName: 'ТОО «Новый»', recipientEmail: null })
    expect($('[data-party-modal]')?.getAttribute('data-state') ?? 'closed').toBe('closed')
  })

  it('400 по полю — текст под полем, окно остаётся открытым', async () => {
    await mountWith(card())
    await w.find('[data-party-edit]').trigger('click')
    await flushPromises()
    setInput('[data-party-email]', 'не-почта')
    api.updateParty.mockRejectedValue(httpError(400, { errors: { recipientEmail: ['Проверьте адрес почты.'] } }))
    okIn('[data-party-modal]', 'Сохранить').click()
    await flushPromises()
    expect($('[data-party-modal]')!.textContent).toContain('Проверьте адрес почты.')
  })

  it('клиент платформы подставляет название, БИН и страну', async () => {
    clients.list.mockResolvedValue([{ id: 'c1', username: 'altyn', email: 'a@altyn.kz', companyName: 'ТОО «Алтын Сауда»', bin: '990140000123', phone: null, status: 'Active' }])
    await mountWith(card({ parties: [party('p1', 1, { recipientName: '', recipientRegNumber: '', recipientCountry: '' })] }), ['autotransit.read', 'autotransit.border', 'clients.read'])
    await w.find('[data-party-edit]').trigger('click')
    await flushPromises()
    expect(clients.list).toHaveBeenCalledWith({ silent: true })
    const select = w.findComponent({ name: 'PartyModal' }).findComponent({ name: 'ZSelect' })
    select.vm.$emit('update:value', 'c1')
    await flushPromises()
    api.updateParty.mockResolvedValue(card())
    okIn('[data-party-modal]', 'Сохранить').click()
    await flushPromises()
    expect(api.updateParty).toHaveBeenCalledWith('t1', 'p1', {
      clientId: 'c1', recipientName: 'ТОО «Алтын Сауда»', recipientRegNumber: '990140000123', recipientCountry: 'KZ', recipientEmail: 'a@altyn.kz',
    })
  })

  it('«Проблема» — без комментария не уходит; с ним — setProblem', async () => {
    await mountWith(card())
    await w.find('[data-truck-more]').trigger('keydown', { key: 'Enter' })
    await vi.waitFor(() => expect(document.body.querySelectorAll('[role="menuitem"]').length).toBeGreaterThan(0))
    const item = $$('[role="menuitem"]').find((el) => el.textContent?.trim() === 'Проблема')
    expect(item).toBeTruthy()
    item!.click()
    await flushPromises()
    okIn('[data-problem-modal]', 'Отметить проблему').click()
    await flushPromises()
    expect(api.setProblem).not.toHaveBeenCalled()
    expect($('[data-problem-modal]')!.textContent).toContain('Опишите проблему')
    const ta = $('[data-problem-note]') as HTMLTextAreaElement
    ta.value = 'Отказ в пропуске'
    ta.dispatchEvent(new Event('input'))
    api.setProblem.mockResolvedValue(card({ status: 'problem', problemNote: 'Отказ в пропуске' }))
    okIn('[data-problem-modal]', 'Отметить проблему').click()
    await flushPromises()
    expect(api.setProblem).toHaveBeenCalledWith('t1', 'Отказ в пропуске')
    expect(w.find('[data-truck-problem]').text()).toContain('Отказ в пропуске')
  })
})

describe('TruckPage: видимость файла получателю меняется только явно', () => {
  const openFileMenu = async (fileId: string) => {
    await w.find(`[data-file-chip="${fileId}"] [data-file-menu]`).trigger('keydown', { key: 'Enter' })
    await vi.waitFor(() => expect(document.body.querySelectorAll('[role^="menuitem"]').length).toBeGreaterThan(0))
  }
  const pickItem = async (label: string) => {
    const el = Array.from(document.body.querySelectorAll<HTMLElement>('[role^="menuitem"]')).find((x) => x.textContent?.trim() === label)
    expect(el, label).toBeTruthy()
    el!.click()
    await flushPromises()
  }
  const lastInfo = () => msg.info.mock.calls.at(-1)![0]

  it('смена вида other → CMR у общего документа: «Виден всем получателям машины», «Скрыть» шлёт visibleToRecipient: false', async () => {
    await mountWith(card({ files: [file('f1', { kind: 'other' })] }))
    api.patchFile.mockResolvedValue(card({ files: [file('f1', { kind: 'cmr', visibleToRecipient: true })] }))
    await openFileMenu('f1')
    await pickItem('CMR')
    expect(api.patchFile).toHaveBeenCalledWith('t1', 'f1', { kind: 'cmr' })
    expect(lastInfo()).toMatchObject({ content: 'Виден всем получателям машины', action: { label: 'Скрыть' } })
    expect(w.find('[data-file-chip="f1"] [data-file-visible]').text()).toBe('Виден всем получателям машины')
    api.patchFile.mockResolvedValue(card({ files: [file('f1', { kind: 'cmr' })] }))
    lastInfo().action.onClick()
    await flushPromises()
    expect(api.patchFile).toHaveBeenLastCalledWith('t1', 'f1', { visibleToRecipient: false })
    expect(w.find('[data-file-chip="f1"] [data-file-visible]').exists()).toBe(false)
  })

  it('смена вида в партии на инвойс: тост «Виден получателю партии 1» со «Скрыть»', async () => {
    await mountWith(card({ files: [file('f1', { kind: 'other', partyId: 'p1' })] }))
    api.patchFile.mockResolvedValue(card({ files: [file('f1', { kind: 'invoice', partyId: 'p1', visibleToRecipient: true })] }))
    await openFileMenu('f1')
    await pickItem('Инвойс')
    expect(api.patchFile).toHaveBeenCalledWith('t1', 'f1', { kind: 'invoice' })
    expect(lastInfo()).toMatchObject({ content: 'Виден получателю партии 1', action: { label: 'Скрыть' } })
  })

  it('был виден и стал скрыт — тост «Скрыт от получателей» с «Показать»', async () => {
    await mountWith(card({ files: [file('f1', { kind: 'invoice', partyId: 'p1', visibleToRecipient: true })] }))
    api.patchFile.mockResolvedValue(card({ files: [file('f1', { kind: 'td', partyId: 'p1', visibleToRecipient: false })] }))
    await openFileMenu('f1')
    await pickItem('ТД')
    expect(lastInfo()).toMatchObject({ content: 'Скрыт от получателей', action: { label: 'Показать' } })
  })

  it.each([
    ['td', 'ТД'],
    ['driverPassport', 'Паспорт водителя'],
  ] as const)('был скрыт и остался скрытым (%s) — без тоста', async (kind, label) => {
    await mountWith(card({ files: [file('f1', { kind: 'other', partyId: 'p1' })] }))
    api.patchFile.mockResolvedValue(card({ files: [file('f1', { kind, partyId: 'p1', visibleToRecipient: false })] }))
    await openFileMenu('f1')
    await pickItem(label)
    expect(api.patchFile).toHaveBeenCalledWith('t1', 'f1', { kind })
    expect(msg.info).not.toHaveBeenCalled()
  })

  it('перенос видимого файла в другую партию шлёт visibleToRecipient: false; «Показать» — true', async () => {
    const two = [party('p1', 1), party('p2', 2)]
    await mountWith(card({ parties: two, files: [file('f2', { kind: 'invoice', partyId: 'p1', visibleToRecipient: true })] }))
    api.patchFile.mockResolvedValue(card({ parties: two, files: [file('f2', { kind: 'invoice', partyId: 'p2' })] }))
    await openFileMenu('f2')
    await pickItem('В партию 2')
    expect(api.patchFile).toHaveBeenCalledWith('t1', 'f2', { partyId: 'p2', visibleToRecipient: false })
    expect(lastInfo()).toMatchObject({ content: 'Файл перенесён и скрыт от получателей', action: { label: 'Показать получателю партии 2' } })
    lastInfo().action.onClick()
    await flushPromises()
    expect(api.patchFile).toHaveBeenLastCalledWith('t1', 'f2', { visibleToRecipient: true })
  })

  it('перенос из партии в общие документы — «Показать всем получателям машины»', async () => {
    const two = [party('p1', 1), party('p2', 2)]
    await mountWith(card({ parties: two, files: [file('f2', { kind: 'cmr', partyId: 'p1' })] }))
    api.patchFile.mockResolvedValue(card({ parties: two, files: [file('f2', { kind: 'cmr', partyId: null })] }))
    await openFileMenu('f2')
    await pickItem('Общий документ машины')
    expect(api.patchFile).toHaveBeenCalledWith('t1', 'f2', { partyId: null, visibleToRecipient: false })
    expect(lastInfo()).toMatchObject({ content: 'Файл перенесён и скрыт от получателей', action: { label: 'Показать всем получателям машины' } })
  })

  it('кнопка в тосте файла после перехода на другую машину ничего не шлёт', async () => {
    await mountWith(card({ files: [file('f1', { kind: 'other' })] }))
    api.patchFile.mockResolvedValue(card({ files: [file('f1', { kind: 'cmr', visibleToRecipient: true })] }))
    await openFileMenu('f1')
    await pickItem('CMR')
    api.getTruck.mockResolvedValue(card({ id: 't2' }))
    await router.push('/auto-transit/t2')
    await flushPromises()
    api.patchFile.mockClear()
    lastInfo().action.onClick()
    await flushPromises()
    expect(api.patchFile).not.toHaveBeenCalled()
  })

  it('выпущенная машина: вид, партия, «с печатью», «виден получателю» меняются; удалить — нет', async () => {
    await mountWith(card({ status: 'released', currentStage: null, can: { border: true, declare: true, manage: true }, files: [file('f1', { kind: 'invoice', partyId: 'p1' })] }),
      ['autotransit.read', 'autotransit.border', 'autotransit.declare', 'autotransit.manage'])
    await openFileMenu('f1')
    const labels = Array.from(document.body.querySelectorAll('[role^="menuitem"]')).map((x) => x.textContent?.trim())
    expect(labels).toEqual(expect.arrayContaining(['CMR', 'Общий документ машины', 'С печатью', 'Виден получателю']))
    expect(labels).not.toContain('Удалить')
  })
})

describe('TruckPage: «Отменить» в тосте отметки привязано к своей машине', () => {
  const markA = async () => {
    await mountWith(card())
    api.markStage.mockResolvedValue(card({ currentStage: 4, events: [...card().events, event('e3', 3, '2026-11-16T10:00:00Z')] }))
    await w.find('[data-primary-action]').trigger('click')
    await flushPromises()
    return msg.success.mock.calls.at(-1)![0]
  }

  it('отметили на машине A, перешли на B, нажали «Отменить» — запроса нет ни для B, ни для A', async () => {
    const toast = await markA()
    api.getTruck.mockResolvedValue(card({ id: 't2', plate: '787 ABD 05' }))
    await router.push('/auto-transit/t2')
    await flushPromises()
    expect(w.find('[data-plate]').text()).toBe('787 ABD 05')
    toast.action.onClick()
    await flushPromises()
    expect(api.undoStage).not.toHaveBeenCalled()
  })

  it('ушли с карточки — «Отменить» ничего не шлёт', async () => {
    const toast = await markA()
    w.unmount()
    toast.action.onClick()
    await flushPromises()
    expect(api.undoStage).not.toHaveBeenCalled()
  })
})

describe('TruckPage: «Добавить фото / файл» идёт через очередь', () => {
  const pick = async (list: File[]) => {
    const input = w.find<HTMLInputElement>('[data-truck-files] [data-upload-camera-input]')
    Object.defineProperty(input.element, 'files', { value: list, configurable: true })
    await input.trigger('change')
    await flushPromises()
  }

  it('строки файлов с состоянием; упавший — «Повторить»; ответ заменяет карточку; загруженные строки убираются', async () => {
    await mountWith(card({ files: [] }))
    let release!: () => void
    api.uploadFile.mockImplementationOnce((_id: string, _f: File, _o: unknown, onProgress: (x: number) => void) => {
      onProgress(0.3)
      return new Promise((res) => { release = () => res(card({ files: [file('fa', { fileName: 'a.jpg' })] })) })
    })
    api.uploadFile.mockRejectedValueOnce(new Error('Network Error'))
    await pick([new File(['x'], 'a.jpg'), new File(['x'], 'b.jpg')])
    expect(w.find('[data-upload-row="uploading"]').text()).toContain('Загружается: 30 %')
    expect(w.find('[data-upload-row="queued"] [data-upload-name]').text()).toBe('b.jpg')
    expect(w.find('[data-upload-progress]').text()).toContain('Загрузка 1 из 2: a.jpg')
    release()
    await flushPromises()
    expect(api.uploadFile).toHaveBeenCalledTimes(2)
    expect(w.find('[data-file-chip="fa"]').exists()).toBe(true)
    expect(w.findAll('[data-upload-row]')).toHaveLength(1)
    expect(w.find('[data-upload-row="failed"]').text()).toContain('b.jpg')
    expect(msg.success).toHaveBeenCalledWith('Загружено файлов: 1')

    api.uploadFile.mockResolvedValueOnce(card({ files: [file('fa', { fileName: 'a.jpg' }), file('fb', { fileName: 'b.jpg' })] }))
    await w.find('[data-upload-retry]').trigger('click')
    await flushPromises()
    expect(api.uploadFile).toHaveBeenCalledTimes(3)
    expect(w.find('[data-file-chip="fb"]').exists()).toBe(true)
    expect(w.findAll('[data-upload-row]')).toHaveLength(0)
  })

  it('409 archived — очередь встаёт, тост и перечитывание карточки', async () => {
    await mountWith(card({ files: [] }))
    api.uploadFile.mockRejectedValueOnce(httpError(409, { code: 'archived' }))
    api.getTruck.mockResolvedValue(card({ status: 'archived', files: [] }))
    await pick([new File(['x'], 'a.jpg'), new File(['x'], 'b.jpg')])
    expect(api.uploadFile).toHaveBeenCalledTimes(1)
    expect(msg.error).toHaveBeenCalledWith('Машина в архиве.')
    expect(api.getTruck).toHaveBeenCalledTimes(2)
    expect(w.findAll('[data-upload-row="failed"]')).toHaveLength(2)
    expect(w.find('[data-upload-retry]').exists()).toBe(false)
    expect(w.find('[data-upload-retry-all]').exists()).toBe(false)
  })

  it('нет связи: одна сводка за проход, а не тост на каждый файл', async () => {
    await mountWith(card({ files: [] }))
    api.uploadFile.mockRejectedValue(new Error('Network Error'))
    await pick([new File(['x'], 'a.jpg'), new File(['x'], 'b.jpg'), new File(['x'], 'c.jpg')])
    expect(api.uploadFile.mock.calls.every((c) => (c[4] as { silent?: boolean })?.silent === true)).toBe(true)
    expect(msg.error).toHaveBeenCalledTimes(1)
    expect(msg.error).toHaveBeenCalledWith('Не загрузилось файлов: 3. Проверьте связь и нажмите «Повторить».')
    expect(w.findAll('[data-upload-retry]')).toHaveLength(3)
  })
})

describe('TruckPage: общий документ машины не CMR получатели не видят (решение 32)', () => {
  const openFileMenu = async (fileId: string) => {
    await w.find(`[data-file-chip="${fileId}"] [data-file-menu]`).trigger('keydown', { key: 'Enter' })
    await vi.waitFor(() => expect(document.body.querySelectorAll('[role^="menuitem"]').length).toBeGreaterThan(0))
  }
  const item = (label: string) => Array.from(document.body.querySelectorAll<HTMLElement>('[role^="menuitem"]')).find((x) => x.textContent?.trim().startsWith(label))
  const lastInfo = () => msg.info.mock.calls.at(-1)![0]

  it('чек СВХ общим документом с признаком: глаза нет, пункт «Виден получателю» выключен с подсказкой', async () => {
    await mountWith(card({ files: [file('f1', { kind: 'warehouseReceipt', visibleToRecipient: true })] }))
    expect(w.find('[data-file-chip="f1"] [data-file-visible]').exists()).toBe(false)
    await openFileMenu('f1')
    const vis = item('Виден получателю')!
    expect(vis.getAttribute('aria-disabled') ?? vis.getAttribute('data-disabled')).not.toBeNull()
    expect(vis.querySelector('[data-z-dropdown-hint]')!.textContent).toBe('Общий документ получатели не видят — перенесите его в партию')
    vis.click()
    await flushPromises()
    expect(api.patchFile).not.toHaveBeenCalled()
  })

  it('CMR общим документом — глаз «Виден всем получателям машины»', async () => {
    await mountWith(card({ files: [file('f1', { kind: 'cmr', visibleToRecipient: true })] }))
    expect(w.find('[data-file-chip="f1"] [data-file-visible]').text()).toBe('Виден всем получателям машины')
  })

  it('смена вида общего «прочее» → чек СВХ при одной партии: «перенесите в партию» и «В партию 1» (переносит и показывает)', async () => {
    await mountWith(card({ files: [file('f1', { kind: 'other' })] }))
    api.patchFile.mockResolvedValue(card({ files: [file('f1', { kind: 'warehouseReceipt', visibleToRecipient: true })] }))
    await openFileMenu('f1')
    item('Чек СВХ')!.click()
    await flushPromises()
    expect(lastInfo()).toMatchObject({ content: 'Общий документ получатели не видят — перенесите его в партию', action: { label: 'В партию 1' } })
    expect(w.find('[data-file-chip="f1"] [data-file-visible]').exists()).toBe(false)
    api.patchFile.mockResolvedValue(card({ files: [file('f1', { kind: 'warehouseReceipt', partyId: 'p1', visibleToRecipient: true })] }))
    lastInfo().action.onClick()
    await flushPromises()
    expect(api.patchFile).toHaveBeenLastCalledWith('t1', 'f1', { partyId: 'p1', visibleToRecipient: true })
    expect(lastInfo()).toMatchObject({ content: 'Виден получателю партии 1', action: { label: 'Скрыть' } })
  })

  it('инвойс из партии в общие документы — подсказка «перенесите в партию», без «Показать»; true не уходит', async () => {
    const two = [party('p1', 1), party('p2', 2)]
    await mountWith(card({ parties: two, files: [file('f2', { kind: 'invoice', partyId: 'p1', visibleToRecipient: true })] }))
    api.patchFile.mockResolvedValue(card({ parties: two, files: [file('f2', { kind: 'invoice', partyId: null })] }))
    await openFileMenu('f2')
    item('Общий документ машины')!.click()
    await flushPromises()
    expect(api.patchFile).toHaveBeenCalledWith('t1', 'f2', { partyId: null, visibleToRecipient: false })
    expect(lastInfo().content).toBe('Общий документ получатели не видят — перенесите его в партию')
    expect(lastInfo().action).toBeUndefined()
    expect(api.patchFile.mock.calls.some((c) => (c[2] as { visibleToRecipient?: boolean }).visibleToRecipient === true)).toBe(false)
  })

  it('CMR из партии в общие документы — «Показать всем получателям машины» шлёт visibleToRecipient: true', async () => {
    const two = [party('p1', 1), party('p2', 2)]
    await mountWith(card({ parties: two, files: [file('f2', { kind: 'cmr', partyId: 'p1', visibleToRecipient: true })] }))
    api.patchFile.mockResolvedValue(card({ parties: two, files: [file('f2', { kind: 'cmr', partyId: null })] }))
    await openFileMenu('f2')
    item('Общий документ машины')!.click()
    await flushPromises()
    expect(lastInfo()).toMatchObject({ content: 'Файл перенесён и скрыт от получателей', action: { label: 'Показать всем получателям машины' } })
    lastInfo().action.onClick()
    await flushPromises()
    expect(api.patchFile).toHaveBeenLastCalledWith('t1', 'f2', { visibleToRecipient: true })
  })

  it('общий CMR, видимый получателям, сменил вид на «Прочее» — тост «Скрыт от получателей» без «Показать»', async () => {
    await mountWith(card({ files: [file('f1', { kind: 'cmr', visibleToRecipient: true })] }))
    api.patchFile.mockResolvedValue(card({ files: [file('f1', { kind: 'other', visibleToRecipient: false })] }))
    await openFileMenu('f1')
    item('Прочее')!.click()
    await flushPromises()
    expect(lastInfo().content).toBe('Скрыт от получателей')
    expect(lastInfo().action).toBeUndefined()
  })

  it('при нескольких партиях — подсказка без кнопки (переносят через меню файла)', async () => {
    const two = [party('p1', 1), party('p2', 2)]
    await mountWith(card({ parties: two, files: [file('f1', { kind: 'other' })] }))
    api.patchFile.mockResolvedValue(card({ parties: two, files: [file('f1', { kind: 'td', visibleToRecipient: true })] }))
    await openFileMenu('f1')
    item('ТД')!.click()
    await flushPromises()
    expect(lastInfo().content).toBe('Общий документ получатели не видят — перенесите его в партию')
    expect(lastInfo().action).toBeUndefined()
  })
})

describe('TruckPage: загрузка прямо в партию', () => {
  const choose = async (list: File[]) => {
    const input = w.find<HTMLInputElement>('[data-party-card="p1"] [data-party-upload-input]')
    Object.defineProperty(input.element, 'files', { value: list, configurable: true })
    await input.trigger('change')
    await flushPromises()
  }

  it('пунктирный чип «Нет файла ТД» — кнопка: файл уходит в партию с видом ТД; один тост партии', async () => {
    await mountWith(card({
      currentStage: 6, parties: [party('p1', 1, { submittedAtUtc: '2026-11-16T09:00:00Z', tdNumber: '50509/161126/0001234' })],
      blockers: [{ code: 'no_td_file', partyId: 'p1' }],
    }))
    const chip = w.find('[data-party-card="p1"] button[data-party-missing="no_td_file"]')
    expect(chip.exists()).toBe(true)
    await chip.trigger('click')
    api.uploadFile.mockResolvedValue(card({ files: [file('n1', { kind: 'td', partyId: 'p1', visibleToRecipient: true })] }))
    await choose([new File(['x'], 'td.jpg'), new File(['x'], 'td2.jpg')])
    expect(api.uploadFile).toHaveBeenCalledTimes(2)
    expect(api.uploadFile.mock.calls.map((c) => c[2])).toEqual([{ partyId: 'p1', kind: 'td' }, { partyId: 'p1', kind: 'td' }])
    expect(msg.success).toHaveBeenCalledTimes(1)
    expect(msg.success).toHaveBeenCalledWith('Загружено файлов: 2. Видны получателю партии 1')
  })

  it('«+ Файл» — сначала вид из меню, затем файл уходит в эту партию', async () => {
    await mountWith(card())
    await w.find('[data-party-card="p1"] [data-party-add-file]').trigger('keydown', { key: 'Enter' })
    await vi.waitFor(() => expect(document.body.querySelectorAll('[role="menuitem"]').length).toBeGreaterThan(0))
    expect($$('[role="menuitem"]').map((x) => x.textContent?.trim())).toEqual(['Инвойс', 'Упаковочный лист', 'CMR', 'ТД', 'Прочее'])
    $$('[role="menuitem"]').find((x) => x.textContent?.trim() === 'Упаковочный лист')!.click()
    await flushPromises()
    api.uploadFile.mockResolvedValue(card())
    await choose([new File(['x'], 'pl.pdf')])
    expect(api.uploadFile.mock.calls[0]![2]).toEqual({ partyId: 'p1', kind: 'packingList' })
  })

  it('без права загрузки — чип не кнопка и «+ Файл» нет', async () => {
    await mountWith(card({ status: 'archived', blockers: [{ code: 'no_td_file', partyId: 'p1' }] }))
    expect(w.find('[data-party-add-file]').exists()).toBe(false)
    expect(w.find('button[data-party-missing]').exists()).toBe(false)
  })
})

describe('TruckPage: отмена отметки', () => {
  const EV = (...extra: ReturnType<typeof event>[]) => [...card().events, ...extra]

  it('«Отменить» в тосте этапа 2 после отметки этапа 3 — ничего не шлёт', async () => {
    await mountWith(card({ currentStage: 2, events: [event('e1', 1, '2026-11-16T09:14:00Z')] }))
    api.markStage.mockResolvedValueOnce(card({ currentStage: 3, events: EV() }))
    await w.find('[data-primary-action]').trigger('click')
    await flushPromises()
    const first = msg.success.mock.calls.at(-1)![0]
    api.markStage.mockResolvedValueOnce(card({ currentStage: 4, events: EV(event('e3', 3, '2026-11-16T10:00:00Z')) }))
    await w.find('[data-primary-action]').trigger('click')
    await flushPromises()
    const second = msg.success.mock.calls.at(-1)![0]
    first.action.onClick()
    await flushPromises()
    expect(api.undoStage).not.toHaveBeenCalled()
    api.undoStage.mockResolvedValue(card({ currentStage: 3, events: EV() }))
    second.action.onClick()
    await flushPromises()
    expect(api.undoStage).toHaveBeenCalledTimes(1)
  })

  const menuLabels = async () => {
    await w.find('[data-truck-more]').trigger('keydown', { key: 'Enter' })
    await vi.waitFor(() => expect(document.body.querySelectorAll('[role="menuitem"]').length).toBeGreaterThan(0))
    return $$('[role="menuitem"]').map((x) => x.textContent?.trim())
  }
  it('«Отменить последнюю отметку» — только когда есть отметка машины 2–4 или 7', async () => {
    await mountWith(card({ currentStage: 2, events: [event('e1', 1, '2026-11-16T09:14:00Z')] }))
    expect(await menuLabels()).not.toContain('Отменить последнюю отметку')
    w.unmount()
    document.body.innerHTML = ''
    await mountWith(card())
    expect(await menuLabels()).toContain('Отменить последнюю отметку')
  })
})

describe('TruckPage: удаление партии', () => {
  it('подтверждение говорит про файлы и ссылку получателя', async () => {
    await mountWith(card({ can: { border: false, declare: true, manage: false }, parties: [party('p1', 1), party('p2', 2)] }), ['autotransit.read', 'autotransit.declare'])
    await w.findAll('[data-party-delete]').at(-1)!.trigger('click')
    await flushPromises()
    expect(confirmState.open).toBe(true)
    expect(confirmState.content).toContain('Файлы партии станут общими документами машины и будут скрыты от получателей')
    expect(confirmState.content).toContain('Ссылка получателя этой партии перестанет работать')
  })
})

describe('TruckPage: уход во время загрузки', () => {
  it('файлы грузятся — уход и переход на другую машину спрашивают; beforeunload тоже; после — без вопросов', async () => {
    await mountWith(card({ files: [] }))
    let release!: () => void
    api.uploadFile.mockImplementationOnce(() => new Promise((res) => { release = () => res(card()) }))
    const input = w.find<HTMLInputElement>('[data-truck-files] [data-upload-camera-input]')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'a.jpg')], configurable: true })
    await input.trigger('change')
    await flushPromises()

    const ev = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)

    const nav = router.push('/auto-transit')
    await flushPromises()
    expect(confirmState.open).toBe(true)
    expect(confirmState.content).toBe('Файлы ещё загружаются. Если уйти, оставшиеся не загрузятся.')
    confirmState.resolve(false)
    await nav
    expect(router.currentRoute.value.fullPath).toBe('/auto-transit/t1')

    const nav2 = router.push('/auto-transit/t2')
    await flushPromises()
    expect(confirmState.open).toBe(true)
    confirmState.resolve(false)
    await nav2
    expect(router.currentRoute.value.fullPath).toBe('/auto-transit/t1')

    release()
    await flushPromises()
    const ev2 = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(ev2)
    expect(ev2.defaultPrevented).toBe(false)
    await router.push('/auto-transit')
    expect(router.currentRoute.value.fullPath).toBe('/auto-transit')
  })

  it('слушатель beforeunload снимается при уходе', async () => {
    await mountWith(card())
    const remove = vi.spyOn(window, 'removeEventListener')
    w.unmount()
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })
})
