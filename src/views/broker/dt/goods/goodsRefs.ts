// Привязки документов к товарам ДТ по ПОЗИЦИИ товара (G1): при удалении, перестановке и вставке товаров их надо
// пересчитать, иначе документ «переезжает» на чужой товар (PUT пишет индексы как есть, XML и бланк берут их же).
//
// Что ссылается на товар этой ДТ по позиции (больше нигде в форме ДТ):
// - гр. 44 (doc44Items): goodsItemIndexes — CSV позиций с 0 («0,2»), goodsItemIndex — одиночная позиция с 0 (старые ДТ),
//   appliesToAll — «на все товары». Ни индекса, ни CSV — тоже «на все товары» (KedenXmlExporter.DocAppliesToGood).
// - гр. 40 (prevDocItems): ТОЛЬКО goodsItemIndex — позиция с 0 (null — ко всем товарам, PrevDocAppliesToGood).
//   goodsNumber гр. 40 — № товара В ПРЕДШЕСТВУЮЩЕМ документе (ConsignmentItemOrdinal), к товарам этой ДТ отношения не
//   имеет и здесь не трогается.
//
// Правила: позиция удалённого товара из привязки выпадает, остальные сдвигаются. Позиции, которые и так не указывают на
// товар (вне списка, нечисловые), при пересчёте тоже выбрасываются — иначе после добавления товаров документ молча
// привязался бы к новому. Документ, у которого не осталось ни одной привязки, удаляется: «без привязки» для обеих граф
// значит «на все товары» — оставить его значило бы молча приписать документ всем товарам (интерфейс заранее говорит,
// сколько документов уйдёт: goodsRefsImpact). Строки «ко всем товарам» (appliesToAll; гр. 44 без индекса и CSV;
// гр. 40 с goodsItemIndex null) не меняются никогда. sortOrder гр. 40 = место в списке.
import type { Import40PrevDocItem } from '@/api/import40'
import type { Import40Doc44ItemInput } from '@/types/api'

export interface GoodsRefsHolder {
  doc44Items: Import40Doc44ItemInput[]
  prevDocItems: Import40PrevDocItem[]
}

/** map[старая позиция] = новая позиция или null (товар удалён). Длина — прежнее число товаров. */
export type GoodsIndexMap = readonly (number | null)[]

export interface GoodsRefsResult {
  /** Документы гр. 44, не оставшиеся привязанными ни к одному товару (убраны из формы). */
  droppedDoc44: Import40Doc44ItemInput[]
  /** Строки гр. 40, чей товар (goodsItemIndex) удалён или не существует (убраны из формы). */
  droppedPrevDocs: Import40PrevDocItem[]
}

/** Новая позиция товара; null — товар удалён или позиции нет в списке (вне карты). */
const mapIndex = (map: GoodsIndexMap, i: number): number | null =>
  Number.isInteger(i) && i >= 0 && i < map.length ? map[i] : null

type Doc44Plan = { drop: true } | { drop: false; goodsItemIndex: number | null; goodsItemIndexes: string | null }

function planDoc44(d: Import40Doc44ItemInput, map: GoodsIndexMap): Doc44Plan | null {
  if (d.appliesToAll) return null
  const single = d.goodsItemIndex ?? null
  const tokens = (d.goodsItemIndexes ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '')
  if (single == null && !tokens.length) return null // «на все товары»
  const nextSingle = single == null ? null : mapIndex(map, single)
  const nextTokens = tokens.flatMap((s) => {
    const n = /^\d+$/.test(s) ? mapIndex(map, Number(s)) : null
    return n == null ? [] : [String(n)]
  })
  if (nextSingle == null && !nextTokens.length) return { drop: true }
  return { drop: false, goodsItemIndex: nextSingle, goodsItemIndexes: nextTokens.length ? nextTokens.join(',') : null }
}

type PrevPlan = { drop: true } | { drop: false; goodsItemIndex: number }

function planPrev(p: Import40PrevDocItem, map: GoodsIndexMap): PrevPlan | null {
  if (p.goodsItemIndex == null) return null // ко всем товарам
  const next = mapIndex(map, p.goodsItemIndex)
  return next == null ? { drop: true } : { drop: false, goodsItemIndex: next }
}

/** Сколько документов гр. 44 / гр. 40 уйдёт вместе с товарами (форма не меняется). */
export function goodsRefsImpact(holder: GoodsRefsHolder, map: GoodsIndexMap): { doc44: number; prevDocs: number } {
  return {
    doc44: (holder.doc44Items ?? []).filter((d) => planDoc44(d, map)?.drop).length,
    prevDocs: (holder.prevDocItems ?? []).filter((p) => planPrev(p, map)?.drop).length,
  }
}

/** Пересчитать привязки документов к товарам на месте (те же массивы и объекты документов). */
export function remapGoodsRefs(holder: GoodsRefsHolder, map: GoodsIndexMap): GoodsRefsResult {
  const droppedDoc44: Import40Doc44ItemInput[] = []
  const droppedPrevDocs: Import40PrevDocItem[] = []

  const docs = holder.doc44Items ?? []
  for (let i = docs.length - 1; i >= 0; i--) {
    const d = docs[i]
    const plan = planDoc44(d, map)
    if (!plan) continue
    if (plan.drop) {
      droppedDoc44.unshift(d)
      docs.splice(i, 1)
      continue
    }
    if ((d.goodsItemIndex ?? null) !== plan.goodsItemIndex) d.goodsItemIndex = plan.goodsItemIndex
    if ((d.goodsItemIndexes ?? null) !== plan.goodsItemIndexes) d.goodsItemIndexes = plan.goodsItemIndexes
  }

  const prevs = holder.prevDocItems ?? []
  for (let i = prevs.length - 1; i >= 0; i--) {
    const p = prevs[i]
    const plan = planPrev(p, map)
    if (!plan) continue
    if (plan.drop) {
      droppedPrevDocs.unshift(p)
      prevs.splice(i, 1)
      continue
    }
    if (p.goodsItemIndex !== plan.goodsItemIndex) p.goodsItemIndex = plan.goodsItemIndex
  }
  if (droppedPrevDocs.length) prevs.forEach((p, i) => { if (p.sortOrder !== i) p.sortOrder = i })

  return { droppedDoc44, droppedPrevDocs }
}
