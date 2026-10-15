// Гр. 31 «Характеристики товара в группе» (как окно КЕДЕН, пакет 7): строки товара — наименование, количество в своей
// единице ОКЕИ (не гр. 41; у единственной строки без своего — гр. 41), фактурная стоимость (валюта гр. 22; у единственной
// строки без своей — гр. 42), производитель, товарный знак, марка, модель, артикул,
// стандарт, сорт, серийные номера. Чистые функции: пустая строка, копия, строка 1 из прежних одиночных полей ответа,
// итоги строк против гр. 41 / гр. 42, марки для ТРОИС.
import type { Import40GoodsCharacteristic, Import40GoodsItemInput } from '@/types/api'
import { okeiCode } from './okei'

export type GoodsRowValue = Import40GoodsCharacteristic

export const blankCharacteristic = (): GoodsRowValue => ({
  name: null,
  quantity: null,
  unitCode: null,
  invoiceValue: null,
  manufacturerName: null,
  tradeMarkName: null,
  productMarkName: null,
  productModelName: null,
  productArticle: null,
  standardName: null,
  productSortName: null,
  serialNumbers: null,
})

/** Копия строки — свой объект (копирование строки, копия товара). */
export const cloneCharacteristic = (r: GoodsRowValue): GoodsRowValue => ({ ...blankCharacteristic(), ...r })

export const cloneCharacteristics = (rows: readonly GoodsRowValue[] | null | undefined): GoodsRowValue[] =>
  (rows ?? []).map(cloneCharacteristic)

const has = (v: unknown) => v !== null && v !== undefined && (typeof v !== 'string' || v.trim() !== '')

/** Строка пустая (сервер такие отбрасывает). */
export const isBlankCharacteristic = (r: GoodsRowValue): boolean => !Object.values(r).some(has)

/**
 * Прежний ответ сервера (без строк) и распознанный инвойс: одиночные поля товара — строка 1. Все пусто — строк нет.
 * Количество, единица и стоимость в строку не копируются: единственная строка без них берёт гр. 41 / гр. 42 товара
 * (rowMeasure, gr31Text, сервер), а копия не следовала бы правкам гр. 41 / гр. 42 (итоговое ревью пакета 7, I1).
 */
export interface LegacyGoodsFields {
  tradeMarkName?: string | null
  productMarkName?: string | null
  productModelName?: string | null
  productArticle?: string | null
  manufacturerName?: string | null
  extras?: { productSortName?: string | null; standardName?: string | null } | null
}
export function rowsFromLegacy(g: LegacyGoodsFields): GoodsRowValue[] {
  const row: GoodsRowValue = {
    ...blankCharacteristic(),
    tradeMarkName: g.tradeMarkName ?? null,
    productMarkName: g.productMarkName ?? null,
    productModelName: g.productModelName ?? null,
    productArticle: g.productArticle ?? null,
    manufacturerName: g.manufacturerName ?? null,
    productSortName: g.extras?.productSortName ?? null,
    standardName: g.extras?.standardName ?? null,
  }
  return isBlankCharacteristic(row) ? [] : [row]
}

/** Товарные знаки всех строк товара (ТРОИС). */
export const tradeMarksOf = (g: Pick<Import40GoodsItemInput, 'characteristics'>): string[] =>
  (g.characteristics ?? []).map((r) => (r.tradeMarkName ?? '').trim()).filter((s) => s !== '')

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/**
 * Итоги строк против товара: количество — только строк в единице гр. 41 (иначе складывать нечего), стоимость — всех
 * строк со стоимостью. Расхождение — предупреждение (не блок): null — сверять нечего или совпало.
 */
export interface CharacteristicTotals {
  /** Сумма количества строк в единице гр. 41 (null — таких строк нет или у товара нет ДЕИ). */
  quantity: number | null
  /** Сумма стоимостей строк (null — ни у одной строки нет стоимости). */
  value: number | null
  quantityMismatch: boolean
  valueMismatch: boolean
}
export function characteristicTotals(
  g: Pick<Import40GoodsItemInput, 'characteristics' | 'quantity' | 'unitCode' | 'customsValue'>,
): CharacteristicTotals {
  const rows = g.characteristics ?? []
  const unit = okeiCode(g.unitCode)
  const inUnit = unit ? rows.filter((r) => r.quantity != null && okeiCode(r.unitCode) === unit) : []
  const quantity = inUnit.length ? round6(inUnit.reduce((s, r) => s + (r.quantity ?? 0), 0)) : null
  const priced = rows.filter((r) => r.invoiceValue != null)
  const value = priced.length ? round6(priced.reduce((s, r) => s + (r.invoiceValue ?? 0), 0)) : null
  return {
    quantity,
    value,
    quantityMismatch: quantity != null && g.quantity != null && quantity !== round6(g.quantity),
    valueMismatch: value != null && g.customsValue != null && value !== round6(g.customsValue),
  }
}

/**
 * Строка, которая следует за товаром (гр. 41 / гр. 42): единственная непустая строка; непустых нет — единственная строка
 * таблицы (новая пустая). Иначе (2+ строк) — null: подстановки нет. То же правило, что сервер (Measure, Gr31Text).
 */
export function singleRowOf(rows: readonly GoodsRowValue[] | null | undefined): GoodsRowValue | null {
  const all = rows ?? []
  const filled = all.filter((r) => !isBlankCharacteristic(r))
  if (filled.length === 1) return filled[0]
  return !filled.length && all.length === 1 ? all[0] : null
}

/**
 * Количество строки для XML и текста гр. 31 (то же правило, что сервер Import40GoodsCharacteristics.Measure): своё количество
 * с единицей; у единственной строки без них — гр. 41 товара (singleOf), как до строк; иначе — своё количество без единицы.
 */
export function rowMeasure(
  r: GoodsRowValue,
  singleOf: { quantity?: number | null; unitCode?: string | null } | null,
): { quantity: number; unitCode: string | null } | null {
  const unit = (r.unitCode ?? '').trim()
  if (r.quantity != null && unit) return { quantity: r.quantity, unitCode: unit }
  if (singleOf && singleOf.quantity != null) return { quantity: singleOf.quantity, unitCode: (singleOf.unitCode ?? '').trim() || null }
  return r.quantity != null ? { quantity: r.quantity, unitCode: null } : null
}

/**
 * Строки, которые уйдут в XML без количества (предупреждение, не блок — как в готовности сервера): номера строк с 1.
 * noUnit — количество есть, а единицы нет; noQuantity — при 2+ строках у строки нет количества.
 */
export function rowsWithoutMeasure(
  g: Pick<Import40GoodsItemInput, 'characteristics' | 'quantity' | 'unitCode'>,
): { noUnit: number[]; noQuantity: number[] } {
  const all = g.characteristics ?? []
  const filled = all.filter((r) => !isBlankCharacteristic(r)).length
  const res = { noUnit: [] as number[], noQuantity: [] as number[] }
  // Номера — позиции в таблице (пустые строки пропускаются, но не сдвигают номера).
  all.forEach((r, i) => {
    if (isBlankCharacteristic(r)) return
    const m = rowMeasure(r, filled === 1 ? g : null)
    if (m?.unitCode) return
    if (r.quantity != null) res.noUnit.push(i + 1)
    else if (filled > 1) res.noQuantity.push(i + 1)
  })
  return res
}

/** Предел строк у товара — как у сервера (Import40GoodsCharacteristics.MaxRows: больше — 400). */
export const CHARACTERISTICS_MAX_ROWS = 500

/**
 * Поля строки по порядку колонок таблицы (как окно КЕДЕН): вид значения и предел длины по структуре ДТ (Решение Коллегии
 * ЕЭК №75): знак, марка, модель, сорт — Name250; артикул — Id50; стандарт — 40; производитель — 300 (как прежнее поле);
 * наименование строки в XML не идёт (только текст гр. 31) — 500. f — суффикс data-f поля («char-{i}-{f}») и подписи колонки
 * broker.dt.goods.editor.chars.col.<f>.
 */
export type CharacteristicField = keyof GoodsRowValue
export interface CharacteristicFieldDef {
  key: CharacteristicField
  kind: 'text' | 'number' | 'unit'
  max?: number
  f: string
}
export const CHARACTERISTIC_FIELDS: readonly CharacteristicFieldDef[] = [
  { key: 'name', kind: 'text', max: 500, f: 'name' },
  { key: 'quantity', kind: 'number', f: 'quantity' },
  { key: 'unitCode', kind: 'unit', f: 'unit' },
  { key: 'invoiceValue', kind: 'number', f: 'value' },
  { key: 'manufacturerName', kind: 'text', max: 300, f: 'manufacturer' },
  { key: 'tradeMarkName', kind: 'text', max: 250, f: 'tradeMark' },
  { key: 'productMarkName', kind: 'text', max: 250, f: 'mark' },
  { key: 'productModelName', kind: 'text', max: 250, f: 'model' },
  { key: 'productArticle', kind: 'text', max: 50, f: 'article' },
  { key: 'standardName', kind: 'text', max: 40, f: 'standard' },
  { key: 'productSortName', kind: 'text', max: 250, f: 'sort' },
  { key: 'serialNumbers', kind: 'text', max: 2000, f: 'serials' },
]
export const characteristicField = (key: CharacteristicField): CharacteristicFieldDef =>
  CHARACTERISTIC_FIELDS.find((c) => c.key === key)!

/**
 * Сумма количества строк по единицам (код ОКЕИ, '' — без единицы) — итог под таблицей: «1 800 ШТ · 25 КГ».
 * Порядок — первого появления единицы.
 */
export function quantityByUnit(rows: readonly GoodsRowValue[] | null | undefined): { unitCode: string; quantity: number }[] {
  const sums = new Map<string, number>()
  for (const r of rows ?? []) {
    if (r.quantity == null) continue
    const u = okeiCode(r.unitCode)
    sums.set(u, (sums.get(u) ?? 0) + r.quantity)
  }
  return [...sums].map(([unitCode, q]) => ({ unitCode, quantity: round6(q) }))
}
