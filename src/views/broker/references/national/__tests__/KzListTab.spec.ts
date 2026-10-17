import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { KzList, KzListRow } from '@/api/nationalLists'

const api = vi.hoisted(() => ({ lists: vi.fn() }))
vi.mock('@/api/nationalLists', async (orig) => ({ ...(await orig<typeof import('@/api/nationalLists')>()), nationalListsApi: api }))
vi.mock('@/utils/customsRequests', () => ({ almatyToday: () => '2026-10-17' }))

import KzListTab from '../KzListTab.vue'
import { clearKzListsCache } from '../kzListsCache'

const row = (p: Partial<KzListRow>): KzListRow => ({
  number: 1, codeText: '2402 20 900 0', name: 'прочие сигареты', partial: false, startDate: '2020-10-01', condition: 'С 1 октября 2020 года…',
  section: null, check: null, ...p,
})
const lists = (): KzList[] => [
  {
    key: 'marking', actName: 'Приказ Министра торговли и интеграции РК', actNumber: '199-НҚ', actDate: '2026-05-26',
    actTitle: 'Об определении перечня товаров, подлежащих маркировке', actUrl: 'https://adilet.zan.kz/rus/docs/G26TI000199',
    editionDate: '2026-09-04', effectiveFrom: '2026-08-03', amendments: [{ name: 'Приказ', number: '253-ОД', date: '2026-09-04', url: null }],
    sourceUrl: 'https://cdb.kz/x', note: 'n',
    rows: [
      row({}),
      row({ number: 31, codeText: 'из 3304, 3305, 3306, 3307', name: 'косметика', partial: true, startDate: '2027-03-01', condition: null }),
      row({ number: 183, codeText: '1512 21 900 0', name: 'масло', startDate: '2027-04-01', check: 'код — хлопковое масло' }),
      row({ number: 126, codeText: '2202 99 180 0', name: 'напитки', startDate: '2026-09-01', excluded: 'Считается исключённой Приказом № 253-ОД' }),
      ...Array.from({ length: 60 }, (_, i) => row({ number: 300 + i, codeText: `9999 ${String(i).padStart(2, '0')}`, name: `строка ${i}` })),
    ],
  },
  {
    key: 'muc', actName: 'Приказ и.о. Министра финансов РК', actNumber: '658', actDate: '2025-10-31', actTitle: 'МУЦ',
    actUrl: 'https://adilet.zan.kz/rus/docs/V2500037326', editionDate: '2026-06-18', effectiveFrom: '2026-07-06', amendments: [],
    sourceUrl: 'https://www.alta.ru/tamdoc/26kz0414/', note: 'n',
    rows: [row({ number: 1, codeText: '0401 20 110 9', name: 'молоко', startDate: null, condition: null, section: 'Раздел 2. Товары, не производимые на территории Республики Казахстан' })],
  },
]

let w: VueWrapper
afterEach(() => {
  w?.unmount()
  vi.clearAllMocks()
  clearKzListsCache()
})

describe('KzListTab', () => {
  it('маркировка: акт, редакция, «обязательна с» / «с», «часть кода», «сверить», поиск и «Показать ещё»', async () => {
    api.lists.mockResolvedValue(lists())
    w = mountWithI18n(KzListTab, { props: { listKey: 'marking' } })
    await flushPromises()
    expect(w.get('[data-kz-act]').text()).toContain('Приказ Министра торговли и интеграции РК № 199-НҚ от 26.05.2026')
    expect(w.get('[data-kz-act]').text()).toContain('Редакция 04.09.2026, действует с 03.08.2026 · позиций: 64')
    expect(w.get('[data-kz-row="1"] [data-kz-start]').text()).toBe('обязательна с 01.10.2020')
    expect(w.get('[data-kz-row="31"] [data-kz-start]').text()).toBe('с 01.03.2027')
    expect(w.find('[data-kz-row="31"] [data-kz-partial]').exists()).toBe(true)
    expect(w.get('[data-kz-row="183"] [data-kz-check]').text()).toContain('код — хлопковое масло')
    expect(w.get('[data-kz-row="126"] [data-kz-excluded]').text()).toBe('исключена')
    expect(w.find('[data-kz-row="126"] [data-kz-start]').exists()).toBe(false)
    expect(w.get('[data-kz-row="126"] [data-kz-excluded-note]').text()).toContain('253-ОД')
    expect(w.findAll('[data-kz-row]')).toHaveLength(50)
    await w.get('[data-kz-more]').trigger('click')
    expect(w.findAll('[data-kz-row]')).toHaveLength(64)

    await w.get('[data-kz-search] input, input[data-kz-search]').setValue('3305')
    expect(w.findAll('[data-kz-row]').map((x) => x.attributes('data-kz-row'))).toEqual(['31'])
    await w.get('[data-kz-search] input, input[data-kz-search]').setValue('нет такого')
    expect(w.find('[data-kz-empty]').exists()).toBe(true)
  })

  it('МУЦ: раздел и оговорка «база НДС при ввозе из ЕАЭС (форма 328), не ДТ»; одна загрузка на обе вкладки', async () => {
    api.lists.mockResolvedValue(lists())
    w = mountWithI18n(KzListTab, { props: { listKey: 'muc' } })
    await flushPromises()
    expect(w.get('[data-kz-note]').text()).toContain('форма 328')
    expect(w.get('[data-kz-row="1"] [data-kz-section]').text()).toBe('не производится в РК')
    expect(w.find('[data-kz-start]').exists()).toBe(false)
    w.unmount()
    w = mountWithI18n(KzListTab, { props: { listKey: 'marking' } })
    await flushPromises()
    expect(api.lists).toHaveBeenCalledTimes(1)
  })

  it('сбой — «Повторить»', async () => {
    api.lists.mockRejectedValueOnce(new Error('x')).mockResolvedValue(lists())
    w = mountWithI18n(KzListTab, { props: { listKey: 'muc' } })
    await flushPromises()
    await w.get('[data-kz-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-kz-row="1"]').exists()).toBe(true)
  })
})
