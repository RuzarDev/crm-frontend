import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import ZAskBanner from '../ZAskBanner.vue'
import ZProgress from '../ZProgress.vue'
import ZBreadcrumbs from '../ZBreadcrumbs.vue'

let w: VueWrapper
afterEach(() => w?.unmount())

// Настоящий роутер в тесте не нужен — RouterLink подменяем <a>, сохраняя to.
const RouterLinkStub = defineComponent({
  props: { to: { type: [String, Object], required: true } },
  setup(props, { slots, attrs }) {
    return () => h('a', { ...attrs, 'data-to': String(props.to), href: String(props.to) }, slots.default?.())
  },
})
const global = { stubs: { RouterLink: RouterLinkStub } }

describe('ZAskBanner', () => {
  it('role=region с именем-заголовком (не status: постоянный баннер с кнопкой), описание, кнопка; action эмитится', async () => {
    w = mountWithI18n(ZAskBanner, { props: { title: 'Нужны документы', description: 'Загрузите инвойс', actionText: 'Загрузить' }, attachTo: document.body })
    expect(w.attributes('role')).toBe('region')
    expect(document.getElementById(w.attributes('aria-labelledby')!)?.textContent).toBe('Нужны документы')
    expect(w.find('[role="status"]').exists()).toBe(false)
    expect(w.text()).toContain('Нужны документы')
    expect(w.text()).toContain('Загрузите инвойс')
    const btn = w.find('button')
    expect(btn.text()).toBe('Загрузить')
    await btn.trigger('click')
    expect(w.emitted('action')).toHaveLength(1)
  })
  it('кнопка читается на золотом: bg-surface вместо bg-sunken', () => {
    w = mountWithI18n(ZAskBanner, { props: { title: 'T', actionText: 'Go' } })
    const cls = w.find('button').classes()
    expect(cls).toContain('bg-surface')
    expect(cls).not.toContain('bg-sunken')
  })
  it('hover кнопки виден на золотом: gold-line', () => {
    w = mountWithI18n(ZAskBanner, { props: { title: 'T', actionText: 'Go' } })
    expect(w.find('button').classes()).toContain('enabled:hover:bg-gold-line')
  })
  it('без actionText кнопки нет; слот action', () => {
    w = mountWithI18n(ZAskBanner, { props: { title: 'T' } })
    expect(w.find('button').exists()).toBe(false)
    w.unmount()
    w = mountWithI18n(ZAskBanner, { props: { title: 'T' }, slots: { action: '<b class="a">ok</b>' } })
    expect(w.find('.a').exists()).toBe(true)
  })
})

describe('ZProgress', () => {
  it('progressbar с aria-valuenow/min/max и именем', () => {
    w = mountWithI18n(ZProgress, { props: { percent: 42, ariaLabel: 'Загрузка файла', showInfo: true } })
    const bar = w.find('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('42')
    expect(bar.attributes('aria-valuemin')).toBe('0')
    expect(bar.attributes('aria-valuemax')).toBe('100')
    expect(bar.attributes('aria-label')).toBe('Загрузка файла')
    expect(w.text()).toContain('42%')
  })
  it('без ariaLabel и слота имя по умолчанию — z.progress', () => {
    w = mountWithI18n(ZProgress, { props: { percent: 10 } })
    expect(w.find('[role="progressbar"]').attributes('aria-label')).toBe('Выполнено')
    expect(w.find('[role="progressbar"]').attributes('aria-labelledby')).toBeUndefined()
  })
  it('имя из слота label через aria-labelledby', () => {
    w = mountWithI18n(ZProgress, { props: { percent: 10 }, slots: { label: 'Документы' } })
    const bar = w.find('[role="progressbar"]')
    const id = bar.attributes('aria-labelledby')!
    expect(id).toBeTruthy()
    expect(w.find(`[id="${id}"]`).text()).toBe('Документы')
  })
  it('значение ограничено 0..100, мусор — 0', () => {
    w = mountWithI18n(ZProgress, { props: { percent: 150 } })
    expect(w.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('100')
    w.unmount()
    w = mountWithI18n(ZProgress, { props: { percent: -5 } })
    expect(w.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('0')
    w.unmount()
    w = mountWithI18n(ZProgress, { props: { percent: Number.NaN } })
    expect(w.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('0')
  })
  it('статусы окрашивают заполнение; ширина = процент', () => {
    w = mountWithI18n(ZProgress, { props: { percent: 30 } })
    expect(w.find('[data-z-progress-fill]').classes()).toContain('bg-zircon')
    expect((w.find('[data-z-progress-fill]').element as HTMLElement).style.width).toBe('30%')
    w.unmount()
    w = mountWithI18n(ZProgress, { props: { percent: 100, status: 'success' } })
    expect(w.find('[data-z-progress-fill]').classes()).toContain('bg-tone-done-fg')
    w.unmount()
    w = mountWithI18n(ZProgress, { props: { percent: 50, status: 'exception' } })
    expect(w.find('[data-z-progress-fill]').classes()).toContain('bg-danger')
  })
  it('showInfo выключен по умолчанию', () => {
    w = mountWithI18n(ZProgress, { props: { percent: 42 } })
    expect(w.text()).toBe('')
  })
})

describe('ZBreadcrumbs', () => {
  const items = [{ label: 'Заявки', to: '/orders' }, { label: 'Реестр', to: '/reestr' }, { label: 'И40-182' }]
  it('nav с aria-label и ol, последний — aria-current=page без ссылки', () => {
    w = mountWithI18n(ZBreadcrumbs, { props: { items }, global })
    const nav = w.find('nav')
    expect(nav.attributes('aria-label')).toBe('Навигация')
    expect(nav.find('ol').exists()).toBe(true)
    const lis = w.findAll('li')
    expect(lis).toHaveLength(3)
    const last = lis[2]
    expect(last.find('a').exists()).toBe(false)
    expect(last.find('[aria-current="page"]').text()).toBe('И40-182')
    expect(w.findAll('[aria-current="page"]')).toHaveLength(1)
  })
  it('предыдущие со to — ссылки; разделитель aria-hidden и не после последнего', () => {
    w = mountWithI18n(ZBreadcrumbs, { props: { items }, global })
    const links = w.findAll('a')
    expect(links.map((a) => a.attributes('data-to'))).toEqual(['/orders', '/reestr'])
    const seps = w.findAll('[aria-hidden="true"]')
    expect(seps).toHaveLength(2)
    expect(seps[0].text()).toBe('/')
  })
  it('пункт без to не ссылка', () => {
    w = mountWithI18n(ZBreadcrumbs, { props: { items: [{ label: 'A' }, { label: 'B' }] }, global })
    expect(w.find('a').exists()).toBe(false)
  })
})
