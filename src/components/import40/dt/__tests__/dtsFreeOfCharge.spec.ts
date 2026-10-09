import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import type { Import40GoodsItemInput } from '@/types/api'
import { keyOf } from '@/views/broker/dt/goods/useDtGoods'
import { syncGoodsValuationForDts } from '../dtsFreeOfCharge'

const g = (valuationMethodCode: string | null) => ({ description: 'X', valuationMethodCode } as unknown as Import40GoodsItemInput)

describe('ДТС-2: метод гр. 43 товаров', () => {
  it('бесплатная поставка: пусто и 1 → 6, другой метод не трогает; те же объекты (ключи товаров не теряются)', () => {
    const form = reactive({ goodsItems: [g(null), g('1'), g('2')] })
    const list = form.goodsItems
    const keys = list.map(keyOf)
    expect(syncGoodsValuationForDts(form.goodsItems, true)).toBe(2)
    expect(form.goodsItems).toBe(list)
    expect(form.goodsItems.map((x) => x.valuationMethodCode)).toEqual(['6', '6', '2'])
    expect(form.goodsItems.map(keyOf)).toEqual(keys)
  })

  it('выключили — 6 и пусто → 1', () => {
    const goods = [g('6'), g(null), g('3')]
    expect(syncGoodsValuationForDts(goods, false)).toBe(2)
    expect(goods.map((x) => x.valuationMethodCode)).toEqual(['1', '1', '3'])
  })
})
