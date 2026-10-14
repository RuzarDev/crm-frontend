// Текст гр. 31 — как печатает КЕДЕН (образец владельца, 14.10), тем же правилом, что сервер (Gr31Text.cs — печать бланка):
//   1. ШТОРЫ ДЛЯ ВАННОЙ 180*240, ШТОРЫ ДЛЯ ВАННОЙ 180*240: ПРОИЗВОДИТЕЛЬ: YIWU…, ТОВАРНЫЙ ЗНАК: …, МАРКА: ОТСУТСТВУЕТ,
//   МОДЕЛЬ: ОТСУТСТВУЕТ, АРТИКУЛ: JJ-17, СТАНДАРТ (ГОСТ): ОТСУТСТВУЕТ, СОРТ: ОТСУТСТВУЕТ, СТОИМОСТЬ: 1854, КОЛИЧЕСТВО: 1800 ШТ;
//   2. 30, BX-30
// «1.» — наименование товара, затем по строке характеристик «{наименование строки}: …;» (каждая с новой строки; пустое
// наименование строки — наименование товара, как подставляет КЕДЕН). «2.» — места, вид упаковки-количество упаковок.
// Пустое — «ОТСУТСТВУЕТ», числа без лишних нулей, единица — краткое наименование ОКЕИ. Подписи — по-русски, как бланк.
import type { Import40GoodsItemInput } from '@/types/api'
import { placesOfGoods } from '@/utils/goodsPlaces'
import type { GoodsRowValue } from './characteristics'
import { okeiCode, okeiShort } from './okei'

export const GR31_MISSING = 'ОТСУТСТВУЕТ'

const upper = (s: string | null | undefined): string | null => {
  const v = (s ?? '').trim()
  return v ? v.toLocaleUpperCase('ru') : null
}

/** Число без лишних нулей, точка — разделитель (1854.00 → «1854», 12.50 → «12.5»). */
export const gr31Number = (v: number | null | undefined): string | null =>
  v == null || !Number.isFinite(v) ? null : String(Number(v.toFixed(6)))

const quantityText = (q: number | null | undefined, unitCode: string | null | undefined): string | null => {
  const n = gr31Number(q)
  if (n == null) return null
  const code = okeiCode(unitCode)
  const unit = code ? okeiShort(code) ?? code : null
  return unit ? `${n} ${unit}` : n
}

const part = (label: string, value: string | null | undefined) => `${label}: ${upper(value) ?? GR31_MISSING}`

/** «{наименование}: ПРОИЗВОДИТЕЛЬ: …, КОЛИЧЕСТВО: 1800 ШТ;» */
export function gr31RowText(r: GoodsRowValue, goodsDescription: string | null): string {
  const name = upper(r.name) ?? goodsDescription
  const parts = [
    part('ПРОИЗВОДИТЕЛЬ', r.manufacturerName),
    part('ТОВАРНЫЙ ЗНАК', r.tradeMarkName),
    part('МАРКА', r.productMarkName),
    part('МОДЕЛЬ', r.productModelName),
    part('АРТИКУЛ', r.productArticle),
    part('СТАНДАРТ (ГОСТ)', r.standardName),
    part('СОРТ', r.productSortName),
  ]
  if ((r.serialNumbers ?? '').trim()) parts.push(part('СЕРИЙНЫЕ НОМЕРА', r.serialNumbers))
  parts.push(`СТОИМОСТЬ: ${gr31Number(r.invoiceValue) ?? GR31_MISSING}`)
  parts.push(`КОЛИЧЕСТВО: ${quantityText(r.quantity, r.unitCode) ?? GR31_MISSING}`)
  const body = `${parts.join(', ')};`
  return name ? `${name}: ${body}` : body
}

/** «30, BX-30»: места, вид упаковки и количество упаковок (нет — места). */
export function gr31Packaging(places: number, kindCode: string | null | undefined, packageQuantity: number | null | undefined): string | null {
  const kind = upper(kindCode)
  if (places <= 0 && !kind) return null
  const head = places > 0 ? gr31Number(places) : null
  const qty = packageQuantity != null && packageQuantity > 0 ? packageQuantity : places > 0 ? places : null
  const pack = kind ? (qty == null ? kind : `${kind}-${gr31Number(qty)}`) : null
  return [head, pack].filter((x) => x != null).join(', ')
}

type Gr31Goods = Pick<Import40GoodsItemInput, 'description' | 'tnvedDescription' | 'characteristics' | 'packageKindCode' | 'packageQuantity'>
  & Parameters<typeof placesOfGoods>[0]

/** Текст гр. 31 товара (строки через перевод строки); нечего показать — ''. */
export function gr31Text(g: Gr31Goods): string {
  const lines: string[] = []
  const description = upper(g.description) ?? upper(g.tnvedDescription)
  const rows = g.characteristics ?? []
  if (!rows.length) {
    if (description) lines.push(`1. ${description}`)
  } else {
    rows.forEach((r, i) => {
      const row = gr31RowText(r, description)
      lines.push(i === 0 ? `1. ${description ? `${description}, ${row}` : row}` : row)
    })
  }
  const packaging = gr31Packaging(placesOfGoods(g) ?? 0, g.packageKindCode, g.packageQuantity)
  if (packaging) lines.push(`2. ${packaging}`)
  return lines.join('\n')
}
