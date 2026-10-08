// crm-frontend/src/composables/useTransitTotals.ts
// КЕДЕН-транзит: автопересчёт агрегатов «Общие сведения» (transit.goodsQuantity/
// cargoPlacesCount/grossWeightKg/totalValue) из списка товаров (goods).
//
// Правила (иначе сохранение записи затирало итоги, см. хотфикс потери данных транзита):
//  - при подключении и после rebase() ничего не пишется: сохранённые/ручные значения остаются
//    как есть, текущие суммы по товарам становятся точкой отсчёта;
//  - пересчёт — только когда сумма по товарам реально изменилась после этого (правка товаров),
//    и пишется только изменившийся агрегат;
//  - при пустом списке товаров (и для суммы, у которой ни у одного товара нет значения)
//    ничего не пишется — 0 вместо неизвестного не подставляем.
// Владелец формы вызывает rebase() после того, как заново загрузил в неё запись (goods + transit).
import { watch, type Ref } from 'vue'
import type { ReestrGoodsItemInput, ReestrTransitFields } from '@/types/api'

type SumKey = 'packagesCount' | 'grossWeightKg' | 'customsValue'

// null — ни у одного товара нет числа в этом поле (сумма неизвестна, а не 0).
function sumBy(goods: ReestrGoodsItemInput[], key: SumKey): number | null {
  let acc: number | null = null
  for (const g of goods) {
    const v = g[key]
    if (typeof v === 'number' && !Number.isNaN(v)) acc = (acc ?? 0) + v
  }
  return acc
}

interface Totals {
  goodsQuantity: number
  cargoPlacesCount: number | null
  grossWeightKg: number | null
  totalValue: number | null
}

const totalsOf = (goods: ReestrGoodsItemInput[] | null | undefined): Totals => {
  const list = goods ?? []
  return {
    goodsQuantity: list.length,
    cargoPlacesCount: sumBy(list, 'packagesCount'),
    grossWeightKg: sumBy(list, 'grossWeightKg'),
    totalValue: sumBy(list, 'customsValue'),
  }
}

const KEYS = ['goodsQuantity', 'cargoPlacesCount', 'grossWeightKg', 'totalValue'] as const

export function useTransitTotals(
  goods: Ref<ReestrGoodsItemInput[]>,
  transit: Ref<ReestrTransitFields>,
) {
  let last: Totals = totalsOf(goods.value)

  /** Текущие товары — новая точка отсчёта; в transit ничего не пишется. */
  const rebase = () => {
    last = totalsOf(goods.value)
  }

  watch(
    goods,
    (list) => {
      const next = totalsOf(list)
      const prev = last
      last = next
      if (!list?.length) return
      for (const key of KEYS) {
        const value = next[key]
        if (value != null && value !== prev[key]) transit.value[key] = value
      }
    },
    { deep: true },
  )

  return { rebase }
}
