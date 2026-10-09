import type { Import40GoodsItemInput } from '@/types/api'
import { markStale } from './goods/goodsStatus'

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
 * Пакет 6 №4: при заданной гр. 22 валюта каждого товара = гр. 22. Правит товары НА МЕСТЕ (те же объекты — ключ
 * товара в списке и открытый редактор не теряются, волна 6б). markStale — смена гр. 22 пользователем (не загрузка):
 * товары, чья валюта изменилась, получают «Пересчитать» (валюта — основа расчёта платежей). false — менять нечего.
 */
export function lockGoodsCurrency(
  goods: Import40GoodsItemInput[],
  currency: string | null | undefined,
  opts: { markStale?: boolean } = {},
): boolean {
  if (!currency) return false
  let changed = false
  for (const g of goods) {
    if (g.currency === currency) continue
    g.currency = currency
    if (opts.markStale) markStale(g)
    changed = true
  }
  return changed
}

/**
 * Item I: гр. 46 тем товарам, где она пуста (null/0), а гр. 45 и курс известны. Введённую гр. 46 не трогает —
 * ручное значение живёт до следующей правки гр. 45 (пересчёт по правке — в редакторе товара). На месте, как
 * lockGoodsCurrency; false — менять нечего.
 */
export function fillStatUsd(goods: Import40GoodsItemInput[], usdRate: number | null | undefined): boolean {
  let changed = false
  for (const g of goods) {
    if (g.statisticValueUsd != null && g.statisticValueUsd !== 0) continue
    const stat = statUsdFrom(g.customsValueKzt, usdRate)
    if (stat == null) continue
    g.statisticValueUsd = stat
    changed = true
  }
  return changed
}
