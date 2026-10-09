import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { createI18n } from 'vue-i18n'
import ru from '@/i18n/locales/ru'
import kk from '@/i18n/locales/kk'
import en from '@/i18n/locales/en'
import { i18n as appI18n } from '@/i18n'

const api = vi.hoisted(() => ({ auditSearch: vi.fn(), auditActors: vi.fn(), exportXlsx: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('@/api/system', () => ({ systemApi: { auditSearch: api.auditSearch, auditActors: api.auditActors } }))
vi.mock('@/views/broker/list', async (orig) => ({ ...(await orig<typeof import('@/views/broker/list')>()), exportXlsx: api.exportXlsx }))
vi.mock('@/ui/message', () => ({ message: { warning: api.warn, error: api.error, success: vi.fn(), info: vi.fn() } }))

import AuditPage from '../AuditPage.vue'

const row = (i: number, extra: Record<string, unknown> = {}) => ({
  id: `a${i}`, atUtc: '2026-10-08T12:42:00Z', actorUserId: 'u1', actorName: 'Ахметов Куат', actorRole: 'administrator',
  action: 'client.block', entityType: 'client', entityId: `c${i}`, summary: `Клиент ${i}`, ...extra,
})
const page = (from: number, n: number, total: number) => ({ items: Array.from({ length: n }, (_, i) => row(from + i)), total })

const i18n = createI18n({ legacy: false, locale: 'ru', messages: { ru, kk, en } })
let w: VueWrapper
let router: Router
const mountAt = async (path = '/settings/audit') => {
  await router.push(path)
  await router.isReady()
  w = mount(AuditPage, { attachTo: document.body, global: { plugins: [i18n, router] } })
  await flushPromises()
}
const lastParams = () => api.auditSearch.mock.calls.at(-1)![0]
const rowsEl = () => w.findAll('[data-audit-what]')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  i18n.global.locale.value = 'ru'
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  api.auditSearch.mockResolvedValue(page(1, 3, 3))
  api.auditActors.mockResolvedValue([{ id: 'u2', name: 'Сейткали Д.' }, { id: 'u1', name: 'Ахметов Куат' }])
  api.exportXlsx.mockResolvedValue(undefined)
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('AuditPage — журнал действий', () => {
  it('шапка, строки и «Показаны N из M»; по умолчанию 30 дней, страница 50, запрос тихий', async () => {
    await mountAt()
    expect(w.get('h1').text()).toBe('Журнал действий')
    expect(w.get('[data-audit-hint]').text()).toBe('Кто менял права, пароли, реквизиты, блокировал клиентов и отзывал документы')
    expect(rowsEl().map((r) => r.text())).toEqual(['Клиент 1', 'Клиент 2', 'Клиент 3'])
    expect(w.get('[data-audit-shown]').text()).toBe('Показаны 3 из 3')
    expect(w.find('[data-audit-more]').exists()).toBe(false)
    expect(api.auditSearch).toHaveBeenCalledTimes(1)
    expect(lastParams()).toEqual({ days: 30, offset: 0, limit: 50 })
    expect(api.auditSearch.mock.calls[0][1]).toEqual({ silent: true })
    expect(w.text()).not.toContain('хранится')
  })

  it('строка: инициалы и имя, подпись действия и цветная точка по виду', async () => {
    api.auditSearch.mockResolvedValue({
      items: [row(1, { action: 'role.permissions' }), row(2, { action: 'user.password_reset' }), row(3), row(4, { action: 'organization.update' }), row(5, { action: 'mystery.code' })],
      total: 5,
    })
    await mountAt()
    const cells = w.findAll('[data-audit-action-cell]')
    expect(cells.map((c) => c.attributes('data-tone'))).toEqual(['submitted', 'wait', 'danger', 'info', 'info'])
    expect(cells.map((c) => c.text())).toEqual(['Изменил права роли', 'Выдал временный пароль', 'Заблокировал клиента', 'Изменил реквизиты', 'mystery.code'])
    expect(w.get('[data-audit-who]').text()).toContain('Ахметов Куат')
    expect(w.get('[data-audit-who]').text()).toContain('АК')
  })

  it('«Показать ещё» догружает со смещением, повторы отбрасываются, счётчик растёт', async () => {
    api.auditSearch.mockResolvedValueOnce(page(1, 50, 120))
    await mountAt()
    expect(rowsEl()).toHaveLength(50)
    expect(w.get('[data-audit-shown]').text()).toBe('Показаны 50 из 120')
    api.auditSearch.mockResolvedValueOnce(page(49, 50, 121)) // двое повторов: a49, a50
    await w.get('[data-audit-more]').trigger('click')
    await flushPromises()
    expect(lastParams()).toEqual({ days: 30, offset: 50, limit: 50 })
    expect(rowsEl()).toHaveLength(98)
    expect(w.get('[data-audit-shown]').text()).toBe('Показаны 98 из 121')
  })

  it('ошибка догрузки не стирает список и подсказывает повторить', async () => {
    api.auditSearch.mockResolvedValueOnce(page(1, 50, 80))
    await mountAt()
    api.auditSearch.mockRejectedValueOnce(new Error('boom'))
    await w.get('[data-audit-more]').trigger('click')
    await flushPromises()
    expect(rowsEl()).toHaveLength(50)
    expect(w.find('[data-audit-more-error]').exists()).toBe(true)
  })

  it('период: чип пишет days в адрес и в запрос; «За всё время» — без days и days=0 в адресе', async () => {
    await mountAt()
    await w.get('[data-audit-days] button').trigger('click')
    await flushPromises()
    const opt = (label: string) => [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.includes(label))!
    opt('7 дней').click()
    await flushPromises()
    expect(router.currentRoute.value.query.days).toBe('7')
    expect(lastParams()).toEqual({ days: 7, offset: 0, limit: 50 })

    await w.get('[data-audit-days] button').trigger('click')
    await flushPromises()
    opt('За всё время').click()
    await flushPromises()
    expect(router.currentRoute.value.query.days).toBe('0')
    expect(lastParams()).toEqual({ offset: 0, limit: 50 })
  })

  it('действие и сотрудник: параметры запроса и адрес; список сотрудников из actors по алфавиту', async () => {
    await mountAt()
    const opt = (label: string) => [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.includes(label))!
    await w.get('[data-audit-action] button').trigger('click')
    await flushPromises()
    opt('Выдал временный пароль').click()
    await flushPromises()
    expect(router.currentRoute.value.query.action).toBe('user.password_reset')
    expect(lastParams()).toMatchObject({ days: 30, action: 'user.password_reset', offset: 0 })

    await w.get('[data-audit-actor] button').trigger('click')
    await flushPromises()
    expect([...document.body.querySelectorAll('[role="option"]')].map((o) => o.textContent!.trim())).toEqual(['Все сотрудники', 'Ахметов Куат', 'Сейткали Д.'])
    opt('Сейткали').click()
    await flushPromises()
    expect(router.currentRoute.value.query.actor).toBe('u2')
    expect(lastParams()).toMatchObject({ action: 'user.password_reset', actorId: 'u2' })
  })

  it('поиск: пауза 400 мс, затем q в адресе и в запросе; смена фильтра сбрасывает смещение', async () => {
    api.auditSearch.mockResolvedValueOnce(page(1, 50, 120))
    await mountAt()
    api.auditSearch.mockResolvedValue(page(1, 1, 1))
    const input = w.get('input[type="search"]')
    await input.setValue('Steppe')
    await vi.advanceTimersByTimeAsync(399)
    expect(api.auditSearch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2)
    await flushPromises()
    expect(router.currentRoute.value.query.q).toBe('Steppe')
    expect(lastParams()).toEqual({ days: 30, q: 'Steppe', offset: 0, limit: 50 })
    expect(rowsEl()).toHaveLength(1)
  })

  it('фильтры из адреса сразу в запросе', async () => {
    await mountAt('/settings/audit?days=90&action=user.poa&actor=u1&q=abc')
    expect(api.auditSearch).toHaveBeenCalledTimes(1)
    expect(lastParams()).toEqual({ days: 90, action: 'user.poa', actorId: 'u1', q: 'abc', offset: 0, limit: 50 })
    expect((w.get('input[type="search"]').element as HTMLInputElement).value).toBe('abc')
  })

  it('устаревший ответ при смене фильтров отбрасывается', async () => {
    let slow!: (v: unknown) => void
    api.auditSearch.mockImplementationOnce(() => new Promise((r) => { slow = r }))
    await router.push('/settings/audit')
    w = mount(AuditPage, { attachTo: document.body, global: { plugins: [i18n, router] } })
    await flushPromises()
    api.auditSearch.mockResolvedValueOnce({ items: [row(9, { summary: 'Новый' })], total: 1 })
    await router.replace({ query: { days: '7' } })
    await flushPromises()
    slow({ items: [row(1, { summary: 'Старый' })], total: 1 })
    await flushPromises()
    expect(rowsEl().map((r) => r.text())).toEqual(['Новый'])
  })

  it('пусто: за период — одна подпись, при фильтрах — «Ничего не нашлось»', async () => {
    api.auditSearch.mockResolvedValue({ items: [], total: 0 })
    await mountAt()
    expect(w.get('[data-audit-table]').text()).toContain('За этот период ничего не происходило')
    expect(w.find('[data-audit-footer]').exists()).toBe(false)
    w.unmount()
    await mountAt('/settings/audit?action=user.poa')
    expect(w.get('[data-audit-table]').text()).toContain('Ничего не нашлось')
  })

  it('ошибка загрузки: «Не удалось загрузить» и «Повторить»', async () => {
    api.auditSearch.mockRejectedValueOnce(new Error('boom'))
    await mountAt()
    expect(w.get('[data-audit-error]').text()).toContain('Не удалось загрузить')
    await w.get('[data-audit-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-audit-error]').exists()).toBe(false)
    expect(rowsEl()).toHaveLength(3)
  })

  it('Excel: все строки по текущим фильтрам (limit 5000), колонки как в таблице', async () => {
    await mountAt('/settings/audit?days=7&action=client.block')
    api.auditSearch.mockResolvedValueOnce({ items: [row(1), row(2)], total: 2 })
    await w.get('[data-audit-export]').trigger('click')
    await flushPromises()
    expect(lastParams()).toEqual({ days: 7, action: 'client.block', offset: 0, limit: 5000 })
    expect(api.exportXlsx).toHaveBeenCalledTimes(1)
    const [base, sheet, rows] = api.exportXlsx.mock.calls[0]
    expect(base).toBe('audit')
    expect(sheet).toBe('Журнал действий')
    expect(Object.keys(rows[0])).toEqual(['Когда', 'Кто', 'Действие', 'Что'])
    expect(rows.map((r: Record<string, string>) => r['Что'])).toEqual(['Клиент 1', 'Клиент 2'])
    expect(rows[0]['Действие']).toBe('Заблокировал клиента')
    expect(api.warn).not.toHaveBeenCalled()
  })

  it('Excel: если записей больше 5000 — предупреждение, что выгружены первые 5000', async () => {
    await mountAt()
    api.auditSearch.mockResolvedValueOnce({ items: [row(1)], total: 7300 })
    await w.get('[data-audit-export]').trigger('click')
    await flushPromises()
    expect(api.exportXlsx).toHaveBeenCalledTimes(1)
    expect(api.warn).toHaveBeenCalledWith('В журнале 7300 записей — в файл выгружены первые 5000. Сузьте период или фильтры.')
  })

  it('Excel: ошибка выгрузки — тост, файл не создаётся; без записей кнопка недоступна', async () => {
    await mountAt()
    api.auditSearch.mockRejectedValueOnce(new Error('boom'))
    await w.get('[data-audit-export]').trigger('click')
    await flushPromises()
    expect(api.error).toHaveBeenCalledWith('Не удалось выгрузить журнал')
    expect(api.exportXlsx).not.toHaveBeenCalled()
    w.unmount()
    api.auditSearch.mockResolvedValue({ items: [], total: 0 })
    await mountAt()
    expect(w.get('[data-audit-export]').attributes('disabled')).toBeDefined()
  })

  it('на kk и en — переведённые подписи, дата ДД.ММ', async () => {
    // Подписи действий берутся из общего экземпляра i18n приложения (formatAuditAction) — переключаем и его.
    appI18n.global.setLocaleMessage('kk', kk as never)
    appI18n.global.locale.value = 'kk'
    i18n.global.locale.value = 'kk'
    await mountAt()
    expect(w.get('h1').text()).toBe('Әрекеттер журналы')
    expect(w.get('[data-audit-shown]').text()).toBe('Көрсетілді: 3 / 3')
    expect(w.findAll('[data-audit-action-cell]')[0].text()).toBe('Клиентті бұғаттады')
    expect(w.get('[data-audit-when]').text()).toMatch(/^\d{2}\.\d{2}, \d{2}:\d{2}$/)
    appI18n.global.locale.value = 'ru'
  })
})
