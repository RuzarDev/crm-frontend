import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { TnvedCalculateResult } from '@/types/api'

// Калькулятор платежей: общее для клиента и сотрудника (extended) — выбор вида акциза и антидемпинга
// с пересчётом, объём двигателя при ставке в см³, пояснение расчёта; сотруднику — количество и дата.
const api = vi.hoisted(() => ({ calculate: vi.fn(), currencies: vi.fn() }))
vi.mock('@/api/tnved', () => ({ tnvedApi: api }))
vi.mock('@/api/references', () => ({ referencesApi: { listCountries: vi.fn().mockResolvedValue([]) } }))

import TnvedCalculator from '../TnvedCalculator.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import { resetCurrenciesCache } from '../currency'

const RESULT = (o: Partial<TnvedCalculateResult> = {}): TnvedCalculateResult => ({
  code: '8703231981', codeName: null, rateStr: '15%', customsValueKzt: 5_000_000, importDutyKzt: 750_000, customsFeeKzt: 20_000,
  exciseKzt: 0, vatKzt: 920_000, totalKzt: 1_690_000, notes: null, explanation: null, nonTariffMeasures: [],
  antiDumpingKzt: 0, exciseOptions: [], antiDumpingOptions: [], ...o,
})

let w: VueWrapper
const mountCalc = async (props: Record<string, unknown>) => {
  w = mountWithI18n(TnvedCalculator, { props: { code: '8703231981', ...props }, attachTo: document.body })
  await flushPromises()
}
const submit = async (value = '10000') => {
  await w.get('[data-calc-value]').setValue(value)
  await w.get('form').trigger('submit')
  await flushPromises()
}
const selectByAttr = (attr: string) => w.findAllComponents(ZSelect).find((c) => attr in c.vm.$attrs)!

beforeEach(() => {
  resetCurrenciesCache()
  api.currencies.mockResolvedValue({ data: [{ codeLat: 'USD', name: 'Доллар США', rate: 478.32, updatedAtUtc: '' }] })
  api.calculate.mockResolvedValue({ data: RESULT() })
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('TnvedCalculator', () => {
  it('клиенту: без количества и даты; объём двигателя — только при ставке в см³', async () => {
    await mountCalc({ rateText: '15%' })
    expect(w.find('[data-calc-quantity]').exists()).toBe(false)
    expect(w.find('[data-calc-date]').exists()).toBe(false)
    expect(w.find('[data-calc-engine]').exists()).toBe(false)
    // подсказка суммы — с десятичным знаком языка интерфейса (как и само число вне фокуса)
    expect(w.get('[data-calc-value]').attributes('placeholder')).toBe('0,00')
    await w.setProps({ rateText: '15%, но не менее 0,6 евро за 1 см3 объёма двигателя' })
    expect(w.find('[data-calc-engine]').exists()).toBe(true)
    await w.get('[data-calc-engine]').setValue('1998')
    await submit()
    expect(api.calculate.mock.calls[0][0]).toMatchObject({ engineVolumeCm3: 1998 })
    expect(api.calculate.mock.calls[0][0].quantity).toBeUndefined()
  })

  it('сотруднику (extended): количество, дата и курс у валюты уходят в расчёт; пояснение — «ставки на дату»', async () => {
    await mountCalc({ extended: true, unit: 'шт' })
    expect(w.text()).toContain('Количество, шт')
    expect(selectByAttr('data-calc-currency').props('options')).toContainEqual({ value: 'USD', label: 'USD · 478,32' })
    await w.get('[data-calc-quantity]').setValue('120')
    await submit('25000')
    expect(api.calculate).toHaveBeenCalledWith(expect.objectContaining({ quantity: 120, customsValue: 25000 }), { silent: true })
    expect(w.get('[data-calc-disclaimer]').text()).toContain('Ставки — на выбранную дату')
  })

  it('варианты акциза и антидемпинга из ответа — выбор пересчитывает с exciseKind / antiDumpingKind', async () => {
    api.calculate.mockResolvedValue({ data: RESULT({
      exciseKind: 'a', exciseKzt: 100,
      exciseOptions: [{ key: 'a', rate: '10%', condition: 'бензин', country: null, endDate: null }, { key: 'b', rate: '20%', condition: 'дизель', country: null, endDate: null }],
      antiDumpingOptions: [{ key: 'ad1', rate: '18%', condition: 'производитель X', country: 'CN', endDate: null }],
      explanation: 'Пошлина: 15% от таможенной стоимости',
    }) })
    await mountCalc({})
    await submit()
    const excise = selectByAttr('data-calc-excise-kind')
    expect(excise.props('options')).toEqual([{ value: 'a', label: '10% — бензин' }, { value: 'b', label: '20% — дизель' }])
    expect(excise.props('value')).toBe('a')
    excise.vm.$emit('update:value', 'b')
    await flushPromises()
    expect(api.calculate).toHaveBeenLastCalledWith(expect.objectContaining({ exciseKind: 'b' }), { silent: true })

    const ad = selectByAttr('data-calc-antidumping-kind')
    expect(ad.props('options')).toEqual([{ value: '', label: 'Не применять' }, { value: 'ad1', label: '18% (CN) — производитель X' }])
    ad.vm.$emit('update:value', 'ad1')
    await flushPromises()
    expect(api.calculate).toHaveBeenLastCalledWith(expect.objectContaining({ exciseKind: 'b', antiDumpingKind: 'ad1' }), { silent: true })
    expect(w.get('[data-calc-explanation]').text()).toContain('Пошлина: 15% от таможенной стоимости')

    // Другой код — виды сброшены.
    await w.setProps({ code: '8703231982' })
    await submit()
    const req = api.calculate.mock.calls.at(-1)![0]
    expect(req.exciseKind).toBeUndefined()
    expect(req.antiDumpingKind).toBeUndefined()
  })

  it('один вариант акциза — без выбора', async () => {
    api.calculate.mockResolvedValue({ data: RESULT({ exciseOptions: [{ key: 'a', rate: '10%', condition: null, country: null, endDate: null }] }) })
    await mountCalc({})
    await submit()
    expect(w.find('[data-calc-kinds]').exists()).toBe(false)
  })
})
