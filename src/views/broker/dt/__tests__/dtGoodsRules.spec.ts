import { describe, expect, it } from 'vitest'
import type { Import40GoodsItemInput } from '@/types/api'
import { fillStatUsd, lockGoodsCurrency, statUsdFrom } from '../dtGoodsRules'

const g = (o: Partial<Import40GoodsItemInput>): Import40GoodsItemInput => ({ description: 'X', currency: 'USD', ...o } as Import40GoodsItemInput)

describe('dtGoodsRules', () => {
  it('гр. 46 = гр. 45 / курс USD, до 0,01; без курса или гр. 45 — null', () => {
    expect(statUsdFrom(750000, 495.12)).toBe(1514.78)
    expect(statUsdFrom(750000, null)).toBeNull()
    expect(statUsdFrom(750000, 0)).toBeNull()
    expect(statUsdFrom(null, 495.12)).toBeNull()
  })

  it('валюта товаров = гр. 22: на месте (те же объекты — ключ товара не меняется); без гр. 22 или без расхождений — false', () => {
    const same = g({ currency: 'EUR' })
    const other = g({ currency: 'USD' })
    const goods = [same, other]
    expect(lockGoodsCurrency(goods, 'EUR')).toBe(true)
    expect(goods.map((x) => x.currency)).toEqual(['EUR', 'EUR'])
    expect(goods[0]).toBe(same)
    expect(goods[1]).toBe(other)
    expect(lockGoodsCurrency(goods, null)).toBe(false)
    expect(lockGoodsCurrency(goods, '')).toBe(false)
    expect(lockGoodsCurrency(goods, 'EUR')).toBe(false)
  })

  it('гр. 46 заполняется на месте только пустая (null/0) при известных гр. 45 и курсе', () => {
    const goods = [
      g({ customsValueKzt: 750000, statisticValueUsd: null }),
      g({ customsValueKzt: 750000, statisticValueUsd: 0 }),
      g({ customsValueKzt: 750000, statisticValueUsd: 1500 }),
      g({ customsValueKzt: null, statisticValueUsd: null }),
    ]
    const before = [...goods]
    expect(fillStatUsd(goods, null)).toBe(false)
    expect(fillStatUsd(goods, 495.12)).toBe(true)
    expect(goods.map((x) => x.statisticValueUsd)).toEqual([1514.78, 1514.78, 1500, null])
    goods.forEach((x, i) => expect(x).toBe(before[i]))
    expect(fillStatUsd(goods, 495.12)).toBe(false)
  })

  it('правила страницы не помечают платежи устаревшими', () => {
    const goods = [g({ currency: 'USD', customsValueKzt: 1, statisticValueUsd: null, needsTpinRecalc: false })]
    lockGoodsCurrency(goods, 'EUR')
    fillStatUsd(goods, 2)
    expect(goods[0].needsTpinRecalc).toBe(false)
  })
})
