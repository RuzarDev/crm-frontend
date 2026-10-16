import { describe, expect, it } from 'vitest'
import type { Import40GoodsItemInput } from '@/types/api'
import { fillStatUsd, lockGoodsCurrency, resetCustomsValue, resetStatValue, setManualCustomsValue, setManualStatValue, statUsdFrom } from '../dtGoodsRules'

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

  it('ручную гр. 46 (16.10.2026) не заполняет, даже пустую', () => {
    const goods = [g({ customsValueKzt: 750000, statisticValueUsd: null, statisticValueUsdManual: true })]
    expect(fillStatUsd(goods, 495.12)).toBe(false)
    expect(goods[0].statisticValueUsd).toBeNull()
  })

  it('ручные гр. 45/46: правка — «вручную» и прежнее как расчёт; гр. 46 за гр. 45, пока не ручная; сброс — к расчёту', () => {
    const x = g({ customsValueKzt: 450000, statisticValueUsd: 908.87, needsTpinRecalc: false })
    const setField = (key: 'customsValueKzt', v: number | null) => {
      if ((x[key] ?? null) === v) return false
      x[key] = v
      x.needsTpinRecalc = true
      return true
    }
    expect(setManualCustomsValue(x, 450000, 495.12, setField)).toBe(false)
    expect(x.customsValueKztManual).toBeFalsy()
    expect(setManualCustomsValue(x, 495120, 495.12, setField)).toBe(true)
    expect(x).toMatchObject({ customsValueKzt: 495120, customsValueKztManual: true, customsValueKztCalc: 450000, statisticValueUsd: 1000, needsTpinRecalc: true })
    // Вторая правка подсказку расчёта не трогает.
    setManualCustomsValue(x, 500000, 495.12, setField)
    expect(x.customsValueKztCalc).toBe(450000)
    expect(setManualStatValue(x, 1009.86)).toBe(false)
    expect(setManualStatValue(x, 999)).toBe(true)
    expect(x).toMatchObject({ statisticValueUsd: 999, statisticValueUsdManual: true, statisticValueUsdCalc: 1009.86 })
    setManualCustomsValue(x, 990240, 495.12, setField)
    expect(x.statisticValueUsd).toBe(999)
    resetStatValue(x, 495.12)
    expect(x).toMatchObject({ statisticValueUsd: 2000, statisticValueUsdManual: false, statisticValueUsdCalc: null })
    resetCustomsValue(x, 495.12, setField)
    expect(x).toMatchObject({ customsValueKzt: 450000, customsValueKztManual: false, customsValueKztCalc: null, statisticValueUsd: 908.87 })
    // Расчёта не было — сброс снимает признак, значение остаётся до «Рассчитать».
    const y = g({ customsValueKzt: 7, customsValueKztManual: true, customsValueKztCalc: null })
    resetCustomsValue(y, 495.12, () => { throw new Error('не должен писать') })
    expect(y).toMatchObject({ customsValueKzt: 7, customsValueKztManual: false })
  })

  it('загрузка и гр. 46 не помечают платежи устаревшими', () => {
    const goods = [g({ currency: 'USD', customsValueKzt: 1, statisticValueUsd: null, needsTpinRecalc: false })]
    lockGoodsCurrency(goods, 'EUR')
    fillStatUsd(goods, 2)
    expect(goods[0].needsTpinRecalc).toBe(false)
  })

  it('смена гр. 22 пользователем (markStale) помечает «Пересчитать» только товары, у которых валюта изменилась', () => {
    const goods = [g({ currency: 'USD', needsTpinRecalc: false }), g({ currency: 'EUR', needsTpinRecalc: false })]
    expect(lockGoodsCurrency(goods, 'EUR', { markStale: true })).toBe(true)
    expect(goods.map((x) => x.needsTpinRecalc)).toEqual([true, false])
  })
})
