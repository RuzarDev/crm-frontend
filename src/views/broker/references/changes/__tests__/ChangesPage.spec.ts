import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import kk from '@/i18n/locales/kk'
import ru from '@/i18n/locales/ru'
import { mountWithI18n } from '@/test/mountWithI18n'
import { useAuthStore } from '@/stores/auth'

const api = vi.hoisted(() => ({ timeline: vi.fn(), rateChanges: vi.fn(), topCodes: vi.fn(), vtoSections: vi.fn() }))
vi.mock('@/api/tnved', () => ({ tnvedApi: api }))

import ChangesPage from '../ChangesPage.vue'

// «Сегодня» фиксируем: лента делит события на будущие и прошедшие по местной дате.
const NOW = new Date('2026-10-09T07:00:00Z') // полдень по времени Казахстана

const TIMELINE = [
  {
    typeId: 1, kind: 'starts', date: '2026-10-15', showDate: '2026-10-15T00:00:00Z', codes: ['8516601010', '8516601090'], totalCodes: 5,
    description: 'С 15.10.2026: ставка ввозной пошлины ЕТТ 5% — 5 кодов: 8516601010, 8516601090 и ещё 3',
  },
  {
    typeId: 4, kind: 'ends', date: '2026-09-01', showDate: '2026-09-01T00:00:00Z', codes: ['8703800002'], totalCodes: 1,
    description: 'До 01.09.2026: окончание: ставка ввозной пошлины ЕТТ 7% — 1 код: 8703800002',
  },
]
const RATE_CHANGES = [
  { code: '2402209000', oldRateStr: '10%', newRateStr: '5%', detectedAtUtc: '2026-10-05T03:15:00Z', name: '– – сигареты' },
]
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } })

let w: VueWrapper
let router: Router
const mountAt = async (path: string, role = 'administrator', permissions: string[] = []) => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = permissions
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(ChangesPage, { attachTo: document.body, global: { plugins: [pinia, router] } })
  await flushPromises()
}
const rows = () => w.findAll('[data-change-row]')
const rowKinds = () => rows().map((r) => r.attributes('data-kind'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(NOW)
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  api.timeline.mockResolvedValue({ data: TIMELINE })
  api.rateChanges.mockResolvedValue({ data: RATE_CHANGES })
  api.topCodes.mockResolvedValue({ data: [{ code: '8516601010', treeName: '– электронагреватели', rateStr: '5%', declarationCount: 12 }] })
  api.vtoSections.mockResolvedValue({ data: [{ name: 'Раздел I', totalCodes: 3, groups: [{ code: '0102', hint: 'Живой скот' }] }] })
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('ChangesPage — лента', () => {
  it('склеивает хронологию и изменения ставок; по умолчанию только будущие; тип точкой с подписью', async () => {
    await mountAt('/tnved/timeline')
    expect(w.get('h1').text()).toBe('Изменения ставок и классификатора')
    expect(rowKinds()).toEqual(['starts'])
    expect(rows()[0].get('[data-change-type]').text()).toBe('Вступает в силу')
    expect(rows()[0].get('[data-change-date]').text()).toBe('15.10.2026')
    expect(rows()[0].get('[data-change-text]').text()).toBe('Ставка ввозной пошлины ЕТТ: 5%')
    expect(rows()[0].get('[data-change-more]').text()).toBe('и ещё 3')
    // Хронология — целиком (limit 0): обрезка по limit отрезала бы ближайшие будущие события.
    expect(api.timeline).toHaveBeenCalledWith(0, { silent: true })
  })

  it('«Будущие» снимается: видны все события, изменение ставки — «было → стало», название и дата правильные', async () => {
    await mountAt('/tnved/timeline')
    await w.get('[data-changes-future]').trigger('click')
    expect(rowKinds()).toEqual(['starts', 'rate', 'ends'])
    const rate = rows()[1]
    expect(rate.get('[data-change-type]').text()).toBe('Изменение ставки')
    expect(rate.get('[data-change-text]').text()).toBe('сигареты')
    expect(rate.get('[data-change-date]').text()).toBe('05.10.2026')
    expect(rate.get('[data-change-rate]').text()).toBe('Ставка: 10% → 5%')
    expect(w.text()).not.toContain('Invalid Date')
    expect(rows()[2].get('[data-change-type]').text()).toBe('Действие закончилось')
  })

  it('коды — ссылки на /tnved/tree?code=', async () => {
    await mountAt('/tnved/timeline')
    const links = rows()[0].findAll('[data-change-code]')
    expect(links.map((l) => l.text())).toEqual(['8516 60 101 0', '8516 60 109 0'])
    await links[0].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/tnved/tree')
    expect(router.currentRoute.value.query.code).toBe('8516601010')
  })

  it('поиск по коду и тексту; ничего не нашлось — отдельный текст', async () => {
    await mountAt('/tnved/timeline')
    await w.get('[data-changes-future]').trigger('click')
    await w.get('[data-changes-search]').setValue('2402')
    expect(rowKinds()).toEqual(['rate'])
    await w.get('[data-changes-search]').setValue('шоколад')
    expect(w.find('[data-changes-nothing]').exists()).toBe(true)
    expect(w.get('[data-changes-nothing]').text()).toContain('Ничего не нашлось')
  })

  it('нет будущих изменений — подсказка снять «Будущие», а не «ошибка»', async () => {
    api.timeline.mockResolvedValue({ data: [TIMELINE[1]] })
    await mountAt('/tnved/timeline')
    expect(w.get('[data-changes-nothing]').text()).toContain('Будущих изменений нет')
    expect(w.find('[data-changes-error]').exists()).toBe(false)
  })

  it('ошибка обоих источников — «Повторить»; 429 — про лимит; пусто — отдельный текст', async () => {
    api.timeline.mockRejectedValueOnce(httpError(429))
    api.rateChanges.mockRejectedValueOnce(httpError(500))
    await mountAt('/tnved/timeline')
    expect(w.get('[data-changes-error]').text()).toContain('Слишком много запросов')
    await w.get('[data-changes-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-changes-error]').exists()).toBe(false)
    expect(rowKinds()).toEqual(['starts'])
  })

  it('упал один источник — второй показан, сверху «Повторить»', async () => {
    api.rateChanges.mockRejectedValueOnce(httpError(500))
    await mountAt('/tnved/timeline')
    expect(rowKinds()).toEqual(['starts'])
    expect(w.get('[data-changes-partial]').text()).toContain('Часть изменений не загрузилась')
  })

  it('пустые источники — «Изменений пока нет»', async () => {
    api.timeline.mockResolvedValue({ data: [] })
    api.rateChanges.mockResolvedValue({ data: [] })
    await mountAt('/tnved/timeline')
    expect(w.get('[data-changes-empty]').text()).toContain('Изменений пока нет')
  })
})

describe('ChangesPage — поиск по коду на сервере', () => {
  const later = async (ms = 450) => { await vi.advanceTimersByTimeAsync(ms); await flushPromises() }
  const SERVER_HIT = {
    typeId: 1, kind: 'starts', date: '2026-10-20', showDate: '2026-10-20T00:00:00Z', what: 'importDuty', value: '9%', countryCode: null,
    codes: ['8517130000', '8517620000'], totalCodes: 40, description: '',
  }

  it('цифры спрашивают сервер (code=, с паузой), событие с кодом вне первых пяти находится', async () => {
    await mountAt('/tnved/timeline')
    api.timeline.mockClear()
    api.timeline.mockResolvedValue({ data: [SERVER_HIT] })
    await w.get('[data-changes-search]').setValue('8517 13')
    expect(api.timeline).not.toHaveBeenCalled()
    await later()
    expect(api.timeline).toHaveBeenCalledTimes(1)
    expect(api.timeline).toHaveBeenCalledWith(0, { silent: true, code: '851713' })
    expect(rowKinds()).toEqual(['starts'])
    expect(rows()[0].get('[data-change-text]').text()).toBe('Ставка ввозной пошлины ЕТТ: 9%')
    expect(rows()[0].get('[data-change-more]').text()).toBe('и ещё 38')
  })

  it('быстрый набор — один запрос; ответ устаревшего запроса не перебивает новый', async () => {
    await mountAt('/tnved/timeline')
    api.timeline.mockClear()
    let resolveFirst!: (v: unknown) => void
    api.timeline.mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
    api.timeline.mockResolvedValueOnce({ data: [SERVER_HIT] })
    await w.get('[data-changes-search]').setValue('85')
    await w.get('[data-changes-search]').setValue('851')
    await later()
    expect(api.timeline).toHaveBeenCalledTimes(1)
    expect(api.timeline).toHaveBeenLastCalledWith(0, { silent: true, code: '851' })
    // «851» ещё в пути, пользователь дописал — новый запрос; поздний ответ первого не должен его перебить.
    await w.get('[data-changes-search]').setValue('8517')
    await later()
    expect(api.timeline).toHaveBeenLastCalledWith(0, { silent: true, code: '8517' })
    resolveFirst({ data: [{ ...SERVER_HIT, date: '2026-12-01', codes: ['8519000000'] }] })
    await flushPromises()
    expect(rows().map((r) => r.get('[data-change-date]').text())).toEqual(['20.10.2026'])
  })

  it('текст ищет на месте, без запроса; одна цифра — тоже', async () => {
    await mountAt('/tnved/timeline')
    api.timeline.mockClear()
    await w.get('[data-changes-search]').setValue('ЕТТ')
    await w.get('[data-changes-search]').setValue('8')
    await later()
    expect(api.timeline).not.toHaveBeenCalled()
  })

  it('сбой поиска по коду — запасной поиск по первым пяти кодам и «Повторить»', async () => {
    await mountAt('/tnved/timeline')
    api.timeline.mockRejectedValueOnce(httpError(500))
    await w.get('[data-changes-search]').setValue('8516')
    await later()
    expect(rowKinds()).toEqual(['starts'])
    expect(w.get('[data-changes-partial]').text()).toContain('Часть изменений не загрузилась')
    api.timeline.mockImplementation(async (_limit: number, opts: { code?: string }) => ({ data: opts.code ? [] : TIMELINE }))
    await w.get('[data-changes-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-changes-partial]').exists()).toBe(false)
    expect(w.get('[data-changes-nothing]').text()).toContain('Ничего не нашлось')
  })
})

describe('ChangesFeed — казахский', () => {
  it('подписи, текст события и страна по-казахски', async () => {
    const { default: ChangesFeed } = await import('../ChangesFeed.vue')
    const { timelineEntries } = await import('../changes')
    const i18n = createI18n({ legacy: false, locale: 'kk', messages: { ru, kk } })
    const entries = timelineEntries([
      { ...TIMELINE[0], what: 'antiDumping', value: '12%', countryCode: 'CN', description: '' } as never,
    ])
    const wrapper = mount(ChangesFeed, { props: { entries, today: '2026-10-09' }, global: { plugins: [i18n, router] } })
    expect(wrapper.get('[data-change-type]').text()).toBe('Күшіне енеді')
    expect(wrapper.get('[data-change-text]').text()).toMatch(/^Демпингке қарсы баж \(.+\): 12%$/)
    expect(wrapper.get('[data-change-more]').text()).toBe('тағы 3')
    wrapper.unmount()
  })
})

describe('ChangesPage — статистика', () => {
  it('?view=stats: топ кодов с честной подписью «по записям транзита», коды-ссылки, разделы ВТО раскрываются', async () => {
    await mountAt('/tnved/timeline?view=stats')
    expect(w.get('[data-stats-top]').text()).toContain('Топ кодов по записям транзита')
    expect(w.get('[data-stats-top-hint]').text()).toContain('все записи транзита в системе')
    expect(w.text()).not.toContain('по вашим декларациям')
    expect(w.get('[data-top-count]').text()).toBe('записей: 12')
    expect(w.get('[data-top-code]').attributes('href')).toBe('/tnved/tree?code=8516601010')
    expect(api.timeline).not.toHaveBeenCalled()
    const section = w.get('[data-vto-section] button')
    expect(w.text()).toContain('Раздел I')
    await section.trigger('click')
    await flushPromises()
    expect(w.get('[data-vto-code]').attributes('href')).toBe('/tnved/tree?code=0102')
  })

  it('переключатель «Лента / Статистика» пишет ?view= в адрес', async () => {
    await mountAt('/tnved/timeline')
    const stats = w.findAll('[data-changes-view] button').find((b) => b.text() === 'Статистика')!
    await stats.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.view).toBe('stats')
    expect(w.find('[data-changes-stats]').exists()).toBe(true)
    const feed = w.findAll('[data-changes-view] button').find((b) => b.text() === 'Лента')!
    await feed.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.view).toBeUndefined()
    expect(rowKinds()).toEqual(['starts'])
    // Возврат на «Статистику» берёт данные из памяти, а не перезапрашивает (лимит 60 запросов в минуту).
    await stats.trigger('click')
    await flushPromises()
    expect(api.topCodes).toHaveBeenCalledTimes(1)
    expect(api.vtoSections).toHaveBeenCalledTimes(1)
    expect(api.timeline).toHaveBeenCalledTimes(1)
  })

  it('клиенту «Статистики» нет, даже по прямой ссылке; запрос top-codes не уходит', async () => {
    await mountAt('/tnved/timeline?view=stats', 'client')
    expect(w.find('[data-changes-view]').exists()).toBe(false)
    expect(w.find('[data-changes-stats]').exists()).toBe(false)
    expect(api.topCodes).not.toHaveBeenCalled()
    expect(rowKinds()).toEqual(['starts'])
  })

  it('сотруднику без reestr.read и references.read «Статистики» нет; с одним из прав — есть', async () => {
    await mountAt('/tnved/timeline', 'broker', [])
    expect(w.find('[data-changes-view]').exists()).toBe(false)
    w.unmount()
    await mountAt('/tnved/timeline', 'broker', ['references.read'])
    expect(w.find('[data-changes-view]').exists()).toBe(true)
  })

  it('ошибка топа кодов не прячет разделы ВТО; «Повторить» перезапрашивает только его', async () => {
    api.topCodes.mockRejectedValueOnce(httpError(500))
    await mountAt('/tnved/timeline?view=stats')
    expect(w.get('[data-stats-top-error]').text()).toContain('Не удалось загрузить')
    expect(w.text()).toContain('Раздел I')
    await w.get('[data-stats-top-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-stats-top-error]').exists()).toBe(false)
    expect(api.topCodes).toHaveBeenCalledTimes(2)
    expect(api.vtoSections).toHaveBeenCalledTimes(1)
  })
})

describe('маршрут', () => {
  it('/tnved/analytics перенаправляет на /tnved/timeline?view=stats', async () => {
    const { default: realRouter } = await import('@/router')
    const target = realRouter.resolve('/tnved/analytics')
    expect(target.matched.length).toBeGreaterThan(0)
    const rec = target.matched[target.matched.length - 1]
    expect(rec.redirect).toEqual({ path: '/tnved/timeline', query: { view: 'stats' } })
  })
})
