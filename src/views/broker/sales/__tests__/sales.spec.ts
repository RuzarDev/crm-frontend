import { describe, expect, it } from 'vitest'
import type { SalesCalcGoodsResult, SalesQuoteListItem } from '@/api/sales'
import {
  activeServices, antiDumpingChoices, buildPayload, exciseChoices, filterQuotes, formatRate, goodsErrorText, hasAntiDumping,
  hasKedenBlock, isStale, payloadKey, quoteNumber, quoteStatusKey, quoteTone, seesAllQuotes, serviceLineTotal, tpinBreakdown,
  type GoodsRow, type ServiceRow,
} from '../sales'
import { formatAmount } from '@/ui/number'

const t = (k: string, p?: Record<string, unknown>) => (p ? `${k}${JSON.stringify(p)}` : k)
const nb = (s: string) => s.replace(/ /g, ' ')

const svc = (o: Partial<ServiceRow> = {}): ServiceRow => ({ _k: 1, name: 'Оформление ДТ', unit: 'за ДТ', unitPrice: 45000, quantity: 1, discountPercent: 0, ...o })
const goods = (o: Partial<GoodsRow> = {}): GoodsRow => ({ _k: 2, description: 'Ноутбуки', code: '8471300000', customsValue: 25000, currencyCode: 'USD', weightKg: null, unit: '', ...o })
const res = (o: Partial<SalesCalcGoodsResult> = {}): SalesCalcGoodsResult => ({
  description: 'Ноутбуки', code: '8471300000', codeName: null, customsValueKzt: 12_000_000, importDutyKzt: 0, exciseKzt: 0,
  customsFeeKzt: 20000, vatKzt: 1_488_810, tpinTotalKzt: 1_508_810, error: null, ...o,
})

describe('строки расчёта', () => {
  it('сумма строки услуги — как на сервере: цена × кол-во × (1 − скидка), до копеек', () => {
    expect(serviceLineTotal(svc())).toBe(45000)
    expect(serviceLineTotal(svc({ unitPrice: 3000, quantity: 4 }))).toBe(12000)
    expect(serviceLineTotal(svc({ unitPrice: 25000, discountPercent: 10 }))).toBe(22500)
    expect(serviceLineTotal(svc({ unitPrice: 333.33, quantity: 3, discountPercent: 15 }))).toBe(849.99)
    expect(serviceLineTotal(svc({ unitPrice: 0 }))).toBe(0)
  })

  it('тело запроса — без служебного _k, остальные поля как есть', () => {
    const p = buildPayload([svc()], [goods({ originCountry: '156', exciseKind: 'k1', antiDumpingKind: null })])
    expect(p).toEqual({
      services: [{ name: 'Оформление ДТ', unit: 'за ДТ', unitPrice: 45000, quantity: 1, discountPercent: 0 }],
      goods: [{ description: 'Ноутбуки', code: '8471300000', customsValue: 25000, currencyCode: 'USD', weightKg: null, unit: '', originCountry: '156', exciseKind: 'k1', antiDumpingKind: null }],
    })
    expect(JSON.stringify(p)).not.toContain('_k')
  })

  it('устаревший результат: строки изменились после расчёта; без расчёта — не устарел', () => {
    const lines = [svc()]
    const before = payloadKey(buildPayload(lines, []))
    expect(isStale(null, before)).toBe(false)
    expect(isStale(before, before)).toBe(false)
    lines[0].quantity = 2
    expect(isStale(before, payloadKey(buildPayload(lines, [])))).toBe(true)
    // Ключ строки (_k) в отпечаток не входит: пересоздание строк с теми же данными — не изменение.
    expect(isStale(before, payloadKey(buildPayload([svc({ _k: 99 })], [])))).toBe(false)
  })

  it('прайс — только действующие услуги', () => {
    const list = [
      { id: 'a', name: 'A', unit: 'шт', price: 1, sortOrder: 1, isActive: true },
      { id: 'b', name: 'B', unit: 'шт', price: 1, sortOrder: 2, isActive: false },
    ]
    expect(activeServices(list).map((s) => s.id)).toEqual(['a'])
  })
})

describe('итог и товары', () => {
  it('расшифровка платежей — суммы по товарам; антидемпинг', () => {
    const goodsRes = [res({ importDutyKzt: 165180, antiDumpingKzt: 0 }), res({ importDutyKzt: 100, exciseKzt: 50, vatKzt: 10, customsFeeKzt: 5, antiDumpingKzt: 7 })]
    expect(tpinBreakdown(goodsRes)).toEqual({ duty: 165280, antiDumping: 7, excise: 50, vat: 1_488_820, fee: 20005 })
    expect(hasAntiDumping(goodsRes)).toBe(true)
    expect(hasAntiDumping([res()])).toBe(false)
  })

  it('ошибка товара: код или «Товар»', () => {
    expect(goodsErrorText({ code: '8471', error: 'Нет ставки' }, t)).toBe('8471: Нет ставки')
    expect(goodsErrorText({ code: '', error: 'Укажите код ТНВЭД и стоимость' }, t)).toBe('broker.sales.goodsFallback: Укажите код ТНВЭД и стоимость')
  })

  it('варианты КЕДЕН и признак блока', () => {
    const opt = { key: 'k1', rate: '10%', condition: 'вино', country: null, endDate: null }
    expect(exciseChoices([opt])).toEqual([{ value: 'k1', label: '10% — вино' }])
    expect(antiDumpingChoices([{ ...opt, country: 'CN' }], t)).toEqual([
      { value: '', label: 'dt.tariffAntiDumpingNone' },
      { value: 'k1', label: '10% (CN) — вино' },
    ])
    expect(hasKedenBlock(res())).toBe(false)
    expect(hasKedenBlock(res({ notes: 'ставка по стране' }))).toBe(true)
    expect(hasKedenBlock(res({ exciseOptions: [opt] }))).toBe(false)
    expect(hasKedenBlock(res({ exciseOptions: [opt, opt] }))).toBe(true)
    expect(hasKedenBlock(res({ antiDumpingOptions: [opt] }))).toBe(true)
  })

  it('числа: сумма без знака валюты, курс до двух знаков', () => {
    expect(nb(formatAmount(1521300))).toBe('1 521 300')
    expect(formatAmount(undefined)).toBe('0')
    expect(nb(formatRate(482.6123))).toBe('482,61')
    expect(nb(formatRate(1234.5))).toBe('1 234,5')
  })
})

describe('КП', () => {
  const q = (o: Partial<SalesQuoteListItem>): SalesQuoteListItem => ({
    id: 'q', number: '0037', year: 2026, clientName: 'ТОО «Казахмыс Трейд»', status: 0, grandTotal: 1, createdByName: 'mpp', createdAtUtc: '2026-10-08T05:00:00Z', ...o,
  })
  const tt = (k: string, p?: Record<string, unknown>) => (k === 'sales.kpNumber' ? `${p!.n}/КП/${p!.y}` : k)

  it('статус: тон и подпись; неизвестный — пусто', () => {
    expect([0, 1, 2, 3].map(quoteTone)).toEqual(['neutral', 'info', 'done', 'danger'])
    expect(quoteTone(9)).toBe('neutral')
    expect(quoteStatusKey(2)).toBe('enum.salesQuoteStatus.accepted')
    expect(quoteStatusKey(9)).toBe('')
  })

  it('поиск по клиенту и номеру, фильтр статуса', () => {
    const rows = [q({ id: 'a' }), q({ id: 'b', number: '0036', clientName: 'ТОО «Altyn Med»', status: 2 })]
    expect(quoteNumber(rows[0], tt)).toBe('0037/КП/2026')
    expect(filterQuotes(rows, 'altyn', null, tt).map((r) => r.id)).toEqual(['b'])
    expect(filterQuotes(rows, '0037/2026', null, tt).map((r) => r.id)).toEqual(['a'])
    expect(filterQuotes(rows, '0036/КП', null, tt).map((r) => r.id)).toEqual(['b'])
    expect(filterQuotes(rows, '', 2, tt).map((r) => r.id)).toEqual(['b'])
    expect(filterQuotes(rows, 'altyn', 0, tt)).toEqual([])
  })

  it('все КП — администратору и руководителю отдела', () => {
    expect(seesAllQuotes(' Administrator ', false)).toBe(true)
    expect(seesAllQuotes('broker', true)).toBe(true)
    expect(seesAllQuotes('broker', false)).toBe(false)
    expect(seesAllQuotes(null, false)).toBe(false)
  })
})
