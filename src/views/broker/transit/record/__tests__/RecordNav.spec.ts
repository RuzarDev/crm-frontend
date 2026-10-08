import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import RecordNav from '../RecordNav.vue'
import { SECTION_ORDER, draftFromEntry, type RecordDraft } from '../recordModel'
import { fullEntry, good } from './recordFixture'

let w: VueWrapper
const draft = (): RecordDraft => reactive(draftFromEntry(fullEntry({
  // «Организации» — без БИН (золотая точка), пломб и гарантий нет (серые).
  organizations: [{ role: 'Декларант', subjectType: 'ЮЛ', bin: null, name: 'ТОО Брокер', shortName: null, address: null, phone: null, email: null }],
  identificationMeans: [],
  guarantees: [],
  goods: [good({ tnvedCode: '8471300000', description: 'Ноутбуки' }), good({ tnvedCode: '8473302008', description: 'Блоки' }), good({ tnvedCode: '4202121900', description: 'Сумки' })],
})))
const item = (key: string) => w.get(`[data-nav-item="${key}"]`)

let scrollTo: ReturnType<typeof vi.fn>
beforeEach(() => {
  scrollTo = vi.fn()
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => { cb(0); return 1 }) as typeof window.requestAnimationFrame
})
/** Разделы на странице с заданным верхом (px от верха окна). */
const sections = (tops: Partial<Record<string, number>>) => {
  for (const [key, top] of Object.entries(tops)) {
    const el = document.createElement('section')
    el.id = `sec-${key}`
    document.body.appendChild(el)
    el.getBoundingClientRect = () => ({ top: top!, bottom: top! + 300, left: 0, right: 0, width: 0, height: 300, x: 0, y: top!, toJSON: () => ({}) })
  }
}
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
})

describe('RecordNav', () => {
  it('пункты в порядке меню; точки — по состоянию раздела, счётчики — по числу строк', () => {
    const d = draft()
    w = mountWithI18n(RecordNav, { props: { draft: d }, attachTo: document.body })
    expect(w.get('nav').attributes('aria-label')).toBe('Разделы записи')
    expect(w.findAll('[data-nav-item]').map((a) => a.attributes('data-nav-item'))).toEqual(SECTION_ORDER)
    expect(item('main').text()).toContain('Основное')
    expect(item('goods').attributes('data-state')).toBe('done')
    expect(item('organizations').attributes('data-state')).toBe('warn')
    expect(item('seals').attributes('data-state')).toBe('empty')
    expect(item('guarantees').attributes('data-state')).toBe('empty')
    // Состояние точки читается и без цвета.
    expect(item('organizations').text()).toContain('требует внимания')
    expect(item('goods').get('[data-nav-count]').text()).toBe('3')
    expect(item('doc44').get('[data-nav-count]').text()).toBe('1')
    // Без списка («Основное») и пустой список (пломбы) — без числа.
    expect(item('main').find('[data-nav-count]').exists()).toBe(false)
    expect(item('seals').find('[data-nav-count]').exists()).toBe(false)
  })

  it('точки и счётчики следуют за черновиком', async () => {
    const d = draft()
    w = mountWithI18n(RecordNav, { props: { draft: d }, attachTo: document.body })
    d.identificationMeans.push({ noSeal: false, meansTypeCode: '1', quantity: 1, number: 'SL-1' })
    await nextTick()
    expect(item('seals').attributes('data-state')).toBe('done')
    expect(item('seals').get('[data-nav-count]').text()).toBe('1')
  })

  it('клик плавно прокручивает к разделу с учётом шапки и делает пункт активным', async () => {
    const section = document.createElement('section')
    section.id = 'sec-goods'
    document.body.appendChild(section)
    section.getBoundingClientRect = () => ({ top: 500, bottom: 900, left: 0, right: 0, width: 0, height: 400, x: 0, y: 500, toJSON: () => ({}) })
    Object.defineProperty(window, 'scrollY', { value: 100, configurable: true })
    w = mountWithI18n(RecordNav, { props: { draft: draft() }, attachTo: document.body })
    await item('goods').trigger('click')
    expect(scrollTo).toHaveBeenCalledTimes(1)
    const arg = scrollTo.mock.calls[0][0] as ScrollToOptions
    // 500 + 100 − шапка оболочки (64 по умолчанию) − зазор 16
    expect(arg.top).toBe(520)
    expect(arg.behavior).toBe('smooth')
    expect(item('goods').attributes('aria-current')).toBe('true')
    expect(item('main').attributes('aria-current')).toBeUndefined()
    expect(item('goods').attributes('href')).toBe('#sec-goods')
  })

  it('на прокрутке активен последний раздел, чей верх ушёл под шапку (64 + 16)', async () => {
    sections({ main: -700, row: 40, goods: 300, doc44: 900 })
    w = mountWithI18n(RecordNav, { props: { draft: draft() }, attachTo: document.body })
    window.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(item('row').attributes('aria-current')).toBe('true')
    expect(item('main').attributes('aria-current')).toBeUndefined()
  })

  it('пока идёт прокрутка от клика, пункт клика не перебивается; вкладка скрыта (tracking=false) — не считается', async () => {
    sections({ main: -700, row: 40, goods: 300 })
    w = mountWithI18n(RecordNav, { props: { draft: draft() }, attachTo: document.body })
    await item('goods').trigger('click')
    window.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(item('goods').attributes('aria-current')).toBe('true')
    w.unmount()
    w = mountWithI18n(RecordNav, { props: { draft: draft(), tracking: false }, attachTo: document.body })
    window.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(item('main').attributes('aria-current')).toBe('true')
  })

  it('не шире своей колонки: min-w-0 у меню (лента на узком экране прокручивается внутри)', () => {
    w = mountWithI18n(RecordNav, { props: { draft: draft() }, attachTo: document.body })
    expect(w.get('nav').classes()).toContain('min-w-0')
    expect(w.get('nav ul').classes()).toContain('overflow-x-auto')
  })
})
