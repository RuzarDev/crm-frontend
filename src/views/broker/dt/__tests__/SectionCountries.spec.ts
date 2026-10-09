import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick, reactive } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import { emptyDtForm, type DtFormState } from '../dtPayload'
import SectionCountries from '../sections/SectionCountries.vue'

const countries = [
  { value: '398', label: '398 — Казахстан' },
  { value: '156', label: '156 — Китай' },
  { value: '792', label: '792 — Турция' },
]
let w: VueWrapper
let form: DtFormState
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })
beforeEach(() => { form = reactive(emptyDtForm()) })

const mount = (over: Partial<DtFormState> = {}, props: Record<string, unknown> = {}) => {
  Object.assign(form, over)
  w = mountWithI18n(SectionCountries, {
    props: { form, readonly: false, countryOptions: countries, ...props },
    global: { stubs: { DtGraphHelp: { props: ['graph'], template: '<i data-help :data-help-graph="graph" />' } } },
    attachTo: document.body,
  })
}
const field = (graph: string) => w.get(`[data-graph="${graph}"]`)
const optionTexts = () => [...document.body.querySelectorAll('[role="option"]')].map((e) => e.textContent?.trim())
const open = async (graph: string) => {
  await field(graph).get('input').trigger('keydown', { key: 'ArrowDown' })
  await nextTick()
}
const pick = async (text: string) => {
  ;([...document.body.querySelectorAll('[role="option"]')].find((e) => e.textContent?.includes(text)) as HTMLElement).click()
  await nextTick()
}

describe('SectionCountries — гр. 11, 15–17', () => {
  it('четыре выбора страны с поиском; код ОКСМ пишется в свою графу', async () => {
    mount()
    await open('15')
    expect(optionTexts()).toEqual(['398 — Казахстан', '156 — Китай', '792 — Турция'])
    await field('15').get('input').setValue('кит')
    await nextTick()
    expect(optionTexts()).toEqual(['156 — Китай'])
    await pick('Китай')
    expect(form.departureCountryCode).toBe('156')
    await open('17'); await pick('Казахстан')
    expect(form.destinationCountryCode).toBe('398')
    await open('11'); await pick('Турция')
    expect(form.tradeCountryCode).toBe('792')
    await open('16'); await pick('Китай')
    expect(form.originCountryCode).toBe('156')
  })

  it('выбранная страна показывается «код — название»; очистка — null / пусто', async () => {
    mount({ departureCountryCode: '156', tradeCountryCode: '792' })
    expect((field('15').get('input').element as HTMLInputElement).value).toBe('156 — Китай')
    await field('15').get('button[aria-label="Очистить"]').trigger('click')
    expect(form.departureCountryCode).toBeNull()
    await field('11').get('button[aria-label="Очистить"]').trigger('click')
    expect(form.tradeCountryCode).toBe('')
  })

  it('гр. 16: подпись «считается по товарам» и пункт 000 — разные страны', async () => {
    mount({ originCountryCode: '000' })
    expect(field('16').text()).toContain('Считается по товарам: одна страна — её код, разные — 000.')
    expect((field('16').get('input').element as HTMLInputElement).value).toBe('000 — разные страны')
    expect(w.text()).not.toContain('нет в справочнике')
    await open('16')
    expect(optionTexts()[0]).toBe('000 — разные страны')
    await field('16').get('input').trigger('keydown', { key: 'Escape' })
    await nextTick()
    await open('15')
    expect(optionTexts()).not.toContain('000 — разные страны')
  })

  it('страна вне справочника (старый «KZ») показывается с предупреждением', () => {
    mount({ destinationCountryCode: 'KZ' })
    expect((field('17').get('input').element as HTMLInputElement).value).toBe('KZ')
    expect(field('17').text()).toContain('Страны «KZ» нет в справочнике ОКСМ')
  })

  it('справка у каждой графы, просмотр — выбор недоступен', () => {
    mount({}, { readonly: true })
    expect(w.findAll('[data-help]').map((e) => e.attributes('data-help-graph')).sort()).toEqual(['11', '15', '16', '17'])
    for (const g of ['11', '15', '16', '17']) expect(field(g).get('input').attributes('disabled')).toBeDefined()
  })
})
