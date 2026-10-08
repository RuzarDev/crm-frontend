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
const setTop = (key: string, top: number) => {
  const el = document.getElementById(`sec-${key}`)!
  el.getBoundingClientRect = () => ({ top, bottom: top + 300, left: 0, right: 0, width: 0, height: 300, x: 0, y: top, toJSON: () => ({}) })
}
const page = (scrollY: number, scrollHeight: number) => {
  Object.defineProperty(window, 'scrollY', { value: scrollY, configurable: true })
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: scrollHeight, configurable: true })
}
const scroll = async () => {
  window.dispatchEvent(new Event('scroll'))
  await nextTick()
}
afterEach(() => {
  vi.useRealTimers()
  page(0, 0)
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
    // Без обрезки по ширине содержимое ленты на телефоне раздвигало страницу (эмуляция Chrome: ~1500 px).
    expect(w.get('nav').classes()).toContain('max-lg:overflow-x-clip')
    expect(w.get('nav ul').classes()).toContain('overflow-x-auto')
  })

  it('линия активации ≈ 30% окна: раздел, чей заголовок на 100px, уже активен', async () => {
    sections({ main: -700, row: 100, goods: 400 })
    w = mountWithI18n(RecordNav, { props: { draft: draft() }, attachTo: document.body })
    await scroll()
    // innerHeight 768 → линия 230: «Строка реестра» (100) уже за ней, «Товары» (400) — нет.
    expect(item('row').attributes('aria-current')).toBe('true')
  })

  it('у низа страницы активен последний видный раздел («Прочее»), даже если он ниже линии', async () => {
    sections({ main: -2000, guarantees: 350, misc: 560 })
    // До самого низа не докручено на 6px (дробная прокрутка, отступы) — это всё ещё низ: 2234 + 768 ≥ 3008 − 8.
    page(2234, 3008)
    w = mountWithI18n(RecordNav, { props: { draft: draft() }, attachTo: document.body })
    await scroll()
    expect(item('misc').attributes('aria-current')).toBe('true')
  })

  it('после прокрутки от клика — один пересчёт: прокрутили руками дальше — подсветка догоняет', async () => {
    vi.useFakeTimers()
    sections({ main: -700, row: 50, goods: 80 })
    w = mountWithI18n(RecordNav, { props: { draft: draft() }, attachTo: document.body })
    await item('goods').trigger('click')
    // Прокрутка от клика довела «Товары» к полосе (64 + 16 = 80) — пункт клика держится и после неё.
    await scroll()
    vi.advanceTimersByTime(1500)
    await nextTick()
    expect(item('goods').attributes('aria-current')).toBe('true')
    // Во время блокировки прокрутили руками: «Товары» ушли вверх, «Документы гр. 44» на 150px.
    await item('goods').trigger('click')
    sections({ doc44: 150 })
    setTop('goods', -400)
    await scroll()
    vi.advanceTimersByTime(1500)
    await nextTick()
    expect(item('doc44').attributes('aria-current')).toBe('true')
  })

  it('возврат на «Данные» (tracking → true) сразу пересчитывает подсветку', async () => {
    sections({ main: -700, row: -300, goods: 120 })
    w = mountWithI18n(RecordNav, { props: { draft: draft(), tracking: false }, attachTo: document.body })
    await nextTick()
    expect(item('main').attributes('aria-current')).toBe('true')
    await w.setProps({ tracking: true })
    await nextTick()
    await nextTick()
    expect(item('goods').attributes('aria-current')).toBe('true')
  })
})

describe('RecordNav в своей прокрутке (шторка транзитной декларации партии)', () => {
  /** Прокручиваемая область: верх на 100px от окна, высота 600, прокручена на scrollTop. */
  const box = (scrollTop: number, scrollHeight = 3000) => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.getBoundingClientRect = () => ({ top: 100, bottom: 700, left: 0, right: 0, width: 0, height: 600, x: 0, y: 100, toJSON: () => ({}) })
    Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true })
    Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true })
    el.scrollTop = scrollTop
    el.scrollTo = vi.fn() as unknown as typeof el.scrollTo
    return el
  }
  const SECTIONS = ['main', 'organizations', 'carriers', 'transport', 'seals', 'containers', 'packaging', 'preceding', 'guarantees', 'misc']

  it('свой набор разделов и подпись меню', () => {
    w = mountWithI18n(RecordNav, { props: { draft: draft(), sections: SECTIONS, label: 'Разделы декларации' }, attachTo: document.body })
    expect(w.findAll('[data-nav-item]').map((a) => a.attributes('data-nav-item'))).toEqual(SECTIONS)
    expect(w.get('nav').attributes('aria-label')).toBe('Разделы декларации')
  })

  it('клик прокручивает область (не окно) — с учётом её верха и прокрутки', async () => {
    const el = box(200)
    sections({ carriers: 500 })
    w = mountWithI18n(RecordNav, { props: { draft: draft(), sections: SECTIONS, scroller: el }, attachTo: document.body })
    await item('carriers').trigger('click')
    expect(scrollTo).not.toHaveBeenCalled()
    // 500 − верх области 100 + прокрутка 200 − зазор 16 (шапки оболочки в шторке нет)
    expect((el.scrollTo as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ top: 584 })
    expect(item('carriers').attributes('aria-current')).toBe('true')
  })

  it('подсветка — по прокрутке области: линия ≈ 30% её высоты от её верха', async () => {
    const el = box(400)
    sections({ main: -500, organizations: 150, carriers: 400 })
    w = mountWithI18n(RecordNav, { props: { draft: draft(), sections: SECTIONS, scroller: el }, attachTo: document.body })
    // Прокрутка окна область не трогает.
    el.dispatchEvent(new Event('scroll'))
    await nextTick()
    // линия = 100 + 0.3 × 600 = 280: «Организации» (150) за ней, «Перевозчики» (400) — нет.
    expect(item('organizations').attributes('aria-current')).toBe('true')
  })

  it('область пришла после монтирования меню — подсветка пересчитывается по ней', async () => {
    // Окно прокручено до низа: по окну активным был бы последний видный раздел.
    page(2234, 3008)
    sections({ main: 120, organizations: 700, misc: 300 })
    w = mountWithI18n(RecordNav, { props: { draft: draft(), sections: SECTIONS, scroller: null }, attachTo: document.body })
    await nextTick()
    await w.setProps({ scroller: box(0) })
    await nextTick()
    await nextTick()
    // По области (верх 100, высота 600, не прокручена): «Основное» на 20px — за линией (180), «Прочее» на 200 — нет.
    expect(item('main').attributes('aria-current')).toBe('true')
  })

  it('область ещё не выложена (высота 0, верхи нулевые) — подсветка не прыгает на последний раздел', async () => {
    const el = box(0)
    Object.defineProperty(el, 'clientHeight', { value: 0, configurable: true })
    sections({ main: 0, organizations: 0, misc: 0 })
    w = mountWithI18n(RecordNav, { props: { draft: draft(), sections: SECTIONS, scroller: el }, attachTo: document.body })
    await nextTick()
    el.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(item('main').attributes('aria-current')).toBe('true')
  })
})
