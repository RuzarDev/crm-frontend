import { describe, expect, it } from 'vitest'
import type { Import40GoodsItemInput } from '@/types/api'
import { goodsWithLockedCurrency, goodsWithStatUsd, statUsdFrom } from '../dtGoodsRules'

const g = (o: Partial<Import40GoodsItemInput>): Import40GoodsItemInput => ({ description: 'X', currency: 'USD', ...o } as Import40GoodsItemInput)

describe('dtGoodsRules', () => {
  it('гр. 46 = гр. 45 / курс USD, до 0,01; без курса или гр. 45 — null', () => {
    expect(statUsdFrom(750000, 495.12)).toBe(1514.78)
    expect(statUsdFrom(750000, null)).toBeNull()
    expect(statUsdFrom(750000, 0)).toBeNull()
    expect(statUsdFrom(null, 495.12)).toBeNull()
  })

  it('валюта товаров = гр. 22: новый массив, копии только изменённых; без гр. 22 или без расхождений — null', () => {
    const same = g({ currency: 'EUR' })
    const other = g({ currency: 'USD' })
    const goods = [same, other]
    const next = goodsWithLockedCurrency(goods, 'EUR')!
    expect(next).not.toBe(goods)
    expect(next.map((x) => x.currency)).toEqual(['EUR', 'EUR'])
    expect(next[0]).toBe(same)
    expect(other.currency).toBe('USD')
    expect(goodsWithLockedCurrency(goods, null)).toBeNull()
    expect(goodsWithLockedCurrency(goods, '')).toBeNull()
    expect(goodsWithLockedCurrency(next, 'EUR')).toBeNull()
  })

  it('гр. 46 заполняется только пустая (null/0) при известных гр. 45 и курсе', () => {
    const goods = [
      g({ customsValueKzt: 750000, statisticValueUsd: null }),
      g({ customsValueKzt: 750000, statisticValueUsd: 0 }),
      g({ customsValueKzt: 750000, statisticValueUsd: 1500 }),
      g({ customsValueKzt: null, statisticValueUsd: null }),
    ]
    const next = goodsWithStatUsd(goods, 495.12)!
    expect(next.map((x) => x.statisticValueUsd)).toEqual([1514.78, 1514.78, 1500, null])
    expect(next[2]).toBe(goods[2])
    expect(goodsWithStatUsd(goods, null)).toBeNull()
    expect(goodsWithStatUsd(next, 495.12)).toBeNull()
  })
})
