import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import type { Import40CalculatePaymentsResponse } from '@/api/import40'
import { emptyDtForm, type DtFormState } from '../../dtPayload'
import { applyGoodsPaymentRows, isCalculatedTaxMode } from '../paymentRows'

// Перенос из useDtPayments (волна 6в): правила гр. 47 — один в один.
const goods = (o: Record<string, unknown> = {}) => ({
  tnvedCode: '8471300000', customsValue: 100, currency: 'USD', netWeightKg: 1, payments: [], ...o,
})
const calc = (rows: Import40CalculatePaymentsResponse['goodsRows']): Import40CalculatePaymentsResponse =>
  ({ goodsRows: rows, totalsByTaxMode: { 1010: 5, 5060: 7 } } as unknown as Import40CalculatePaymentsResponse)

describe('paymentRows: строки гр. 47 из расчёта', () => {
  it('расчётные виды: 1010, 2010, 2050, 5060 и любой акциз 4xxx', () => {
    expect(['1010', '2010', '2050', '5060', '4420', '4400', '4010'].every(isCalculatedTaxMode)).toBe(true)
    expect(['9999', '6010', '44200', '401', ''].some(isCalculatedTaxMode)).toBe(false)
  })

  it('обновить по виду, добавить новые, убрать устаревшие расчётные, ручной вид ставки не трогать', () => {
    const form = reactive(emptyDtForm()) as DtFormState
    form.goodsItems = [goods({
      payments: [
        { taxModeCode: '2010', rateKindCode: '*', amountKzt: 1 },
        { taxModeCode: '4420', amountKzt: 9 }, // акциз больше не считается — уходит
        { taxModeCode: '9999', amountKzt: 3 }, // не расчётный — остаётся
      ],
    })] as never
    applyGoodsPaymentRows(form, calc([{ index: 0, rows: [
      { taxModeCode: '2010', base: 100, rate: 10, amount: 10 },
      { taxModeCode: '5060', base: 110, rate: 12, amount: 13.2 },
    ] } as never]))
    const p = form.goodsItems[0].payments!
    expect(p.map((x) => x.taxModeCode)).toEqual(['2010', '9999', '5060'])
    expect(p[0]).toMatchObject({ amountKzt: 10, rateKindCode: '*', paymentFeatureCode: 'ИУ' })
    expect(p[2]).toMatchObject({ amountKzt: 13.2, rateKindCode: '%', rateDate: null, weightRatio: null })
  })

  it('вид ставки с сервера (rateKind) — вместе с единицей, валютой и коэффициентом', () => {
    const form = reactive(emptyDtForm()) as DtFormState
    form.goodsItems = [goods({ payments: [{ taxModeCode: '2010', rateKindCode: '%', amountKzt: 1, paymentFeatureCode: 'УН' }] })] as never
    applyGoodsPaymentRows(form, calc([{ index: 0, rows: [
      { taxModeCode: '2010', base: 5, rate: 0.5, amount: 2.5, rateKind: '*', rateUnitCode: '166', rateCurrencyCode: '978', bLine: '2010-2.5' },
      { taxModeCode: '4420', base: 5, rate: 1, amount: 5, rateKind: '*', rateUnitCode: '796' },
    ] } as never]))
    const [duty, excise] = form.goodsItems[0].payments!
    expect(duty).toMatchObject({ rateKindCode: '*', rateUnitCode: '166', rateCurrencyCode: '978', weightRatio: 1, paymentFeatureCode: 'УН', bLine: '2010-2.5' })
    expect(excise).toMatchObject({ rateKindCode: '*', rateUnitCode: '796', rateCurrencyCode: null, weightRatio: 1, paymentFeatureCode: 'ИУ' })
  })

  it('снимает «Пересчитать» у посчитанных товаров; у товара с ошибкой и не попавшего в расчёт — нет', () => {
    const form = reactive(emptyDtForm()) as DtFormState
    form.goodsItems = [goods({ needsTpinRecalc: true }), goods({ needsTpinRecalc: true }), goods({ needsTpinRecalc: true })] as never
    const [a, b, c] = form.goodsItems
    applyGoodsPaymentRows(form, calc([
      { index: 0, rows: [{ taxModeCode: '1010', amount: 5 }] } as never,
      { index: 1, rows: [], error: 'нет ставки' } as never,
    ]))
    expect([a, b, c].map((g) => g.needsTpinRecalc)).toEqual([false, true, true])
  })

  it('пишет в те же товары и тот же массив (ключ товара и открытый товар не теряются, волна 6б)', () => {
    const form = reactive(emptyDtForm()) as DtFormState
    form.goodsItems = [goods(), goods()] as never
    const list = form.goodsItems
    const [a, b] = list
    applyGoodsPaymentRows(form, calc([{ index: 1, rows: [{ taxModeCode: '1010', amount: 5 }] } as never]))
    expect(form.goodsItems).toBe(list)
    expect(form.goodsItems[0]).toBe(a)
    expect(form.goodsItems[1]).toBe(b)
    expect(b.payments?.[0]).toMatchObject({ taxModeCode: '1010', amountKzt: 5 })
  })
})
