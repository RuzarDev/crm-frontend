// Гр. 31 «Характеристики товара в группе» (как окно КЕДЕН, пакет 7): строки товара — наименование, количество в своей
// единице ОКЕИ (не гр. 41), фактурная стоимость (валюта гр. 22), производитель, товарный знак, марка, модель, артикул,
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

/** Прежний ответ сервера (без строк): одиночные поля товара — строка 1. Все пусто — строк нет. */
export interface LegacyGoodsFields {
  quantity?: number | null
  unitCode?: string | null
  invoiceValue?: number | null
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
    quantity: g.quantity ?? null,
    unitCode: g.unitCode ?? null,
    invoiceValue: g.invoiceValue ?? null,
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
