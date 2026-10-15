// Импорт товаров из Excel «КЕДЕН ШАПКА» (правила разбора — прежние, общие): первый лист, первая строка —
// заголовки. Им пользуются раздел «Товары» записи транзита и раздел «Товары» ДТ (views/broker/dt/goods,
// с предпросмотром). Строки добавляются в конец списка — это делает экран.
import { loadXlsx } from '@/utils/xlsx'
import { parseCodes } from '@/views/broker/dt/goods/editor/tradeCodes'
import type { ReestrGoodsItemInput } from '@/types/api'

/**
 * Строка Excel. NTIN/GTIN (гр. 33.3, ДТ) — только с опцией tradeCodes: транзит их не знает, и лишние поля не должны
 * уйти в его товары.
 */
export type GoodsExcelRow = ReestrGoodsItemInput & { ntins?: string[]; gtin?: string | null }

export interface GoodsExcelOptions {
  /** Столбцы «NTIN» и «GTIN» (гр. 33.3 ДТ): коды через запятую/пробел/перевод строки. */
  tradeCodes?: boolean
}

export const GOODS_EXCEL_ACCEPT = '.xlsx,.xls'

/** Прежняя проверка файла: только .xlsx / .xls (иначе экран пишет dt.dopustimTolkoExcel). */
export function isExcelFileName(name: string): boolean {
  const n = name.toLowerCase()
  return n.endsWith('.xlsx') || n.endsWith('.xls')
}

export type GoodsExcelProblem = 'noSheets' | 'empty' | 'noGoods'

/** Ключи i18n для проблем разбора (тексты прежние). */
export const GOODS_EXCEL_MESSAGES: Record<GoodsExcelProblem, string> = {
  noSheets: 'dt.vFayleNetListov',
  empty: 'dt.faylPust',
  noGoods: 'dt.neNaydenoTovarovDlya',
}

// Столбцы источника нестабильны по написанию (пробелы/регистр/лишние слова),
// поэтому матчим заголовки по нормализованной подстроке, а не точным именам.
type ExcelField = 'tnvedCode' | 'description' | 'grossWeightKg' | 'quantity' | 'unit' | 'packagesCount' | 'ntins' | 'gtin'

const EXCEL_COLUMN_MATCHERS: { field: ExcelField; patterns: string[] }[] = [
  { field: 'tnvedCode', patterns: ['кодтнвэд'] },
  { field: 'description', patterns: ['коммерческоеописание'] },
  { field: 'grossWeightKg', patterns: ['брутто'] },
  { field: 'quantity', patterns: ['количествотовара'] },
  { field: 'unit', patterns: ['видупаковкитовара'] },
  { field: 'packagesCount', patterns: ['количествогрузовыхмест'] },
  // Гр. 33.3 (только ДТ, опция tradeCodes): «NTIN», «NTIN (гр. 33.3)», «GTIN или другой идентификационный код (артикул)».
  { field: 'ntins', patterns: ['ntin'] },
  { field: 'gtin', patterns: ['gtin'] },
]
const TRADE_CODE_FIELDS: ReadonlySet<ExcelField> = new Set(['ntins', 'gtin'])

/**
 * Ячейка с кодами (NTIN/GTIN). Excel хранит код числом и теряет ведущий ноль: NTIN «0200…» (13 цифр) читается как
 * 12-значное «200…» — ноль возвращаем. Текст — как есть (несколько кодов через запятую/перевод строки).
 */
function excelCodes(v: unknown): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v)) {
    const s = Math.round(v).toString()
    return s.length === 12 && s.startsWith('2') ? `0${s}` : s
  }
  return excelToStr(v)
}

function normalizeHeader(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

function excelToStr(v: unknown): string | null {
  if (v == null || v === '') return null
  const s = String(v).trim()
  return s || null
}

function excelToNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return isNaN(n) ? null : n
}

/** Товары из строк листа (первая — заголовки). Пустые строки пропускаются. */
export function goodsFromSheetRows(rows: unknown[][], opts: GoodsExcelOptions = {}): GoodsExcelRow[] {
  const headerRow = rows[0] ?? []
  const colIndex: Partial<Record<ExcelField, number>> = {}
  headerRow.forEach((cell, idx) => {
    const norm = normalizeHeader(cell)
    if (!norm) return
    for (const matcher of EXCEL_COLUMN_MATCHERS) {
      if (colIndex[matcher.field] != null) continue
      if (!opts.tradeCodes && TRADE_CODE_FIELDS.has(matcher.field)) continue
      if (matcher.patterns.some((p) => norm.includes(p))) {
        colIndex[matcher.field] = idx
        break
      }
    }
  })

  const goods: GoodsExcelRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every((c) => c == null || c === '')) continue

    const tnvedCode = colIndex.tnvedCode != null ? excelToStr(row[colIndex.tnvedCode]) : null
    const description = colIndex.description != null ? excelToStr(row[colIndex.description]) : null
    const grossWeightKg = colIndex.grossWeightKg != null ? excelToNum(row[colIndex.grossWeightKg]) : null
    const quantity = colIndex.quantity != null ? excelToNum(row[colIndex.quantity]) : null
    const unit = colIndex.unit != null ? excelToStr(row[colIndex.unit]) : null
    const packagesCount = colIndex.packagesCount != null ? excelToNum(row[colIndex.packagesCount]) : null

    const ntinsCell = colIndex.ntins != null ? excelCodes(row[colIndex.ntins]) : null
    const ntins = ntinsCell ? parseCodes(ntinsCell) : []
    const gtinCell = colIndex.gtin != null ? excelCodes(row[colIndex.gtin]) : null
    // Несколько GTIN в ячейке — по одному в строке (как в поле редактора).
    const gtin = gtinCell ? gtinCell.split(/[\r\n,;]+/).map((s) => s.trim()).filter(Boolean).join('\n') || null : null

    const isEmptyRow =
      !tnvedCode && !description && grossWeightKg == null && quantity == null && unit == null && packagesCount == null
      && !ntins.length && !gtin
    if (isEmptyRow) continue

    goods.push({
      ...(opts.tradeCodes ? { ntins, gtin } : {}),
      description,
      tnvedCode,
      tnvedDescription: description,
      countryOfOrigin: null,
      quantity,
      unit,
      unitCode: null,
      grossWeightKg,
      netWeightKg: null,
      packagesCount,
      quantityTypeCode: null,
      customsValue: null,
      currency: null,
    })
  }
  return goods
}

/**
 * Читает первый лист файла. Проблема разбора — { problem } (экран показывает предупреждение);
 * файл, который не читается, — исключение (экран показывает dt.neUdalosProchitatFayl).
 */
export async function readGoodsExcel(
  file: Blob,
  opts: GoodsExcelOptions = {},
): Promise<{ goods: GoodsExcelRow[] } | { problem: GoodsExcelProblem }> {
  const XLSX = await loadXlsx()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return { problem: 'noSheets' }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: null, raw: true })
  if (!rows.length) return { problem: 'empty' }
  const goods = goodsFromSheetRows(rows, opts)
  return goods.length ? { goods } : { problem: 'noGoods' }
}
