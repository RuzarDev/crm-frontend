import { watch } from 'vue'
import type { ReestrGoodsItemInput, ReestrTransitFields } from '@/types/api'
import { goodsTotals, type GoodsTotals } from './recordModel'

/** Итоги «Основного», которые пересчитываются из товаров. */
const TOTALS: [keyof GoodsTotals, keyof ReestrTransitFields][] = [
  ['items', 'goodsQuantity'],
  ['places', 'cargoPlacesCount'],
  ['gross', 'grossWeightKg'],
  ['value', 'totalValue'],
]

/**
 * Пересчёт итогов transit (количество товаров, места — целые, брутто, стоимость) при правке товаров.
 * Общий для записи транзита (4б) и партии пакета (4в).
 * - Не immediate: загрузка не правка, сохранённые итоги остаются.
 * - Пишется только итог, который изменился с прошлого раза: ручные правки остальных итогов не затираются.
 * - Пустой список и неизвестные суммы (null) итоги не трогают.
 * - reset() — товары заменили целиком (открыли запись, «Отменить», перечитали): это не правка, точка отсчёта — текущие товары.
 *   Вызывать синхронно сразу после замены, до срабатывания наблюдателя.
 */
export function useGoodsTotalsSync(goods: () => ReestrGoodsItemInput[], transit: () => ReestrTransitFields): { reset(): void } {
  let last = goodsTotals(goods())
  watch(
    goods,
    (list) => {
      const next = goodsTotals(list)
      const prev = last
      last = next
      if (!list.length) return
      const tr = transit() as unknown as Record<string, unknown>
      for (const [from, to] of TOTALS) {
        const v = next[from]
        if (v != null && v !== prev[from]) tr[to] = v
      }
    },
    { deep: true },
  )
  return {
    reset: () => {
      last = goodsTotals(goods())
    },
  }
}
