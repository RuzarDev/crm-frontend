import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, ref, type EffectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'

const api = vi.hoisted(() => ({ ratesOnDate: vi.fn() }))
vi.mock('@/api/import40', () => ({ import40Api: api }))
const tnved = vi.hoisted(() => ({ currencies: vi.fn() }))
vi.mock('@/api/tnved', () => ({ tnvedApi: tnved }))

import { useDtRates, type DtRatesForm } from '../useDtRates'

let scope: EffectScope
const deferred = <T>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

const start = (init: Partial<DtRatesForm> = {}) => {
  scope = effectScope()
  const form = reactive<DtRatesForm>({ submissionDate: null, currency: '', exchangeRate: null, goodsItems: [], expenses: [], ...init })
  const applying = ref(false)
  const r = scope.run(() => useDtRates(form, { applying: () => applying.value }))!
  return { form, applying, r }
}

/** Загрузка ДТ: поля ставятся под флагом applying, флаг снимается после nextTick (как useDtForm). */
const load = async (form: DtRatesForm, applying: { value: boolean }, values: Partial<DtRatesForm>) => {
  applying.value = true
  Object.assign(form, values)
  await nextTick()
  applying.value = false
  await flushPromises()
}

beforeEach(() => {
  tnved.currencies.mockResolvedValue({
    data: [
      { codeLat: 'USD', name: 'Доллар США', rate: 500, updatedAtUtc: '2026-10-09T00:00:00Z' },
      { codeLat: 'EUR', name: 'Евро', rate: 550, updatedAtUtc: '2026-10-09T00:00:00Z' },
      { codeLat: 'CNY', name: 'Юань', rate: 70, updatedAtUtc: '2026-10-09T00:00:00Z' },
    ],
  })
  api.ratesOnDate.mockImplementation(async (date: string, codes: string[]) => ({
    date,
    official: true,
    rates: Object.fromEntries(codes.map((c) => [c, date === '2026-10-01' ? 480 : 490])),
  }))
})
afterEach(() => {
  scope?.stop()
  vi.clearAllMocks()
})

describe('useDtRates — справочник валют НБ РК', () => {
  it('loadCurrencies: варианты «USD / 840 — Доллар США» и текущие курсы, KZT = 1', async () => {
    const { r } = start()
    await r.loadCurrencies()
    expect(r.currencyOptions.value[0]).toEqual({ value: 'USD', label: 'USD / 840 — Доллар США' })
    expect(r.rates.value.KZT.rate).toBe(1)
    expect(r.rates.value.USD.rate).toBe(500)
  })

  it('сбой справочника — без исключения, курсов нет', async () => {
    tnved.currencies.mockRejectedValueOnce(new Error('x'))
    const { r } = start()
    await r.loadCurrencies()
    expect(r.currencyOptions.value).toEqual([])
    expect(r.rates.value).toEqual({})
  })
})

describe('useDtRates — курсы на дату гр.А', () => {
  it('запрашивает курсы на дату гр.А по валютам ДТ (USD, EUR, гр.22, товары, расходы; без KZT) поверх текущих', async () => {
    const { form, applying, r } = start()
    await r.loadCurrencies()
    await load(form, applying, {
      submissionDate: '2026-10-05T00:00:00Z',
      currency: 'cny',
      exchangeRate: 70,
      goodsItems: [{ currency: 'RUB' }, { currency: 'KZT' }],
      expenses: [{ currencyCode: 'TRY' }],
    })
    expect(api.ratesOnDate).toHaveBeenLastCalledWith('2026-10-05', ['CNY', 'EUR', 'RUB', 'TRY', 'USD'])
    expect(r.rates.value.USD).toEqual({ rate: 490, date: '2026-10-05' })
    expect(r.rates.value.KZT.rate).toBe(1)
    expect(r.usdRate.value).toBe(490)
    expect(r.official.value).toBe(true)
    expect(r.nbUnavailable.value).toBe(false)
  })

  it('при загрузке гр.23 не трогается — только расхождение и «Подставить»', async () => {
    const { form, applying, r } = start()
    await load(form, applying, { submissionDate: '2026-10-05', currency: 'USD', exchangeRate: 470 })
    expect(form.exchangeRate).toBe(470)
    expect(r.dealRate.value?.rate).toBe(490)
    expect(r.rateMismatch.value).toBe(true)
    r.applyDealRate()
    expect(form.exchangeRate).toBe(490)
    expect(r.rateMismatch.value).toBe(false)
  })

  it('смена даты пользователем → гр.23 следует за курсом валюты сделки на новую дату', async () => {
    const { form, applying } = start()
    await load(form, applying, { submissionDate: '2026-10-05', currency: 'USD', exchangeRate: 490 })
    form.submissionDate = '2026-10-01'
    await flushPromises()
    expect(api.ratesOnDate).toHaveBeenLastCalledWith('2026-10-01', ['EUR', 'USD'])
    expect(form.exchangeRate).toBe(480)
  })

  it('смена только набора валют — гр.23 не трогается', async () => {
    const { form, applying } = start()
    await load(form, applying, { submissionDate: '2026-10-05', currency: 'USD', exchangeRate: 1 })
    form.expenses = [{ currencyCode: 'CNY' }]
    await flushPromises()
    expect(api.ratesOnDate).toHaveBeenLastCalledWith('2026-10-05', ['CNY', 'EUR', 'USD'])
    expect(form.exchangeRate).toBe(1)
  })

  it('official=false → признак «НБ РК недоступен»', async () => {
    api.ratesOnDate.mockResolvedValueOnce({ date: '2026-10-05', official: false, rates: { USD: 500 } })
    const { form, applying, r } = start()
    await load(form, applying, { submissionDate: '2026-10-05' })
    expect(r.official.value).toBe(false)
    expect(r.nbUnavailable.value).toBe(true)
  })

  it('без даты гр.А — текущие курсы, без запроса', async () => {
    const { form, applying, r } = start()
    await r.loadCurrencies()
    await load(form, applying, { currency: 'USD' })
    expect(api.ratesOnDate).not.toHaveBeenCalled()
    expect(r.rates.value.USD.rate).toBe(500)
    expect(r.official.value).toBe(true)
  })

  it('ответ на прежнюю дату, пришедший позже, отбрасывается', async () => {
    const first = deferred<unknown>()
    api.ratesOnDate.mockImplementationOnce(() => first.promise)
    const { form, applying, r } = start()
    await load(form, applying, { submissionDate: '2026-10-05', currency: 'USD', exchangeRate: 1 })
    form.submissionDate = '2026-10-01'
    await flushPromises()
    expect(form.exchangeRate).toBe(480)
    first.resolve({ date: '2026-10-05', official: false, rates: { USD: 999 } })
    await flushPromises()
    expect(form.exchangeRate).toBe(480)
    expect(r.rates.value.USD.rate).toBe(480)
    expect(r.official.value).toBe(true)
  })

  it('сбой запроса — курсы остаются, исключения нет', async () => {
    const { form, applying, r } = start()
    await load(form, applying, { submissionDate: '2026-10-05', currency: 'USD', exchangeRate: 490 })
    api.ratesOnDate.mockRejectedValueOnce(new Error('x'))
    form.submissionDate = '2026-10-01'
    await flushPromises()
    expect(form.exchangeRate).toBe(490)
    expect(r.rates.value.USD.rate).toBe(490)
  })

  it('коды для полосы курсов: USD, EUR, гр.22 и валюты расходов, без KZT и повторов', () => {
    const { r } = start({ currency: 'usd', expenses: [{ currencyCode: 'CNY' }, { currencyCode: 'KZT' }, { currencyCode: 'cny' }] })
    expect(r.boxCodes.value).toEqual(['USD', 'EUR', 'CNY'])
  })
})
