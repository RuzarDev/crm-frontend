// Импорт товаров из Excel «КЕДЕН ШАПКА» (перенос из ReestrGoodsSection без изменения правил): первый лист,
// первая строка — заголовки. Им пользуются раздел «Товары» записи транзита и ReestrGoodsSection (форма ДТ,
// разбор пакета). Строки добавляются в конец списка — это делает экран.
import { loadXlsx } from '@/utils/xlsx'
import type { ReestrGoodsItemInput } from '@/types/api'

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
type ExcelField = 'tnvedCode' | 'description' | 'grossWeightKg' | 'quantity' | 'unit' | 'packagesCount'

const EXCEL_COLUMN_MATCHERS: { field: ExcelField; patterns: string[] }[] = [
  { field: 'tnvedCode', patterns: ['кодтнвэд'] },
  { field: 'description', patterns: ['коммерческоеописание'] },
  { field: 'grossWeightKg', patterns: ['брутто'] },
  { field: 'quantity', patterns: ['количествотовара'] },
  { field: 'unit', patterns: ['видупаковкитовара'] },
  { field: 'packagesCount', patterns: ['количествогрузовыхмест'] },
]

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
export function goodsFromSheetRows(rows: unknown[][]): ReestrGoodsItemInput[] {
  const headerRow = rows[0] ?? []
  const colIndex: Partial<Record<ExcelField, number>> = {}
  headerRow.forEach((cell, idx) => {
    const norm = normalizeHeader(cell)
    if (!norm) return
    for (const matcher of EXCEL_COLUMN_MATCHERS) {
      if (colIndex[matcher.field] != null) continue
      if (matcher.patterns.some((p) => norm.includes(p))) {
        colIndex[matcher.field] = idx
        break
      }
    }
  })

  const goods: ReestrGoodsItemInput[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every((c) => c == null || c === '')) continue

    const tnvedCode = colIndex.tnvedCode != null ? excelToStr(row[colIndex.tnvedCode]) : null
    const description = colIndex.description != null ? excelToStr(row[colIndex.description]) : null
    const grossWeightKg = colIndex.grossWeightKg != null ? excelToNum(row[colIndex.grossWeightKg]) : null
    const quantity = colIndex.quantity != null ? excelToNum(row[colIndex.quantity]) : null
    const unit = colIndex.unit != null ? excelToStr(row[colIndex.unit]) : null
    const packagesCount = colIndex.packagesCount != null ? excelToNum(row[colIndex.packagesCount]) : null

    const isEmptyRow =
      !tnvedCode && !description && grossWeightKg == null && quantity == null && unit == null && packagesCount == null
    if (isEmptyRow) continue

    goods.push({
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
export async function readGoodsExcel(file: Blob): Promise<{ goods: ReestrGoodsItemInput[] } | { problem: GoodsExcelProblem }> {
  const XLSX = await loadXlsx()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return { problem: 'noSheets' }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: null, raw: true })
  if (!rows.length) return { problem: 'empty' }
  const goods = goodsFromSheetRows(rows)
  return goods.length ? { goods } : { problem: 'noGoods' }
}
