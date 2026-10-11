// ДТС-2 (бесплатная поставка): метод гр. 43 товаров 6 на основе 1 — и обратно. Товары с другим методом не трогаем
// (их покажет проверка готовности ДТС). Правка НА МЕСТЕ: те же объекты товаров — ключ товара (keyOf), выбор строк
// и открытый товар не теряются (волна 6б). Возвращает число изменённых товаров.
type Valued = { valuationMethodCode?: string | null }

const willChange = (g: Valued, from: string) => !g.valuationMethodCode || g.valuationMethodCode === from

/** Сколько товаров сменит гр. 43 при переключении (для подтверждения «у N товаров гр. 43 станет 6»). */
export function countGoodsValuationChanges(goods: readonly Valued[], freeOfCharge: boolean): number {
  const from = freeOfCharge ? '1' : '6'
  return goods.reduce((n, g) => n + (willChange(g, from) ? 1 : 0), 0)
}

export function syncGoodsValuationForDts(goods: readonly Valued[], freeOfCharge: boolean): number {
  const from = freeOfCharge ? '1' : '6'
  const to = freeOfCharge ? '6' : '1'
  let changed = 0
  for (const g of goods) {
    if (!willChange(g, from)) continue
    g.valuationMethodCode = to
    changed += 1
  }
  return changed
}
