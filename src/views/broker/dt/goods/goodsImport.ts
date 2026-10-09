// «Из Excel» в ДТ (волна 6б): разбор файла — общий с транзитом (utils/goodsExcel.ts, правила не меняются); здесь —
// сопоставление разобранных строк с товаром ДТ и сводка для предпросмотра («N строк, что распознано, сколько без
// кода»). Товары добавляются в конец списка (useDtGoods.append).
//
// X1: столбец «Вид упаковки товара» общий разбор кладёт в `unit` (транзиту так и нужно). В ДТ `unit` — наименование
// ДЕИ (поле заблокировано, его задаёт код ТН ВЭД), поэтому здесь значение идёт в вид упаковки товара (гр. 31,
// packageKindCode, классификатор 2013): по коду, названию или «код — название». Не распознано — никуда не пишется,
// предпросмотр показывает такие значения.
import type { ClassifierItem, Import40GoodsItemInput, ReestrGoodsItemInput } from '@/types/api'
import { newDtGoodsItem } from './useDtGoods'

export interface DtExcelContext {
  /** Валюта гр. 22: товары получают её (пусто — без валюты, как прежде; страница подставит гр. 22, когда её зададут). */
  currency: string | null | undefined
  /** Классификатор 2013 (виды упаковки). Пустой — не загрузился: двухзначный код берётся как есть. */
  packageKinds: readonly ClassifierItem[]
}

const norm = (s: string) => s.trim().toLocaleUpperCase('ru').replace(/\s+/g, ' ')

/** Код вида упаковки по значению из Excel; null — не распознан. */
export function packageKindFrom(raw: string | null | undefined, kinds: readonly ClassifierItem[]): string | null {
  const v = norm(raw ?? '')
  if (!v) return null
  if (!kinds.length) return /^[0-9A-Z]{2}$/.test(v) ? v : null
  const byCode = kinds.find((k) => norm(k.code) === v)
  if (byCode) return byCode.code
  const byName = kinds.find((k) => norm(k.nameRu) === v)
  if (byName) return byName.code
  // «CT — картонная коробка», «CT - коробка», «CT коробка»
  const lead = /^([0-9A-ZА-Я]{1,3})\s*(?:[—–-]|\s)/.exec(v)?.[1]
  const byLead = lead ? kinds.find((k) => norm(k.code) === lead) : undefined
  return byLead ? byLead.code : null
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
    g.packageKindCode = packageKindFrom(r.unit, ctx.packageKinds)
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
  /** Значения «Вида упаковки», которых нет в классификаторе (без повторов) — в товары не попадут. */
  unknownPackaging: string[]
}

export function excelPreview(rows: readonly ReestrGoodsItemInput[], packageKinds: readonly ClassifierItem[]): DtExcelPreview {
  const has = (v: unknown) => v !== null && v !== undefined && v !== ''
  const count = (pick: (r: ReestrGoodsItemInput) => unknown) => rows.filter((r) => has(pick(r))).length
  const withCode = count((r) => r.tnvedCode)
  const unknown = new Set<string>()
  let packaging = 0
  for (const r of rows) {
    if (!has(r.unit)) continue
    if (packageKindFrom(r.unit, packageKinds)) packaging += 1
    else unknown.add(String(r.unit).trim())
  }
  return {
    rows: rows.length,
    withCode,
    withoutCode: rows.length - withCode,
    recognized: {
      description: count((r) => r.description),
      gross: count((r) => r.grossWeightKg),
      quantity: count((r) => r.quantity),
      packaging,
      places: count((r) => r.packagesCount),
    },
    unknownPackaging: [...unknown],
  }
}
