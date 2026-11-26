// «Из Excel» в ПИ/ТД авто-транзита: книга брокера «инвойс + упаковочный» (.xls из двух листов: INVOICE и PACKING LIST).
// Лист товаров инвойса читается существующим разбором (goodsFromSheetRows); лист упаковочного узнаётся по заголовкам
// (G.KGS / GROSS / брутто, N.KGS / NET / нетто, PIECES / PCS / QTY, CTNS / мест) и дополняет только пустые поля товаров:
// брутто, нетто, количество, места. Валюта — из заголовка стоимости/цены («PRICE $») или из шапки («Currency: USD»).
// Включается пропсом workbook у SectionGoods; без него «Из Excel» работает как раньше (общий разбор не менялся).
import { loadXlsx } from '@/utils/xlsx'
import {
  GOODS_SHEET_MAX_COLS, GOODS_SHEET_MAX_ROWS, findGoodsHeader, goodsFromSheetRows, goodsHeaderColumns, normalizeHeader,
  type GoodsExcelProblem, type GoodsExcelRow,
} from '@/utils/goodsExcel'

/** Сколько у товаров дополнено из упаковочного листа и откуда валюта. */
export interface GoodsWorkbookReport {
  /** Лист упаковочного найден и применён. */
  packingSheet: string | null
  gross: number
  net: number
  quantity: number
  places: number
  currency: number
  /** Строки без пары («описание» из упаковочного или инвойса, когда число строк разное). */
  unmatched: string[]
}

export type GoodsWorkbookResult = { goods: GoodsExcelRow[]; report: GoodsWorkbookReport } | { problem: GoodsExcelProblem }

const PACKING_HEADER_SCAN_ROWS = 30
const TOTAL_TEXT = /(^|[\s/|(])(итого|всего|total|subtotal|grand\s*total|合计|总计)(?=$|[\s:.,;/)])/i

type PackingField = 'description' | 'places' | 'quantity' | 'net' | 'gross' | 'code'

/** Заголовок столбца упаковочного листа → поле. Проверяется строго по порядку: «N.KGS» — нетто, «G.KGS» — брутто. */
function packingField(raw: unknown): PackingField | null {
  const n = normalizeHeader(raw)
  if (!n) return null
  if (/^(gkgs?|gw|grossweight(kg)?|gross|брутто\S*|毛重|ttlgw)$/.test(n) || /grossw|брутто|毛重|gkgs/.test(n)) return 'gross'
  if (/^(nkgs?|nw|netweight(kg)?|net|netto|нетто\S*|净重|ttlnw)$/.test(n) || /netw|нетто|净重|nkgs/.test(n)) return 'net'
  if (/^(pieces|pcs|qty|quantity|pc|колво|количество|кол|数量)$/.test(n) || /pieces|количество|колво|数量/.test(n)) return 'quantity'
  if (/^(ctns?|cartons?|pkgs|packages|boxes|мест|места|件数|箱数)$/.test(n) || /ctns|cartons|грузовыхмест|колвомест|количествомест/.test(n)) return 'places'
  if (/hscode|тнвэд|тнвед|海关编码|^hs$/.test(n)) return 'code'
  if (/^(description|descriptionofgoods|goodsname|наименование\S*|описание\S*|товар|товары|品名|货物名称|name|product)$/.test(n)
    || /description|наименование|описание|品名/.test(n)) return 'description'
  return null
}

interface PackingTable { header: number; cols: Partial<Record<PackingField, number>> }

/** Строка заголовков упаковочного листа: есть описание и хотя бы брутто/нетто/штуки (без них — не упаковочный). */
function findPackingHeader(rows: unknown[][]): PackingTable | null {
  let best: { table: PackingTable; score: number } | null = null
  for (let i = 0; i < Math.min(rows.length, PACKING_HEADER_SCAN_ROWS); i++) {
    const cols: Partial<Record<PackingField, number>> = {}
    ;(rows[i] ?? []).forEach((cell, c) => {
      const f = packingField(cell)
      if (f && cols[f] == null) cols[f] = c
    })
    if (cols.description == null) continue
    const weights = (cols.gross != null ? 1 : 0) + (cols.net != null ? 1 : 0) + (cols.quantity != null ? 1 : 0)
    if (!weights) continue
    const score = weights * 2 + (cols.places != null ? 1 : 0) + (cols.code != null ? 1 : 0)
    if (!best || score > best.score) best = { table: { header: i, cols }, score }
  }
  return best?.table ?? null
}

const toNum = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null
  if (v == null) return null
  let s = String(v).replace(/[\s ]/g, '')
  if (!s) return null
  const comma = s.lastIndexOf(',')
  const dot = s.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (comma >= 0) s = s.indexOf(',') !== comma ? s.replace(/,/g, '') : s.replace(',', '.')
  const n = parseFloat(s.replace(/[^0-9.+-]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : null
}

interface PackingRow {
  description: string
  code: string | null
  places: number | null
  quantity: number | null
  net: number | null
  gross: number | null
}

function packingRows(rows: unknown[][], table: PackingTable): PackingRow[] {
  const out: PackingRow[] = []
  const at = (row: unknown[], f: PackingField) => (table.cols[f] != null ? row[table.cols[f]!] : null)
  for (let i = table.header + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every((c) => c == null || c === '')) continue
    const description = String(at(row, 'description') ?? '').trim()
    const first = row.find((c) => typeof c === 'string' && c.trim()) as string | undefined
    if (TOTAL_TEXT.test(description) || (!description && first && TOTAL_TEXT.test(first))) continue
    const code = String(at(row, 'code') ?? '').replace(/\D/g, '')
    const r: PackingRow = {
      description, code: code.length >= 6 ? code : null, places: toNum(at(row, 'places')), quantity: toNum(at(row, 'quantity')),
      net: toNum(at(row, 'net')), gross: toNum(at(row, 'gross')),
    }
    if (!description && !r.code) continue
    if (r.places == null && r.quantity == null && r.net == null && r.gross == null) continue
    out.push(r)
  }
  return out
}

/** Описание без регистра, пробелов и знаков — для сопоставления строк двух листов. */
const descKey = (s: string | null | undefined): string => normalizeHeader(s)

const digitsOf = (s: string | null | undefined): string => (s ?? '').replace(/\D/g, '')

/**
 * Сопоставление строк упаковочного и инвойса: равное число — по порядку; иначе по описанию (без регистра и пробелов)
 * или коду. Возвращает пары (индекс товара → строка упаковочного) и подписи строк без пары.
 */
function pairRows(goods: GoodsExcelRow[], packing: PackingRow[]): { pairs: Map<number, PackingRow>; unmatched: string[] } {
  const pairs = new Map<number, PackingRow>()
  if (goods.length === packing.length) {
    packing.forEach((p, i) => pairs.set(i, p))
    return { pairs, unmatched: [] }
  }
  const unmatched: string[] = []
  const used = new Set<number>()
  for (const p of packing) {
    const key = descKey(p.description)
    let idx = key ? goods.findIndex((g, i) => !used.has(i) && descKey(g.description) === key) : -1
    if (idx < 0 && p.code) idx = goods.findIndex((g, i) => !used.has(i) && digitsOf(g.tnvedCode) === p.code)
    if (idx < 0) {
      unmatched.push(p.description || p.code || '?')
      continue
    }
    used.add(idx)
    pairs.set(idx, p)
  }
  goods.forEach((g, i) => { if (!used.has(i)) unmatched.push(g.description || g.tnvedCode || '?') })
  return { pairs, unmatched }
}

/** Валюта по знаку или слову: «$»/USD → USD, «¥»/RMB/CNY → CNY, «€»/EUR → EUR, «₽»/RUB → RUB, «₸»/KZT → KZT. */
export function currencyFromText(text: unknown): string | null {
  const s = String(text ?? '')
  if (!s.trim()) return null
  if (/\$|\busd\b|dollar|доллар/i.test(s)) return 'USD'
  if (/¥|￥|\brmb\b|\bcny\b|yuan|юан|人民币|元/i.test(s)) return 'CNY'
  if (/€|\beur\b|euro|евро/i.test(s)) return 'EUR'
  if (/₽|\brub\b|руб/i.test(s)) return 'RUB'
  if (/₸|\bkzt\b|тенге/i.test(s)) return 'KZT'
  return null
}

/** Валюта шапки: ячейка «Currency / Валюта / 币种» — значение в той же ячейке после двоеточия или в следующей непустой. */
function currencyFromHeaderRows(rows: unknown[][], upTo: number): string | null {
  for (let i = 0; i < Math.min(upTo, rows.length); i++) {
    const row = rows[i] ?? []
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]
      if (typeof cell !== 'string' || !/currency|валюта|币种/i.test(cell)) continue
      const same = cell.split(/[:：]/).slice(1).join(':')
      const found = currencyFromText(same)
        ?? currencyFromText(row.slice(c + 1).find((x) => x != null && String(x).trim() !== ''))
      if (found) return found
    }
  }
  return null
}

/** Читает книгу и собирает товары инвойса с данными упаковочного листа и валютой. */
export async function readGoodsWorkbook(file: Blob): Promise<GoodsWorkbookResult> {
  const XLSX = await loadXlsx()
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', sheetRows: GOODS_SHEET_MAX_ROWS })
  if (!wb.SheetNames.length) return { problem: 'noSheets' }
  const sheets = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    let range: ReturnType<typeof XLSX.utils.decode_range> | undefined
    if (ws?.['!ref']) {
      range = XLSX.utils.decode_range(ws['!ref'])
      range.e.r = Math.min(range.e.r, range.s.r + GOODS_SHEET_MAX_ROWS - 1)
      range.e.c = Math.min(range.e.c, range.s.c + GOODS_SHEET_MAX_COLS - 1)
    }
    const rows = ws ? XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true, ...(range ? { range } : {}) }) : []
    const header = findGoodsHeader(rows)
    const hasCode = header ? goodsHeaderColumns(rows[header.index] ?? [], {}).tnvedCode != null : false
    return { name, rows, header, hasCode }
  })
  if (!sheets.some((x) => x.rows.length)) return { problem: 'empty' }

  // Лист инвойса: с кодом ТН ВЭД в шапке, затем по числу узнанных столбцов; первый по порядку при равенстве.
  let invoice: (typeof sheets)[number] | null = null
  for (const x of sheets) {
    if (!x.header) continue
    if (!invoice || (x.hasCode && !invoice.hasCode) || (x.hasCode === invoice.hasCode && x.header.score > invoice.header!.score)) invoice = x
  }
  const goods = invoice ? goodsFromSheetRows(invoice.rows) : []
  if (!invoice || !goods.length) return { problem: 'noGoods' }

  const report: GoodsWorkbookReport = { packingSheet: null, gross: 0, net: 0, quantity: 0, places: 0, currency: 0, unmatched: [] }

  for (const x of sheets) {
    if (x === invoice) continue
    const table = findPackingHeader(x.rows)
    if (!table) continue
    const packing = packingRows(x.rows, table)
    if (!packing.length) continue
    report.packingSheet = x.name
    const { pairs, unmatched } = pairRows(goods, packing)
    report.unmatched = unmatched
    pairs.forEach((p, i) => {
      const g = goods[i]!
      if (g.grossWeightKg == null && p.gross != null) { g.grossWeightKg = p.gross; report.gross++ }
      if (g.netWeightKg == null && p.net != null) { g.netWeightKg = p.net; report.net++ }
      if (g.quantity == null && p.quantity != null) { g.quantity = p.quantity; report.quantity++ }
      if (g.packagesCount == null && p.places != null) { g.packagesCount = p.places; report.places++ }
    })
    break
  }

  // Валюта пустым товарам: заголовок стоимости, затем цены, затем шапка листа инвойса.
  const headerIndex = invoice.header!.index
  const headerRow = invoice.rows[headerIndex] ?? []
  const cols = goodsHeaderColumns(headerRow, {}, invoice.rows.slice(headerIndex + 1, headerIndex + 201))
  const currency = (cols.customsValue != null ? currencyFromText(headerRow[cols.customsValue]) : null)
    ?? (cols.unitPrice != null ? currencyFromText(headerRow[cols.unitPrice]) : null)
    ?? currencyFromHeaderRows(invoice.rows, headerIndex + 1)
  if (currency) {
    for (const g of goods) {
      if (!g.currency) { g.currency = currency; report.currency++ }
    }
  }
  return { goods, report }
}
