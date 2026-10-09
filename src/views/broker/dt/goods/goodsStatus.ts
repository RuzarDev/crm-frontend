// Статус товара ДТ в списке (волна 6б): «готов» / «не хватает N» / «Пересчитать» — и признак «платежи устарели».
//
// - «Не хватает N»: пункты серверной готовности КЕДЕН с этим товаром (goodsIndex — позиция товара с 0, как SortOrder);
//   нет ответа сервера (нет права или не загрузился) — местная проверка, как прежняя отметка раздела «Товары».
// - «Пересчитать»: у товара стоит needsTpinRecalc или нет ни одной строки гр. 47 — то же правило, что точка раздела
//   на странице (dtPageModel.paymentsStale).
// - Устаревание (K4) ставится ЯВНО: редактор товара зовёт setGoodsField / markStale на правке пользователя. Никакого
//   наблюдателя за полями: загрузка ДТ, ответы расчётов и правила страницы (валюта = гр. 22, гр. 46) платежи не
//   «портят». Снимает признак расчёт (useDtPayments.applyGoodsPaymentRows).
import type { Import40GoodsItemInput } from '@/types/api'

type Goods = Import40GoodsItemInput

/**
 * Поля товара, правка которых делает платежи гр. 47 устаревшими: всё, что уходит в расчёт (useDtPayments.toPaymentsInput:
 * код, фактурная стоимость и валюта, гр. 45, веса, количество и ДЕИ, количества в единицах ставок, страна, вид акциза,
 * антидемпинг, врем. ввоз, НДС 5%), и льготы гр. 36 ×4.
 */
export const PAYMENT_FIELDS = [
  'tnvedCode',
  'customsValue',
  'currency',
  'customsValueKzt',
  'grossWeightKg',
  'netWeightKg',
  'quantity',
  'unitCode',
  'taxVolumeL',
  'taxAlcoholL',
  'taxPieces',
  'engineVolumeCm3',
  'countryOfOrigin',
  'prefClearanceCode',
  'prefDutyCode',
  'prefExciseCode',
  'prefVatCode',
  'exciseKind',
  'antiDumpingKind',
  'tempImportMonths',
  'vatRatePreferential',
] as const satisfies readonly (keyof Goods)[]

export type PaymentField = (typeof PAYMENT_FIELDS)[number]

const PAYMENT_FIELD_SET: ReadonlySet<string> = new Set(PAYMENT_FIELDS)

export const isPaymentField = (key: PropertyKey): key is PaymentField => PAYMENT_FIELD_SET.has(key as string)

/** Платежи товара устарели: признак «пересчитать» или нет ни одной строки гр. 47. */
export const goodsPaymentsStale = (g: { needsTpinRecalc?: boolean | null; payments?: readonly unknown[] | null }): boolean =>
  !!g.needsTpinRecalc || !(g.payments?.length)

/** Пометить платежи товара устаревшими (правка пользователя в поле из PAYMENT_FIELDS). */
export function markStale(g: Goods): void {
  if (!g.needsTpinRecalc) g.needsTpinRecalc = true
}

/**
 * Правка поля товара пользователем: записать и, если поле влияет на платежи, пометить их устаревшими.
 * То же значение (null и отсутствующее поле — одно и то же) — ничего (false).
 */
export function setGoodsField<K extends keyof Goods>(g: Goods, key: K, value: Goods[K]): boolean {
  if (Object.is(g[key] ?? null, value ?? null)) return false
  g[key] = value
  if (isPaymentField(key)) markStale(g)
  return true
}

/** Поля местной проверки (как прежняя отметка раздела «Товары»; гр. 47 — отдельно, это «Пересчитать»). */
export type LocalMissingField =
  | 'tnvedCode' | 'description' | 'grossWeightKg' | 'netWeightKg' | 'quantity' | 'unitCode'
  | 'customsValue' | 'customsValueKzt' | 'valuationMethodCode'

const blank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

/** Чего не хватает товару по местной проверке (без сервера). Описание из ТН ВЭД годится вместо описания из инвойса. */
export function localMissingFields(g: Goods): LocalMissingField[] {
  const out: LocalMissingField[] = []
  if (blank(g.tnvedCode)) out.push('tnvedCode')
  if (blank(g.description) && blank(g.tnvedDescription)) out.push('description')
  if (blank(g.grossWeightKg)) out.push('grossWeightKg')
  if (blank(g.netWeightKg)) out.push('netWeightKg')
  if (blank(g.quantity)) out.push('quantity')
  if (blank(g.unitCode)) out.push('unitCode')
  if (blank(g.customsValue)) out.push('customsValue')
  if (blank(g.customsValueKzt)) out.push('customsValueKzt')
  if (blank(g.valuationMethodCode)) out.push('valuationMethodCode')
  return out
}

export type GoodsStatus =
  | { kind: 'ready' }
  /** fields — только у местной проверки (без сервера). */
  | { kind: 'missing'; count: number; fields?: LocalMissingField[] }
  | { kind: 'stale' }
  /** Кода ТН ВЭД нет в справочнике (проверка кодов раздела «Товары», tnvedCodeCheck) — ошибка, важнее остального. */
  | { kind: 'badCode' }

/** Статус-ошибка: фильтр «С ошибками» — «не хватает» и «нет в справочнике». */
export const isErrorStatus = (s: GoodsStatus): boolean => s.kind === 'missing' || s.kind === 'badCode'

/** Статус с учётом проверки кода ТН ВЭД: код не из справочника — «нет в справочнике». */
export const withCodeCheck = (s: GoodsStatus, codeInvalid: boolean): GoodsStatus => (codeInvalid ? { kind: 'badCode' } : s)

/** Пункт готовности, привязанный к товару: goodsIndex — позиция товара с 0 (null — пункт не про товар). */
export interface GoodsReadinessItem {
  goodsIndex: number | null
}

/** Пунктов готовности по позиции товара (с 0). */
export function missingByGoodsIndex(items: readonly GoodsReadinessItem[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const i of items) if (i.goodsIndex != null) out.set(i.goodsIndex, (out.get(i.goodsIndex) ?? 0) + 1)
  return out
}

/** Статус по числу недостающего (сервер или местная проверка); «не хватает» важнее «Пересчитать». */
export function statusFrom(g: Goods, missing: number, fields?: LocalMissingField[]): GoodsStatus {
  if (missing > 0) return fields ? { kind: 'missing', count: missing, fields } : { kind: 'missing', count: missing }
  return goodsPaymentsStale(g) ? { kind: 'stale' } : { kind: 'ready' }
}

/** Местная проверка товара (нет ответа сервера). */
export function localStatus(g: Goods): GoodsStatus {
  const fields = localMissingFields(g)
  return statusFrom(g, fields.length, fields)
}
