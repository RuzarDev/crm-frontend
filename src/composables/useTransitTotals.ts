// crm-frontend/src/composables/useTransitTotals.ts
// КЕДЕН-транзит: автопересчёт агрегатов «Общие сведения» (transit.goodsQuantity/
// cargoPlacesCount/grossWeightKg/totalValue) из списка товаров (goods). Поля
// остаются редактируемыми вручную — пересчёт срабатывает только когда сумма по
// товарам реально меняется, чтобы не затирать ручную правку пользователя на
// каждый watch-тик и не зацикливаться.
import { watch, type Ref } from 'vue'
import type { ReestrGoodsItemInput, ReestrTransitFields } from '@/types/api'

function sumBy(goods: ReestrGoodsItemInput[], key: 'packagesCount' | 'grossWeightKg' | 'customsValue'): number {
  return goods.reduce((acc, g) => acc + (typeof g[key] === 'number' ? (g[key] as number) : 0), 0)
}

export function useTransitTotals(
  goods: Ref<ReestrGoodsItemInput[]>,
  transit: Ref<ReestrTransitFields>,
) {
  let lastGoodsQuantity: number | null = null
  let lastCargoPlacesCount: number | null = null
  let lastGrossWeightKg: number | null = null
  let lastTotalValue: number | null = null

  watch(
    goods,
    (list) => {
      const goodsQuantity = list.length
      const cargoPlacesCount = sumBy(list, 'packagesCount')
      const grossWeightKg = sumBy(list, 'grossWeightKg')
      const totalValue = sumBy(list, 'customsValue')

      if (goodsQuantity !== lastGoodsQuantity) {
        lastGoodsQuantity = goodsQuantity
        transit.value.goodsQuantity = goodsQuantity
      }
      if (cargoPlacesCount !== lastCargoPlacesCount) {
        lastCargoPlacesCount = cargoPlacesCount
        transit.value.cargoPlacesCount = cargoPlacesCount
      }
      if (grossWeightKg !== lastGrossWeightKg) {
        lastGrossWeightKg = grossWeightKg
        transit.value.grossWeightKg = grossWeightKg
      }
      if (totalValue !== lastTotalValue) {
        lastTotalValue = totalValue
        transit.value.totalValue = totalValue
      }
    },
    { deep: true, immediate: true },
  )
}
