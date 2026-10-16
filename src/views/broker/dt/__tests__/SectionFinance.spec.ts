import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import { vUppercase } from '@/directives/uppercase'
import { useClassifiersStore } from '@/stores/classifiers'
import { confirmState } from '@/ui/confirm'
import { emptyDtForm, type DtFormState } from '../dtPayload'
import SectionFinance from '../sections/SectionFinance.vue'

vi.mock('@/api/references', () => ({ referencesApi: { getDtGuideGraph: vi.fn(), listClassifiers: vi.fn() } }))

const item = (classifierCode: string, code: string, nameRu: string) => ({ id: `${classifierCode}-${code}`, classifierCode, code, nameRu, sortOrder: 0, isActive: true })
let w: VueWrapper
let pinia: ReturnType<typeof createPinia>
let form: DtFormState
afterEach(() => { w?.unmount(); document.body.innerHTML = ''; confirmState.resolve(false) })
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  form = reactive(emptyDtForm())
  useClassifiersStore().cache = {
    incoterms: [item('incoterms', 'CIF', 'Стоимость, страхование и фрахт'), item('incoterms', 'FCA', 'Франко-перевозчик')],
    'transaction-natures': [item('transaction-natures', '011', 'Купля-продажа'), item('transaction-natures', '021', 'Поставка товара')],
    'settlement-terms': [item('settlement-terms', 'AKK', 'Аккредитив'), item('settlement-terms', 'PRE', 'Предоплата')],
  }
})

const currencyOptions = [
  { value: 'KZT', label: 'KZT / 398 — Тенге' },
  { value: 'USD', label: 'USD / 840 — Доллар США' },
  { value: 'EUR', label: 'EUR / 978 — Евро' },
]
const usdRate = { rate: 495.12, date: '2026-10-05' }
const types = [{ value: '17', label: 'Транспортные расходы' }, { value: '29', label: 'Скидка' }]

const mount = (over: Partial<DtFormState> = {}, props: Record<string, unknown> = {}) => {
  Object.assign(form, over)
  w = mountWithI18n(SectionFinance, {
    props: {
      form, readonly: false, customsValue: 750000, customsValueFromServer: true, currencyOptions, dealRate: usdRate,
      expenseTypeOptions: types, expenseDistributionByCode: { '17': 'GrossWeight' }, expenseDeductionByCode: { '29': true }, ...props,
    },
    global: { plugins: [pinia], directives: { uppercase: vUppercase }, stubs: { DtGraphHelp: { props: ['graph'], template: '<i data-help />' } } },
    attachTo: document.body,
  })
  return w
}
const field = (graph: string, nth = 0) => w.findAll(`[data-graph="${graph}"]`)[nth]
const comboOf = (graph: string) => field(graph).get('input')
const optionTexts = () => [...document.body.querySelectorAll('[role="option"]')].map((e) => e.textContent?.trim())
const open = async (el: { trigger: (e: string, o?: object) => Promise<void> }) => { await el.trigger('keydown', { key: 'ArrowDown' }); await nextTick() }
const pick = async (text: string) => {
  ;([...document.body.querySelectorAll('[role="option"]')].find((e) => e.textContent?.includes(text)) as HTMLElement).click()
  await nextTick()
}
const openMenu = async () => {
  await w.get('[data-rate-type-more]').trigger('keydown', { key: 'Enter' })
  await vi.waitFor(() => expect(document.body.querySelectorAll('[role="menuitem"]')).toHaveLength(1))
  return document.body.querySelector('[role="menuitem"]') as HTMLElement
}

describe('SectionFinance — условия (гр. 20, 22, 23, 12, 24)', () => {
  it('Инкотермс — выбор из классификатора, место — в верхнем регистре; значение вне списка с предупреждением', async () => {
    mount({ incoterms: 'FCA' })
    expect((comboOf('20').element as HTMLInputElement).value).toBe('FCA — Франко-перевозчик')
    await open(comboOf('20'))
    expect(optionTexts()).toEqual(['CIF — Стоимость, страхование и фрахт', 'FCA — Франко-перевозчик'])
    await pick('CIF')
    expect(form.incoterms).toBe('CIF')
    const place = w.get('[data-incoterms-place]')
    await place.setValue('алматы')
    expect(form.incotermsPlace).toBe('АЛМАТЫ')
    form.incoterms = 'XYZ'
    await nextTick()
    expect(w.text()).toContain('Значения «XYZ» нет в справочнике')
  })

  it('валюта гр. 22 — ZSelect валют; гр. 23 сам раздел не пишет (курс на дату ставит страница)', async () => {
    mount({ currency: 'EUR', exchangeRate: 580 })
    expect((comboOf('22').element as HTMLInputElement).value).toBe('EUR / 978 — Евро')
    await open(comboOf('22'))
    await pick('USD')
    expect(form.currency).toBe('USD')
    expect(form.exchangeRate).toBe(580)
  })

  it('гр. 23 — только чтение: курс НБ РК на дату курсов ДТ с датой (16.10.2026); правки и «Подставить» нет', () => {
    mount({ currency: 'USD', exchangeRate: 500 })
    const rate = w.get('[data-exchange-rate]')
    expect((rate.element as HTMLInputElement).value).toBe('495,12 (НБ РК на 05.10.2026)')
    expect(rate.attributes('readonly')).toBeDefined()
    expect(rate.attributes('data-rate-date')).toBe('2026-10-05')
    expect(w.find('[data-rate-apply]').exists()).toBe(false)
    expect(field('23').text()).toContain('если она пуста — на сегодня')
  })

  it('гр. 23 без курса на дату — пусто (сохранённый курс не показываем); без валюты — подсказка про гр. 22', () => {
    mount({ currency: 'USD', exchangeRate: 470.5 }, { dealRate: null })
    expect((w.get('[data-exchange-rate]').element as HTMLInputElement).value).toBe('')
    w.unmount()
    mount({ currency: '', exchangeRate: null }, { dealRate: null })
    expect((w.get('[data-exchange-rate]').element as HTMLInputElement).value).toBe('')
    expect(field('23').text()).toContain('после выбора валюты в гр. 22')
  })

  it('просмотр: поля недоступны', () => {
    mount({ currency: 'USD', exchangeRate: 500 }, { readonly: true })
    expect(w.find('[data-rate-apply]').exists()).toBe(false)
    expect(comboOf('22').attributes('disabled')).toBeDefined()
    expect(w.find('[data-calc-customs-value]').exists()).toBe(false)
    expect(w.find('[data-expense-add]').exists()).toBe(false)
  })

  it('гр. 12 — только чтение: после сохранения серверное значение, до него предпросмотр, с пометкой', async () => {
    mount({}, { customsValue: 750000, customsValueFromServer: true })
    const input = w.get('[data-customs-value]')
    expect(input.attributes('readonly')).toBeDefined()
    expect((input.element as HTMLInputElement).value.replace(/\s/g, ' ')).toBe('750 000,00 ₸')
    expect(input.attributes('data-source')).toBe('server')
    expect(w.get('[data-customs-value-tag]').text()).toBe('по сохранённой ДТ')
    await w.setProps({ customsValue: 760000, customsValueFromServer: false })
    expect(w.get('[data-customs-value]').attributes('data-source')).toBe('preview')
    expect(w.get('[data-customs-value-tag]').text()).toBe('предварительно')
  })

  it('гр. 24: характер сделки и форма расчётов — выбор без свободного ввода', async () => {
    mount({ transactionNatureCode: '011' })
    expect((comboOf('24').element as HTMLInputElement).value).toBe('011 — Купля-продажа')
    await open(comboOf('24'))
    await comboOf('24').setValue('99')
    await comboOf('24').trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(form.transactionNatureCode).toBe('011')
    await comboOf('24').trigger('keydown', { key: 'Escape' })
    const inputs = w.findAll('[data-finance-deal] input[role="combobox"]')
    await open(inputs[1])
    await pick('PRE')
    expect(form.transactionFeatureCode).toBe('PRE')
  })

  it('«Места для ДТС» здесь нет — оно в разделе «ДТС»', () => {
    mount({ incotermsPlace: 'АЛМАТЫ' })
    expect(w.find('[data-dts-place]').exists()).toBe(false)
    expect(w.text()).not.toContain('для ДТС')
  })
})

describe('SectionFinance — гр. 22 = Σ гр. 42 (сверка КЕДЕН 14.10, I6)', () => {
  const g = (customsValue: number | null, currency: string | null = null) => ({ customsValue, currency }) as never

  it('расходится — подсказка с суммой и «Подставить Σ гр. 42»; совпадает (до копейки) — подсказки нет', async () => {
    mount({ currency: 'CNY', totalInvoiceValue: 354000, goodsItems: [g(187368), g(166732.004, 'CNY')] })
    expect(w.get('[data-invoice-hint]').text()).toMatch(/^Сумма гр\. 42 по товарам — 354\s100,00 CNY: КЕДЕН сверяет её с гр\. 22$/)
    await w.get('[data-invoice-apply]').trigger('click')
    expect(form.totalInvoiceValue).toBe(354100)
    await nextTick()
    expect(w.find('[data-invoice-hint]').exists()).toBe(false)
    expect(w.text()).toContain('Считается по товарам.')
    form.totalInvoiceValue = 354100.01
    await nextTick()
    expect(w.find('[data-invoice-hint]').exists()).toBe(false)
    form.totalInvoiceValue = null
    await nextTick()
    expect(w.find('[data-invoice-hint]').exists()).toBe(true) // пустая гр. 22 при товарах со стоимостью — тоже подсказка
  })

  it('товар в другой валюте или нет стоимости — не сверяем; только чтение — без «Подставить»', async () => {
    mount({ currency: 'CNY', totalInvoiceValue: 1, goodsItems: [g(100), g(50, 'USD')] })
    expect(w.find('[data-invoice-hint]').exists()).toBe(false)
    w.unmount()
    mount({ currency: 'CNY', totalInvoiceValue: 1, goodsItems: [g(null)] })
    expect(w.find('[data-invoice-hint]').exists()).toBe(false)
    w.unmount()
    mount({ currency: 'CNY', totalInvoiceValue: 1, goodsItems: [g(100)] }, { readonly: true })
    expect(w.find('[data-invoice-hint]').exists()).toBe(true)
    expect(w.find('[data-invoice-apply]').exists()).toBe(false)
  })
})

describe('SectionFinance — вид ставки', () => {
  it('показан тегом (ЕТТ / ВТО), свободного поля нет', () => {
    mount({ rateType: 'ETT' })
    expect(w.get('[data-rate-type]').text()).toContain('Вид ставки') // подпись как у поля КЕДЕН
    expect(w.get('[data-rate-type-tag]').text()).toBe('ЕТТ')
    expect(w.find('[data-rate-type] input').exists()).toBe(false)
    w.unmount()
    mount({ rateType: 'EATT' })
    expect(w.get('[data-rate-type-tag]').text()).toBe('ВТО')
    expect(w.find('[data-rate-type] input').exists()).toBe(false)
    w.unmount()
    mount({ rateType: 'WTO' })
    expect(w.get('[data-rate-type-tag]').text()).toBe('WTO')
  })

  it('без права править ДТ «Ещё» нет; у того, кто правит (декларант, РОП, админ), — смена с подтверждением', async () => {
    mount({ rateType: 'ETT' })
    expect(w.find('[data-rate-type-more]').exists()).toBe(false)
    w.unmount()
    mount({ rateType: 'ETT' }, { canChangeRateType: true })
    const menuItem = await openMenu()
    expect(menuItem.textContent).toContain('Сменить вид ставки на ВТО')
    menuItem.click()
    await vi.waitFor(() => expect(confirmState.open).toBe(true))
    // Пока не подтвердили — тип прежний.
    expect(confirmState.title).toBe('Сменить вид ставки?')
    expect(form.rateType).toBe('ETT')
    confirmState.resolve(true)
    await nextTick(); await nextTick()
    expect(form.rateType).toBe('EATT')
    expect(w.get('[data-rate-type-tag]').text()).toBe('ВТО')
  })

  it('отказ в подтверждении — тип не меняется; в просмотре «Ещё» нет', async () => {
    mount({ rateType: 'EATT' }, { canChangeRateType: true })
    ;(await openMenu()).click()
    await vi.waitFor(() => expect(confirmState.open).toBe(true))
    confirmState.resolve(false)
    await nextTick(); await nextTick()
    expect(form.rateType).toBe('EATT')
    w.unmount()
    mount({ rateType: 'EATT' }, { canChangeRateType: true, readonly: true })
    expect(w.find('[data-rate-type-more]').exists()).toBe(false)
  })
})

describe('SectionFinance — расходы и пересчёт гр. 45', () => {
  it('строки правятся прямо в форме; тег базы распределения и «вычет» из справочника', async () => {
    mount({ expenses: [{ expenseTypeCode: '17', amount: 300, currencyCode: 'USD' }, { expenseTypeCode: '29', amount: 50, currencyCode: 'EUR' }] })
    const rows = w.findAll('[data-expense-row]')
    expect(rows).toHaveLength(2)
    expect(rows[0].get('[data-expense-base]').text()).toBe('по весу брутто')
    expect(rows[0].find('[data-expense-deduction]').exists()).toBe(false)
    expect(rows[1].get('[data-expense-base]').text()).toContain('по стоимости')
    expect(rows[1].get('[data-expense-deduction]').text()).toBe('вычет')
    await rows[0].get('[data-expense-amount]').setValue('450')
    await rows[0].get('[data-expense-amount]').trigger('blur')
    expect(form.expenses![0].amount).toBe(450)
    await open(rows[1].get('[data-expense-type]'))
    await pick('Транспортные')
    expect(form.expenses![1].expenseTypeCode).toBe('17')
  })

  it('добавить и удалить расход; пусто — «Расходов нет»', async () => {
    mount({ expenses: [] })
    expect(w.get('[data-expenses-empty]').text()).toBe('Расходов нет')
    await w.get('[data-expense-add]').trigger('click')
    expect(form.expenses).toEqual([{ expenseTypeCode: null, amount: null, currencyCode: null }])
    expect(w.find('[data-expenses-empty]').exists()).toBe(false)
    await w.get('[data-expense-remove]').trigger('click')
    expect(form.expenses).toEqual([])
  })

  it('«Рассчитать там. стоимость» — вторичное действие; событие наружу', async () => {
    mount()
    const btn = w.get('[data-calc-customs-value]')
    expect(btn.classes().join(' ')).not.toContain('bg-navy')
    await btn.trigger('click')
    expect(w.emitted('calc-customs-value')).toHaveLength(1)
    expect(w.text()).toContain('Платежи (гр. 47) не меняются')
  })

  it('результат пересчёта — в разделе; правка исходных данных помечает его устаревшим', async () => {
    mount({ exchangeRate: 495.12 }, { recalc: null })
    expect(w.find('[data-recalc-result]').exists()).toBe(false)
    await w.setProps({ recalc: { updated: 3, total: 1234567.5 } })
    const res = w.get('[data-recalc-result]')
    expect(res.text()).toContain('Гр. 45 пересчитана: товаров — 3')
    expect(res.text().replace(/\s/g, ' ')).toContain('1 234 567,50 ₸')
    expect(res.attributes('role')).toBe('status')
    expect(res.attributes('data-stale')).toBeUndefined()
    await w.setProps({ dealRate: { rate: 500, date: '2026-10-06' } })
    expect(w.get('[data-recalc-result]').attributes('data-stale')).toBeDefined()
    expect(w.get('[data-recalc-result]').text()).toContain('пересчитайте ещё раз')
    // Новый расчёт снимает пометку.
    await w.setProps({ recalc: { updated: 3, total: 1 } })
    expect(w.get('[data-recalc-result]').attributes('data-stale')).toBeUndefined()
    expect(w.get('[data-recalc-result]').text()).not.toContain('вручную')
    // Ручные гр. 45 (16.10.2026) — сколько оставлено.
    await w.setProps({ recalc: { updated: 1, total: 1, kept: 2 } })
    expect(w.get('[data-recalc-result]').text()).toContain('Гр. 45 вручную оставлена у товаров: 2.')
  })

  it('открытие раздела форму не меняет', () => {
    const before = JSON.stringify(emptyDtForm())
    Object.assign(form, emptyDtForm())
    mount({}, {})
    expect(JSON.stringify(form)).toBe(before)
  })
})
