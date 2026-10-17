import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { CustomsRepresentativeReport, RepDeclarationRow } from '@/api/reports'

const api = vi.hoisted(() => ({ report: vi.fn(), xlsx: vi.fn(), saveBlob: vi.fn() }))
vi.mock('@/api/reports', () => ({ reportsApi: { customsRepresentative: api.report, customsRepresentativeXlsx: api.xlsx } }))
vi.mock('@/ui/download', () => ({ saveBlob: api.saveBlob }))

import RepresentativeReportView from '../RepresentativeReportView.vue'
import { useAuthStore } from '@/stores/auth'

const row = (o: Partial<RepDeclarationRow>): RepDeclarationRow => ({
  declarationId: 'd1', caseId: 'c1', caseNumber: 'ИМ-2026-0001', number: '55302/100726/0000001', date: '2026-07-10', dateSource: 'submission',
  clientId: 'cl1', clientName: 'ТОО «Ромашка»', clientBin: '123456789012', dgdCode: '55300', dgdName: '55300 — ДГД ПО ГОРОДУ АЛМАТЫ',
  postCode: '55302', postName: '55302 — Т/П «Достык»', procedure: 'ИМ 40', status: 'released', splitRole: null, paymentsKzt: 1000, customsValueKzt: 5000,
  ...o,
})
const counters = (n: number, released: number, pay: number, value: number) => ({
  declarations: n, released, paymentsKzt: pay, customsValueKzt: value, procedures: [{ procedure: 'ИМ 40', count: n }],
})
const DATA = (): CustomsRepresentativeReport => ({
  from: '2026-07-01', to: '2026-09-30', organizationName: 'ТОО «AQNIET»', organizationBin: '990440001234', generatedAtUtc: '2026-10-17T05:00:00Z',
  totals: counters(3, 1, 3500, 9000),
  cancelledExcluded: 2,
  authorities: [
    {
      code: '55300', name: '55300 — ДГД ПО ГОРОДУ АЛМАТЫ', ...counters(2, 1, 3000, 8000),
      posts: [
        { code: '55302', name: '55302 — Т/П «Достык»', ...counters(2, 1, 3000, 8000) },
      ],
    },
    { code: null, name: 'Орган не указан', ...counters(1, 0, 500, 1000), posts: [{ code: null, name: 'Орган не указан', ...counters(1, 0, 500, 1000) }] },
  ],
  declarations: [
    row({}),
    row({ declarationId: 'd2', caseId: 'c2', number: '', status: 'submitted', splitRole: 'VTO', dateSource: 'number', paymentsKzt: 2000 }),
    row({ declarationId: 'd3', dgdCode: null, postCode: null, dgdName: 'Орган не указан', postName: 'Орган не указан', status: 'cancelled' }),
    row({ declarationId: 'd4', caseId: 'c4', postCode: '55302', number: '55302/200726/0000004', status: 'cancelled' }),
    row({ declarationId: 'd5', dgdCode: null, postCode: null, number: '', status: 'submitted', dateSource: 'caseSubmitted', date: '2026-07-20' }),
  ],
})

let w: VueWrapper
let router: Router
const mountView = async () => {
  w = mountWithI18n(RepresentativeReportView, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
}
const nb = (x: string) => x.replace(/[\u00a0\u202f]/g, ' ')

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 17, 12, 0, 0))
  setActivePinia(createPinia())
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  await router.push('/analytics/representative-report')
  api.report.mockResolvedValue(DATA())
  api.xlsx.mockResolvedValue(new Blob(['x']))
  const auth = useAuthStore()
  auth.role = 'manager'
  auth.permissions = ['analytics.read', 'import40.read']
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('«Отчёт представителя»', () => {
  it('по умолчанию — прошлый квартал без тоста; кнопка квартала нажата', async () => {
    await mountView()
    expect(api.report).toHaveBeenCalledWith('2026-07-01', '2026-09-30', { silent: true })
    expect(w.get('h1').text()).toBe('Отчёт таможенного представителя')
    const qs = w.findAll('[data-rep-quarter]')
    expect(qs.map((b) => b.text())).toEqual(['IV кв. 2026', 'III кв. 2026', 'II кв. 2026', 'I кв. 2026'])
    expect(qs.map((b) => b.attributes('aria-pressed'))).toEqual(['false', 'true', 'false', 'false'])
    expect(w.get('[data-rep-org]').text()).toBe('ТОО «AQNIET», БИН 990440001234 · 01.07.2026–30.09.2026')
  })

  it('быстрый квартал перезагружает отчёт за его период', async () => {
    await mountView()
    await w.findAll('[data-rep-quarter]')[0].trigger('click')
    await flushPromises()
    expect(api.report).toHaveBeenLastCalledWith('2026-10-01', '2026-12-31', { silent: true })
    expect(w.findAll('[data-rep-quarter]')[0].attributes('aria-pressed')).toBe('true')
  })

  it('свод: ДГД, пост, «Орган не указан», итог и показатели', async () => {
    await mountView()
    expect(w.findAll('[data-rep-authority-name]').map((x) => x.text())).toEqual(['55300 — ДГД ПО ГОРОДУ АЛМАТЫ', 'Орган не указан'])
    expect(w.findAll('[data-rep-authority-count]').map((x) => x.text())).toEqual(['2', '1'])
    expect(w.findAll('[data-rep-post]')).toHaveLength(2)
    const total = nb(w.get('[data-rep-total]').text())
    expect(total).toContain('Итого')
    expect(total).toContain('3 500')
    const cells = w.findAll('[data-stat-cell]')
    expect(cells[0].text()).toContain('3')
    expect(cells[0].text()).toContain('ИМ 40: 3')
    expect(cells[1].text()).toContain('1')
  })

  it('раскрытие поста: ДТ поста со ссылкой на заявку, статусом и пометкой ВТО', async () => {
    await mountView()
    expect(w.find('[data-rep-post-rows]').exists()).toBe(false)
    const toggle = w.findAll('[data-rep-post-toggle]')[0]
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    const dts = w.get('[data-rep-post-rows]').findAll('[data-rep-dt]')
    expect(dts).toHaveLength(2)
    expect(dts[0].get('[data-rep-dt-link]').attributes('href')).toBe('/import-40/c1')
    expect(dts[0].get('[data-rep-dt-status]').text()).toBe('Выпущена')
    expect(dts[1].text()).toContain('без номера')
    expect(dts[1].text()).toContain('ИМ 40 · ВТО')
    expect(dts[1].get('[data-rep-dt-status]').text()).toBe('Подана')
    await toggle.trigger('click')
    expect(w.find('[data-rep-post-rows]').exists()).toBe(false)
  })

  it('без import40.read номер ДТ — текстом, без ссылки; дата без номера — с подсказкой', async () => {
    useAuthStore().permissions = ['analytics.read']
    await mountView()
    await w.findAll('[data-rep-post-toggle]')[1].trigger('click')
    const dt = w.get('[data-rep-post-rows]').get('[data-rep-dt]')
    expect(dt.find('[data-rep-dt-link]').exists()).toBe(false)
    expect(dt.text()).toContain('20.07.2026')
    expect(dt.find('[title="Номера ДТ нет — дата перехода заявки в «ДТ подана»"]').exists()).toBe(true)
  })

  it('отменённые заявки: в посте их нет, сноска с числом раскрывается списком', async () => {
    await mountView()
    await w.findAll('[data-rep-post-toggle]')[0].trigger('click')
    expect(w.get('[data-rep-post-rows]').findAll('[data-rep-dt]')).toHaveLength(2) // d4 (отменена) не показан
    const toggle = w.get('[data-rep-cancelled-toggle]')
    expect(toggle.text()).toBe('ДТ отменённых заявок не учтены: 2')
    expect(w.find('[data-rep-cancelled-dt]').exists()).toBe(false)
    await toggle.trigger('click')
    const rows = w.findAll('[data-rep-cancelled-dt]')
    expect(rows).toHaveLength(2)
    expect(rows[1].text()).toContain('55302/200726/0000004')
    expect(rows[1].text()).toContain('Заявка отменена')
  })

  it('ошибка загрузки нового периода — данные прежнего периода не остаются', async () => {
    await mountView()
    expect(w.findAll('[data-rep-authority]').length).toBeGreaterThan(0)
    api.report.mockRejectedValueOnce(new Error('400'))
    await w.findAll('[data-rep-quarter]')[0].trigger('click')
    await flushPromises()
    expect(w.find('[data-rep-error]').exists()).toBe(true)
    expect(w.find('[data-rep-authority]').exists()).toBe(false)
    expect(w.find('[data-rep-summary]').exists()).toBe(false)
  })

  it('«Скачать Excel» — за выбранный период, имя файла с периодом', async () => {
    await mountView()
    await w.get('[data-rep-xlsx]').trigger('click')
    await flushPromises()
    expect(api.xlsx).toHaveBeenCalledWith('2026-07-01', '2026-09-30')
    expect(api.saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'Отчёт представителя 01.07.2026–30.09.2026.xlsx')
  })

  it('пустой период и не заполненные реквизиты', async () => {
    api.report.mockResolvedValue({ ...DATA(), organizationName: '', organizationBin: '', totals: { ...counters(0, 0, 0, 0), procedures: [] }, authorities: [], declarations: [], cancelledExcluded: 0 })
    await mountView()
    expect(w.get('[data-rep-empty]').text()).toContain('За период поданных ДТ нет')
    expect(w.get('[data-rep-org]').text()).toContain('Реквизиты организации не заполнены')
    expect(w.get('[data-rep-org] a').attributes('href')).toBe('/settings/organization')
  })

  it('ошибка загрузки — «Повторить» грузит снова', async () => {
    api.report.mockRejectedValueOnce(new Error('x'))
    await mountView()
    expect(w.find('[data-rep-error]').exists()).toBe(true)
    await w.get('[data-rep-retry]').trigger('click')
    await flushPromises()
    expect(api.report).toHaveBeenCalledTimes(2)
    expect(w.find('[data-rep-error]').exists()).toBe(false)
  })
})
