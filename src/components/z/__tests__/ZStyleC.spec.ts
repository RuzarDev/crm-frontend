import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import ZListRow from '../ZListRow.vue'
import ZStepper from '../ZStepper.vue'
import ZAskBanner from '../ZAskBanner.vue'
import ZProgress from '../ZProgress.vue'
import ZBreadcrumbs from '../ZBreadcrumbs.vue'
import { createI18n } from 'vue-i18n'
import { mount } from '@vue/test-utils'
import kk from '@/i18n/locales/kk'
import en from '@/i18n/locales/en'
import ru from '@/i18n/locales/ru'

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

describe('ZListRow', () => {
  it('без to/href/click — div; заголовок и подзаголовок', () => {
    w = mountWithI18n(ZListRow, { props: { title: 'И40-182', subtitle: 'ТОО «Казахмыс»' }, global })
    expect(w.element.tagName).toBe('DIV')
    expect(w.text()).toContain('И40-182')
    expect(w.find('.font-semibold').text()).toBe('И40-182')
    expect(w.find('.text-ink-3').text()).toBe('ТОО «Казахмыс»')
  })
  it('to — RouterLink (a)', () => {
    w = mountWithI18n(ZListRow, { props: { title: 'X', to: '/orders/1' }, global })
    expect(w.element.tagName).toBe('A')
    expect(w.attributes('data-to')).toBe('/orders/1')
    expect(w.classes()).toContain('hover:bg-canvas')
  })
  it('пустой to считается отсутствующим; базовые классы шрифта на любом элементе', () => {
    w = mountWithI18n(ZListRow, { props: { title: 'X', to: '' }, global })
    expect(w.element.tagName).toBe('DIV')
    expect(w.classes()).toEqual(expect.arrayContaining(['font-sans', 'text-base']))
    w.unmount()
    w = mountWithI18n(ZListRow, { props: { title: 'X', href: '/a' }, global })
    expect(w.classes()).toEqual(expect.arrayContaining(['font-sans', 'text-base']))
  })
  it('href — a', () => {
    w = mountWithI18n(ZListRow, { props: { title: 'X', href: 'https://example.kz' }, global })
    expect(w.element.tagName).toBe('A')
    expect(w.attributes('href')).toBe('https://example.kz')
  })
  it('слушатель click — button type=button со сбросом нативного вида, click доходит', async () => {
    const onClick = vi.fn()
    w = mountWithI18n(ZListRow, { props: { title: 'X' }, attrs: { onClick }, global })
    expect(w.element.tagName).toBe('BUTTON')
    expect(w.attributes('type')).toBe('button')
    for (const c of ['border-0', 'bg-transparent', 'w-full', 'text-left']) expect(w.classes()).toContain(c)
    await w.trigger('click')
    expect(onClick).toHaveBeenCalledTimes(1)
  })
  it('слоты leading/meta/trailing; avatar-name рисует аватар, leading его заменяет', () => {
    w = mountWithI18n(ZListRow, {
      props: { title: 'X', avatarName: 'Иван Петров' },
      slots: { meta: '<span class="m">тег</span>', trailing: '<span class="t">8 920 000</span>' },
      global,
    })
    expect(w.find('[title="Иван Петров"]').exists()).toBe(true)
    expect(w.find('.m').exists()).toBe(true)
    expect(w.find('.t').element.parentElement?.classList.contains('tabular-nums')).toBe(true)
    w.unmount()
    w = mountWithI18n(ZListRow, {
      props: { title: 'X', avatarName: 'Иван Петров' },
      slots: { leading: '<i class="lead" />' },
      global,
    })
    expect(w.find('.lead').exists()).toBe(true)
    expect(w.find('[title="Иван Петров"]').exists()).toBe(false)
  })
})

const steps = [
  { key: 'draft', label: 'Черновик' },
  { key: 'border', label: 'На границе' },
  { key: 'decl', label: 'Декларирование', hint: 'ДТ' },
  { key: 'sent', label: 'Подана' },
  { key: 'rel', label: 'Выпущена' },
  { key: 'svh', label: 'Закрытие СВХ' },
  { key: 'pay', label: 'Счёт и оплата' },
]

describe('ZStepper', () => {
  it('ol/li, aria-current=step только у текущего', () => {
    w = mountWithI18n(ZStepper, { props: { steps, current: 'decl' } })
    expect(w.find('ol').exists()).toBe(true)
    const items = w.findAll('li')
    expect(items).toHaveLength(7)
    expect(items.map((li) => li.attributes('aria-current'))).toEqual([undefined, undefined, 'step', undefined, undefined, undefined, undefined])
  })
  it('сегменты: пройденные zircon, текущий zircon-ink, будущие line; без градиентов', () => {
    w = mountWithI18n(ZStepper, { props: { steps, current: 'decl' } })
    const bars = w.findAll('[data-z-step-bar]')
    expect(bars[0].classes()).toContain('bg-zircon')
    expect(bars[1].classes()).toContain('bg-zircon')
    expect(bars[2].classes()).toContain('bg-zircon-ink')
    expect(bars[3].classes()).toContain('bg-line')
    expect(bars[6].classes()).toContain('bg-line')
    expect(w.html()).not.toContain('gradient')
    expect(w.findAll('li')[2].find('[data-z-step-label]').classes()).toEqual(expect.arrayContaining(['text-zircon-ink', 'font-semibold']))
  })
  it('status=error — текущий сегмент danger', () => {
    w = mountWithI18n(ZStepper, { props: { steps, current: 'decl', status: 'error' } })
    const bars = w.findAll('[data-z-step-bar]')
    expect(bars[2].classes()).toContain('bg-danger')
    expect(bars[2].classes()).not.toContain('bg-zircon-ink')
    expect(bars[1].classes()).toContain('bg-zircon')
  })
  it('мобильная подпись «Шаг 3 из 7»; у неактивных подписи скрыты на телефоне', () => {
    w = mountWithI18n(ZStepper, { props: { steps, current: 'decl' } })
    expect(w.text()).toContain('Шаг 3 из 7')
    const labels = w.findAll('li').map((li) => li.find('[data-z-step-label]').classes())
    expect(labels[0]).toContain('max-sm:hidden')
    expect(labels[2]).not.toContain('max-sm:hidden')
  })
  it('не только цветом: у пройденного галочка и «пройден», у ошибки значок и «ошибка»', () => {
    w = mountWithI18n(ZStepper, { props: { steps, current: 'decl' } })
    const lis = w.findAll('li')
    expect(lis[0].find('svg').exists()).toBe(true)
    expect(lis[0].find('.sr-only').text()).toContain('пройден')
    expect(lis[2].find('svg').exists()).toBe(false)
    expect(lis[3].find('svg').exists()).toBe(false)
    w.unmount()
    w = mountWithI18n(ZStepper, { props: { steps, current: 'decl', status: 'error' } })
    expect(w.findAll('li')[2].find('svg').exists()).toBe(true)
    expect(w.findAll('li')[2].find('.sr-only').text()).toContain('ошибка')
  })
  it('подсказка шага — text-muted text-xs; подпись можно обрезать', () => {
    w = mountWithI18n(ZStepper, { props: { steps, current: 'decl' } })
    const hint = w.findAll('li')[2].findAll('span').find((s) => s.text() === 'ДТ')!
    expect(hint.classes()).toEqual(expect.arrayContaining(['text-muted', 'text-xs']))
    expect(w.findAll('[data-z-step-label]')[2].classes()).toContain('min-w-0')
  })
  it('казахский счётчик без падежных окончаний: «Қадам 3/7»; en — Step 3 of 7', () => {
    const mk = (locale: string) => mount(ZStepper, {
      props: { steps, current: 'decl' },
      global: { plugins: [createI18n({ legacy: false, locale, messages: { ru, kk, en } })] },
    })
    w = mk('kk')
    expect(w.find('p').text()).toBe('Қадам 3/7')
    w.unmount()
    w = mk('en')
    expect(w.find('p').text()).toBe('Step 3 of 7')
  })
  it('неизвестный current — нет текущего и нет счётчика', () => {
    w = mountWithI18n(ZStepper, { props: { steps, current: 'nope' } })
    expect(w.find('[aria-current="step"]').exists()).toBe(false)
    expect(w.text()).not.toContain('Шаг')
  })
})

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
