import type { Import40GoodsItemInput } from '@/types/api'

// Правила товаров ДТ, которые действуют независимо от того, открыт ли раздел «Товары» (он монтируется лениво):
// страница применяет их к форме сама, разделы товаров берут отсюда тот же расчёт.

/**
 * гр. 46 (статистическая стоимость, USD) = гр. 45 (₸) / курс доллара на дату гр. А, до 0,01.
 * null — курс или гр. 45 неизвестны.
 */
export const statUsdFrom = (customsValueKzt: number | null | undefined, usdRate: number | null | undefined): number | null => {
  if (!usdRate || usdRate <= 0 || customsValueKzt == null) return null
  return Math.round((customsValueKzt / usdRate) * 100) / 100
}

/**
 * Пакет 6 №4: при заданной гр. 22 валюта каждого товара = гр. 22. Новый массив (изменённые товары — копии), чтобы
 * раздел товаров под KeepAlive пересинхронизировал свои строки; null — менять нечего.
 */
export function goodsWithLockedCurrency(goods: Import40GoodsItemInput[], currency: string | null | undefined): Import40GoodsItemInput[] | null {
  if (!currency) return null
  if (goods.every((g) => g.currency === currency)) return null
  return goods.map((g) => (g.currency === currency ? g : { ...g, currency }))
}

/**
 * Item I: гр. 46 тем товарам, где она пуста (null/0), а гр. 45 и курс известны. Введённую гр. 46 не трогает —
 * ручное значение живёт до следующей правки гр. 45 (пересчёт по правке — в карточке товара). Новый массив; null —
 * менять нечего.
 */
export function goodsWithStatUsd(goods: Import40GoodsItemInput[], usdRate: number | null | undefined): Import40GoodsItemInput[] | null {
  let changed = false
  const next = goods.map((g) => {
    if (g.statisticValueUsd != null && g.statisticValueUsd !== 0) return g
    const stat = statUsdFrom(g.customsValueKzt, usdRate)
    if (stat == null) return g
    changed = true
    return { ...g, statisticValueUsd: stat }
  })
  return changed ? next : null
}
