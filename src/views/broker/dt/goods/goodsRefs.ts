// Привязки документов к товарам ДТ по ПОЗИЦИИ товара (G1): при удалении, перестановке и вставке товаров их надо
// пересчитать, иначе документ «переезжает» на чужой товар (PUT пишет индексы как есть, XML и бланк берут их же).
//
// Что ссылается на товар по позиции (больше нигде в форме ДТ):
// - гр. 44 (doc44Items): goodsItemIndexes — CSV позиций с 0 («0,2»), goodsItemIndex — одиночная позиция с 0 (старые ДТ),
//   appliesToAll — «на все товары». Ни индекса, ни CSV — тоже «на все товары» (KedenXmlExporter.DocAppliesToGood).
// - гр. 40 (prevDocItems): goodsNumber — номер товара строкой с 1 (ConsignmentItemOrdinal в XML), goodsItemIndex —
//   позиция с 0 (старые ДТ; null — на все товары).
//
// Правила: позиция удалённого товара из привязки выпадает, остальные сдвигаются. Документ, привязанный ТОЛЬКО к удалённым
// товарам, удаляется вместе с ними: «без привязки» для обеих граф значит «на все товары» — оставить его значило бы
// молча приписать документ всем товарам (интерфейс заранее говорит, сколько документов уйдёт: goodsRefsImpact).
// Позиция вне списка товаров (товара уже не было) и нечисловой номер гр. 40 не трогаем. sortOrder гр. 40 = место в списке.
import type { Import40PrevDocItem } from '@/api/import40'
import type { Import40Doc44ItemInput } from '@/types/api'

export interface GoodsRefsHolder {
  doc44Items: Import40Doc44ItemInput[]
  prevDocItems: Import40PrevDocItem[]
}

/** map[старая позиция] = новая позиция или null (товар удалён). Длина — прежнее число товаров. */
export type GoodsIndexMap = readonly (number | null)[]

export interface GoodsRefsResult {
  /** Документы гр. 44, привязанные только к удалённым товарам (убраны из формы). */
  droppedDoc44: Import40Doc44ItemInput[]
  /** Документы гр. 40, привязанные только к удалённым товарам (убраны из формы). */
  droppedPrevDocs: Import40PrevDocItem[]
}

/** Новая позиция: вне карты — как была; null — товар удалён. */
const mapIndex = (map: GoodsIndexMap, i: number): number | null => (i >= 0 && i < map.length ? map[i] : i)

const isIndexToken = (s: string) => /^\d+$/.test(s)

type Doc44Plan = { drop: true } | { drop: false; goodsItemIndex: number | null; goodsItemIndexes: string | null }

function planDoc44(d: Import40Doc44ItemInput, map: GoodsIndexMap): Doc44Plan | null {
  if (d.appliesToAll) return null
  const single = d.goodsItemIndex ?? null
  const tokens = (d.goodsItemIndexes ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '')
  if (single == null && !tokens.length) return null // «на все товары»
  const nextSingle = single == null ? null : mapIndex(map, single)
  const nextTokens = tokens.flatMap((s) => {
    if (!isIndexToken(s)) return [s]
    const n = mapIndex(map, Number(s))
    return n == null ? [] : [String(n)]
  })
  if (nextSingle == null && !nextTokens.length) return { drop: true }
  return { drop: false, goodsItemIndex: nextSingle, goodsItemIndexes: nextTokens.length ? nextTokens.join(',') : null }
}

type PrevPlan = { drop: true } | { drop: false; goodsItemIndex: number | null; goodsNumber: string | null }

function planPrev(p: Import40PrevDocItem, map: GoodsIndexMap): PrevPlan | null {
  const idx = p.goodsItemIndex ?? null
  const raw = (p.goodsNumber ?? '').trim()
  const num = isIndexToken(raw) && Number(raw) > 0 ? Number(raw) : null
  if (idx == null && num == null) return null
  const nextIdx = idx == null ? null : mapIndex(map, idx)
  const nextNumIdx = num == null ? null : mapIndex(map, num - 1)
  if (nextIdx == null && nextNumIdx == null) return { drop: true }
  return {
    drop: false,
    goodsItemIndex: nextIdx,
    // нечисловой номер — как был; числовой удалённого товара — пусто (вторая привязка осталась)
    goodsNumber: num == null ? p.goodsNumber : nextNumIdx == null ? null : String(nextNumIdx + 1),
  }
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
    if (p.goodsNumber !== plan.goodsNumber) p.goodsNumber = plan.goodsNumber
  }
  if (droppedPrevDocs.length) prevs.forEach((p, i) => { if (p.sortOrder !== i) p.sortOrder = i })

  return { droppedDoc44, droppedPrevDocs }
}
