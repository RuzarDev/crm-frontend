import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ClientDocumentRow } from '@/api/clientCard'

const api = vi.hoisted(() => ({ documents: vi.fn(), exportXlsx: vi.fn(), toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/api/clientCard', () => ({ clientCardApi: { documents: api.documents } }))
vi.mock('@/ui/message', () => ({ message: api.toast }))
vi.mock('@/views/broker/list', async (orig) => ({ ...(await orig<typeof import('@/views/broker/list')>()), exportXlsx: api.exportXlsx }))

import ClientDocumentsRegisterView from '../ClientDocumentsRegisterView.vue'
import ZPagination from '@/components/z/ZPagination.vue'
import { useAuthStore } from '@/stores/auth'

const doc = (o: Partial<ClientDocumentRow>): ClientDocumentRow => ({
  id: 'd', clientId: 'c', clientName: 'ТОО «Клиент»', clientEmail: 'c@client.kz', kind: 'contract', number: '1', year: 2026, status: 2,
  clientSigned: true, providerSigned: true, isSingleUse: false, validUntilUtc: null, daysLeft: null, expiringSoon: false,
  consumedByCaseId: null, generatedAtUtc: '2026-10-02T04:00:00Z',
  ...o,
})
const ROWS = [
  doc({ id: 'a', clientId: 'ca', clientName: 'ТОО «Казахмыс Трейд»', clientEmail: 'finance@kazakhmys.kz', number: '14', validUntilUtc: '2026-12-31T00:00:00Z', daysLeft: 84 }),
  doc({ id: 'b', clientId: 'cb', clientName: 'ТОО «Altyn Med»', clientEmail: 'zakup@altyn.kz', number: '21', status: 1, providerSigned: false }),
  doc({ id: 'c', clientId: 'cc', clientName: 'ТОО «Ақжол Логистик»', kind: 'poa', number: '9', providerSigned: false, validUntilUtc: '2026-10-20T00:00:00Z', daysLeft: 12, expiringSoon: true }),
  doc({ id: 'd', clientId: 'cd', clientName: 'ТОО «Steppe Agro»', number: '3', isSingleUse: true }),
  doc({ id: 'e', clientId: 'ce', clientName: 'ИП «Елубаев»', kind: 'poa', number: '2', status: 3, providerSigned: false, validUntilUtc: '2026-10-01T00:00:00Z', daysLeft: -7 }),
  doc({ id: 'f', clientId: 'cf', clientName: 'ТОО «Алатау Строй»', number: '22', status: 1, providerSigned: false }),
]

let w: VueWrapper
let router: Router
const as = (role: string, perms: string[], businessRoles: string[] = []) => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = perms
  auth.businessRoles = businessRoles
}
const mountView = async () => {
  w = mountWithI18n(ClientDocumentsRegisterView, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
}
const has = (sel: string) => w.find(sel).exists()
const clients = () => w.findAll('[data-doc-client-name] .truncate').map((b) => b.text())
const states = () => w.findAll('[data-docs-states] button').map((b) => b.text().replace(/\s+/g, ' '))
const bodyRows = () => w.findAll('tbody tr')

beforeEach(async () => {
  setActivePinia(createPinia())
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  await router.push('/client-documents')
  api.documents.mockResolvedValue(ROWS)
  as('manager', ['clients.read', 'import40.read'], ['rop'])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('«Документы клиентов»: список', () => {
  it('один запрос (silent); заголовок, подзаголовок, счётчик; колонки и порядок как с сервера', async () => {
    await mountView()
    expect(api.documents).toHaveBeenCalledTimes(1)
    expect(api.documents).toHaveBeenCalledWith(undefined, { silent: true })
    expect(w.get('h1').text()).toBe('Документы клиентов')
    expect(w.text()).toContain('Договоры и доверенности по всем клиентам')
    expect(w.get('[data-docs-count]').text()).toBe('6')
    expect(w.findAll('thead th').map((th) => th.text())).toEqual(['Клиент', 'Документ', 'Статус', 'Подписи', 'Действует до ↑'])
    expect(clients()).toEqual(['ТОО «Казахмыс Трейд»', 'ТОО «Altyn Med»', 'ТОО «Ақжол Логистик»', 'ТОО «Steppe Agro»', 'ИП «Елубаев»', 'ТОО «Алатау Строй»'])
    expect(bodyRows()[0].text()).toContain('finance@kazakhmys.kz')
  })

  it('документ: вид, номер/год, дата, «разовый»; статус — тон и подпись', async () => {
    await mountView()
    const r = bodyRows()
    expect(r[0].get('[data-doc-title]').text()).toBe('Договор № 14/2026')
    expect(r[0].get('[data-doc-generated]').text()).toBe('сформирован 02.10.2026')
    expect(r[2].get('[data-doc-title]').text()).toBe('Доверенность № 9/2026')
    expect(r[3].get('[data-doc-generated]').text()).toBe('сформирован 02.10.2026 · разовый')
    expect(w.findAll('[data-doc-status]').map((s) => s.text())).toEqual(['Действует', 'Ждёт подписи', 'Действует', 'Действует', 'Истёк', 'Ждёт подписи'])
    expect(r[0].get('[data-doc-status]').classes()).toContain('bg-tone-done-bg')
    expect(r[1].get('[data-doc-status]').classes()).toContain('bg-tone-wait-bg')
    expect(r[4].get('[data-doc-status]').classes()).toContain('bg-tone-danger-bg')
  })

  it('подписи: у договора клиент и AQNIET, у доверенности только клиент', async () => {
    await mountView()
    const signs = (i: number) => bodyRows()[i].findAll('[data-sign]').map((s) => `${s.attributes('data-sign')}:${s.attributes('data-on')}`)
    expect(signs(0)).toEqual(['client:true', 'provider:true'])
    expect(signs(1)).toEqual(['client:true', 'provider:false'])
    expect(signs(2)).toEqual(['client:true'])
    expect(bodyRows()[1].text()).toContain('— AQNIET')
  })

  it('срок: дата и пояснение — осталось / просрочен / без срока / только тире', async () => {
    await mountView()
    const r = bodyRows()
    expect(r[0].get('[data-doc-until]').text()).toBe('31.12.2026')
    expect(r[0].get('[data-doc-hint]').text()).toBe('осталось 84 дн.')
    expect(r[0].get('[data-doc-hint]').classes()).not.toContain('text-gold-ink')
    expect(r[2].get('[data-doc-hint]').text()).toBe('осталось 12 дн.')
    expect(r[2].get('[data-doc-hint]').classes()).toEqual(expect.arrayContaining(['text-gold-ink', 'font-semibold']))
    expect(r[4].get('[data-doc-hint]').text()).toBe('просрочен 7 дн.')
    expect(r[4].get('[data-doc-hint]').classes()).toContain('text-tone-danger-fg')
    expect(r[3].get('[data-doc-hint]').text()).toBe('без срока')
    expect(r[3].get('[data-doc-hint]').classes()).toContain('text-muted')
    expect(r[1].get('[data-doc-until]').text()).toBe('—')
    expect(r[1].find('[data-doc-hint]').exists()).toBe(false)
  })

  it('состояния со счётчиками; «Показать» у плашки включает фильтр; сегмент AQNIET у rop', async () => {
    await mountView()
    expect(states()).toEqual(['Все 6', 'Действуют 3', 'Истекают 1', 'Ждут подписи 2', 'Ждут AQNIET 2'])
    await w.get('[data-docs-show-expiring]').trigger('click')
    await flushPromises()
    expect(clients()).toEqual(['ТОО «Ақжол Логистик»'])
    await w.get('[data-docs-show-aqniet]').trigger('click')
    await flushPromises()
    expect(clients()).toEqual(['ТОО «Altyn Med»', 'ТОО «Алатау Строй»'])
    expect(w.get('[data-docs-states] [aria-pressed="true"]').text()).toContain('Ждут AQNIET')
  })

  it('вид и поиск; счётчики состояний учитывают их', async () => {
    await mountView()
    await w.findAll('[data-docs-kinds] button')[2].trigger('click')
    await flushPromises()
    expect(clients()).toEqual(['ТОО «Ақжол Логистик»', 'ИП «Елубаев»'])
    expect(states()).toEqual(['Все 2', 'Действуют 1', 'Истекают 1', 'Ждут подписи 0', 'Ждут AQNIET 0'])
    await w.findAll('[data-docs-kinds] button')[0].trigger('click')
    await w.get('input[type="search"]').setValue('21/2026')
    expect(clients()).toEqual(['ТОО «Altyn Med»'])
    expect(api.documents).toHaveBeenCalledTimes(1)
  })

  it('ничего не найдено: пустое состояние со сбросом; документов нет совсем — без сброса', async () => {
    await mountView()
    await w.get('input[type="search"]').setValue('нет такого')
    expect(w.text()).toContain('Ничего не нашлось')
    await w.get('[data-docs-reset]').trigger('click')
    expect(clients()).toHaveLength(6)
    w.unmount()
    api.documents.mockResolvedValue([])
    await mountView()
    expect(w.text()).toContain('Документов нет')
    expect(has('[data-docs-reset]')).toBe(false)
  })

  it('ошибка загрузки: блок с «Повторить», тост не дублируется (silent)', async () => {
    api.documents.mockRejectedValueOnce(new Error('500'))
    await mountView()
    expect(has('[data-docs-error]')).toBe(true)
    expect(has('[data-docs-table]')).toBe(false)
    expect(w.get('[data-docs-error]').text()).toContain('Не удалось загрузить список')
    await w.get('[data-docs-retry]').trigger('click')
    await flushPromises()
    expect(has('[data-docs-error]')).toBe(false)
    expect(clients()).toHaveLength(6)
  })

  it('ошибка обновления при уже загруженных данных: полоса над таблицей, таблица остаётся', async () => {
    await mountView()
    api.documents.mockRejectedValueOnce(new Error('500'))
    await w.get('[data-docs-refresh]').trigger('click')
    await flushPromises()
    expect(has('[data-docs-error]')).toBe(true)
    expect(clients()).toHaveLength(6)
  })

  it('смена поиска возвращает на первую страницу', async () => {
    api.documents.mockResolvedValue(Array.from({ length: 30 }, (_, i) => doc({ id: `m${i}`, clientName: `Компания ${100 + i}`, number: String(i) })))
    await mountView()
    w.getComponent(ZPagination).vm.$emit('change', 2)
    await flushPromises()
    expect(w.getComponent(ZPagination).props('current')).toBe(2)
    await w.get('input[type="search"]').setValue('Компания')
    await flushPromises()
    expect(w.getComponent(ZPagination).props('current')).toBe(1)
  })
})

describe('«Документы клиентов»: плашки', () => {
  it('gold-плашка — у rop и администратора, с числом и «Показать»; у остальных нет, сегмента AQNIET тоже', async () => {
    await mountView()
    expect(w.get('[data-docs-banner-aqniet]').text()).toContain('2 договора ждут подписи AQNIET')
    expect(w.get('[data-docs-banner-expiring]').text()).toContain('1 документ истекает в ближайшие 30 дней')
    w.unmount()
    as('administrator', ['clients.read'])
    await mountView()
    expect(has('[data-docs-banner-aqniet]')).toBe(true)
    w.unmount()
    as('manager', ['clients.read', 'import40.read'], ['sales'])
    await mountView()
    expect(has('[data-docs-banner-aqniet]')).toBe(false)
    expect(has('[data-docs-banner-expiring]')).toBe(true)
    expect(states()).toEqual(['Все 6', 'Действуют 3', 'Истекают 1', 'Ждут подписи 2'])
  })

  it('склонение: 1 договор ждёт, 5 договоров ждут; плашек нет без счётчика', async () => {
    api.documents.mockResolvedValue([doc({ id: 'x', status: 1, providerSigned: false })])
    await mountView()
    expect(w.get('[data-docs-banner-aqniet]').text()).toContain('1 договор ждёт подписи AQNIET')
    expect(has('[data-docs-banner-expiring]')).toBe(false)
    w.unmount()
    api.documents.mockResolvedValue(Array.from({ length: 5 }, (_, i) => doc({ id: `x${i}`, status: 1, providerSigned: false, expiringSoon: true })))
    await mountView()
    expect(w.get('[data-docs-banner-aqniet]').text()).toContain('5 договоров ждут подписи AQNIET')
    expect(w.get('[data-docs-banner-expiring]').text()).toContain('5 документов истекают')
    w.unmount()
    api.documents.mockResolvedValue([doc({ id: 'y' })])
    await mountView()
    expect(has('[data-docs-banner-aqniet]')).toBe(false)
    expect(has('[data-docs-banner-expiring]')).toBe(false)
  })

  it('счётчики плашек — по всем строкам, поиск и фильтры их не меняют', async () => {
    await mountView()
    await w.get('input[type="search"]').setValue('казахмыс')
    expect(w.get('[data-docs-banner-aqniet]').text()).toContain('2 договора')
  })
})

describe('«Документы клиентов»: переходы', () => {
  it('строка и имя клиента ведут в /clients/<clientId>', async () => {
    await mountView()
    await bodyRows()[1].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/clients/cb')
    await router.push('/client-documents')
    await w.findAll('[data-doc-client]')[2].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/clients/cc')
  })

  it('«Подписать за AQNIET»: только у договоров, ждущих AQNIET; ведёт в мастер с client и step=contract', async () => {
    await mountView()
    const links = w.findAll('[data-doc-sign-aqniet]')
    expect(links).toHaveLength(2)
    expect(links[0].text()).toBe('Подписать за AQNIET →')
    expect(bodyRows()[1].find('[data-doc-sign-aqniet]').exists()).toBe(true)
    expect(bodyRows()[0].find('[data-doc-sign-aqniet]').exists()).toBe(false)
    await links[1].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/import-40/company')
    expect(router.currentRoute.value.query).toEqual({ client: 'cf', step: 'contract' })
  })

  it('ссылка подписи скрыта без права подписывать и без import40.read', async () => {
    as('manager', ['clients.read', 'import40.read'], ['sales'])
    await mountView()
    expect(has('[data-doc-sign-aqniet]')).toBe(false)
    w.unmount()
    as('manager', ['clients.read'], ['rop'])
    await mountView()
    expect(has('[data-doc-sign-aqniet]')).toBe(false)
    expect(has('[data-docs-banner-aqniet]')).toBe(true)
  })
})

describe('«Документы клиентов»: Excel', () => {
  it('выгружает отфильтрованные строки; есть и «Клиент», и «Подпись клиента»', async () => {
    await mountView()
    await w.findAll('[data-docs-kinds] button')[2].trigger('click')
    await flushPromises()
    await w.get('[data-docs-export]').trigger('click')
    await flushPromises()
    expect(api.exportXlsx).toHaveBeenCalledTimes(1)
    const [base, sheet, rows] = api.exportXlsx.mock.calls[0] as [string, string, Record<string, unknown>[]]
    expect(base).toBe('client-documents')
    expect(sheet).toBe('Документы клиентов')
    expect(rows).toHaveLength(2)
    const keys = Object.keys(rows[0])
    expect(keys).toEqual(expect.arrayContaining(['Клиент', 'Подпись клиента', 'Подпись AQNIET']))
    expect(new Set(keys).size).toBe(keys.length)
    expect(rows[0]['Клиент']).toBe('ТОО «Ақжол Логистик»')
    expect(rows[0]['Подпись клиента']).toBe('да')
  })

  it('без строк «Выгрузить» неактивна', async () => {
    api.documents.mockResolvedValue([])
    await mountView()
    expect(w.get('[data-docs-export]').attributes('disabled')).toBeDefined()
  })
})
