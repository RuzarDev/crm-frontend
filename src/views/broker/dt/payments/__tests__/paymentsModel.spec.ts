import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import type { Import40FactPayment, Import40GoodsItemInput } from '@/types/api'
import {
  calcSnapshot, factVsGoodsDiff, goodsSnapshot, goodsTotalsAfterApply, grandTotal, mergeFactPayments, notRecalculatedGoods, toKopecks,
  totalsByMode, totalsRecord,
} from '../paymentsModel'

const pay = (taxModeCode: string | null, amountKzt: number | null) => ({ taxModeCode, amountKzt }) as never
const fact = (taxModeCode: string | null, amount: number | null, o: Partial<Import40FactPayment> = {}): Import40FactPayment => ({
  taxModeCode, amount, exchangeRate: 1, paymentDocDate: null, paymentDocNumber: null, payerTaxpayerId: null, paymentDate: null, paymentMethodCode: 'БН', ...o,
})

describe('totalsByMode: Σ гр. 47 по виду (как печать ДТ)', () => {
  it('сумма по видам всех товаров, порядок по коду; пустая сумма — 0; без вида — группа ""', () => {
    const goods = [
      { payments: [pay('5060', 100.25), pay('1010', 2000), pay('2010', 10)] },
      { payments: [pay('2010', 5.5), pay('5060', null), pay('4420', 7)] },
      { payments: [pay(null, 3)] },
      { payments: null },
    ]
    expect(totalsByMode(goods)).toEqual([
      { code: '', amount: 3 },
      { code: '1010', amount: 2000 },
      { code: '2010', amount: 15.5 },
      { code: '4420', amount: 7 },
      { code: '5060', amount: 100.25 },
    ])
    expect(totalsByMode([])).toEqual([])
  })

  it('(баг QA Q3) Σ по виду и итого — до копеек: шум двоичных дробей не попадает в гр. В и на экран', () => {
    // 100 000,38 + 1 009 505,76 + 200 000,33 в JS = 1309506.4700000002
    expect(100000.38 + 1009505.76 + 200000.33).not.toBe(1309506.47)
    const goods = [
      { payments: [pay('5060', 100000.38), pay('1010', 0.1)] },
      { payments: [pay('5060', 1009505.76), pay('1010', 0.2)] },
      { payments: [pay('5060', 200000.33)] },
    ]
    const totals = totalsByMode(goods)
    expect(totals).toEqual([{ code: '1010', amount: 0.3 }, { code: '5060', amount: 1309506.47 }])
    expect(grandTotal(totals)).toBe(1309506.77)
    expect(toKopecks(-0.001)).toBe(0)
    expect(Object.is(toKopecks(-0.001), -0)).toBe(false)
    expect(toKopecks(2.675)).toBe(2.68)
  })
})

describe('mergeFactPayments: расчёт → гр. В', () => {
  it('нет строки вида — добавить в конец (курс 1, «БН», прочее пусто); одна — заменить сумму; прочие — как были', () => {
    const own = fact('6010', 50, { payerTaxpayerId: '123456789012' })
    const vat = fact('5060', 1, { paymentDocDate: '2026-10-09', paymentDocNumber: '490380', paymentMethodCode: 'ПП' })
    const before = [own, vat]
    const res = mergeFactPayments(before, { 1010: 8650, 5060: 120000 })
    expect(res.rows).toEqual([
      own,
      { ...vat, amount: 120000 },
      { taxModeCode: '1010', amount: 8650, exchangeRate: 1, paymentDocDate: null, paymentDocNumber: null, payerTaxpayerId: null, paymentDate: null, paymentMethodCode: 'БН' },
    ])
    expect(res.rows[1].paymentDocNumber).toBe('490380') // номер платёжки при замене суммы сохраняется
    expect(res.rows[2].paymentDocNumber).toBeNull() // новая строка — без номера
    expect(res.rows[0]).toBe(own) // не тронутая строка — тот же объект
    expect(res.added).toEqual(['1010'])
    expect(res.updated).toEqual(['5060'])
    expect(res.multiple).toEqual([])
    // исходный массив и строки не меняются
    expect(before).toEqual([own, vat])
    expect(vat.amount).toBe(1)
  })

  it('несколько строк одного вида (несколько платёжек) — не трогать и предупредить (сумма не удваивается, §5-10)', () => {
    const a = fact('5060', 60000)
    const b = fact('5060', 40000)
    const res = mergeFactPayments([a, b], { 5060: 120000 })
    expect(res.rows).toEqual([a, b])
    expect(res.multiple).toEqual(['5060'])
    expect(res.updated).toEqual([])
  })

  it('(баг §5-10) рассчитываемые виды, которых больше нет в расчёте, удаляются (все строки); прочие и без вида — остаются', () => {
    const own = fact('6010', 2)
    const blank = fact(null, 3)
    const res = mergeFactPayments(
      [fact('4420', 9), fact('5060', 1), own, fact('2050', 4), fact('2050', 1), blank],
      { 4400: 5, 5060: 7 },
    )
    expect(res.rows.map((r) => [r.taxModeCode, r.amount])).toEqual([['5060', 7], ['6010', 2], [null, 3], ['4400', 5]])
    expect(res.rows[1]).toBe(own)
    expect(res.rows[2]).toBe(blank)
    expect(res.removed).toEqual(['4420', '2050'])
    expect(res.added).toEqual(['4400'])
  })

  it('пустая гр. В — строки в порядке видов', () => {
    const res = mergeFactPayments([], { 5060: 7, 1010: 5 })
    expect(res.rows.map((r) => [r.taxModeCode, r.amount])).toEqual([['1010', 5], ['5060', 7]])
  })
})

describe('factVsGoodsDiff: сверка гр. 47 ↔ гр. В', () => {
  it('расхождение по виду, вид только с одной стороны; несколько строк гр. В складываются; меньше копейки — не расхождение', () => {
    const form = {
      goodsItems: [{ payments: [pay('1010', 8650), pay('5060', 100)] }, { payments: [pay('5060', 50.004), pay('2010', 10)] }] as never,
      factPayments: [fact('1010', 8650), fact('5060', 100), fact('5060', 50), fact('4420', 3), fact(null, 9)],
    }
    expect(factVsGoodsDiff(form)).toEqual([
      { code: '2010', goods: 10, fact: 0 },
      { code: '4420', goods: 0, fact: 3 },
    ])
  })

  it('(баг QA Q3) обе стороны — до копеек: шум сложения не даёт ложного «расходится», суммы в строке точные', () => {
    const form = {
      goodsItems: [{ payments: [pay('5060', 100000.38)] }, { payments: [pay('5060', 1009505.76)] }, { payments: [pay('5060', 200000.33), pay('1010', 1)] }] as never,
      factPayments: [fact('5060', 0.1), fact('5060', 0.2), fact('5060', 1309506.17), fact('1010', 0.1), fact('1010', 0.2)],
    }
    expect(factVsGoodsDiff(form)).toEqual([{ code: '1010', goods: 1, fact: 0.3 }])
  })

  it('совпадает — пусто', () => {
    expect(factVsGoodsDiff({ goodsItems: [{ payments: [pay('1010', 5)] }] as never, factPayments: [fact('1010', 5)] })).toEqual([])
    expect(factVsGoodsDiff({ goodsItems: [], factPayments: [] })).toEqual([])
  })
})

describe('goodsSnapshot: снимок товаров для предпросмотра', () => {
  const item = (o: Partial<Import40GoodsItemInput> = {}) => reactive({ tnvedCode: '8471300000', customsValue: 100, payments: [], description: 'A', ...o }) as Import40GoodsItemInput

  it('меняется от состава, порядка, полей расчёта и строк гр. 47; не меняется от описания и «Пересчитать»', () => {
    const a = item()
    const b = item()
    const base = goodsSnapshot([a, b])
    expect(goodsSnapshot([a, b])).toBe(base)
    expect(goodsSnapshot([b, a])).not.toBe(base) // порядок
    expect(goodsSnapshot([a])).not.toBe(base) // состав
    expect(goodsSnapshot([a, item()])).not.toBe(base) // другой товар с теми же данными
    a.description = 'B'
    a.needsTpinRecalc = true
    expect(goodsSnapshot([a, b])).toBe(base)
    a.vatRatePreferential = 0.05 // «Медизделие — НДС 5%»
    expect(goodsSnapshot([a, b])).not.toBe(base)
    a.vatRatePreferential = null
    expect(goodsSnapshot([a, b])).toBe(base)
    a.payments = [pay('2010', 1)]
    expect(goodsSnapshot([a, b])).not.toBe(base)
  })
})

describe('Σ гр. 47 после «Записать» (основа гр. В)', () => {
  const res = {
    goodsRows: [
      { index: 0, rows: [{ taxModeCode: '1010', amount: 5 }, { taxModeCode: '5060', amount: 4 }] },
      { index: 1, rows: [], error: 'Нет кода ТН ВЭД' },
    ],
    totalsByTaxMode: { 1010: 5, 5060: 4 },
    grandTotalB: 9,
  } as never

  it('посчитанные товары — строки расчёта (устаревшие расчётные уходят); товар с ошибкой — свои строки; форма не меняется', () => {
    const goods = [
      { payments: [pay('2010', 7), pay('6010', 1)] },
      { payments: [pay('4420', 9), pay('5060', 2)] },
    ]
    expect(goodsTotalsAfterApply(goods, res)).toEqual([
      { code: '1010', amount: 5 }, { code: '4420', amount: 9 }, { code: '5060', amount: 6 }, { code: '6010', amount: 1 },
    ])
    expect(goods[0].payments.map((p: { taxModeCode: string }) => p.taxModeCode)).toEqual(['2010', '6010'])
  })

  it('(баг I1) сбор 1010 — один на ДТ: у товара с ошибкой его строка 1010 уходит, прочие строки остаются (3 × 8 650, ошибка у 2-го → Σ 25 950)', () => {
    const goods = [
      { payments: [pay('1010', 8650), pay('5060', 100)] },
      { payments: [pay('1010', 8650), pay('5060', 200)] },
      { payments: [pay('1010', 8650), pay('5060', 300)] },
    ]
    const calc = {
      goodsRows: [
        { index: 0, rows: [{ taxModeCode: '1010', amount: 12975 }, { taxModeCode: '5060', amount: 110 }] },
        { index: 1, rows: [], error: 'Нет кода ТН ВЭД' },
        { index: 2, rows: [{ taxModeCode: '1010', amount: 12975 }, { taxModeCode: '5060', amount: 330 }] },
      ],
      totalsByTaxMode: { 1010: 25950, 5060: 440 },
      grandTotalB: 26390,
    } as never
    // без исключения было бы 12 975 + 8 650 + 12 975 = 34 600 — сбор дважды в гр. В, XML и печати
    expect(goodsTotalsAfterApply(goods, calc)).toEqual([{ code: '1010', amount: 25950 }, { code: '5060', amount: 640 }])
    expect(goods[1].payments.map((p: { taxModeCode: string }) => p.taxModeCode)).toEqual(['1010', '5060']) // форма не тронута
    // расчёт не распределил сбор (ни один товар не посчитан) — строки 1010 остаются
    const none = { goodsRows: [{ index: 0, rows: [], error: 'x' }, { index: 1, rows: [], error: 'x' }, { index: 2, rows: [], error: 'x' }], totalsByTaxMode: {}, grandTotalB: 0 } as never
    expect(goodsTotalsAfterApply(goods, none)).toEqual([{ code: '1010', amount: 25950 }, { code: '5060', amount: 600 }])
  })

  it('не пересчитаны: ошибка расчёта или товара нет в ответе', () => {
    expect(notRecalculatedGoods(3, res)).toEqual([1, 2])
  })

  it('итоги → { вид: сумма } без строк без вида', () => {
    expect(totalsRecord([{ code: '', amount: 3 }, { code: '1010', amount: 5 }])).toEqual({ 1010: 5 })
  })
})

describe('calcSnapshot: товары и графы шапки расчёта', () => {
  it('дата гр. А и ЕТТ/ВТО меняют снимок; прочие графы шапки — нет', () => {
    const form = reactive({ goodsItems: [{ tnvedCode: '1', payments: [] }], submissionDate: '2026-10-05', rateType: 'ETT', declarationNumber: 'x' }) as never as Parameters<typeof calcSnapshot>[0] & { declarationNumber: string }
    const base = calcSnapshot(form)
    form.declarationNumber = 'y'
    expect(calcSnapshot(form)).toBe(base)
    form.submissionDate = '2026-10-06'
    expect(calcSnapshot(form)).not.toBe(base)
    form.submissionDate = '2026-10-05'
    form.rateType = 'EATT'
    expect(calcSnapshot(form)).not.toBe(base)
  })
})
