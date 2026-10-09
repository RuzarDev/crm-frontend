import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import DtSectionNav from '../DtSectionNav.vue'
import DtReadinessPanel from '../DtReadinessPanel.vue'
import DtBanners from '../DtBanners.vue'
import DtHeaderBar from '../DtHeaderBar.vue'
import { visibleSections } from '../dtPageModel'
import type { DtReadinessItem } from '../useDtReadiness'

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
let w: VueWrapper
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
})

describe('DtSectionNav', () => {
  const mountNav = (props: Record<string, unknown> = {}) => mountWithI18n(DtSectionNav, {
    props: { sections: visibleSections(true), active: 'parties', marks: {}, ...props },
    global: { plugins: [router] },
  })

  it('разделы по порядку доски с графами; активный — aria-current', () => {
    w = mountNav()
    const items = w.findAll('[data-dt-nav-item]')
    expect(items.map((i) => i.attributes('data-dt-nav-item'))).toEqual(visibleSections(true))
    expect(items[0].text()).toContain('Номер и дата')
    expect(items[0].text()).toContain('гр. А')
    expect(items[2].text()).toContain('гр. 2, 8, 9, 14')
    expect(w.get('[data-dt-nav-item="dts"]').text()).toContain('гр. ДТС')
    expect(w.get('[aria-current="true"]').attributes('data-dt-nav-item')).toBe('parties')
  })

  it('отметки: число, галочка, кружок, точка «платежи устарели» — и словом для чтения с экрана', () => {
    w = mountNav({
      marks: { parties: { kind: 'count', count: 2 }, countries: { kind: 'done' } },
      stale: ['goods'],
    })
    const item = (k: string) => w.get(`[data-dt-nav-item="${k}"]`)
    expect(item('parties').get('[data-dt-nav-count]').text()).toBe('2')
    expect(item('parties').text()).toContain('не хватает: 2')
    expect(item('countries').attributes('data-mark')).toBe('done')
    expect(item('countries').text()).toContain('готово')
    expect(item('general').attributes('data-mark')).toBe('unknown')
    expect(item('goods').find('[data-dt-nav-stale]').exists()).toBe(true)
    expect(item('goods').text()).toContain('платежи устарели')
  })

  it('клик — select с ключом раздела', async () => {
    w = mountNav()
    await w.get('[data-dt-nav-item="goods"]').trigger('click')
    expect(w.emitted('select')).toEqual([['goods']])
  })
})

describe('DtReadinessPanel', () => {
  const item = (o: Partial<DtReadinessItem>): DtReadinessItem =>
    ({ text: 'Получатель: дом длиннее 20 знаков', graph: '8', goodsIndex: null, section: 'parties', fromXml: false, ...o })
  const mountPanel = (props: Record<string, unknown> = {}) => mountWithI18n(DtReadinessPanel, {
    props: {
      enabled: true, loaded: true, items: [item({})],
      blank: { filled: 40, total: 46, pct: 87, complete: false, emptyGraphs: ['7', '48'] },
      rates: [{ code: 'USD', rate: 495.12 }], ratesDate: '2026-10-09', nbUnavailable: false,
      ...props,
    },
  })

  it('бланк, число пунктов, пункт с графой; клик — go', async () => {
    w = mountPanel()
    expect(w.get('[data-dt-panel-blank]').text()).toBe('40 из 46 граф')
    expect(w.get('[data-dt-panel-count]').text()).toBe('Пунктов: 1')
    const btn = w.get('[data-dt-panel-item]')
    expect(btn.text()).toContain('8')
    expect(btn.attributes('aria-label')).toBe('Перейти к графе 8: Получатель: дом длиннее 20 знаков')
    await btn.trigger('click')
    expect(w.emitted('go')?.[0]?.[0]).toMatchObject({ graph: '8', section: 'parties' })
  })

  it('курсы НБ РК на дату гр. А по языку интерфейса; «НБ РК недоступен»', () => {
    w = mountPanel({ nbUnavailable: true })
    expect(w.get('[data-dt-panel-rates]').text()).toContain('на 09.10.2026')
    expect(w.get('[data-dt-rate]').text().replace(/\s/g, ' ')).toContain('495,12 ₸')
    expect(w.find('[data-dt-panel-nb]').exists()).toBe(true)
  })

  it('пунктов нет — «Готово к выгрузке»; без права — только курсы', () => {
    w = mountPanel({ items: [] })
    expect(w.find('[data-dt-panel-ready]').exists()).toBe(true)
    w.unmount()
    w = mountPanel({ enabled: false, loaded: false, items: [] })
    expect(w.find('[data-dt-panel-readiness]').exists()).toBe(false)
    expect(w.find('[data-dt-panel-rates]').exists()).toBe(true)
  })

  it('ошибки выгрузки XML — своя подсказка', () => {
    w = mountPanel({ items: [item({ fromXml: true })] })
    expect(w.text()).toContain('ошибки последней выгрузки XML')
  })
})

describe('DtBanners', () => {
  const mountBanners = (props: Record<string, unknown> = {}) => mountWithI18n(DtBanners, {
    props: { caseId: 'c1', readonlyReason: null, assignedName: null, stage: 'ДТ подана', split: null, conflict: false, saveError: null, saving: false, ...props },
    global: { plugins: [router] },
  })

  it('без режимов — ничего', () => {
    w = mountBanners()
    expect(w.find('[data-dt-banners]').exists()).toBe(false)
  })

  it('«Только просмотр»: закреплена за ФИО и этап', () => {
    w = mountBanners({ readonlyReason: 'assigned', assignedName: 'Сейткали Д.' })
    const b = w.get('[data-dt-banner-view]').text()
    expect(b).toContain('Только просмотр.')
    expect(b).toContain('Сейткали Д.')
    expect(b).toContain('«ДТ подана»')
    expect(b).toContain('Печать и документы доступны')
  })

  it('разделена: ссылки на ЕТТ и ВТО', () => {
    w = mountBanners({ split: { ett: { id: 'e1', declarationNumber: '55302/091026/0001235' }, vto: { id: 'v1', declarationNumber: '' } } })
    const b = w.get('[data-dt-banner-split]')
    expect(b.text()).toContain('ДТ разделена — правки закрыты.')
    expect(b.get('[data-dt-split-ett]').attributes('href')).toBe('/import-40/c1/dt/e1')
    expect(b.get('[data-dt-split-ett]').text()).toBe('55302/091026/0001235')
    expect(b.get('[data-dt-split-vto]').text()).toBe('без номера')
  })

  it('409 — «Перезагрузить»; ошибка сохранения — «Повторить»', async () => {
    w = mountBanners({ conflict: true, saveError: 'x' })
    expect(w.find('[data-dt-save-error]').exists()).toBe(false)
    await w.get('[data-dt-conflict-reload]').trigger('click')
    expect(w.emitted('reload')).toHaveLength(1)
    w.unmount()
    w = mountBanners({ saveError: 'Нет связи' })
    expect(w.get('[data-dt-save-error]').text()).toContain('Причина: Нет связи')
    await w.get('[data-dt-save-retry]').trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
  })
})

describe('DtHeaderBar', () => {
  const mountHeader = (props: Record<string, unknown> = {}) => mountWithI18n(DtHeaderBar, {
    props: {
      caseId: 'c1', caseNumber: 'ИМ-2026-0012', clientName: 'ТОО «Казахмыс Трейд»', number: '55302/091026/0001234',
      tag: { kind: 'ett' }, editable: true, canXml: true, saving: false, dirty: false, failed: false,
      savedAt: new Date(2026, 9, 9, 15, 32), split: { show: true, reason: '' }, panelToggle: { show: true, count: 4 },
      ...props,
    },
    global: { plugins: [router] },
  })

  it('крошки, номер, тег, «Сохранено в ЧЧ:ММ»', () => {
    w = mountHeader()
    expect(w.text()).toContain('Заявки')
    expect(w.text()).toContain('ИМ-2026-0012 · ТОО «Казахмыс Трейд»')
    expect(w.get('[data-dt-number]').text()).toBe('55302/091026/0001234')
    expect(w.get('[data-dt-tag]').text()).toBe('ЕТТ')
    expect(w.get('[data-dt-save-state]').text()).toBe('Сохранено в 15:32')
  })

  it('шапка липкая только с 768px (на телефоне не занимает треть экрана)', () => {
    w = mountHeader()
    const cls = w.get('[data-dt-header]').classes()
    expect(cls).toEqual(expect.arrayContaining(['md:sticky', 'md:top-0']))
    expect(cls).not.toContain('sticky')
    // корень — сам <header> (DtPage меряет высоту по $el; фрагмент с комментарием ломал ResizeObserver)
    expect((w.vm.$el as Node).nodeName).toBe('HEADER')
  })

  it('состояние сохранения: сохраняется / не сохранено / есть несохранённые / просмотр', () => {
    w = mountHeader({ saving: true })
    expect(w.get('[data-dt-save-state]').text()).toBe('Сохраняется…')
    w.unmount()
    w = mountHeader({ failed: true, dirty: true })
    expect(w.get('[data-dt-save-state]').text()).toBe('Не сохранено')
    w.unmount()
    w = mountHeader({ dirty: true })
    expect(w.get('[data-dt-save-state]').text()).toBe('Есть несохранённые изменения')
    w.unmount()
    w = mountHeader({ editable: false })
    expect(w.get('[data-dt-save-state]').text()).toBe('Только просмотр')
  })

  it('правка: «Сохранить» с ⌘S, платежи, XML, «Ещё»; просмотр — печать и документы', async () => {
    w = mountHeader()
    expect(w.get('[data-dt-save]').attributes('aria-keyshortcuts')).toMatch(/S$/)
    expect(w.find('[data-dt-calc-payments]').exists()).toBe(true)
    expect(w.find('[data-dt-more]').exists()).toBe(true)
    await w.get('[data-dt-xml]').trigger('click')
    expect(w.emitted('xml')).toHaveLength(1)
    w.unmount()
    w = mountHeader({ editable: false, canXml: false, split: { show: false, reason: 'x' } })
    // Клиенту «Ещё» нечего показать.
    expect(w.find('[data-dt-more]').exists()).toBe(false)
    w.unmount()
    w = mountHeader({ editable: false, canXml: false, split: { show: true, reason: 'Декларация закреплена за другим декларантом' } })
    // Просмотр не клиентом: «Ещё» есть — в нём «Разделить» с причиной.
    expect(w.find('[data-dt-more]').exists()).toBe(true)
    expect(w.find('[data-dt-save]').exists()).toBe(false)
    expect(w.find('[data-dt-calc-payments]').exists()).toBe(false)
    expect(w.find('[data-dt-xml]').exists()).toBe(false)
    await w.get('[data-dt-print]').trigger('click')
    await w.get('[data-dt-docs]').trigger('click')
    expect(w.emitted('print')).toHaveLength(1)
    expect(w.emitted('docs')).toHaveLength(1)
  })

  it('кнопка «До подачи» с числом пунктов (для экрана уже 1280)', async () => {
    w = mountHeader()
    const btn = w.get('[data-dt-panel-toggle]')
    expect(btn.classes()).toContain('xl:hidden')
    expect(btn.text()).toContain('До подачи: 4')
    await btn.trigger('click')
    expect(w.emitted('openPanel')).toHaveLength(1)
    w.unmount()
    w = mountHeader({ panelToggle: { show: true, count: null, ratesOnly: true } })
    expect(w.get('[data-dt-panel-toggle]').text()).toBe('Курсы НБ РК')
  })
})
