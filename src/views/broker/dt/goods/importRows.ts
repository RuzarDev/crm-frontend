// Импорт в ДТ (пакет 21.10.2026): единый вид строки импорта — из Excel («Из Excel» в товарах ДТ и дочитка Excel «Из
// документов») и из разбора Zircon AI. Дальше строки сливаются (importMerge), коды проверяются (importResolve), товары
// ДТ строятся по одним правилам (importBuild).
import type { Import40ExtractionGoodsExtra, Import40ExtractionPreviewGoodsItem } from '@/api/import40'
import { ABSENT, type GoodsExcelRow } from '@/utils/goodsExcel'
import { countryFromText, type CountryOption } from '@/utils/importText'

/** Документ гр. 44 строки шаблона декларанта («КОД / НОМЕР / ДАТА ДОКУМЕНТА», инвойс 04021). */
export interface ImportDocRef {
  typeCode: string
  number: string
  /** 'YYYY-MM-DD' */
  date: string | null
}

export interface ImportRow {
  /** Файл/лист («invoice.xlsx», «book.xlsx · Packing list») или «Zircon AI». */
  source: string
  /** № строки таблицы — первый ключ сопоставления инвойса и упаковочного листа. */
  lineNo: number | null
  description: string | null
  /** «ХАРАКТЕРИСТИКА» — наименование строки гр. 31. */
  rowName: string | null
  /** Код как в файле, только цифры (не проверен). */
  tnvedCode: string | null
  quantity: number | null
  /** Единица количества как в файле («шт», «PCS», «pairs») — столбец или заголовок количества. */
  unitText: string | null
  places: number | null
  grossWeightKg: number | null
  netWeightKg: number | null
  value: number | null
  currency: string | null
  /** Цифровой ОКСМ. */
  countryCode: string | null
  /** Страна текстом, которую не узнали. */
  originText: string | null
  packageAvailabilityCode: string | null
  /** «Вид упаковки» из столбца («CT», «картонная коробка», «PC»). */
  packageKindText: string | null
  packageQuantity: number | null
  /** Подсказка вида упаковки из документа: заголовок столбца мест («Cartons»), строка «Упаковка / 包装: …». */
  packagingHint: string | null
  manufacturerName: string | null
  tradeMarkName: string | null
  productMarkName: string | null
  productModelName: string | null
  productArticle: string | null
  standardName: string | null
  productSortName: string | null
  serialNumbers: string | null
  cargoPartQuantity: number | null
  individualPackages: number | null
  ntins: string[]
  gtin: string | null
  docs: ImportDocRef[]
}

/** Документ импорта: файл или лист книги — инвойс, упаковочный лист или неизвестно. */
export interface ImportDoc {
  source: string
  kind: 'invoice' | 'packing' | null
  rows: ImportRow[]
}

/** Код вида документа «Инвойс» гр. 44. */
export const INVOICE_DOC_CODE = '04021'

const digits = (v: string | null | undefined) => {
  const d = (v ?? '').replace(/[\s.\-]/g, '')
  return d ? d : null
}
const text = (v: string | null | undefined) => {
  const t = (v ?? '').trim()
  return t ? t : null
}
/** Сведение строки гр. 31 из разбора: «Отсутствует», «нет», «-» — пусто, как в «Из Excel» (решение В23 — у владельца). */
const detail = (v: string | null | undefined) => {
  const t = text(v)
  return t && !ABSENT.test(t) ? t : null
}

export const emptyImportRow = (source: string): ImportRow => ({
  source, lineNo: null, description: null, rowName: null, tnvedCode: null, quantity: null, unitText: null, places: null,
  grossWeightKg: null, netWeightKg: null, value: null, currency: null, countryCode: null, originText: null,
  packageAvailabilityCode: null, packageKindText: null, packageQuantity: null, packagingHint: null, manufacturerName: null,
  tradeMarkName: null, productMarkName: null, productModelName: null, productArticle: null, standardName: null,
  productSortName: null, serialNumbers: null, cargoPartQuantity: null, individualPackages: null, ntins: [], gtin: null, docs: [],
})

/** Строка Excel (goodsExcel, с опцией details) → строка импорта. packagingHint — заголовок мест / строка «Упаковка: …». */
export function fromExcelRow(r: GoodsExcelRow, source: string, packagingHint: string | null = null): ImportRow {
  const d = r.details
  const docs: ImportDocRef[] = []
  if (d?.docTypeCode && d.docNumber) docs.push({ typeCode: d.docTypeCode, number: d.docNumber, date: d.docDate })
  if (d?.invoiceNumber) docs.push({ typeCode: INVOICE_DOC_CODE, number: d.invoiceNumber, date: d.invoiceDate })
  return {
    ...emptyImportRow(source),
    lineNo: d?.lineNo ?? null,
    description: text(r.description),
    rowName: d?.rowName ?? null,
    tnvedCode: digits(r.tnvedCode),
    quantity: r.quantity ?? null,
    unitText: d?.measureUnit ?? null,
    places: r.packagesCount ?? null,
    grossWeightKg: r.grossWeightKg ?? null,
    netWeightKg: r.netWeightKg ?? null,
    value: r.customsValue ?? null,
    currency: text(r.currency),
    countryCode: r.countryOfOrigin ?? null,
    originText: d?.originText ?? null,
    packageAvailabilityCode: d?.packageAvailabilityCode ?? null,
    // В общем разборе «Вид упаковки товара» — в unit (так нужно транзиту); в ДТ это вид упаковки гр. 31 (X1).
    packageKindText: text(r.unit),
    packageQuantity: d?.packageQuantity ?? null,
    packagingHint,
    manufacturerName: d?.manufacturerName ?? null,
    tradeMarkName: d?.tradeMarkName ?? null,
    productMarkName: d?.productMarkName ?? null,
    productModelName: d?.productModelName ?? null,
    productArticle: d?.productArticle ?? null,
    standardName: d?.standardName ?? null,
    productSortName: d?.productSortName ?? null,
    serialNumbers: d?.serialNumbers ?? null,
    cargoPartQuantity: d?.cargoPartQuantity ?? null,
    individualPackages: d?.individualPackages ?? null,
    ntins: [...new Set(r.ntins ?? [])],
    gtin: r.gtin ?? null,
    docs,
  }
}

/** Товар предпросмотра «Из документов» (Zircon AI) + его extras → строка импорта. */
export function fromExtraction(
  item: Import40ExtractionPreviewGoodsItem, extra: Import40ExtractionGoodsExtra | null | undefined, source: string,
  countries: readonly CountryOption[] = [],
): ImportRow {
  const code = text(item.countryOfOrigin)
  const countryCode = (code ? countryFromText(code, countries) : null) ?? countryFromText(extra?.originText, countries)
  return {
    ...emptyImportRow(source),
    description: text(item.description),
    tnvedCode: digits(item.tnvedCode),
    quantity: item.quantity ?? null,
    unitText: text(extra?.measureUnitText),
    places: item.packagesCount ?? null,
    grossWeightKg: item.grossWeightKg ?? null,
    netWeightKg: item.netWeightKg ?? null,
    value: item.invoiceValue ?? null,
    currency: text(item.currency),
    countryCode,
    originText: countryCode ? null : text(extra?.originText) ?? (code && !countryCode ? code : null),
    packageKindText: text(extra?.packageKindText),
    manufacturerName: detail(item.manufacturerName),
    tradeMarkName: detail(item.tradeMarkName),
    productMarkName: detail(item.productMarkName),
    productModelName: detail(item.productModelName),
    productArticle: detail(item.productArticle),
  }
}

/** Есть ли у строки числа (веса, места, стоимость, количество) — иначе это «товар» без сведений (подсказка, только код). */
export const rowHasNumbers = (r: ImportRow): boolean =>
  [r.grossWeightKg, r.netWeightKg, r.places, r.value, r.quantity].some((v) => v != null && v !== 0)
