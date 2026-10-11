import { describe, expect, it } from 'vitest'
import type { Import40CalculatePaymentsResponse } from '@/api/import40'
import type { Import40GoodsItemInput } from '@/types/api'
import { formatBasisLabel } from '../../goods/editor/payments'
import { isMedical, noteLines, paymentsGoodsEntries, previewLines, savedLines, staleGoodsIndexes } from '../paymentsView'

const g = (o: Partial<Import40GoodsItemInput> = {}) => ({ payments: [], needsTpinRecalc: false, ...o }) as unknown as Import40GoodsItemInput
const pay = (code: string, amount: number, o: Record<string, unknown> = {}) => ({ taxModeCode: code, amountKzt: amount, ...o }) as never
const res = (rows: unknown[]) => ({ goodsRows: rows, totalsByTaxMode: {}, grandTotalB: 0 }) as unknown as Import40CalculatePaymentsResponse

describe('paymentsGoodsEntries', () => {
  it('без предпросмотра замечание — устаревшие платежи («Пересчитать» или нет гр. 47)', () => {
    const goods = [g({ payments: [pay('1010', 1)] }), g({ payments: [pay('1010', 1)], needsTpinRecalc: true }), g()]
    expect(paymentsGoodsEntries(goods, null).map((e) => [e.index, e.issue, e.calc, e.notRecalculated])).toEqual([
      [0, false, null, false], [1, true, null, false], [2, true, null, false],
    ])
    expect(staleGoodsIndexes(goods)).toEqual([1, 2])
  })

  it('с предпросмотром замечание — ошибка, примечание или товара нет в ответе', () => {
    const goods = [g(), g(), g(), g()]
    const e = paymentsGoodsEntries(goods, res([
      { index: 0, rows: [] },
      { index: 1, rows: [], error: 'Нет кода' },
      { index: 2, rows: [], notes: 'акциз по умолчанию' },
    ]))
    expect(e.map((x) => [x.index, x.issue, x.notRecalculated, x.calc?.index ?? null])).toEqual([
      [0, false, false, 0], [1, true, true, 1], [2, true, false, 2], [3, true, true, null],
    ])
  })
})

describe('строки карточки', () => {
  it('записанные — в порядке 1010 → 2010 → 5060 → прочие, подписи расчёта', () => {
    const lines = savedLines([pay('4420', 4), pay('5060', 3, { basisLabel: ' 100 ' }), pay('1010', 1)])
    expect(lines.map((l) => [l.code, l.amount, l.basisLabel, l.fresh])).toEqual([['1010', 1, null, false], ['5060', 3, '100', false], ['4420', 4, null, false]])
  })

  it('предпросмотр — как запишет «Записать»: виды расчёта новые (fresh), ручной вид остаётся, устаревший расчётный уходит; форма не меняется', () => {
    const item = { payments: [pay('1010', 1), pay('4420', 9), pay('9999', 5)] }
    const before = JSON.stringify(item)
    const lines = previewLines(item, { index: 3, rows: [{ taxModeCode: '1010', amount: 8650 }, { taxModeCode: '5060', amount: 7, rate: 12 }], excisePossible: false })
    expect(lines.map((l) => [l.code, l.amount, l.fresh])).toEqual([['1010', 8650, true], ['5060', 7, true], ['9999', 5, false]])
    expect(lines[1].rateKind).toBe('%')
    expect(JSON.stringify(item)).toBe(before)
  })

  it('ошибка расчёта — строки товара как были', () => {
    const item = { payments: [pay('1010', 1)] }
    expect(previewLines(item, { index: 0, rows: [], excisePossible: false, error: 'x' }).map((l) => [l.code, l.fresh])).toEqual([['1010', false]])
  })

  it('(I1-A) не пересчитанный товар: строки без 1010, если «Записать» её уберёт; отметка feeDropped у таких товаров', () => {
    const goods = [g({ payments: [pay('1010', 1)] }), g({ payments: [pay('1010', 1), pay('5060', 2)] }), g({ payments: [pay('5060', 2)] }), g({ payments: [pay('1010', 1)] })]
    const e = paymentsGoodsEntries(goods, res([
      { index: 0, rows: [{ taxModeCode: '1010', amount: 3 }] },
      { index: 1, rows: [], error: 'Нет кода' },
      { index: 2, rows: [], error: 'Нет кода' },
    ]))
    expect(e.map((x) => x.feeDropped)).toEqual([false, true, false, true])
    expect(paymentsGoodsEntries(goods, null).some((x) => x.feeDropped)).toBe(false)
    expect(savedLines(goods[1].payments, true).map((l) => l.code)).toEqual(['5060'])
    expect(savedLines(goods[1].payments).map((l) => l.code)).toEqual(['1010', '5060'])
  })

  it('(m9) примечания расчёта — строками по «; », внутри скобок не делим', () => {
    expect(noteLines('Акциз взят по умолчанию; Возможна антидемпинговая пошлина (A; B) — выберите вариант;  ')).toEqual([
      'Акциз взят по умолчанию', 'Возможна антидемпинговая пошлина (A; B) — выберите вариант',
    ])
    expect(noteLines(null)).toEqual([])
    expect(noteLines('одно')).toEqual(['одно'])
  })

  it('(QA Q1) основа-число сервера — по языку интерфейса с теми же знаками; подпись с текстом — как есть', () => {
    expect(formatBasisLabel('25950.00', 'ru')).toBe('25\u00a0950,00')
    expect(formatBasisLabel('296046.44', 'en')).toBe('296,046.44')
    expect(formatBasisLabel(' 12.5 ', 'kk')).toBe('12,5')
    expect(formatBasisLabel('300', 'ru')).toBe('300')
    expect(formatBasisLabel('-1.20', 'ru')).toBe('-1,20')
    expect(formatBasisLabel('10 кг', 'ru')).toBe('10 кг')
    expect(formatBasisLabel('0.06 EUR за кг', 'ru')).toBe('0.06 EUR за кг')
  })

  it('медизделие — НДС 5%', () => {
    expect(isMedical({ vatRatePreferential: 0.05 })).toBe(true)
    expect(isMedical({ vatRatePreferential: null })).toBe(false)
  })
})
