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
 * Ручная правка гр. 45 товара (решение 16.10.2026): значение, признак «вручную» и подсказка расчёта — пока её не было,
 * расчётным считается прежнее значение (его и покажет «расчёт: X»). Гр. 46 следует за гр. 45 (тот же курс USD), если она
 * не ручная. Платежи устаревают через setField модели товаров (гр. 45 — поле платежей). false — значение то же.
 */
export function setManualCustomsValue(
  g: Import40GoodsItemInput,
  value: number | null,
  usdRate: number | null | undefined,
  setField: (key: 'customsValueKzt', v: number | null) => boolean,
): boolean {
  const before = g.customsValueKzt ?? null
  if (!setField('customsValueKzt', value)) return false
  if (!g.customsValueKztManual) {
    g.customsValueKztManual = true
    g.customsValueKztCalc = before
  }
  if (!g.statisticValueUsdManual) {
    const stat = statUsdFrom(value, usdRate)
    if (stat != null) g.statisticValueUsd = stat
  }
  return true
}

/** Ручная правка гр. 46: значение и «вручную»; расчётным до этого считается прежнее значение. false — то же значение. */
export function setManualStatValue(g: Import40GoodsItemInput, value: number | null): boolean {
  if ((g.statisticValueUsd ?? null) === (value ?? null)) return false
  if (!g.statisticValueUsdManual) {
    g.statisticValueUsdManual = true
    g.statisticValueUsdCalc = g.statisticValueUsd ?? null
  }
  g.statisticValueUsd = value
  return true
}

/**
 * «Сбросить к расчёту» гр. 45: снять «вручную»; есть подсказка расчёта — вернуть её (гр. 46, если не ручная, — за ней).
 * Подсказки нет (расчёт ещё не запускали) — значение остаётся до «Рассчитать». Гр. 45 — основа платежей: через setField
 * товар получает «Пересчитать».
 */
export function resetCustomsValue(
  g: Import40GoodsItemInput,
  usdRate: number | null | undefined,
  setField: (key: 'customsValueKzt', v: number | null) => boolean,
): void {
  const calc = g.customsValueKztCalc ?? null
  g.customsValueKztManual = false
  g.customsValueKztCalc = null
  if (calc == null) return
  setField('customsValueKzt', calc)
  if (!g.statisticValueUsdManual) {
    const stat = statUsdFrom(calc, usdRate)
    if (stat != null) g.statisticValueUsd = stat
  }
}

/** «Сбросить к расчёту» гр. 46: снять «вручную»; значение — гр. 45 / курс USD (как расчёт), иначе подсказка расчёта. */
export function resetStatValue(g: Import40GoodsItemInput, usdRate: number | null | undefined): void {
  const stat = statUsdFrom(g.customsValueKzt, usdRate) ?? g.statisticValueUsdCalc ?? null
  g.statisticValueUsdManual = false
  g.statisticValueUsdCalc = null
  if (stat != null) g.statisticValueUsd = stat
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
 * Item I: гр. 46 тем товарам, где она пуста (null/0), а гр. 45 и курс известны. Введённую гр. 46 не трогает, ручную
 * (признак «вручную», решение 16.10.2026) — даже пустую. На месте, как lockGoodsCurrency; false — менять нечего.
 */
export function fillStatUsd(goods: Import40GoodsItemInput[], usdRate: number | null | undefined): boolean {
  let changed = false
  for (const g of goods) {
    if (g.statisticValueUsdManual) continue
    if (g.statisticValueUsd != null && g.statisticValueUsd !== 0) continue
    const stat = statUsdFrom(g.customsValueKzt, usdRate)
    if (stat == null) continue
    g.statisticValueUsd = stat
    changed = true
  }
  return changed
}
