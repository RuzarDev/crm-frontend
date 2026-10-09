// Модель товаров ДТ (волна 6б): одна точка правды — form.goodsItems, правка на месте.
//
// - items — сам массив формы (без строк-копий); стабильный ключ товара — keyOf (WeakMap по объекту): переживает
//   правку на месте и перестановку, у копии и нового товара — новый.
// - add / append / remove / duplicate / move / applyToSelected меняют массив формы на месте (splice: тот же массив,
//   те же объекты товаров). Без права править — ничего не делают. Подтверждения — в интерфейсе (useConfirm), здесь
//   только данные; removalImpact — что сказать в вопросе.
// - Удаление, перестановка и дублирование пересчитывают привязки гр. 44 / гр. 40 к товарам (по позиции — G1, см.
//   goodsRefs): документы едут за своим товаром, копия товара привязок не получает, документ только удалённых
//   товаров удаляется вместе с ними. goodsNumber гр. 40 (№ в предш. документе) не трогается.
// - Статус товара (готов / не хватает N / «Пересчитать»): пункты серверной готовности по goodsIndex (позиция с 0)
//   запоминаются за ОБЪЕКТОМ товара в момент ответа сервера — после удаления или перестановки (до следующего ответа)
//   статус не «переезжает» на соседа; товар, которого в ответе не было (новый, копия), и всё без ответа сервера —
//   местная проверка.
// - Признак «платежи устарели» ставит редактор на правке пользователя (markStale / setGoodsField из goodsStatus),
//   снимает расчёт (useDtPayments.applyGoodsPaymentRows).
import { computed, shallowRef, toRaw, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { Import40GoodsItemInput } from '@/types/api'
import { cloneGoodsExtras } from '@/types/api'
import type { DtFormState } from '../dtPayload'
import { applyBulkPatch, type BulkPatch } from './goodsBulk'
import { goodsRefsImpact, remapGoodsRefs, type GoodsIndexMap, type GoodsRefsResult } from './goodsRefs'
import {
  localStatus, markStale, missingByGoodsIndex, setGoodsField, statusFrom, type GoodsReadinessItem, type GoodsStatus,
} from './goodsStatus'

export type { GoodsReadinessItem, GoodsStatus } from './goodsStatus'

type Goods = Import40GoodsItemInput

export interface DtGoodsOptions {
  /**
   * Пункты серверной готовности (нужен только goodsIndex — позиция товара с 0); null — ответа сервера нет
   * (нет права, не загрузился) → местная проверка. Страница: `() => readiness.loaded.value ? readiness.items.value : null`.
   */
  readiness: MaybeRefOrGetter<readonly GoodsReadinessItem[] | null>
  /** Право править ДТ (useDtForm.editable). */
  canEdit: MaybeRefOrGetter<boolean>
}

export interface GoodsRemoveResult extends GoodsRefsResult {
  /** Сколько товаров удалено. */
  removed: number
}

export interface GoodsRemovalImpact {
  /** Сколько товаров будет удалено. */
  count: number
  /** Из них с данными пользователя (тогда спрашивать). */
  withData: number
  /** Документов гр. 44, у которых не останется привязки к товарам, — уйдут вместе с товарами. */
  doc44: number
  /** Строк гр. 40, привязанных (goodsItemIndex) к этим товарам, — уйдут вместе с ними. */
  prevDocs: number
}

// Ключи — общие для всех экземпляров (список и редактор видят один и тот же ключ товара).
const keys = new WeakMap<object, number>()
let lastKey = 0

/** Стабильный ключ товара (для :key, выбора, открытого редактора). */
export function keyOf(item: Goods): number {
  const raw = toRaw(item)
  let k = keys.get(raw)
  if (k === undefined) {
    k = ++lastKey
    keys.set(raw, k)
  }
  return k
}

/** Новый товар: все поля пусты, валюта — гр. 22 или USD (как прежняя карточка), платежей нет. */
export const newDtGoodsItem = (currency: string | null | undefined): Goods => ({
  description: null,
  tnvedCode: null,
  tnvedDescription: null,
  countryOfOrigin: null,
  quantity: null,
  unit: null,
  unitCode: null,
  grossWeightKg: null,
  netWeightKg: null,
  packagesCount: null,
  quantityTypeCode: null,
  customsValue: null,
  currency: currency || 'USD',
  procedureCode: null,
  previousProcedureCode: null,
  goodsMoveFeatureCode: null,
  tradeMarkName: null,
  productMarkName: null,
  productModelName: null,
  productArticle: null,
  manufacturerName: null,
  packageAvailabilityCode: null,
  cargoPlacesQuantity: null,
  packageKindCode: null,
  packageQuantity: null,
  prefClearanceCode: null,
  prefDutyCode: null,
  prefExciseCode: null,
  prefVatCode: null,
  customsValueKzt: null,
  statisticValueUsd: null,
  valuationMethodCode: null,
  quotaAmount: null,
  prohibitionCode: null,
  ipoCode: null,
  payments: [],
  needsTpinRecalc: false,
  containerNumber: null,
  tempImportMonths: null,
  vatRatePreferential: null,
  certificationNote: null,
  oisIndicatorCode: null,
  restrictionMarks: null,
  oisRegNumber: null,
  oisCountryCode: null,
  markings: [],
  extras: null,
  exciseKind: null,
  antiDumpingKind: null,
  taxVolumeL: null,
  taxAlcoholL: null,
  taxPieces: null,
  engineVolumeCm3: null,
})

/** Значения по умолчанию, а не данные пользователя: валюта (гр. 22 / USD) и служебный признак «Пересчитать». */
const NOT_DATA_KEYS: ReadonlySet<string> = new Set(['currency', 'needsTpinRecalc'])

const valueHasData = (v: unknown): boolean => {
  if (v === null || v === undefined || v === false) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (typeof v === 'number') return !Number.isNaN(v)
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.values(v as Record<string, unknown>).some(valueHasData)
  return true
}

/**
 * Есть ли в товаре данные пользователя (тогда удаление спрашивает): любое заполненное поле — и базовое, и КЕДЕН
 * (гр. 36, гр. 33, ОИС, упаковка…), строки платежей и маркировки, доп. сведения. Валюта и «Пересчитать» — не в счёт.
 */
export function dtGoodsHasData(g: Goods): boolean {
  return Object.entries(g).some(([k, v]) => !NOT_DATA_KEYS.has(k) && valueHasData(v))
}

/** Глубокая копия товара: платежи, маркировки (без id строки) и доп. сведения — свои объекты. */
export function cloneGoodsItem(g: Goods): Goods {
  return {
    ...g,
    payments: (g.payments ?? []).map((p) => ({ ...p })),
    markings: (g.markings ?? []).map(({ id: _id, ...m }) => ({ ...m })),
    extras: cloneGoodsExtras(g.extras),
  }
}

/** from[новая позиция] = прежняя (null — новый товар) → карта «прежняя позиция → новая / null (удалён)». */
const indexMap = (oldLength: number, from: readonly (number | null)[]): GoodsIndexMap => {
  const map: (number | null)[] = Array.from({ length: oldLength }, () => null)
  from.forEach((old, i) => { if (old != null) map[old] = i })
  return map
}

/** Допустимые позиции без повторов, по возрастанию. */
const validIndexes = (indexes: Iterable<number>, length: number): number[] =>
  [...new Set(indexes)].filter((i) => Number.isInteger(i) && i >= 0 && i < length).sort((a, b) => a - b)

export function useDtGoods(form: DtFormState, opts: DtGoodsOptions) {
  const items = computed(() => form.goodsItems)
  const editable = () => !!toValue(opts.canEdit)

  /**
   * Новый порядок товаров: next — товары, from[i] — прежняя позиция товара next[i] (null — новый). Массив формы
   * остаётся тем же (splice).
   */
  const relayout = (next: Goods[], from: (number | null)[]): GoodsRefsResult => {
    const map = indexMap(form.goodsItems.length, from)
    form.goodsItems.splice(0, form.goodsItems.length, ...next)
    return remapGoodsRefs(form, map)
  }

  /** Добавить пустой товар в конец. */
  const add = (): Goods | null => {
    if (!editable()) return null
    const g = newDtGoodsItem(form.currency)
    form.goodsItems.push(g)
    // вернуть то, что лежит в форме (реактивный объект), — правки по нему видны в форме
    return form.goodsItems[form.goodsItems.length - 1]
  }

  /** Добавить товары в конец (Excel «КЕДЕН ШАПКА»). Возвращает число добавленных. */
  const append = (list: readonly Goods[]): number => {
    if (!editable() || !list.length) return 0
    form.goodsItems.push(...list)
    return list.length
  }

  /** Что будет удалено (для вопроса перед удалением). */
  const removalImpact = (indexes: Iterable<number>): GoodsRemovalImpact => {
    const at = validIndexes(indexes, form.goodsItems.length)
    const drop = new Set(at)
    const kept = form.goodsItems.map((_, i) => i).filter((i) => !drop.has(i))
    const refs = goodsRefsImpact(form, indexMap(form.goodsItems.length, kept))
    return { count: at.length, withData: at.filter((i) => dtGoodsHasData(form.goodsItems[i])).length, ...refs }
  }

  /** Удалить товары на позициях indexes (с 0). */
  const remove = (indexes: Iterable<number>): GoodsRemoveResult => {
    const none: GoodsRemoveResult = { removed: 0, droppedDoc44: [], droppedPrevDocs: [] }
    if (!editable()) return none
    const drop = new Set(validIndexes(indexes, form.goodsItems.length))
    if (!drop.size) return none
    const next: Goods[] = []
    const from: number[] = []
    form.goodsItems.forEach((g, i) => {
      if (drop.has(i)) return
      next.push(g)
      from.push(i)
    })
    return { removed: drop.size, ...relayout(next, from) }
  }

  /** Копия каждого товара — сразу после исходного. Возвращает копии (как они лежат в форме). */
  const duplicate = (indexes: Iterable<number>): Goods[] => {
    if (!editable()) return []
    const dup = new Set(validIndexes(indexes, form.goodsItems.length))
    if (!dup.size) return []
    const next: Goods[] = []
    const from: (number | null)[] = []
    const copyAt: number[] = []
    form.goodsItems.forEach((g, i) => {
      next.push(g)
      from.push(i)
      if (dup.has(i)) {
        copyAt.push(next.length)
        next.push(cloneGoodsItem(g))
        from.push(null)
      }
    })
    relayout(next, from)
    return copyAt.map((i) => form.goodsItems[i])
  }

  /** Переставить товар с позиции from на позицию to (с 0). */
  const move = (fromIndex: number, toIndex: number): boolean => {
    const n = form.goodsItems.length
    if (!editable() || fromIndex === toIndex) return false
    if (![fromIndex, toIndex].every((i) => Number.isInteger(i) && i >= 0 && i < n)) return false
    const order = form.goodsItems.map((_, i) => i)
    const [moved] = order.splice(fromIndex, 1)
    order.splice(toIndex, 0, moved)
    relayout(order.map((i) => form.goodsItems[i]), order)
    return true
  }

  /** «Применить к выбранным…»: см. goodsBulk. Возвращает число изменённых товаров. */
  const applyToSelected = (indexes: Iterable<number>, patch: BulkPatch): number => {
    if (!editable()) return 0
    return applyBulkPatch(form.goodsItems, indexes, patch)
  }

  // ---- Статусы ----
  // Пункты сервера → товар (объект) в момент ответа; товар, которого не было в ответе, — undefined (местная проверка).
  const serverMissing = shallowRef<WeakMap<object, number> | null>(null)
  watch(
    () => toValue(opts.readiness),
    (list) => {
      if (!list) {
        serverMissing.value = null
        return
      }
      const by = missingByGoodsIndex(list)
      const snap = new WeakMap<object, number>()
      toRaw(form.goodsItems).forEach((g, i) => snap.set(toRaw(g), by.get(i) ?? 0))
      serverMissing.value = snap
    },
    { immediate: true, flush: 'sync' },
  )

  /** Статус товара (см. goodsStatus). */
  const statusOf = (item: Goods): GoodsStatus => {
    const n = serverMissing.value?.get(toRaw(item))
    return n === undefined ? localStatus(item) : statusFrom(item, n)
  }

  /** Сколько товаров «не хватает» и «Пересчитать» — для фильтров списка. */
  const counts = computed(() => {
    let missing = 0
    let stale = 0
    for (const g of form.goodsItems) {
      const s = statusOf(g)
      if (s.kind === 'missing') missing += 1
      else if (s.kind === 'stale') stale += 1
    }
    return { missing, stale }
  })

  return {
    items,
    keyOf,
    add,
    append,
    remove,
    removalImpact,
    duplicate,
    move,
    applyToSelected,
    statusOf,
    counts,
    markStale,
    setField: setGoodsField,
  }
}

export type DtGoodsModel = ReturnType<typeof useDtGoods>
