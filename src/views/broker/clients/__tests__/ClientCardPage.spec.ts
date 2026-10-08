import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ClientCard, ClientCardCase, ClientCardDoc } from '@/api/clientCard'
import type { BrokerInvoice } from '@/api/billing'
import type { ReestrEntry } from '@/types/api'
import { useAuthStore } from '@/stores/auth'

const api = vi.hoisted(() => ({
  card: vi.fn(), reestr: vi.fn(), billing: vi.fn(), download: vi.fn(), saveBlob: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/clientCard', () => ({ clientCardApi: { card: api.card } }))
vi.mock('@/api/reestr', () => ({ reestrApi: { getList: api.reestr } }))
vi.mock('@/api/billing', () => ({ billingApi: { list: api.billing } }))
vi.mock('@/api/import40Contract', () => ({ import40ContractApi: { downloadDocument: api.download } }))
vi.mock('@/ui/download', () => ({ saveBlob: api.saveBlob }))
vi.mock('@/ui/message', () => ({ message: api.toast }))

import ClientCardPage from '../ClientCardPage.vue'

// Меню «⋯» — заглушка: проверяются пункты и переходы, а не механика всплывающего меню.
const DropdownStub = {
  props: ['items'], emits: ['select'],
  template: '<div data-dropdown><slot /><button v-for="it in items" :key="it.key" type="button" :data-menu-item="it.key" @click="$emit(\'select\', it.key)">{{ it.label }}</button></div>',
}
const stubs = { ZDropdown: DropdownStub }

const doc = (o: Partial<ClientCardDoc>): ClientCardDoc => ({
  id: 'd1', kind: 'contract', number: '14', year: 2026, status: 2, clientSigned: true, clientSignedAtUtc: '2026-03-13T08:00:00Z', clientSignMethod: 'egov',
  providerSigned: true, providerSignedAtUtc: '2026-03-13T09:00:00Z', providerSignMethod: 'upload', isSingleUse: false,
  validUntilUtc: '2036-12-31T00:00:00Z', daysLeft: 3000, expiringSoon: false, consumedByCaseId: null, filesCount: 0, generatedAtUtc: '2026-03-12T08:00:00Z',
  ...o,
})
const kase = (o: Partial<ClientCardCase>): ClientCardCase => ({
  id: 'k1', number: 'ИМ-2026-0182', cargo: 'ноутбуки и комплектующие', post: 'Хоргос', status: 2, isProblem: false,
  createdAtUtc: '2026-10-01T08:00:00Z', updatedAtUtc: '2026-10-02T08:00:00Z', svhInvoiceAmount: null, paymentConfirmed: false, declarationsCount: 0,
  ...o,
})
const CASES = [
  kase({ id: 'k1', number: 'ИМ-2026-0182', cargo: 'ноутбуки и комплектующие', status: 2, createdAtUtc: '2026-10-05T08:00:00Z', declarationsCount: 2 }),
  kase({ id: 'k2', number: 'ИМ-2026-0177', cargo: 'мониторы', status: 7, createdAtUtc: '2026-10-03T08:00:00Z', svhInvoiceAmount: 120000, paymentConfirmed: true }),
  kase({ id: 'k3', number: 'ИМ-2026-0161', cargo: 'принтеры', status: 8, createdAtUtc: '2026-09-20T08:00:00Z' }),
  kase({ id: 'k4', number: 'ИМ-2026-0100', cargo: 'кабель', status: 9, createdAtUtc: '2026-08-20T08:00:00Z' }),
]
const card = (o: Partial<ClientCard> = {}): ClientCard => ({
  id: 'c1', username: 'kazakhmys', email: 'finance@kazakhmys-trade.kz', phone: '+7 701 555 12 40', companyName: 'ТОО «Казахмыс Трейд»', bin: '160440012345',
  status: 'Active', emailConfirmed: true, createdAtUtc: '2026-03-12T08:00:00Z', inviteExpiresAtUtc: null,
  profile: {
    companyName: 'Товарищество с ограниченной ответственностью «Казахмыс Трейд»', bin: '160440012345', directorName: 'Сейткали А. Б.', directorBasis: 'Устава',
    legalAddress: 'Алматы, пр. Абая 52', bank: 'АО «Halyk Bank»', iik: 'KZ12601A861001234567', bik: 'HSBKKZKX', kbe: '17', phone: '', email: '',
    contactPersonName: 'Динара М.', contactPersonPosition: 'Логист', contactPhone: '+7 701 111 22 33', contactEmail: 'd.m@kazakhmys-trade.kz', isComplete: true,
    updatedAtUtc: '2026-09-01T08:00:00Z',
  },
  documents: [
    doc({ id: 'dc', kind: 'contract', number: '14' }),
    doc({ id: 'dp', kind: 'poa', number: '9', providerSigned: false, providerSignedAtUtc: null, providerSignMethod: null, validUntilUtc: '2026-10-20T00:00:00Z', daysLeft: 11, expiringSoon: true }),
    doc({ id: 'dold', kind: 'poa', number: '3', status: 3, validUntilUtc: '2025-10-20T00:00:00Z', daysLeft: -300 }),
  ],
  cases: CASES,
  totals: { casesTotal: 4, casesActive: 2, casesDone: 1, casesCancelled: 1, declarationsTotal: 2, invoicedTotal: 120000, paidTotal: 120000 },
  ...o,
})
const invoice = (o: Partial<BrokerInvoice>): BrokerInvoice => ({
  id: 'i1', clientId: 'c1', clientName: 'ТОО «Казахмыс Трейд»', caseId: 'k1', caseNumber: 'ИМ-2026-0182', kind: 'invoice', status: 1, number: '0214', year: 2026,
  issuedAtUtc: '2026-10-02T08:00:00Z', dueDateUtc: '2020-01-10T00:00:00Z', paidAtUtc: null, vatRate: 12, subtotal: 100000, vatAmount: 12000, total: 112000,
  note: '', createdAtUtc: '2026-10-02T08:00:00Z', lines: [], paymentChecks: [],
  ...o,
})
const INVOICES = [
  invoice({ id: 'i1', total: 112000 }),
  invoice({ id: 'i2', number: '0215', total: 160400, dueDateUtc: '2099-01-10T00:00:00Z' }),
  invoice({ id: 'i3', number: '0200', status: 2, total: 50000, paidAtUtc: '2026-09-20T08:00:00Z' }),
  invoice({ id: 'i4', number: '0098', kind: 'act', total: 99999 }),
  invoice({ id: 'ix', clientId: 'other', total: 777000 }),
]
const entry = (id: string, data: Record<string, string>, status = 0): ReestrEntry =>
  ({ id, status, data, createdAtUtc: '2026-10-01T08:00:00Z', clientId: 'c1' }) as unknown as ReestrEntry
const ENTRIES = [
  entry('e1', { '№': '12', 'Контейнер': 'MRSU4885849', 'Груз': 'ноутбуки', 'Дата': '2026-10-04' }, 0),
  entry('e2', { '№': '11', 'Груз': 'мониторы', 'Дата': '2026-10-01' }, 2),
  entry('e3', {}, 2),
]

let w: VueWrapper
let router: Router
const as = (role: string, perms: string[], businessRoles: string[] = []) => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = perms
  auth.businessRoles = businessRoles
}
const ALL = ['clients.read', 'import40.read', 'reestr.read', 'finance.read']
const mountAt = async (path = '/clients/c1') => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(ClientCardPage, { attachTo: document.body, global: { plugins: [router], stubs } })
  await flushPromises()
}
const has = (sel: string) => w.find(sel).exists()
const nb = (s: string) => s.replace(/\u00a0/g, ' ')
const stat = () => w.findAll('[data-stat-cell]').map((c) => ({
  label: c.get('[data-stat-label]').text(), value: nb(c.get('[data-stat-value]').text()), hint: c.find('[data-stat-hint]').exists() ? nb(c.get('[data-stat-hint]').text()) : '',
}))
const tabs = () => w.findAll('[role="tab"]').map((x) => x.text().replace(/\s+/g, ' '))
const clickTab = async (i: number) => {
  const tab = w.findAll('[role="tab"]')[i]
  await tab.trigger('mousedown')
  await tab.trigger('keydown', { key: 'Enter' })
  await flushPromises()
}
const httpError = (status: number) => Object.assign(new Error('x'), { response: { status } })

beforeEach(async () => {
  setActivePinia(createPinia())
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/clients/:id', component: { template: '<div/>' } }, { path: '/:p(.*)*', component: { template: '<div/>' } }] })
  api.card.mockResolvedValue(card())
  api.reestr.mockResolvedValue({ items: ENTRIES, totalCount: 8, page: 1, pageSize: 25, totalPages: 1 })
  api.billing.mockResolvedValue(INVOICES)
  as('manager', ALL)
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('карточка клиента: шапка', () => {
  it('крошки, название, статус, БИН/email/телефон/«с нами с»; запрос карточки тихий', async () => {
    await mountAt()
    expect(api.card).toHaveBeenCalledWith('c1', { silent: true })
    expect(w.get('nav').text()).toContain('Клиенты')
    expect(w.get('[data-card-title]').text()).toBe('ТОО «Казахмыс Трейд»')
    expect(w.get('[data-card-status]').text()).toBe('Активен')
    const meta = w.get('[data-card-meta]').text()
    expect(meta).toContain('160440012345')
    expect(meta).toContain('finance@kazakhmys-trade.kz')
    expect(meta).toContain('+7 701 555 12 40')
    expect(w.get('[data-meta="since"]').text()).toBe('с нами с 12.03.2026')
  })

  it('приглашённый: «до дата» или «ссылка истекла»; заблокированный — тег', async () => {
    api.card.mockResolvedValue(card({ status: 'Invited', inviteExpiresAtUtc: '2099-10-14T08:00:00Z' }))
    await mountAt()
    expect(w.get('[data-card-status]').text()).toBe('Приглашён')
    expect(w.get('[data-card-until]').text()).toBe('до 14.10.2099')
    w.unmount()
    api.card.mockResolvedValue(card({ status: 'Invited', inviteExpiresAtUtc: '2020-10-14T08:00:00Z' }))
    await mountAt()
    expect(w.get('[data-card-expired]').text()).toBe('ссылка истекла')
    w.unmount()
    api.card.mockResolvedValue(card({ status: 'Blocked' }))
    await mountAt()
    expect(w.get('[data-card-status]').text()).toBe('Заблокирован')
  })

  it('«Изменить реквизиты» ведёт в мастер клиента — только с import40.read', async () => {
    await mountAt()
    expect(w.get('[data-card-edit]').attributes('href')).toBe('/import-40/company?client=c1')
    w.unmount()
    as('expeditor', ['clients.read'])
    await mountAt()
    expect(has('[data-card-edit]')).toBe(false)
    expect(has('[data-card-edit-requisites]')).toBe(false)
    expect(has('[data-doc-blank]')).toBe(false)
  })

  it('телефон в шапке и в контакте — в едином виде «+7 700 000 00 00»', async () => {
    const base = card()
    api.card.mockResolvedValue(card({ phone: '+77001157303', profile: { ...base.profile, contactPhone: '87011112233' } }))
    await mountAt()
    expect(w.get('[data-meta="phone"]').text()).toContain('+7 700 115 73 03')
    expect(w.get('[data-contact="phone"] dd').text()).toBe('+7 701 111 22 33')
  })

  it('телефон: «⋯» в строке названия справа, «Изменить реквизиты» — во всю ширину под мета-строкой', async () => {
    await mountAt()
    expect(w.get('[data-card-head]').classes()).toEqual(expect.arrayContaining(['grid', 'grid-cols-[auto_minmax(0,1fr)_auto]', 'sm:flex']))
    expect(w.get('[data-card-actions]').classes()).toContain('contents')
    expect(w.get('[data-card-more]').classes()).toEqual(expect.arrayContaining(['max-sm:col-start-3', 'max-sm:row-start-1']))
    expect(w.get('[data-card-edit]').classes()).toEqual(expect.arrayContaining(['max-sm:col-span-3', 'max-sm:row-start-2', 'max-sm:w-full']))
  })

  it('«Обновить» в меню «⋯» перечитывает карточку, транзит и счета', async () => {
    await mountAt()
    expect(api.card).toHaveBeenCalledTimes(1)
    api.card.mockResolvedValue(card({ companyName: 'ТОО «Новое имя»' }))
    await w.get('[data-menu-item="refresh"]').trigger('click')
    await flushPromises()
    expect(api.card).toHaveBeenCalledTimes(2)
    expect(api.reestr).toHaveBeenCalledTimes(2)
    expect(api.billing).toHaveBeenCalledTimes(2)
    expect(w.get('[data-card-title]').text()).toBe('ТОО «Новое имя»')
  })

  it('меню «⋯»: «Документы клиента» всегда; «Подписать договор» — руководителю с import40.read, когда договор ждёт AQNIET', async () => {
    await mountAt()
    expect(w.findAll('[data-menu-item]').map((b) => b.attributes('data-menu-item'))).toEqual(['docs', 'refresh'])
    await w.get('[data-menu-item="docs"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/client-documents')
    w.unmount()

    api.card.mockResolvedValue(card({ documents: [doc({ id: 'dw', status: 1, providerSigned: false, providerSignedAtUtc: null })] }))
    as('manager', ALL, ['rop'])
    await mountAt('/clients/c1')
    expect(w.findAll('[data-menu-item]').map((b) => b.attributes('data-menu-item'))).toEqual(['sign', 'docs', 'refresh'])
    await w.get('[data-menu-item="sign"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/import-40/company?client=c1&step=contract')
    w.unmount()

    as('manager', ALL, [])
    await mountAt('/clients/c1')
    expect(w.findAll('[data-menu-item]').map((b) => b.attributes('data-menu-item'))).toEqual(['docs', 'refresh'])
    expect(has('[data-doc-sign]')).toBe(false)
  })
})

describe('карточка клиента: показатели', () => {
  it('четыре ячейки с правами; транзит и счета грузятся тихо с фильтром клиента', async () => {
    await mountAt()
    expect(api.reestr).toHaveBeenCalledWith({ clientId: 'c1', page: 1, pageSize: 25, sortBy: 'createdAt', sortDescending: true }, { silent: true })
    expect(api.billing).toHaveBeenCalledWith({ clientId: 'c1' }, { silent: true })
    const s = stat()
    expect(s.map((x) => x.label)).toEqual(['Заявки в работе', 'Выполнено', 'Записи транзита', 'Не оплачено'])
    expect(s[0]).toMatchObject({ value: '2', hint: 'всего 4' })
    expect(s[1]).toMatchObject({ value: '1', hint: 'за всё время' })
    expect(s[2].value).toBe('8')
    // неоплаченные счета (не акты, не оплаченные, не чужие): 112 000 + 160 400, один просрочен
    expect(s[3].value).toBe('272 400 ₸')
    expect(s[3].hint).toBe('2 счёта · 1 просрочен')
  })

  it('без reestr.read и finance.read — только заявки, запросов нет', async () => {
    as('expeditor', ['clients.read', 'import40.read'])
    await mountAt()
    expect(stat().map((x) => x.label)).toEqual(['Заявки в работе', 'Выполнено'])
    expect(api.reestr).not.toHaveBeenCalled()
    expect(api.billing).not.toHaveBeenCalled()
  })

  it('сбой транзита или счетов: «—» с подсказкой, карточка цела, тоста нет', async () => {
    api.reestr.mockRejectedValue(httpError(500))
    api.billing.mockRejectedValue(httpError(500))
    await mountAt()
    const s = stat()
    expect(s[2]).toMatchObject({ value: '—', hint: 'Не удалось загрузить' })
    expect(s[3]).toMatchObject({ value: '—', hint: 'Не удалось загрузить' })
    expect(w.get('[data-card-title]').text()).toBe('ТОО «Казахмыс Трейд»')
    expect(api.toast.error).not.toHaveBeenCalled()
  })

  it('пока транзит и счета грузятся — «—» с подсказкой «загружается…»', async () => {
    api.reestr.mockReturnValue(new Promise(() => {}))
    api.billing.mockReturnValue(new Promise(() => {}))
    await mountAt()
    const s = stat()
    expect(s[2]).toMatchObject({ value: '—', hint: 'загружается…' })
    expect(s[3]).toMatchObject({ value: '—', hint: 'загружается…' })
  })

  it('все счета оплачены: «0 ₸ · всё оплачено»', async () => {
    api.billing.mockResolvedValue([invoice({ status: 2, paidAtUtc: '2026-09-20T08:00:00Z' })])
    await mountAt()
    expect(stat()[3]).toMatchObject({ value: '0 ₸', hint: 'всё оплачено' })
  })
})

describe('карточка клиента: вкладки и ?tab=', () => {
  it('вкладки по правам, со счётчиками', async () => {
    await mountAt()
    expect(tabs()).toEqual(['Обзор', 'Заявки 4', 'Транзит 8', 'Документы 3', 'Счета 4'])
  })

  it('без reestr.read нет «Транзита», без finance.read — «Счетов»', async () => {
    as('manager', ['clients.read', 'import40.read', 'finance.read'])
    await mountAt()
    expect(tabs().map((x) => x.split(' ')[0])).toEqual(['Обзор', 'Заявки', 'Документы', 'Счета'])
    w.unmount()
    as('manager', ['clients.read', 'import40.read', 'reestr.read'])
    await mountAt()
    expect(tabs().map((x) => x.split(' ')[0])).toEqual(['Обзор', 'Заявки', 'Транзит', 'Документы'])
  })

  it('?tab= читается: открывает вкладку; неизвестная или недоступная — «Обзор»', async () => {
    await mountAt('/clients/c1?tab=docs')
    expect(has('[data-tab-panel="docs"]')).toBe(true)
    expect(w.findAll('[role="tab"]')[3].attributes('aria-selected')).toBe('true')
    w.unmount()
    await mountAt('/clients/c1?tab=nope')
    expect(has('[data-tab-panel="overview"]')).toBe(true)
    w.unmount()
    as('manager', ['clients.read', 'import40.read'])
    await mountAt('/clients/c1?tab=invoices')
    expect(has('[data-tab-panel="overview"]')).toBe(true)
  })

  it('?tab= пишется: выбор вкладки меняет адрес, «Обзор» его убирает', async () => {
    await mountAt()
    await clickTab(1)
    expect(router.currentRoute.value.query.tab).toBe('cases')
    expect(has('[data-tab-panel="cases"]')).toBe(true)
    await clickTab(0)
    expect(router.currentRoute.value.query.tab).toBeUndefined()
    expect(has('[data-tab-panel="overview"]')).toBe(true)
  })

  it('«Все 4» в обзоре ведёт во вкладку «Заявки»', async () => {
    api.card.mockResolvedValue(card({ cases: [...CASES, kase({ id: 'k5', number: 'ИМ-2026-0001', createdAtUtc: '2026-01-01T08:00:00Z' })] }))
    await mountAt()
    expect(w.get('[data-card-all-cases]').text()).toBe('Все 5')
    await w.get('[data-card-all-cases]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.tab).toBe('cases')
  })
})

describe('карточка клиента: обзор', () => {
  it('последние три заявки, реквизиты, договор и доверенность, контакт', async () => {
    await mountAt()
    const recent = w.findAll('[data-recent-case]').map((r) => r.text())
    expect(recent).toHaveLength(3)
    for (const [i, parts] of [['ИМ-2026-0182', 'ноутбуки и комплектующие', 'Декларирование'], ['ИМ-2026-0177', 'мониторы', 'Ждёт оплаты услуг AQNIET'], ['ИМ-2026-0161', 'принтеры', 'Выполнено']].entries()) {
      for (const p of parts) expect(recent[i]).toContain(p)
    }
    expect(recent.join('')).not.toContain('ИМ-2026-0100')
    expect(w.get('[data-card-complete]').text()).toBe('Реквизиты заполнены')
    expect(w.get('[data-req="director"] dd').text()).toBe('Сейткали А. Б. · на основании Устава')
    expect(w.get('[data-req="bank"] dd').text()).toBe('АО «Halyk Bank» · БИК HSBKKZKX')
    expect(w.get('[data-req="legalAddress"] dd').text()).toBe('Алматы, пр. Абая 52')
    expect(w.get('[data-card-edit-requisites]').attributes('href')).toBe('/import-40/company?client=c1')
    expect(w.get('[data-contact="name"] dd').text()).toBe('Динара М.')
    expect(w.get('[data-contact="position"] dd').text()).toBe('Логист')
    expect(w.get('[data-contact="phone"] dd').text()).toBe('+7 701 111 22 33')
    expect(w.get('[data-contact="email"] dd').text()).toBe('d.m@kazakhmys-trade.kz')
  })

  it('профиля нет (updatedAtUtc пуст): «на основании устава» не показывается; контакта нет — подсказка', async () => {
    const c = card()
    api.card.mockResolvedValue({
      ...c,
      profile: { ...c.profile, directorBasis: 'устава', updatedAtUtc: null, isComplete: false, contactPersonName: '', contactPersonPosition: '', contactPhone: '', contactEmail: '' },
    })
    await mountAt()
    expect(w.get('[data-req="director"] dd').text()).not.toContain('устава')
    expect(w.get('[data-card-complete]').text()).toBe('Реквизиты заполнены не полностью')
    expect(w.get('[data-card-no-contact]').text()).toBe('Контакт не указан')
  })

  it('документы: действующий договор и истекающая доверенность; подписи с датой и способом; «Выпустить новую»', async () => {
    await mountAt()
    const cards = w.findAll('[data-doc-card]')
    expect(cards.map((c) => c.attributes('data-doc-card'))).toEqual(['contract', 'poa'])
    expect(cards[0].get('[data-doc-title]').text()).toBe('Договор № 14/2026')
    expect(cards[0].get('[data-doc-status]').text()).toBe('Действует')
    expect(cards[0].get('[data-sign="client"]').text()).toBe('клиент · ЭЦП eGov · 13.03.2026')
    expect(cards[0].get('[data-sign="provider"]').text()).toBe('AQNIET · загружен файл · 13.03.2026')
    // доверенность — подпись только клиента; срок истекает → «Истекает»
    expect(cards[1].get('[data-doc-title]').text()).toBe('Доверенность № 9/2026')
    expect(cards[1].get('[data-doc-status]').text()).toBe('Истекает')
    expect(cards[1].find('[data-sign="provider"]').exists()).toBe(false)
    expect(cards[1].get('[data-doc-sub]').text()).toBe('до 20.10.2026 · осталось 11 дн.')
    expect(cards[1].get('[data-doc-renew]').attributes('href')).toBe('/import-40/company?client=c1&step=poa')
    expect(cards[0].find('[data-doc-renew]').exists()).toBe(false)
  })

  it('«Скачать бланк»: запрос и saveBlob с именем; ошибка — без второго тоста', async () => {
    const blob = new Blob(['x'])
    api.download.mockResolvedValue(blob)
    await mountAt()
    await w.get('[data-doc-card="contract"] [data-doc-blank]').trigger('click')
    await flushPromises()
    expect(api.download).toHaveBeenCalledWith('c1', 'dc')
    expect(api.saveBlob).toHaveBeenCalledWith(blob, 'Договор-14-2026.docx')
    api.download.mockRejectedValue(httpError(500))
    await w.get('[data-doc-card="poa"] [data-doc-blank]').trigger('click')
    await flushPromises()
    expect(api.saveBlob).toHaveBeenCalledTimes(1)
    expect(api.toast.error).not.toHaveBeenCalled()
  })

  it('«Подписать за AQNIET» на карточке договора — руководителю', async () => {
    api.card.mockResolvedValue(card({ documents: [doc({ id: 'dw', status: 1, providerSigned: false, providerSignedAtUtc: null })] }))
    as('administrator', ['import40.read'])
    await mountAt()
    expect(w.get('[data-doc-sign]').attributes('href')).toBe('/import-40/company?client=c1&step=contract')
    expect(w.get('[data-doc-status]').text()).toBe('Ждёт подписи')
  })

  it('пустая карточка: подсказки вместо списков', async () => {
    api.card.mockResolvedValue(card({ cases: [], documents: [], totals: { casesTotal: 0, casesActive: 0, casesDone: 0, casesCancelled: 0, declarationsTotal: 0, invoicedTotal: 0, paidTotal: 0 } }))
    await mountAt()
    expect(w.get('[data-card-no-cases]').text()).toBe('Заявок пока нет')
    expect(w.get('[data-card-no-docs]').text()).toBe('Документов пока нет')
    expect(has('[data-card-all-cases]')).toBe(false)
  })
})

describe('карточка клиента: вкладка «Заявки»', () => {
  const rows = () => w.findAll('tbody tr')

  it('таблица: заявка, статус, ДТ, счёт СВХ с «оплачено», дата', async () => {
    await mountAt('/clients/c1?tab=cases')
    expect(w.findAll('thead th').map((th) => th.text())).toEqual(['Заявка', 'Статус', 'ДТ', 'Счёт СВХ', 'Создана'])
    expect(rows()).toHaveLength(4)
    const r = rows()[1].text().replace(/\s+/g, ' ')
    expect(r).toContain('ИМ-2026-0177')
    expect(r).toContain('мониторы')
    expect(r).toContain('Ждёт оплаты услуг AQNIET')
    expect(r).toContain('120 000 ₸')
    expect(r).toContain('оплачено')
    expect(r).toContain('03.10.2026')
    expect(rows()[0].text()).toContain('2')
  })

  it('поиск по номеру и грузу', async () => {
    await mountAt('/clients/c1?tab=cases')
    await w.get('input[type="search"]').setValue('принтер')
    await flushPromises()
    expect(rows()).toHaveLength(1)
    expect(rows()[0].text()).toContain('ИМ-2026-0161')
    await w.get('input[type="search"]').setValue('0177')
    await flushPromises()
    expect(rows()[0].text()).toContain('мониторы')
    await w.get('input[type="search"]').setValue('нет такого')
    await flushPromises()
    expect(w.text()).toContain('Ничего не нашлось')
  })

  it('клик по строке открывает заявку — только с import40.read', async () => {
    await mountAt('/clients/c1?tab=cases')
    await rows()[1].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/import-40/k2')
    w.unmount()

    as('expeditor', ['clients.read'])
    await mountAt('/clients/c1?tab=cases')
    expect(has('[data-case-open]')).toBe(false)
    await rows()[1].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/clients/c1?tab=cases')
    expect(rows()[1].classes()).not.toContain('cursor-pointer')
  })
})

describe('карточка клиента: вкладки «Транзит», «Документы», «Счета»', () => {
  it('транзит: №, статус, контейнер, груз, дата; клик → /reestr?q=контейнер (или №)', async () => {
    await mountAt('/clients/c1?tab=transit')
    const rows = w.findAll('[data-transit-table] tbody tr')
    expect(rows).toHaveLength(3)
    expect(w.findAll('thead th').map((th) => th.text())).toEqual(['№', 'Статус', 'Контейнер', 'Груз', 'Дата'])
    const first = rows[0].text().replace(/\s+/g, ' ')
    expect(first).toContain('12')
    expect(first).toContain('В работе')
    expect(first).toContain('MRSU 488584 9')
    expect(first).toContain('ноутбуки')
    expect(w.get('[data-transit-shown]').text()).toBe('Показаны последние 3 из 8')
    await rows[0].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/reestr?q=MRSU4885849')
  })

  it('транзит: без контейнера ищем по №; без обоих строка не кликается', async () => {
    await mountAt('/clients/c1?tab=transit')
    const rows = w.findAll('[data-transit-table] tbody tr')
    expect(rows[2].classes()).not.toContain('cursor-pointer')
    await rows[1].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/reestr?q=11')
  })

  it('транзит: ошибка — «Повторить» только для блока', async () => {
    api.reestr.mockRejectedValueOnce(httpError(500))
    await mountAt('/clients/c1?tab=transit')
    expect(has('[data-transit-error]')).toBe(true)
    await w.get('[data-transit-retry]').trigger('click')
    await flushPromises()
    expect(has('[data-transit-error]')).toBe(false)
    expect(w.findAll('[data-transit-table] tbody tr')).toHaveLength(3)
    expect(api.card).toHaveBeenCalledTimes(1)
  })

  it('документы: все, со статусом, сроком и подписями; кнопка бланка — с import40.read', async () => {
    await mountAt('/clients/c1?tab=docs')
    const rows = w.findAll('[data-docs-table] tbody tr')
    expect(rows).toHaveLength(3)
    expect(rows[0].text()).toContain('Договор № 14/2026')
    expect(rows[0].text()).toContain('сформирован 12.03.2026')
    expect(rows[0].text()).toContain('Действует')
    expect(rows[1].text()).toContain('осталось 11 дн.')
    expect(rows[2].text()).toContain('Истёк')
    expect(rows[2].text()).toContain('просрочен 300 дн.')
    expect(rows[0].find('[data-row-primary]').text()).toBe('Скачать бланк')
    api.download.mockResolvedValue(new Blob(['x']))
    await rows[0].get('[data-row-primary]').trigger('click')
    await flushPromises()
    expect(api.download).toHaveBeenCalledWith('c1', 'dc')
  })

  it('документы без import40.read: бланка нет', async () => {
    as('expeditor', ['clients.read'])
    await mountAt('/clients/c1?tab=docs')
    expect(has('[data-row-primary]')).toBe(false)
  })

  it('счета: только этого клиента; документ, статус, сумма, даты; «Все счета» → /billing', async () => {
    await mountAt('/clients/c1?tab=invoices')
    const rows = w.findAll('[data-invoices-table] tbody tr')
    expect(rows).toHaveLength(4)
    expect(rows[0].text()).toContain('Счёт № 0214/2026')
    expect(nb(rows[0].text())).toContain('112 000')
    expect(rows[0].text()).toContain('Выставлен')
    expect(rows[0].text()).toMatch(/просрочен \d+ дн\./)
    expect(rows[2].text()).toContain('Оплачен')
    expect(rows[2].text()).toContain('оплачен 20.09.2026')
    expect(w.text()).not.toContain('777 000')
    expect(w.get('[data-invoices-all]').attributes('href')).toBe('/billing')
  })

  it('счета: ошибка — «Повторить»', async () => {
    api.billing.mockRejectedValueOnce(httpError(500))
    await mountAt('/clients/c1?tab=invoices')
    expect(has('[data-invoices-error]')).toBe(true)
    await w.get('[data-invoices-retry]').trigger('click')
    await flushPromises()
    expect(w.findAll('[data-invoices-table] tbody tr')).toHaveLength(4)
  })
})

describe('карточка клиента: состояния', () => {
  it('скелетон, пока карточка грузится', async () => {
    api.card.mockReturnValue(new Promise(() => {}))
    await mountAt()
    expect(has('[data-card-skeleton]')).toBe(true)
    expect(has('[data-card-header]')).toBe(false)
  })

  it.each([404, 403])('%i → «Клиент не найден» со ссылкой к списку, без тоста', async (code) => {
    api.card.mockRejectedValue(httpError(code))
    await mountAt()
    expect(w.get('[data-card-not-found]').text()).toContain('Клиент не найден')
    expect(w.get('[data-card-to-list]').attributes('href')).toBe('/clients')
    expect(has('[data-card-header]')).toBe(false)
    expect(api.toast.error).not.toHaveBeenCalled()
  })

  it('сбой сети → экран ошибки; «Повторить» перечитывает карточку', async () => {
    api.card.mockRejectedValueOnce(httpError(500))
    await mountAt()
    expect(has('[data-card-error]')).toBe(true)
    await w.get('[data-card-retry]').trigger('click')
    await flushPromises()
    expect(has('[data-card-error]')).toBe(false)
    expect(w.get('[data-card-title]').text()).toBe('ТОО «Казахмыс Трейд»')
    expect(api.card).toHaveBeenCalledTimes(2)
  })

  it('смена клиента сбрасывает поиск по заявкам — фильтр прежнего клиента не переносится', async () => {
    await mountAt('/clients/a?tab=cases')
    await w.get('input[type="search"]').setValue('принтер')
    await flushPromises()
    expect(w.findAll('tbody tr')).toHaveLength(1)
    await router.push('/clients/b?tab=cases')
    await flushPromises()
    expect((w.get('input[type="search"]').element as HTMLInputElement).value).toBe('')
    expect(w.findAll('tbody tr').length).toBeGreaterThan(1)
  })

  it('смена клиента в адресе (/clients/a → /clients/b) перечитывает карточку', async () => {
    await mountAt('/clients/a')
    api.card.mockResolvedValue(card({ id: 'b', companyName: 'ТОО «Другой»' }))
    await router.push('/clients/b')
    await flushPromises()
    expect(api.card).toHaveBeenLastCalledWith('b', { silent: true })
    expect(w.get('[data-card-title]').text()).toBe('ТОО «Другой»')
  })
})
