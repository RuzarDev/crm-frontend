import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { FinanceOverview, FinanceRow } from '@/api/manage'

const api = vi.hoisted(() => ({
  overview: vi.fn(), downloadFile: vi.fn(), exportXlsx: vi.fn(), saveBlob: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/manage', () => ({ financeApi: { overview: api.overview } }))
vi.mock('@/api/import40', () => ({ import40Api: { downloadFile: api.downloadFile }, IMPORT40_STATUSES: [
  { id: 0, key: 'Draft' }, { id: 1, key: 'AtBorder' }, { id: 2, key: 'Declaring' }, { id: 3, key: 'Submitted' }, { id: 4, key: 'Released' },
  { id: 5, key: 'SvhClosing' }, { id: 6, key: 'Invoiced' }, { id: 7, key: 'Paid' }, { id: 8, key: 'Done' }, { id: 9, key: 'Cancelled' },
] }))
vi.mock('@/ui/message', () => ({ message: api.toast }))
vi.mock('@/ui/download', () => ({ saveBlob: api.saveBlob }))
vi.mock('@/views/broker/list', async (orig) => ({ ...(await orig<typeof import('@/views/broker/list')>()), exportXlsx: api.exportXlsx }))

import FinanceOverviewView from '../FinanceOverviewView.vue'
import PeriodChip from '@/components/broker/PeriodChip.vue'
import ZPagination from '@/components/z/ZPagination.vue'
import { useAuthStore } from '@/stores/auth'

const row = (o: Partial<FinanceRow>): FinanceRow => ({
  caseId: 'c', number: 'ИМ-2026-0001', clientName: 'ТОО «Клиент»', cargo: 'товар', status: 3, isProblem: false,
  svhInvoiceNote: '', svhInvoiceAmount: null, svhInvoiceNumber: '', invoicedAtUtc: null,
  paymentConfirmed: false, paidAtUtc: null, hasPaymentCheck: false,
  customsPaymentsKzt: 0, declarationsCount: 0, createdAtUtc: '2026-10-01T05:00:00Z', updatedAtUtc: '2026-10-01T05:00:00Z', files: [],
  ...o,
})
const awaitingRow = (i: number) => row({ caseId: `aq${i}`, number: `ИМ-2026-02${i}`, clientName: `ТОО «AQ ${i}»`, status: 7, invoicedAtUtc: '2026-09-20T05:00:00Z', svhInvoiceAmount: 100000, paymentConfirmed: true, paidAtUtc: '2026-09-25T05:00:00Z' })
const BASE_ROWS: FinanceRow[] = [
  row({
    caseId: 'a', number: 'ИМ-2026-0170', clientName: 'ТОО «Altyn Med»', cargo: 'медицинские перчатки', status: 6,
    invoicedAtUtc: '2026-10-03T05:00:00Z', svhInvoiceAmount: 312400, svhInvoiceNumber: '1187', hasPaymentCheck: true,
    customsPaymentsKzt: 1230400, declarationsCount: 1,
    files: [{ id: 'f1', section: 'svh-invoice', fileName: 'schet.pdf', createdAtUtc: '2026-10-03T05:00:00Z' }, { id: 'f2', section: 'payment-check', fileName: 'chek.pdf', createdAtUtc: '2026-10-04T05:00:00Z' }],
  }),
  row({ caseId: 'b', number: 'ИМ-2026-0173', clientName: 'ТОО «Steppe Agro»', cargo: 'запчасти', status: 6, invoicedAtUtc: '2026-10-02T05:00:00Z', svhInvoiceAmount: 184000 }),
  row({ caseId: 'c', number: 'ИМ-2026-0161', clientName: 'ТОО «Казахмыс Трейд»', cargo: 'мониторы', status: 8, invoicedAtUtc: '2026-09-24T05:00:00Z', svhInvoiceAmount: 96500, paymentConfirmed: true, paidAtUtc: '2026-09-27T05:00:00Z', customsPaymentsKzt: 2012300, declarationsCount: 2 }),
  row({ caseId: 'e', number: 'ИМ-2026-0149', clientName: 'ТОО «Отмена»', cargo: 'ткань', status: 9 }),
  row({ caseId: 'p', number: 'ИМ-2026-0140', clientName: 'ТОО «Проблема»', cargo: 'ткань', status: 3, isProblem: true }),
]
const overview = (rows: FinanceRow[]): FinanceOverview => ({
  rows, invoicedCount: 12, awaitingPaymentCount: 3, paidCount: 9, svhInvoicedTotal: 4312400, svhPaidTotal: 3691500, customsPaymentsTotal: 18406900,
})
const mkRows = (extra: FinanceRow[] = [awaitingRow(1), awaitingRow(2)]) => [...BASE_ROWS, ...extra]

let w: VueWrapper
let router: Router
const as = (role: string, perms: string[]) => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = perms
}
const mountView = async () => {
  w = mountWithI18n(FinanceOverviewView, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
}
const has = (sel: string) => w.find(sel).exists()
const numbers = () => w.findAll('tbody tr').map((r) => r.find('[data-finance-link],[data-finance-number]').text())
const bodyRows = () => w.findAll('tbody tr')
const segments = () => w.findAll('[data-finance-filters] button').map((b) => b.text().replace(/\s+/g, ' '))

beforeEach(async () => {
  setActivePinia(createPinia())
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  await router.push('/finance')
  api.overview.mockResolvedValue(overview(mkRows()))
  api.exportXlsx.mockResolvedValue(undefined)
  as('manager', ['finance.read', 'import40.read', 'import40.declarant'])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('«Финансы»: обзор', () => {
  it('один запрос без периода (silent); заголовок и показатели', async () => {
    await mountView()
    expect(api.overview).toHaveBeenCalledTimes(1)
    expect(api.overview).toHaveBeenCalledWith(undefined, undefined, { silent: true })
    expect(w.get('h1').text()).toBe('Финансы')
    const nb = (x: string) => x.replace(/\u00a0/g, ' ')
    const cells = w.findAll('[data-stat-cell]')
    const parts = (i: number) => [...cells[i].element.querySelectorAll(':scope > div')].map((d) => nb(d.textContent ?? '').trim())
    expect(parts(0)).toEqual(['Счета СВХ выставлены', '12', '4 312 400 ₸'])
    expect(parts(1)).toEqual(['Ждут оплаты клиента', '3'])
    expect(parts(2)).toEqual(['Оплачено клиентами', '9', '3 691 500 ₸'])
    expect(parts(3)).toEqual(['Таможенные платежи гр. B', '18 406 900 ₸', 'по 3 ДТ'])
  })

  it('период уходит на сервер: смена и сброс — новый запрос с датами', async () => {
    await mountView()
    w.getComponent(PeriodChip).vm.$emit('update:value', ['2026-09-01', '2026-10-08'])
    await flushPromises()
    expect(api.overview).toHaveBeenLastCalledWith('2026-09-01', '2026-10-08', { silent: true })
    w.getComponent(PeriodChip).vm.$emit('update:value', null)
    await flushPromises()
    expect(api.overview).toHaveBeenLastCalledWith(undefined, undefined, { silent: true })
    expect(api.overview).toHaveBeenCalledTimes(3)
  })

  it('колонки; этап, счёт, оплата, платежи, файлы, дата', async () => {
    await mountView()
    expect(w.findAll('thead th').map((th) => th.text())).toEqual(['Заявка', 'Этап', 'Счёт СВХ', 'Оплата', 'Платежи гр. B', 'Файлы', 'Создана'])
    const r = bodyRows()
    expect(r[0].get('[data-finance-sub]').text()).toBe('ТОО «Altyn Med» · медицинские перчатки')
    expect(r[0].get('[data-finance-invoice]').text()).toBe('312\u00a0400\u00a0₸')
    expect(r[0].get('[data-finance-invoice-sub]').text()).toBe('№ 1187 · 03.10.2026')
    expect(r[0].get('[data-finance-payment]').text()).toBe('Чек на проверке')
    expect(r[0].get('[data-finance-customs]').text()).toBe('1\u00a0230\u00a0400\u00a0₸')
    expect(r[0].text()).toContain('1 ДТ')
    expect(r[0].findAll('[data-finance-file]').map((f) => f.text())).toEqual(['Счёт', 'Чек'])
    expect(r[0].text()).toContain('01.10.2026')
    expect(r[1].get('[data-finance-payment]').text()).toBe('Ждёт оплаты')
    expect(r[2].get('[data-finance-payment]').text()).toBe('Оплачено 27.09.2026')
  })

  it('этап: тон и подпись — 9 нейтральный, 7 «Ждёт счёта AQNIET», проблема красная', async () => {
    await mountView()
    const st = w.findAll('[data-finance-stage]')
    const byNumber = (n: string) => st[numbers().indexOf(n)]
    expect(byNumber('ИМ-2026-0149').classes()).toContain('bg-tone-neutral-bg')
    expect(byNumber('ИМ-2026-0149').text()).toBe('Отменена')
    expect(byNumber('ИМ-2026-0161').classes()).toContain('bg-tone-done-bg')
    expect(byNumber('ИМ-2026-0170').classes()).toContain('bg-tone-wait-bg')
    expect(byNumber('ИМ-2026-021').text()).toBe('Ждёт счёта AQNIET')
    expect(byNumber('ИМ-2026-021').classes()).toContain('bg-tone-wait-bg')
    expect(byNumber('ИМ-2026-0140').classes()).toContain('bg-tone-danger-bg')
  })

  it('фильтры со счётчиками и поиск', async () => {
    await mountView()
    expect(segments()).toEqual(['Все 7', 'Ждут оплаты 2', 'Оплачено 3', 'Счёт выставлен 6'])
    await w.findAll('[data-finance-filters] button')[1].trigger('click')
    await flushPromises()
    expect(numbers()).toEqual(['ИМ-2026-0170', 'ИМ-2026-0173'])
    await w.get('input[type="search"]').setValue('steppe')
    expect(numbers()).toEqual(['ИМ-2026-0173'])
    expect(segments()).toEqual(['Все 1', 'Ждут оплаты 1', 'Оплачено 0', 'Счёт выставлен 1'])
    expect(api.overview).toHaveBeenCalledTimes(1)
  })

  it('ничего не найдено: пустое состояние со сбросом; за период пусто — без сброса', async () => {
    await mountView()
    await w.get('input[type="search"]').setValue('нет такого')
    expect(w.text()).toContain('Ничего не нашлось')
    await w.get('[data-finance-reset]').trigger('click')
    expect(bodyRows()).toHaveLength(7)
    w.unmount()
    api.overview.mockResolvedValue(overview([]))
    await mountView()
    expect(w.text()).toContain('Заявок за период нет')
    expect(has('[data-finance-reset]')).toBe(false)
  })

  it('смена поиска, фильтра или периода возвращает на первую страницу', async () => {
    api.overview.mockResolvedValue(overview(Array.from({ length: 30 }, (_, i) => row({ caseId: `m${i}`, number: `ИМ-2026-9${i}`, clientName: `Компания ${100 + i}` }))))
    await mountView()
    w.getComponent(ZPagination).vm.$emit('change', 2)
    await flushPromises()
    expect(w.getComponent(ZPagination).props('current')).toBe(2)
    await w.get('input[type="search"]').setValue('Компания')
    await flushPromises()
    expect(w.getComponent(ZPagination).props('current')).toBe(1)
    w.getComponent(ZPagination).vm.$emit('change', 2)
    await flushPromises()
    w.getComponent(PeriodChip).vm.$emit('update:value', ['2026-09-01', '2026-10-08'])
    await flushPromises()
    expect(w.getComponent(ZPagination).props('current')).toBe(1)
  })
})

describe('«Финансы»: плашка «ждут счёта AQNIET»', () => {
  it('число заявок и номера ссылками на /billing?caseId=; ссылок не больше трёх, остальные — «и ещё»', async () => {
    api.overview.mockResolvedValue(overview(mkRows([awaitingRow(1), awaitingRow(2), awaitingRow(3), awaitingRow(4), awaitingRow(5)])))
    await mountView()
    const banner = w.get('[data-finance-banner]')
    expect(banner.text()).toContain('5 заявок оплатили СВХ и ждут счёта AQNIET')
    const links = banner.findAll('[data-finance-banner-link]')
    expect(links.map((l) => l.text())).toEqual(['ИМ-2026-021', 'ИМ-2026-022', 'ИМ-2026-023'])
    expect(links[0].element.tagName).toBe('A')
    expect(links[0].attributes('href')).toBe('/billing?caseId=aq1')
    expect(banner.get('[data-finance-banner-more]').text()).toBe('и ещё 2')
    await banner.get('[data-finance-banner-more]').trigger('click')
    expect(banner.findAll('[data-finance-banner-link]')).toHaveLength(5)
    expect(banner.find('[data-finance-banner-more]').exists()).toBe(false)
    expect(banner.findAll('[data-finance-banner-link]')[4].attributes('href')).toBe('/billing?caseId=aq5')
  })

  it('склонение; нет заявок на этом шаге — плашки нет; фильтры плашку не трогают', async () => {
    api.overview.mockResolvedValue(overview(mkRows([awaitingRow(1)])))
    await mountView()
    expect(w.get('[data-finance-banner]').text()).toContain('1 заявка оплатила СВХ и ждёт счёта AQNIET')
    expect(w.find('[data-finance-banner-more]').exists()).toBe(false)
    await w.get('input[type="search"]').setValue('нет такого')
    expect(has('[data-finance-banner]')).toBe(true)
    w.unmount()
    api.overview.mockResolvedValue(overview(mkRows([awaitingRow(1), awaitingRow(2)])))
    await mountView()
    expect(w.get('[data-finance-banner]').text()).toContain('2 заявки оплатили')
    w.unmount()
    api.overview.mockResolvedValue(overview(mkRows([])))
    await mountView()
    expect(has('[data-finance-banner]')).toBe(false)
  })
})

describe('«Финансы»: переход в заявку', () => {
  it('обычный сотрудник: номер — ссылка, клик по строке открывает заявку', async () => {
    await mountView()
    const first = bodyRows()[0]
    expect(first.get('[data-finance-link]').attributes('href')).toBe('/import-40/a')
    await first.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/import-40/a')
  })

  it('клик по файлу строку не открывает', async () => {
    api.downloadFile.mockResolvedValue(new Blob(['x']))
    await mountView()
    await bodyRows()[0].get('[data-finance-file="svh-invoice"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/finance')
  })

  it('сотрудник только с финансами: строка не кликается, номер — не ссылка', async () => {
    as('accountant', ['finance.read'])
    await mountView()
    expect(has('[data-finance-link]')).toBe(false)
    expect(numbers()[0]).toBe('ИМ-2026-0170')
    await bodyRows()[0].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/finance')
    expect(bodyRows()[0].classes()).not.toContain('cursor-pointer')
  })
})

describe('«Финансы»: файлы', () => {
  it('скачивание: blob уходит в saveBlob под именем файла', async () => {
    const blob = new Blob(['pdf'])
    api.downloadFile.mockResolvedValue(blob)
    await mountView()
    await bodyRows()[0].get('[data-finance-file="payment-check"]').trigger('click')
    await flushPromises()
    expect(api.downloadFile).toHaveBeenCalledWith('a', 'f2')
    expect(api.saveBlob).toHaveBeenCalledWith(blob, 'chek.pdf')
  })

  it('ошибка скачивания — тост', async () => {
    api.downloadFile.mockRejectedValue(new Error('404'))
    await mountView()
    await bodyRows()[0].get('[data-finance-file="svh-invoice"]').trigger('click')
    await flushPromises()
    expect(api.toast.error).toHaveBeenCalledWith('Не удалось скачать файл')
    expect(api.saveBlob).not.toHaveBeenCalled()
  })
})

describe('«Финансы»: ошибки', () => {
  it('ошибка первой загрузки: блок с «Повторить», без показателей и таблицы; повтор поднимает экран', async () => {
    api.overview.mockRejectedValueOnce(new Error('500'))
    await mountView()
    expect(has('[data-finance-error]')).toBe(true)
    expect(has('[data-finance-table]')).toBe(false)
    expect(has('[data-stat-cell]')).toBe(false)
    expect(w.get('[data-finance-error]').text()).toContain('Не удалось загрузить список')
    expect(api.toast.error).not.toHaveBeenCalled()
    await w.get('[data-finance-retry]').trigger('click')
    await flushPromises()
    expect(has('[data-finance-error]')).toBe(false)
    expect(bodyRows()).toHaveLength(7)
    expect(has('[data-stat-cell]')).toBe(true)
  })

  it('ошибка обновления при загруженных данных: полоса над таблицей, таблица остаётся', async () => {
    await mountView()
    api.overview.mockRejectedValueOnce(new Error('500'))
    await w.get('[data-finance-refresh]').trigger('click')
    await flushPromises()
    expect(has('[data-finance-error]')).toBe(true)
    expect(bodyRows()).toHaveLength(7)
    expect(has('[data-finance-banner]')).toBe(true)
  })
})

describe('«Финансы»: смена периода', () => {
  it('новый период: прежние цифры сразу убираются (скелетон); ошибка — полный блок с «Повторить», не данные прошлого периода', async () => {
    await mountView()
    expect(w.get('[data-finance-count]').text()).toBe('7')
    let fail!: (e: unknown) => void
    api.overview.mockReturnValueOnce(new Promise((_, rej) => { fail = rej }))
    w.getComponent(PeriodChip).vm.$emit('update:value', ['2026-09-01', '2026-10-08'])
    await flushPromises()
    expect(has('[data-finance-banner]')).toBe(false)
    expect(has('[data-finance-count]')).toBe(false)
    expect(w.get('[data-finance-stats]').attributes('aria-busy')).toBe('true')
    expect(w.text()).not.toContain('4 312 400')
    fail(new Error('500'))
    await flushPromises()
    expect(has('[data-finance-retry]')).toBe(true)
    expect(has('[data-finance-table]')).toBe(false)
    expect(has('[data-stat-cell]')).toBe(false)
    await w.get('[data-finance-retry]').trigger('click')
    await flushPromises()
    expect(api.overview).toHaveBeenLastCalledWith('2026-09-01', '2026-10-08', { silent: true })
    expect(bodyRows()).toHaveLength(7)
  })
})

describe('«Финансы»: Excel', () => {
  it('выгружает отфильтрованные строки; имя файла finance, лист «Финансы»', async () => {
    await mountView()
    await w.findAll('[data-finance-filters] button')[1].trigger('click')
    await flushPromises()
    await w.get('[data-finance-export]').trigger('click')
    await flushPromises()
    expect(api.exportXlsx).toHaveBeenCalledTimes(1)
    const [base, sheet, out] = api.exportXlsx.mock.calls[0]
    expect(base).toBe('finance')
    expect(sheet).toBe('Финансы')
    expect(out.map((r: Record<string, unknown>) => r['Номер'])).toEqual(['ИМ-2026-0170', 'ИМ-2026-0173'])
    expect(Object.keys(out[0])).toHaveLength(13)
  })

  it('кнопка неактивна, если подходящих строк нет (и при пустом поиске по строкам)', async () => {
    await mountView()
    expect(w.get('[data-finance-export]').attributes('disabled')).toBeUndefined()
    await w.get('input[type="search"]').setValue('нет такого')
    expect(w.get('[data-finance-export]').attributes('disabled')).toBeDefined()
    await w.get('[data-finance-export]').trigger('click')
    expect(api.exportXlsx).not.toHaveBeenCalled()
  })

  it('ошибка выгрузки — тост', async () => {
    api.exportXlsx.mockRejectedValue(new Error('x'))
    await mountView()
    await w.get('[data-finance-export]').trigger('click')
    await flushPromises()
    expect(api.toast.error).toHaveBeenCalled()
  })
})
