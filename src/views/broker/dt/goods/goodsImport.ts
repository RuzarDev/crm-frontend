// «Из Excel» в ДТ (волна 6б): разбор файла — общий с транзитом (utils/goodsExcel.ts, правила не меняются); здесь —
// сопоставление разобранных строк с товаром ДТ и сводка для предпросмотра («N строк, что распознано, сколько без
// кода»). Товары добавляются в конец списка (useDtGoods.append).
import type { Import40GoodsItemInput, ReestrGoodsItemInput } from '@/types/api'
import { newDtGoodsItem } from './useDtGoods'

export interface DtExcelContext {
  /** Валюта гр. 22: товары получают её (пусто — без валюты, как прежде; страница подставит гр. 22, когда её зададут). */
  currency: string | null | undefined
}

/** Товары ДТ из строк Excel: пустой товар ДТ + распознанные поля; места — и в «места груза» (гр. 31, = кол-во мест). */
export function dtGoodsFromExcel(rows: readonly ReestrGoodsItemInput[], ctx: DtExcelContext): Import40GoodsItemInput[] {
  return rows.map((r) => {
    const g = newDtGoodsItem(ctx.currency)
    g.currency = ctx.currency || null
    g.description = r.description
    g.tnvedCode = r.tnvedCode
    g.tnvedDescription = r.tnvedDescription
    g.quantity = r.quantity
    g.unit = r.unit
    g.grossWeightKg = r.grossWeightKg
    g.packagesCount = r.packagesCount
    g.cargoPlacesQuantity = r.packagesCount
    return g
  })
}

/** Что распознано в файле: по каждому полю — в скольких строках есть значение. */
export interface DtExcelPreview {
  rows: number
  withCode: number
  withoutCode: number
  recognized: { description: number; gross: number; quantity: number; packaging: number; places: number }
}

export function excelPreview(rows: readonly ReestrGoodsItemInput[]): DtExcelPreview {
  const has = (v: unknown) => v !== null && v !== undefined && v !== ''
  const count = (pick: (r: ReestrGoodsItemInput) => unknown) => rows.filter((r) => has(pick(r))).length
  const withCode = count((r) => r.tnvedCode)
  return {
    rows: rows.length,
    withCode,
    withoutCode: rows.length - withCode,
    recognized: {
      description: count((r) => r.description),
      gross: count((r) => r.grossWeightKg),
      quantity: count((r) => r.quantity),
      packaging: count((r) => r.unit),
      places: count((r) => r.packagesCount),
    },
  }
}
