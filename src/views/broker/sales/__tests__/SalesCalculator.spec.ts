import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { SalesCalcGoodsResult, SalesCalcResponse } from '@/api/sales'

const api = vi.hoisted(() => ({
  listServices: vi.fn(), calculate: vi.fn(), createQuote: vi.fn(), currencies: vi.fn(), node: vi.fn(), listCountries: vi.fn(), listClassifiers: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/sales', async (orig) => ({
  ...(await orig<typeof import('@/api/sales')>()),
  salesApi: { listServices: api.listServices, calculate: api.calculate, createQuote: api.createQuote },
}))
vi.mock('@/api/tnved', () => ({ tnvedApi: { currencies: api.currencies, node: api.node } }))
vi.mock('@/api/references', () => ({ referencesApi: { listCountries: api.listCountries, listClassifiers: api.listClassifiers } }))
vi.mock('@/ui/message', () => ({ message: api.toast }))
// Пикер ТН ВЭД (AntD) — заглушка: кнопка «выбрать» отдаёт код.
vi.mock('@/components/TnvedPickerModal.vue', () => ({
  default: {
    props: ['open', 'initialQuery'], emits: ['update:open', 'select'],
    template: `<div v-if="open" data-picker :data-query="initialQuery"><button type="button" data-picker-choose @click="$emit('select', { code: '8471300000', name: 'Машины вычислительные' }); $emit('update:open', false)" /></div>`,
  },
}))

import SalesCalculator from '../SalesCalculator.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZInput from '@/components/z/ZInput.vue'

const SERVICES = [
  { id: 's1', name: 'Оформление ДТ (ИМ 40)', unit: 'за ДТ', price: 45000, sortOrder: 1, isActive: true },
  { id: 's2', name: 'Старый тариф', unit: 'шт', price: 1000, sortOrder: 2, isActive: false },
  { id: 's3', name: 'Добавочный лист', unit: 'за лист', price: 3000, sortOrder: 3, isActive: true },
]
const opt = (key: string, rate: string, condition: string) => ({ key, rate, condition, country: null, endDate: null })
const good = (o: Partial<SalesCalcGoodsResult> = {}): SalesCalcGoodsResult => ({
  description: 'Вино', code: '2204210000', codeName: null, customsValueKzt: 1_000_000, importDutyKzt: 100_000, exciseKzt: 20_000,
  customsFeeKzt: 20_000, vatKzt: 136_800, tpinTotalKzt: 276_800, error: null, antiDumpingKzt: 0,
  exciseKind: 'k1', exciseOptions: [opt('k1', '300 ₸/л', 'вино'), opt('k2', '600 ₸/л', 'игристое')], antiDumpingOptions: [],
  ...o,
})
const RESULT = (goods: SalesCalcGoodsResult[] = [good()]): SalesCalcResponse => ({
  services: [], goods, servicesTotal: 45000, tpinTotal: goods.reduce((s, g) => s + g.tpinTotalKzt, 0), grandTotal: 45000 + goods.reduce((s, g) => s + g.tpinTotalKzt, 0),
})

let w: VueWrapper
const nb = (s: string) => s.replace(/ /g, ' ')
const mountCalc = async () => {
  w = mountWithI18n(SalesCalculator, { attachTo: document.body })
  await flushPromises()
}
const select = (attr: string) => w.findAllComponents(ZSelect).find((c) => c.find(`[${attr}]`).exists())!
const input = (attr: string) => w.findAllComponents(ZInput).find((c) => c.find(`[${attr}]`).exists())!
const btn = (attr: string) => w.get(`[${attr}]`)

beforeEach(() => {
  setActivePinia(createPinia())
  api.listServices.mockResolvedValue(SERVICES)
  api.currencies.mockResolvedValue({ data: [{ codeLat: 'USD', name: 'Доллар', rate: 482.61, updatedAtUtc: '2026-10-08T03:00:00Z' }, { codeLat: 'EUR', name: 'Евро', rate: 560.1, updatedAtUtc: '2026-10-08T03:00:00Z' }] })
  api.listCountries.mockResolvedValue([{ code: '156', name: 'Китай' }])
  api.listClassifiers.mockResolvedValue([{ code: 'FCA', nameRu: 'Франко-перевозчик' }])
  api.node.mockResolvedValue({ data: { unitShort: 'шт' } })
  api.calculate.mockResolvedValue(RESULT())
  api.createQuote.mockResolvedValue({ id: 'q1' })
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('«Продажи»: расчёт', () => {
  it('справочники: курсы и страны без тоста (silent); курс USD в «Итоге»', async () => {
    await mountCalc()
    expect(api.currencies).toHaveBeenCalledWith({ silent: true })
    expect(api.listCountries).toHaveBeenCalledWith({ silent: true })
    expect(api.listClassifiers).toHaveBeenCalledWith('incoterms')
    expect(nb(w.get('[data-sales-usd]').text())).toBe('курс НБ РК на 08.10: 1 USD = 482,61 ₸')
    expect(select('data-sales-incoterms').props('options')).toEqual([{ value: 'FCA', label: 'FCA — Франко-перевозчик' }])
  })

  it('прайс — только действующие услуги; выбор добавляет строку с ценой и суммой', async () => {
    await mountCalc()
    expect(w.get('[data-sales-services-empty]').text()).toBe('Добавьте услугу из прайса или свою')
    const price = select('data-sales-price')
    expect((price.props('options') as { value: string }[]).map((o) => o.value)).toEqual(['s1', 's3'])
    price.vm.$emit('update:value', 's3')
    await flushPromises()
    expect(w.find('[data-sales-services-empty]').exists()).toBe(false)
    expect((w.get('[data-service-name]').element as HTMLInputElement).value).toBe('Добавочный лист')
    expect(nb(w.get('[data-service-sum]').text())).toBe('3 000')
    // Своя услуга — пустое название, единица «услуга».
    await btn('data-sales-custom-service').trigger('click')
    expect(w.findAll('[data-service-name]')).toHaveLength(2)
    await w.findAll('[data-service-remove]')[0].trigger('click')
    expect(w.findAll('[data-service-name]')).toHaveLength(1)
    expect((w.get('[data-service-name]').element as HTMLInputElement).value).toBe('')
  })

  it('первый расчёт — «Рассчитать» в «Итоге»; суммы, расшифровка, тело без _k', async () => {
    await mountCalc()
    expect(w.find('[data-sales-recalc]').exists()).toBe(false)
    select('data-sales-price').vm.$emit('update:value', 's1')
    await btn('data-sales-add-goods').trigger('click')
    await btn('data-sales-calculate').trigger('click')
    await flushPromises()
    expect(api.calculate).toHaveBeenCalledWith({
      services: [{ name: 'Оформление ДТ (ИМ 40)', unit: 'за ДТ', unitPrice: 45000, quantity: 1, discountPercent: 0 }],
      goods: [{ description: '', code: '', customsValue: 0, currencyCode: 'USD', weightKg: null, unit: '' }],
    })
    expect(w.find('[data-sales-calculate]').exists()).toBe(false)
    expect(w.find('[data-sales-recalc]').exists()).toBe(true)
    expect(nb(w.get('[data-sum-services]').text())).toBe('45 000 ₸')
    expect(nb(w.get('[data-sum-customs]').text())).toBe('276 800 ₸')
    expect(nb(w.get('[data-sum-duty]').text())).toBe('100 000 ₸')
    expect(nb(w.get('[data-sum-excise]').text())).toBe('20 000 ₸')
    expect(w.find('[data-sum-antidumping]').exists()).toBe(false)
    expect(nb(w.get('[data-sum-grand]').text())).toBe('321 800 ₸')
    // Таблица результата: антидемпинговой колонки нет, ТПиН по строке.
    expect(w.get('[data-sales-results-table]').text()).not.toContain('Антидемпинговая')
    expect(nb(w.get('[data-result-cell="tpin"]').text())).toBe('276 800')
  })

  it('«Сохранить как КП» неактивна без клиента и без результата', async () => {
    await mountCalc()
    const save = () => btn('data-sales-save').attributes('disabled')
    expect(save()).toBeDefined()
    input('data-sales-client').vm.$emit('update:value', 'ТОО «Казахмыс Трейд»')
    await flushPromises()
    expect(save()).toBeDefined() // результата ещё нет
    input('data-sales-client').vm.$emit('update:value', '  ')
    await btn('data-sales-calculate').trigger('click')
    await flushPromises()
    expect(save()).toBeDefined() // клиента нет
    expect(w.get('[data-sales-need-client]').text()).toBe('Укажите клиента, чтобы сохранить КП')
    input('data-sales-client').vm.$emit('update:value', 'ТОО «Казахмыс Трейд»')
    await flushPromises()
    expect(save()).toBeUndefined()
    await btn('data-sales-save').trigger('click')
    await flushPromises()
    expect(api.createQuote).toHaveBeenCalledWith(expect.objectContaining({
      clientName: 'ТОО «Казахмыс Трейд»', clientContact: '', comment: '', incoterms: null, transportCost: null, transportCurrency: 'USD', services: [], goods: [],
    }))
    expect(api.toast.success).toHaveBeenCalledWith('КП сохранено')
    expect(w.emitted('saved')).toHaveLength(1)
  })

  it('после правки строк результат устарел — плашка; сохранить можно', async () => {
    await mountCalc()
    input('data-sales-client').vm.$emit('update:value', 'Клиент')
    select('data-sales-price').vm.$emit('update:value', 's1')
    await btn('data-sales-calculate').trigger('click')
    await flushPromises()
    expect(w.find('[data-sales-stale]').exists()).toBe(false)
    select('data-sales-price').vm.$emit('update:value', 's3')
    await flushPromises()
    expect(w.get('[data-sales-stale]').text()).toBe('Данные изменились — пересчитайте')
    expect(btn('data-sales-save').attributes('disabled')).toBeUndefined()
    await btn('data-sales-recalc').trigger('click')
    await flushPromises()
    expect(w.find('[data-sales-stale]').exists()).toBe(false)
  })

  it('выбор вида акциза (КЕДЕН) пересчитывает с выбранным видом; антидемпинг — тоже', async () => {
    api.calculate.mockResolvedValue(RESULT([good({ antiDumpingOptions: [{ key: 'a1', rate: '25%', condition: 'сталь', country: 'CN', endDate: null }] })]))
    await mountCalc()
    await btn('data-sales-add-goods').trigger('click')
    await btn('data-sales-calculate').trigger('click')
    await flushPromises()
    const excise = select('data-keden-excise')
    expect(excise.props('value')).toBe('k1')
    expect(excise.props('options')).toEqual([{ value: 'k1', label: '300 ₸/л — вино' }, { value: 'k2', label: '600 ₸/л — игристое' }])
    excise.vm.$emit('update:value', 'k2')
    await flushPromises()
    expect(api.calculate).toHaveBeenCalledTimes(2)
    expect(api.calculate.mock.calls[1][0].goods[0].exciseKind).toBe('k2')

    const ad = select('data-keden-antidumping')
    expect((ad.props('options') as { value: string }[]).map((o) => o.value)).toEqual(['', 'a1'])
    ad.vm.$emit('update:value', 'a1')
    await flushPromises()
    expect(api.calculate).toHaveBeenCalledTimes(3)
    expect(api.calculate.mock.calls[2][0].goods[0].antiDumpingKind).toBe('a1')
    ad.vm.$emit('update:value', '')
    await flushPromises()
    expect(api.calculate.mock.calls[3][0].goods[0].antiDumpingKind).toBeNull()
  })

  it('ошибка товара — предупреждение «код или Товар: ошибка»; строки с одинаковым кодом не путаются', async () => {
    api.calculate.mockResolvedValue(RESULT([
      good({ code: '', description: '', error: 'Укажите код ТНВЭД и стоимость', exciseOptions: [], tpinTotalKzt: 0 }),
      good({ exciseOptions: [] }),
      good({ exciseOptions: [], tpinTotalKzt: 1 }),
    ]))
    await mountCalc()
    await btn('data-sales-calculate').trigger('click')
    await flushPromises()
    expect(w.findAll('[data-sales-goods-error]').map((a) => a.text())).toEqual(['Товар: Укажите код ТНВЭД и стоимость'])
    expect(w.findAll('[data-result-cell="tpin"]').map((c) => c.text())).toEqual(['0', '276 800', '1'].map((s) => s.replace(' ', ' ')))
  })

  it('ошибка расчёта — тост, прежний результат остаётся', async () => {
    api.calculate.mockRejectedValueOnce(new Error('x'))
    await mountCalc()
    await btn('data-sales-calculate').trigger('click')
    await flushPromises()
    expect(api.toast.error).toHaveBeenCalledWith('Ошибка расчёта')
    expect(w.find('[data-sum-grand]').exists()).toBe(false)
  })

  it('справочник ТН ВЭД возвращает код в строку, название — если пусто, единица — по коду', async () => {
    await mountCalc()
    await btn('data-sales-add-goods').trigger('click')
    await btn('data-sales-add-goods').trigger('click')
    input('data-goods-code').vm.$emit('update:value', '847130')
    await flushPromises()
    await w.findAll('[data-goods-picker]')[0].trigger('click')
    expect(w.get('[data-picker]').attributes('data-query')).toBe('847130')
    await w.get('[data-picker-choose]').trigger('click')
    await flushPromises()
    const codes = w.findAll('[data-goods-code]').map((i) => (i.element as HTMLInputElement).value)
    expect(codes).toEqual(['8471300000', ''])
    expect((w.findAll('[data-goods-desc]')[0].element as HTMLInputElement).value).toBe('Машины вычислительные')
    expect(api.node).toHaveBeenCalledWith('8471300000')
    expect((w.findAll('[data-goods-unit]')[0].element as HTMLInputElement).value).toBe('шт')
  })

  it('единица по коду на blur — только если пусто', async () => {
    await mountCalc()
    await btn('data-sales-add-goods').trigger('click')
    const code = input('data-goods-code')
    code.vm.$emit('update:value', '8471300000')
    code.vm.$emit('blur', new FocusEvent('blur'))
    await flushPromises()
    expect(api.node).toHaveBeenCalledTimes(1)
    expect((w.get('[data-goods-unit]').element as HTMLInputElement).value).toBe('шт')
    code.vm.$emit('blur', new FocusEvent('blur'))
    await flushPromises()
    expect(api.node).toHaveBeenCalledTimes(1)
  })
})
