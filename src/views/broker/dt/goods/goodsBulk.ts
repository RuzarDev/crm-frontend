// «Применить к выбранным…» (волна 6б): одно значение поля — сразу нескольким товарам ДТ. Заменяет прежние
// «Копировать ОИС/МНР/сертификацию в товары» (K1: копирование писалось в массив родителя и затиралось строками-копиями
// карточек) и «Проставить месяцы всем товарам». Пишем в сами объекты form.goodsItems — правка на месте.
import type { Import40GoodsItemInput } from '@/types/api'
import { setGoodsField } from './goodsStatus'

type Goods = Import40GoodsItemInput

/** Группы полей диалога (порядок — как на доске); каждое поле можно передать и отдельно. */
export const BULK_GROUPS = {
  /** гр. 34 */
  country: ['countryOfOrigin'],
  /** гр. 37: процедура, предшествующая процедура, особенность перемещения */
  procedure: ['procedureCode', 'previousProcedureCode', 'goodsMoveFeatureCode'],
  /** гр. 43 */
  valuation: ['valuationMethodCode'],
  /** гр. 36: сбор, пошлина, акциз, НДС */
  preferences: ['prefClearanceCode', 'prefDutyCode', 'prefExciseCode', 'prefVatCode'],
  /** гр. 33 ОИС: индикатор, рег. №, страна */
  ois: ['oisIndicatorCode', 'oisRegNumber', 'oisCountryCode'],
  /** гр. 33 признаки соблюдения запретов С/М/П (CSV) */
  restrictions: ['restrictionMarks'],
  /** гр. 33 коды нетарифного регулирования (через запятую) */
  gr33Codes: ['prohibitionCode'],
  /** Сертификация / экспортный контроль */
  certification: ['certificationNote'],
  /** Месяцы временного ввоза */
  tempImport: ['tempImportMonths'],
  /** гр. 31 упаковка: вид и наличие */
  packaging: ['packageKindCode', 'packageAvailabilityCode'],
} as const satisfies Record<string, readonly (keyof Goods)[]>

export type BulkGroup = keyof typeof BULK_GROUPS
export type BulkField = (typeof BULK_GROUPS)[BulkGroup][number]

export const BULK_FIELDS: readonly BulkField[] = Object.values(BULK_GROUPS).flat()

const BULK_FIELD_SET: ReadonlySet<string> = new Set(BULK_FIELDS)

/** Что применить: только переданные поля; null (или пустая строка) — очистить. */
export type BulkPatch = Partial<Pick<Goods, BulkField>>

/** Рег. № ОИС — заглавными (как в поле); пустая строка — null. */
const normalize = (key: BulkField, v: unknown): unknown => {
  if (typeof v !== 'string') return v ?? null
  if (v.trim() === '') return null
  return key === 'oisRegNumber' ? v.toUpperCase() : v
}

/**
 * Применить заплатку к товарам на позициях indexes (с 0; чужие и повторные — пропускаются). Поля, влияющие на платежи
 * (страна, гр. 36, месяцы), помечают платежи устаревшими — только если значение изменилось. Возвращает, сколько
 * товаров изменилось.
 */
export function applyBulkPatch(goods: Goods[], indexes: Iterable<number>, patch: BulkPatch): number {
  const entries = (Object.keys(patch) as BulkField[])
    .filter((k) => BULK_FIELD_SET.has(k) && patch[k] !== undefined)
    .map((k) => [k, normalize(k, patch[k])] as const)
  if (!entries.length) return 0
  let changed = 0
  for (const i of new Set(indexes)) {
    const g = goods[i]
    if (!g) continue
    let any = false
    for (const [k, v] of entries) {
      if (setGoodsField(g, k, v as Goods[typeof k])) any = true
    }
    if (any) changed += 1
  }
  return changed
}

/** Заплатка из значений товара-образца («как у этого товара»): ОИС/МНР из товара 1, месяцы первого товара и т.п. */
export function bulkPatchFrom(source: Goods, fields: readonly BulkField[]): BulkPatch {
  const out: Record<string, unknown> = {}
  for (const f of fields) out[f] = source[f] ?? null
  return out as BulkPatch
}
