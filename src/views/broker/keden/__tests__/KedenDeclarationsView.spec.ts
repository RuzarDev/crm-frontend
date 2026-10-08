import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'

const api = vi.hoisted(() => ({ list: vi.fn(), mine: vi.fn() }))
vi.mock('@/api/keden', async (orig) => ({
  ...(await orig<typeof import('@/api/keden')>()),
  kedenApi: { list: api.list, mine: api.mine },
}))

import KedenDeclarationsView from '../KedenDeclarationsView.vue'
import { useAuthStore } from '@/stores/auth'

const li = (o: Record<string, unknown>) => ({
  id: 'x', kedenId: 'k', declarationType: 'DT', registrationNumber: '56000/081026/0012484', shortName: null,
  statusCode: null, statusName: 'Выпуск разрешён', statusDateTimeUtc: '2026-10-08T05:12:00Z', registeredDateTimeUtc: null,
  declarantName: 'ТОО «Казахмыс Трейд»', customsPost: 'Достык', ...o,
})
const LIST = {
  items: [
    li({ id: 'a', registrationNumber: '56000/081026/0012484', statusDateTimeUtc: '2026-10-08T05:12:00Z' }),
    li({ id: 'b', registrationNumber: '56000/071026/0012399', declarationType: 'TD', statusName: 'На проверке', customsPost: 'Хоргос', declarantName: 'ТОО «Altyn Med»', statusDateTimeUtc: '2026-10-09T05:12:00Z' }),
    li({ id: 'c', registrationNumber: '56000/061026/0012301', statusName: 'Отказ в выпуске', customsPost: 'Достык', declarantName: 'ТОО «Тұран»', statusDateTimeUtc: '2026-10-06T05:12:00Z' }),
  ],
  total: 3,
}
const mi = (o: Record<string, unknown>) => ({
  id: 'm1', registrationNumber: '56000/081026/0099001', referenceCode: null, statusName: 'Зарегистрирована',
  statusDateTimeUtc: '2026-10-08T05:12:00Z', registeredDateTimeUtc: null, customsPost: 'Достык',
  declarantXin: '160440012345', declarantName: 'ТОО «Мой клиент»', ...o,
})
const MINE = [mi({ id: 'm1' }), mi({ id: 'm2', registrationNumber: '56000/081026/0099002', declarantXin: '200540031208', declarantName: 'ТОО «Другой»', statusName: 'Выпуск разрешён' })]

let w: VueWrapper
let router: Router
const as = (role: string) => { useAuthStore().role = role }
const mountView = async (mode: 'all' | 'mine') => {
  w = mountWithI18n(KedenDeclarationsView, { attachTo: document.body, props: { mode }, global: { plugins: [router] } })
  await flushPromises()
}
const nos = () => w.findAll('tbody tr').map((r) => r.text()).map((x) => x.match(/56000\/\d+\/\d+/)?.[0])
const headers = () => w.findAll('thead th').map((th) => th.text())

beforeEach(async () => {
  setActivePinia(createPinia())
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  await router.push('/keden')
  api.list.mockResolvedValue(LIST)
  api.mine.mockResolvedValue(MINE)
  as('administrator')
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('KedenDeclarationsView: mode=all', () => {
  it('грузит список без фильтров (silent); заголовок «КЕДЕН», счётчик = total; сначала новые', async () => {
    await mountView('all')
    expect(api.list).toHaveBeenCalledTimes(1)
    expect(api.list).toHaveBeenCalledWith(undefined, { silent: true })
    expect(api.mine).not.toHaveBeenCalled()
    expect(w.get('h1').text()).toBe('КЕДЕН')
    expect(w.get('[data-keden-count]').text()).toBe('3')
    expect(w.get('[data-keden-subtitle]').text()).toContain('синхронизированные')
    expect(nos()).toEqual(['56000/071026/0012399', '56000/081026/0012484', '56000/061026/0012301'])
  })

  it('есть колонка «Тип» с короткой подписью и ссылки на карточку', async () => {
    await mountView('all')
    expect(headers()).toContain('Тип')
    const types = w.findAll('[data-keden-type]').map((x) => x.text())
    expect(types).toEqual(['ТД', 'ДТ', 'ДТ'])
    const links = w.findAll('a[data-keden-open]')
    expect(links.map((a) => a.attributes('href'))).toEqual(['/keden/b', '/keden/a', '/keden/c'])
  })

  it('смена типа повторяет запрос с type; сброс — без type', async () => {
    await mountView('all')
    await w.get('[data-keden-filter-type] button').trigger('click')
    await flushPromises()
    const opt = [...document.body.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes('Транзитная декларация')) as HTMLElement
    opt.click()
    await flushPromises()
    expect(api.list).toHaveBeenLastCalledWith({ type: 'TD' }, { silent: true })
    expect(api.list).toHaveBeenCalledTimes(2)
  })

  it('поиск, статус и пост — на клиенте, без новых запросов', async () => {
    await mountView('all')
    await w.get('input[type="search"]').setValue('altyn')
    expect(nos()).toEqual(['56000/071026/0012399'])
    await w.get('input[type="search"]').setValue('')
    await w.get('[data-keden-filter-post] button').trigger('click')
    await flushPromises()
    const opts = [...document.body.querySelectorAll('[role="option"]')].map((o) => o.textContent?.trim())
    expect(opts).toEqual(['Все', 'Достык', 'Хоргос'])
    ;(document.body.querySelectorAll('[role="option"]')[1] as HTMLElement).click()
    await flushPromises()
    expect(nos()).toEqual(['56000/081026/0012484', '56000/061026/0012301'])
    expect(api.list).toHaveBeenCalledTimes(1)
  })

  it('ничего не найдено — со сбросом фильтров', async () => {
    await mountView('all')
    await w.get('input[type="search"]').setValue('нет такого')
    expect(w.text()).toContain('Ничего не нашлось')
    await w.get('[data-keden-reset]').trigger('click')
    expect(nos()).toHaveLength(3)
  })

  it('пусто: «Деклараций пока нет»; на сервере больше, чем пришло, — подсказка', async () => {
    api.list.mockResolvedValue({ items: [], total: 0 })
    await mountView('all')
    expect(w.text()).toContain('Деклараций пока нет')
    w.unmount()
    api.list.mockResolvedValue({ items: LIST.items, total: 812 })
    await mountView('all')
    expect(w.get('[data-keden-truncated]').text()).toBe('Показаны последние 3 — уточните поиск')
    expect(w.get('[data-keden-count]').text()).toBe('812')
  })

  it('не загрузилось: блок ошибки с «Повторить»', async () => {
    api.list.mockRejectedValueOnce(new Error('500'))
    await mountView('all')
    expect(w.find('[data-keden-error]').exists()).toBe(true)
    expect(w.find('[data-keden-table]').exists()).toBe(false)
    await w.get('[data-keden-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-keden-error]').exists()).toBe(false)
    expect(nos()).toHaveLength(3)
  })

  it('«Обновить» перезагружает', async () => {
    await mountView('all')
    await w.get('[data-keden-refresh]').trigger('click')
    await flushPromises()
    expect(api.list).toHaveBeenCalledTimes(2)
  })
})

describe('KedenDeclarationsView: mode=mine', () => {
  it('грузит mine (silent); без колонки «Тип» и без ссылок; счётчик = число строк', async () => {
    as('importer')
    await mountView('mine')
    expect(api.mine).toHaveBeenCalledWith({ silent: true })
    expect(api.list).not.toHaveBeenCalled()
    expect(headers()).not.toContain('Тип')
    expect(w.find('a[data-keden-open]').exists()).toBe(false)
    expect(w.findAll('[data-keden-no]')).toHaveLength(2)
    expect(w.find('[data-keden-filter-type]').exists()).toBe(false)
    expect(w.get('[data-keden-count]').text()).toBe('2')
    expect(w.get('h1').text()).toBe('КЕДЕН')
    expect(w.get('[data-keden-subtitle]').text()).toContain('ваших деклараций')
  })

  it('у клиента заголовок «Статусы деклараций»', async () => {
    as('client')
    await mountView('mine')
    expect(w.get('h1').text()).toBe('Статусы деклараций')
  })

  it('декларант со строкой БИН; поиск по БИН', async () => {
    as('client')
    await mountView('mine')
    expect(w.text()).toContain('БИН 160440012345')
    await w.get('input[type="search"]').setValue('200540')
    expect(w.findAll('[data-keden-no]').map((x) => x.text())).toEqual(['56000/081026/0099002'])
  })

  it('пусто: подсказка про БИН в профиле компании', async () => {
    as('client')
    api.mine.mockResolvedValue([])
    await mountView('mine')
    expect(w.text()).toContain('Деклараций пока нет')
    expect(w.text()).toContain('Статусы появятся, когда в профиле компании указан БИН')
  })

  it('смена режима на том же экземпляре перезагружает данные', async () => {
    await mountView('all')
    await w.setProps({ mode: 'mine' })
    await flushPromises()
    expect(api.mine).toHaveBeenCalledTimes(1)
    expect(headers()).not.toContain('Тип')
  })
})
