import { describe, expect, it } from 'vitest'
import { computed, reactive } from 'vue'
import type { Import40GoodsItemInput } from '@/types/api'
import { filterGoods, formatItemNumbers, goodsTotals, goodsTpin, type GoodsRow } from '../goodsList'
import type { GoodsStatus } from '../goodsStatus'

const item = (o: Partial<Import40GoodsItemInput> = {}): Import40GoodsItemInput => ({
  description: 'НОУТБУКИ', tnvedCode: '8471300000', tnvedDescription: null, countryOfOrigin: '156', quantity: 1, unit: null,
  unitCode: '796', grossWeightKg: 1, netWeightKg: 1, packagesCount: 1, quantityTypeCode: null, customsValue: 10,
  currency: 'USD', customsValueKzt: 5000, payments: [], markings: [], extras: null, ...o,
})
const indexes = (rows: GoodsRow[]) => rows.map((r) => r.index)

describe('goodsList: поиск и фильтры', () => {
  const goods = [
    item({ tnvedCode: '8471300000', description: 'НОУТБУКИ LENOVO' }),
    item({ tnvedCode: '8504403009', description: 'БЛОКИ ПИТАНИЯ', tradeMarkName: 'DELL' }),
    item({ tnvedCode: null, description: 'МЫШИ', productModelName: 'MX-3' }),
  ]
  const ready: GoodsStatus = { kind: 'ready' }
  const statusOf = (g: Import40GoodsItemInput): GoodsStatus =>
    g.tnvedCode === null ? { kind: 'missing', count: 2 } : g.tradeMarkName ? { kind: 'stale' } : ready

  it('без запроса и фильтра — все строки с позицией и ключом', () => {
    const rows = filterGoods(goods, { query: '', filter: null, statusOf })
    expect(indexes(rows)).toEqual([0, 1, 2])
    expect(rows[0].item).toBe(goods[0])
    expect(new Set(rows.map((r) => r.key)).size).toBe(3)
  })

  it('пустой запрос — поля поиска не читаются: правка описания в редакторе не пересобирает список', () => {
    const list = reactive(goods.map((g) => ({ ...g })))
    let runs = 0
    const rows = computed(() => { runs += 1; return filterGoods(list, { query: '  ', filter: null, statusOf }) })
    expect(rows.value).toHaveLength(3)
    list[0].description = 'ПЛАНШЕТЫ'
    list[1].tradeMarkName = 'HP'
    expect(rows.value).toHaveLength(3)
    expect(runs).toBe(1)
    // с запросом — читаются и пересобираются
    const found = computed(() => filterGoods(list, { query: 'планш', filter: null, statusOf }))
    expect(indexes(found.value)).toEqual([0])
    list[0].description = 'НОУТБУКИ'
    expect(found.value).toEqual([])
  })

  it('поиск по коду (с пробелами), описанию, марке и модели — без регистра', () => {
    expect(indexes(filterGoods(goods, { query: '8471 30', filter: null, statusOf }))).toEqual([0])
    expect(indexes(filterGoods(goods, { query: 'питания', filter: null, statusOf }))).toEqual([1])
    expect(indexes(filterGoods(goods, { query: 'dell', filter: null, statusOf }))).toEqual([1])
    expect(indexes(filterGoods(goods, { query: 'mx-3', filter: null, statusOf }))).toEqual([2])
    expect(filterGoods(goods, { query: 'нет такого', filter: null, statusOf })).toEqual([])
  })

  it('фильтры «С ошибками» и «Пересчитать» — по статусу; вместе с поиском', () => {
    expect(indexes(filterGoods(goods, { query: '', filter: 'missing', statusOf }))).toEqual([2])
    expect(indexes(filterGoods(goods, { query: '', filter: 'stale', statusOf }))).toEqual([1])
    expect(indexes(filterGoods(goods, { query: 'ноут', filter: 'stale', statusOf }))).toEqual([])
  })
})

describe('goodsList: ТПиН и итоги', () => {
  it('ТПиН товара — сумма гр. 47; без строк — null', () => {
    expect(goodsTpin(item({ payments: [{ amountKzt: 100.5 } as never, { amountKzt: 20 } as never, { amountKzt: null } as never] }))).toBe(120.5)
    expect(goodsTpin(item({ payments: [] }))).toBeNull()
  })

  it('итоги: товаров, мест (как сервер: места груза, затем упаковки), брутто, нетто, гр. 45, ТПиН; фактурная — по валютам', () => {
    const t = goodsTotals([
      item({ cargoPlacesQuantity: 3, packagesCount: 5, grossWeightKg: 10.5, netWeightKg: 9, customsValue: 100, currency: 'USD', customsValueKzt: 1000, payments: [{ amountKzt: 10 } as never] }),
      item({ cargoPlacesQuantity: null, packagesCount: 2, grossWeightKg: 1.25, netWeightKg: null, customsValue: 50.5, currency: 'USD', customsValueKzt: null, payments: [] }),
      item({ packagesCount: null, grossWeightKg: null, netWeightKg: null, customsValue: 7, currency: 'EUR', customsValueKzt: 300, payments: [{ amountKzt: 5.25 } as never] }),
    ])
    expect(t).toEqual({
      count: 3,
      places: 5,
      gross: 11.75,
      net: 9,
      invoice: [{ currency: 'USD', amount: 150.5 }, { currency: 'EUR', amount: 7 }],
      kzt45: 1300,
      tpin: 15.25,
    })
  })

  it('пустой список — нули и пустая фактурная', () => {
    expect(goodsTotals([])).toEqual({ count: 0, places: 0, gross: 0, net: 0, invoice: [], kzt45: 0, tpin: 0 })
  })

  it('стоимость без валюты — в группе без кода', () => {
    expect(goodsTotals([item({ currency: null, customsValue: 3 })]).invoice).toEqual([{ currency: '', amount: 3 }])
  })
})

describe('formatItemNumbers', () => {
  it('номера с 1, подряд — диапазоном', () => {
    expect(formatItemNumbers([0, 1, 2, 5, 7, 8])).toBe('1–3, 6, 8–9')
    expect(formatItemNumbers([4])).toBe('5')
    expect(formatItemNumbers([3, 1])).toBe('2, 4')
    expect(formatItemNumbers([])).toBe('')
  })
})
