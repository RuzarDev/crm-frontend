// Модель товаров ДТ (волна 6б): одна точка правды — form.goodsItems, правка на месте.
//
// - items — сам массив формы (без строк-копий); стабильный ключ товара — keyOf (WeakMap по объекту): переживает
//   правку на месте и перестановку, у копии и нового товара — новый.
// - add / append / remove / duplicate / move / applyToSelected меняют массив формы на месте (splice: тот же массив,
//   те же объекты товаров). Без права править — ничего не делают. Подтверждения — в интерфейсе (useConfirm), здесь
//   только данные; removalImpact — что сказать в вопросе.
// - Статус товара (готов / не хватает N / «Пересчитать»): пункты серверной готовности по goodsIndex (позиция с 0)
//   запоминаются за ОБЪЕКТОМ товара в момент ответа сервера — после удаления или перестановки (до следующего ответа)
//   статус не «переезжает» на соседа; товар, которого в ответе не было (новый, копия), и всё без ответа сервера —
//   местная проверка.
// - Признак «платежи устарели» ставит редактор на правке пользователя (markStale / setGoodsField из goodsStatus),
//   снимает расчёт (useDtPayments.applyGoodsPaymentRows).
import { computed, shallowRef, toRaw, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { Import40GoodsItemInput } from '@/types/api'
import { cloneGoodsExtras } from '@/types/api'
import { goodsHasData } from '@/views/broker/transit/record/sections/goods'
import type { DtFormState } from '../dtPayload'
import { applyBulkPatch, type BulkPatch } from './goodsBulk'
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

export interface GoodsRemoveResult {
  /** Сколько товаров удалено. */
  removed: number
}

export interface GoodsRemovalImpact {
  /** Сколько товаров будет удалено. */
  count: number
  /** Из них с данными пользователя (тогда спрашивать). */
  withData: number
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

/** Глубокая копия товара: платежи, маркировки (без id строки) и доп. сведения — свои объекты. */
export function cloneGoodsItem(g: Goods): Goods {
  return {
    ...g,
    payments: (g.payments ?? []).map((p) => ({ ...p })),
    markings: (g.markings ?? []).map(({ id: _id, ...m }) => ({ ...m })),
    extras: cloneGoodsExtras(g.extras),
  }
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
  const relayout = (next: Goods[], _from: (number | null)[]) => {
    form.goodsItems.splice(0, form.goodsItems.length, ...next)
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
    return { count: at.length, withData: at.filter((i) => goodsHasData(form.goodsItems[i])).length }
  }

  /** Удалить товары на позициях indexes (с 0). */
  const remove = (indexes: Iterable<number>): GoodsRemoveResult => {
    if (!editable()) return { removed: 0 }
    const drop = new Set(validIndexes(indexes, form.goodsItems.length))
    if (!drop.size) return { removed: 0 }
    const next: Goods[] = []
    const from: number[] = []
    form.goodsItems.forEach((g, i) => {
      if (drop.has(i)) return
      next.push(g)
      from.push(i)
    })
    relayout(next, from)
    return { removed: drop.size }
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
