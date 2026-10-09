// ДТС-2 (бесплатная поставка): метод гр. 43 товаров 6 на основе 1 — и обратно. Товары с другим методом не трогаем
// (их покажет проверка готовности ДТС). Правка НА МЕСТЕ: те же объекты товаров — ключ товара (keyOf), выбор строк
// и открытый товар не теряются (волна 6б). Возвращает число изменённых товаров.
export function syncGoodsValuationForDts(goods: readonly { valuationMethodCode?: string | null }[], freeOfCharge: boolean): number {
  const from = freeOfCharge ? '1' : '6'
  const to = freeOfCharge ? '6' : '1'
  let changed = 0
  for (const g of goods) {
    if (g.valuationMethodCode && g.valuationMethodCode !== from) continue
    g.valuationMethodCode = to
    changed += 1
  }
  return changed
}
