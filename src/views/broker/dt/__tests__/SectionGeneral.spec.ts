import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import { useClassifiersStore } from '@/stores/classifiers'
import { emptyDtForm, type DtFormState } from '../dtPayload'
import SectionGeneral from '../sections/SectionGeneral.vue'

vi.mock('@/api/references', () => ({ referencesApi: { getDtGuideGraph: vi.fn(), listClassifiers: vi.fn() } }))

const item = (classifierCode: string, code: string, nameRu: string) => ({ id: `${classifierCode}-${code}`, classifierCode, code, nameRu, sortOrder: 0, isActive: true })
let w: VueWrapper
let pinia: ReturnType<typeof createPinia>
let form: DtFormState
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  form = reactive(emptyDtForm())
  useClassifiersStore().cache = {
    'declaration-types': [item('declaration-types', 'ИМ', 'ИМ — импорт (ввоз)'), item('declaration-types', 'ЭК', 'ЭК — экспорт (вывоз)')],
    'customs-procedures': [item('customs-procedures', '10', 'Экспорт'), item('customs-procedures', '40', 'Выпуск для внутреннего потребления')],
    'declaring-features': [item('declaring-features', 'ПТД', 'Предварительное декларирование'), item('declaring-features', 'НТД', 'Неполное декларирование')],
  }
})

const mount = (over: Partial<DtFormState> = {}, props: Record<string, unknown> = {}) => {
  Object.assign(form, over)
  w = mountWithI18n(SectionGeneral, {
    props: { form, readonly: false, totals: { goods: 8, places: 36 }, ...props },
    global: { plugins: [pinia], stubs: { DtGraphHelp: { props: ['graph'], template: '<i data-help :data-help-graph="graph" />' } } },
    attachTo: document.body,
  })
  return w
}
const field = (graph: string, nth = 0) => w.findAll(`[data-graph="${graph}"]`)[nth]
const comboOf = (graph: string, nth = 0) => field(graph, nth).get('input')
const optionTexts = () => [...document.body.querySelectorAll('[role="option"]')].map((e) => e.textContent?.trim())
const openCombo = async (graph: string, nth = 0) => {
  await comboOf(graph, nth).trigger('keydown', { key: 'ArrowDown' })
  await nextTick()
}
const pick = async (text: string) => {
  const opt = [...document.body.querySelectorAll('[role="option"]')].find((e) => e.textContent?.includes(text)) as HTMLElement
  opt.click()
  await nextTick()
}

describe('SectionGeneral — гр. 1, 3–7', () => {
  it('тип, процедура — выбор из классификатора с подписью «код — название» (без повтора кода)', async () => {
    mount({ declarationTypeCode: 'ИМ', procedureCode: '40' })
    expect((comboOf('1', 0).element as HTMLInputElement).value).toBe('ИМ — импорт (ввоз)')
    expect((comboOf('1', 1).element as HTMLInputElement).value).toBe('40 — Выпуск для внутреннего потребления')
    await openCombo('1', 1)
    expect(optionTexts()).toEqual(['10 — Экспорт', '40 — Выпуск для внутреннего потребления'])
    await pick('10 — Экспорт')
    expect(form.procedureCode).toBe('10')
  })

  it('свободный ввод закрыт: набранный текст без пункта значения не меняет', async () => {
    mount({ declarationTypeCode: 'ИМ', procedureCode: '40' })
    await openCombo('1', 1)
    await comboOf('1', 1).setValue('77')
    await comboOf('1', 1).trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(form.procedureCode).toBe('40')
    expect(optionTexts()).toEqual([])
  })

  it('значение вне классификатора показывается и подсвечивается предупреждением; список не загружен — без него', () => {
    mount({ declarationTypeCode: 'ИМ', procedureCode: '99' })
    expect((comboOf('1', 1).element as HTMLInputElement).value).toBe('99')
    expect(w.text()).toContain('Значения «99» нет в справочнике')
    w.unmount()
    useClassifiersStore().cache = {}
    mount({ declarationTypeCode: 'ИМ', procedureCode: '99' })
    expect((comboOf('1', 1).element as HTMLInputElement).value).toBe('99')
    expect(w.text()).not.toContain('нет в справочнике')
  })

  it('признак и особенности декларирования: выбор и очистка (null)', async () => {
    mount({ declarationFeatureCode: null, referenceNumber: 'ПТД' })
    await openCombo('1', 2)
    expect(optionTexts()).toEqual(['ЭД — электронная форма'])
    await pick('ЭД')
    expect(form.declarationFeatureCode).toBe('ЭД')
    expect((comboOf('7').element as HTMLInputElement).value).toBe('ПТД — Предварительное декларирование')
    await field('7').get('button[aria-label="Очистить"]').trigger('click')
    expect(form.referenceNumber).toBeNull()
  })

  it('гр. 3, 5, 6 — «авто»: только чтение, значения по товарам', () => {
    mount({ sheetNumber: 1, totalSheets: 3 })
    for (const g of ['3', '5', '6']) {
      const input = field(g).get('input')
      expect(input.attributes('readonly')).toBeDefined()
      expect(field(g).text()).toContain('авто')
    }
    expect((field('3').get('input').element as HTMLInputElement).value).toBe('1 / 3')
    expect((field('5').get('input').element as HTMLInputElement).value).toBe('8')
    expect((field('6').get('input').element as HTMLInputElement).value).toBe('36')
    expect(w.text()).toContain('3 товара на добавочный лист')
  })

  it('листов ещё нет — прочерки, не «null»', () => {
    mount({ sheetNumber: null, totalSheets: null }, { totals: { goods: 0, places: 0 } })
    expect((field('3').get('input').element as HTMLInputElement).value).toBe('— / —')
  })

  it('гр. 4 — число не меньше 0, пишется в форму', async () => {
    mount({ shippingSpecSheets: null })
    const input = field('4').get('input')
    await input.setValue('5')
    await input.trigger('blur')
    expect(form.shippingSpecSheets).toBe(5)
  })

  it('у всех полей data-graph (для перехода «к недостающему») и справка у графы', () => {
    mount()
    for (const g of ['1', '3', '4', '5', '6', '7']) expect(field(g).exists(), g).toBe(true)
    expect(w.findAll('[data-graph="1"]')).toHaveLength(3)
    expect(w.findAll('[data-help]').map((e) => e.attributes('data-help-graph'))).toEqual(['1', '3', '4', '7', '5', '6'])
  })

  it('открытие со старыми и неизвестными значениями форму не меняет', async () => {
    Object.assign(form, { declarationTypeCode: 'XX', procedureCode: '99', declarationFeatureCode: 'ПТД', referenceNumber: 'ЗЗЗ', shippingSpecSheets: null })
    const before = JSON.stringify(form)
    mount()
    await nextTick()
    expect(JSON.stringify(form)).toBe(before)
  })

  it('просмотр: выбор и число недоступны', () => {
    mount({ declarationTypeCode: 'ИМ' }, { readonly: true })
    for (const g of ['1', '4', '7']) expect(field(g).get('input').attributes('disabled'), g).toBeDefined()
  })
})
