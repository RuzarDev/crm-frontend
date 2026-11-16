import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { FilterId, TruckListItem, TruckListResponse } from '@/api/autoTransit'

const api = vi.hoisted(() => ({ listTrucks: vi.fn() }))
vi.mock('@/api/autoTransit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/autoTransit')>()),
  listTrucks: api.listTrucks,
}))

import AutoTransitView from '../AutoTransitView.vue'
import StageBar from '../StageBar.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZPagination from '@/components/z/ZPagination.vue'
import { useAuthStore } from '@/stores/auth'

const NOW = new Date('2026-11-16T10:00:00Z')
const truck = (id: string, o: Partial<TruckListItem> = {}): TruckListItem => ({
  id, plate: '787 ABD 05', trailerPlate: '45 AKT 05', driverName: 'Е. Сапаров', title: 'ТОО «Алтын Сауда»',
  partiesCount: 1, placesTotal: 412, grossKgTotal: 18640, currentStage: 5, stageSinceUtc: '2026-11-16T09:18:00Z',
  status: 'inWork', problemNote: '', stalled: false, blockerCode: null, submittedCount: 0, tdNumberCount: 0,
  createdAtUtc: '2026-11-16T08:00:00Z', ...o,
})
const COUNTS: Record<FilterId, number> = { all: 12, waitDocs: 2, control: 4, waitDeclaration: 3, warehouse: 2, releasedToday: 7, problem: 1 }
const resp = (items: TruckListItem[], o: Partial<TruckListResponse> = {}): TruckListResponse => ({ items, total: items.length, counts: COUNTS, ...o })
const ITEMS = [
  truck('t1'),
  truck('t2', { plate: 'A 318 KZ 19', title: null, partiesCount: 3, placesTotal: 1108, grossKgTotal: 21300, driverName: 'Ван Лэй', currentStage: 3, trailerPlate: '' }),
]

let w: VueWrapper
let pinia: Pinia
let router: Router
const as = (role: string, perms: string[]) => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = perms
}
const mountAt = async (path = '/auto-transit') => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(AutoTransitView, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
}
const rows = () => w.findAll('[data-truck-row]')
const lastCall = () => api.listTrucks.mock.calls.at(-1)![0]
const chips = () => w.findAll('[data-at-filters] button')
const text = (s: string) => s.replace(/\s+/g, ' ').trim()
let hidden = false

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(NOW)
  hidden = false
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') })
  pinia = createPinia()
  setActivePinia(pinia)
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/auto-transit', name: 'auto-transit', component: { template: '<div/>' } },
      { path: '/auto-transit/new', name: 'auto-transit-new', component: { template: '<div/>' } },
      { path: '/auto-transit/:id', name: 'auto-transit-truck', component: { template: '<div/>' } },
    ],
  })
  api.listTrucks.mockResolvedValue(resp(ITEMS))
  as('manager', ['autotransit.read', 'autotransit.border'])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('AutoTransitView: строки', () => {
  it('строка на машину: номер, прицеп, получатель или «Консолидация · 3», сводка, этап и время на этапе', async () => {
    await mountAt()
    expect(api.listTrucks).toHaveBeenCalledWith({ filter: 'all', q: '', page: 1 })
    expect(rows()).toHaveLength(2)
    const [a, b] = rows()
    expect(a!.find('[data-plate]').text()).toBe('787 ABD 05')
    expect(a!.text()).toContain('прицеп 45 AKT 05')
    expect(a!.text()).toContain('ТОО «Алтын Сауда»')
    expect(text(a!.find('[data-truck-meta]').text())).toBe('1 партия · 412 мест · 18 640 кг · водитель Е. Сапаров')
    expect(text(a!.find('[data-truck-stage]').text())).toContain('Этап 5 из 7 · Декларация')
    expect(a!.find('[data-truck-state]').text()).toContain('Ждёт декларанта')
    expect(a!.find('[data-truck-since]').text()).toBe('42 мин')
    expect(a!.attributes('href')).toBe('/auto-transit/t1')
    expect(b!.text()).toContain('Консолидация · 3')
    expect(b!.text()).not.toContain('прицеп')
    expect(text(b!.find('[data-truck-meta]').text())).toBe('3 партии · 1 108 мест · 21 300 кг · водитель Ван Лэй')
    expect(text(b!.find('[data-truck-stage]').text())).toContain('Этап 3 из 7 · Транспортный контроль')
  })

  it('полоса этапов: семь делений по stageBar, подпись для экранного диктора', async () => {
    await mountAt()
    const bar = rows()[0]!.findComponent(StageBar)
    expect(bar.props('steps')).toEqual(['done', 'done', 'done', 'done', 'current', 'todo', 'todo'])
    expect(bar.attributes('role')).toBe('img')
    expect(bar.attributes('aria-label')).toBe('Этап 5 из 7 · Декларация')
    expect(bar.findAll('[data-step]')).toHaveLength(7)
  })

  it('без движения — метка; «Проблема» — красная метка с текстом проблемы в подсказке', async () => {
    api.listTrucks.mockResolvedValue(resp([
      truck('t1', { stalled: true }),
      truck('t2', { status: 'problem', problemNote: 'Пломба сорвана' }),
    ]))
    await mountAt()
    expect(rows()[0]!.find('[data-truck-stalled]').text()).toBe('без движения')
    expect(rows()[1]!.find('[data-truck-stalled]').exists()).toBe(false)
    const problem = rows()[1]!.find('[data-truck-state]')
    expect(problem.text()).toContain('Проблема')
    expect(problem.find('[title]').attributes('title')).toBe('Пломба сорвана')
  })

  it('выпущенная: «Все этапы пройдены», времени на этапе нет', async () => {
    api.listTrucks.mockResolvedValue(resp([truck('t1', { status: 'released', currentStage: null })]))
    await mountAt()
    expect(rows()[0]!.find('[data-truck-stage]').text()).toContain('Все этапы пройдены')
    expect(rows()[0]!.find('[data-truck-state]').text()).toContain('Выпущена')
    expect(rows()[0]!.find('[data-truck-since]').exists()).toBe(false)
  })

  it('время на этапе обновляется без нового запроса', async () => {
    await mountAt()
    expect(rows()[0]!.find('[data-truck-since]').text()).toBe('42 мин')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(rows()[0]!.find('[data-truck-since]').text()).toBe('42 мин')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(rows()[0]!.find('[data-truck-since]').text()).toBe('43 мин')
  })
})

describe('AutoTransitView: фильтры и поиск', () => {
  it('чипы с количеством из counts; клик — запрос с filter, адрес ?filter=, страница 1', async () => {
    await mountAt()
    expect(chips().map((c) => text(c.text()))).toEqual([
      'Все 12', 'Ждут документы 2', 'На контроле 4', 'Ждут декларацию 3', 'Оплата СВХ 2', 'Выпущены сегодня 7', 'Проблема 1',
    ])
    await chips()[2]!.trigger('click')
    await flushPromises()
    expect(lastCall()).toEqual({ filter: 'control', q: '', page: 1 })
    expect(router.currentRoute.value.query).toEqual({ filter: 'control' })
    await chips()[0]!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
    expect(lastCall()).toEqual({ filter: 'all', q: '', page: 1 })
  })

  it('без counts число не показывается', async () => {
    api.listTrucks.mockResolvedValue({ items: ITEMS, total: 2, counts: {} })
    await mountAt()
    expect(text(chips()[1]!.text())).toBe('Ждут документы')
  })

  it('поиск — с задержкой 300 мс, без пробелов по краям, в адрес ?q=', async () => {
    await mountAt()
    const calls = api.listTrucks.mock.calls.length
    await w.find('input[type="search"]').setValue('  787 ')
    await vi.advanceTimersByTimeAsync(200)
    expect(api.listTrucks.mock.calls.length).toBe(calls)
    await vi.advanceTimersByTimeAsync(100)
    await flushPromises()
    expect(lastCall()).toEqual({ filter: 'all', q: '787', page: 1 })
    expect(router.currentRoute.value.query).toEqual({ q: '787' })
  })

  it('фильтр и поиск берутся из адреса', async () => {
    await mountAt('/auto-transit?filter=problem&q=ABD')
    expect(api.listTrucks).toHaveBeenCalledTimes(1)
    expect(lastCall()).toEqual({ filter: 'problem', q: 'ABD', page: 1 })
    expect((w.find('input[type="search"]').element as HTMLInputElement).value).toBe('ABD')
    expect(chips()[6]!.attributes('data-state')).toBe('on')
  })

  it('неизвестный фильтр в адресе — «Все»', async () => {
    await mountAt('/auto-transit?filter=zzz')
    expect(lastCall()).toEqual({ filter: 'all', q: '', page: 1 })
  })

  it('страницы — только при total > 50; смена фильтра возвращает на первую', async () => {
    await mountAt()
    expect(w.findComponent(ZPagination).exists()).toBe(false)
    api.listTrucks.mockResolvedValue(resp(ITEMS, { total: 120 }))
    await chips()[1]!.trigger('click')
    await flushPromises()
    const pg = w.findComponent(ZPagination)
    expect(pg.exists()).toBe(true)
    pg.vm.$emit('change', 2, 50)
    await flushPromises()
    expect(lastCall()).toEqual({ filter: 'waitDocs', q: '', page: 2 })
    await chips()[2]!.trigger('click')
    await flushPromises()
    expect(lastCall()).toEqual({ filter: 'control', q: '', page: 1 })
  })
})

describe('AutoTransitView: пусто, ошибка, права', () => {
  it('пустой список: ZEmpty с «Новая машина» при праве границы', async () => {
    api.listTrucks.mockResolvedValue(resp([]))
    await mountAt()
    const empty = w.findComponent(ZEmpty)
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('Машин пока нет')
    await empty.get('[data-at-empty-new]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('auto-transit-new')
  })

  it('без права границы — ни кнопки в шапке, ни в пустом списке', async () => {
    as('manager', ['autotransit.read'])
    api.listTrucks.mockResolvedValue(resp([]))
    await mountAt()
    expect(w.find('[data-at-new]').exists()).toBe(false)
    expect(w.find('[data-at-empty-new]').exists()).toBe(false)
    expect(w.findComponent(ZEmpty).text()).toContain('Машин пока нет')
  })

  it('с правом — кнопка «Новая машина» в шапке ведёт на новую машину', async () => {
    await mountAt()
    await w.get('[data-at-new]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('auto-transit-new')
  })

  it('пусто по фильтру — «Ничего не нашлось» и сброс', async () => {
    api.listTrucks.mockResolvedValue(resp([]))
    await mountAt('/auto-transit?filter=problem')
    expect(w.findComponent(ZEmpty).text()).toContain('Ничего не нашлось')
    await w.get('[data-at-reset]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
    expect(lastCall()).toEqual({ filter: 'all', q: '', page: 1 })
  })

  it('ошибка: плашка с «Повторить»; при обновлении старые строки остаются', async () => {
    api.listTrucks.mockRejectedValueOnce(new Error('boom'))
    await mountAt()
    expect(w.find('[data-at-error]').exists()).toBe(true)
    expect(rows()).toHaveLength(0)
    await w.get('[data-at-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-at-error]').exists()).toBe(false)
    expect(rows()).toHaveLength(2)
    api.listTrucks.mockRejectedValueOnce(new Error('boom'))
    await vi.advanceTimersByTimeAsync(60_000)
    await flushPromises()
    expect(w.find('[data-at-error]').exists()).toBe(true)
    expect(rows()).toHaveLength(2)
  })

  it('первая загрузка — заглушки строк', async () => {
    api.listTrucks.mockReturnValue(new Promise(() => {}))
    await mountAt()
    expect(w.find('[data-at-skeleton]').exists()).toBe(true)
    expect(rows()).toHaveLength(0)
  })
})

describe('AutoTransitView: автообновление', () => {
  it('раз в 60 с, пока вкладка видна; скрытая — не обновляет; вернулись через > 60 с — сразу', async () => {
    await mountAt()
    expect(api.listTrucks).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.listTrucks).toHaveBeenCalledTimes(2)
    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(180_000)
    expect(api.listTrucks).toHaveBeenCalledTimes(2)
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(api.listTrucks).toHaveBeenCalledTimes(3)
    expect(api.listTrucks.mock.calls.at(-1)![0]).toEqual({ filter: 'all', q: '', page: 1 })
  })

  it('вернулись быстрее 60 с — без лишнего запроса; после ухода с экрана таймер остановлен', async () => {
    await mountAt()
    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(10_000)
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(api.listTrucks).toHaveBeenCalledTimes(1)
    w.unmount()
    await vi.advanceTimersByTimeAsync(300_000)
    expect(api.listTrucks).toHaveBeenCalledTimes(1)
  })
})
