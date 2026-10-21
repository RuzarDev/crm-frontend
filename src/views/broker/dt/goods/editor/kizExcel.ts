import type { Import40GoodsItemInput, Import40GoodsMarking } from '@/types/api'
import { loadXlsx } from '@/utils/xlsx'
import { ABSENT, TOTAL_ROW, findGoodsHeader, goodsHeaderColumns, normalizeHeader } from '@/utils/goodsExcel'
import {
  contentBetter, contentQualifies, isCodeLike, isKizCode, isValidCode, kizColumnStats, kizHeaderRank, kizKey, kizNumberProblem,
  splitKizText,
} from './kizCodes'

// «Из Excel» для кодов идентификации гр. 31.13 (правка №12): прежде номер всегда брался из столбца A первого листа —
// у обычного инвойса туда попадал номер инвойса. Теперь столбец кодов ищется во всех листах: по шапке («GTIN»,
// «Штрих-код», «EAN-13», «Barcode», «条形码», «КИЗ»…), иначе по содержимому (12–14 цифр с контрольной цифрой GS1).
// Старый файл без шапки (пакет 5: номер · уровень · идентификатор · вид) распознаётся по-прежнему. Ничего не
// добавляется без предпросмотра (KizExcelModal): там же выбор столбца вручную и раскладка по товарам ДТ.

export interface KizSheet {
  name: string
  /** sheet_to_json raw:true — значения. */
  rows: unknown[][]
  /** sheet_to_json raw:false — отображаемый текст (ведущие нули пользовательского формата ячейки). */
  texts: unknown[][]
}
export type KizColumnSource = 'header' | 'content' | 'manual'
export interface KizCode {
  number: string
  /** Строка листа (с 0). */
  row: number
}
export interface KizColumn {
  sheet: number
  sheetName: string
  col: number
  letter: string
  /** Текст заголовка (если есть строка шапки). */
  header: string | null
  headerRow: number | null
  source: KizColumnSource
  /** Коды без повторов (с учётом уже введённых в товаре). */
  codes: KizCode[]
  /** С ошибкой GTIN без учёта идентификатора применения (предпросмотр пересчитывает по общим значениям). */
  badCheck: number
  /** Годные по содержимому: 12–14 цифр с верной контрольной цифрой GS1 или контрольный знак (выбор среди шапок). */
  valid: number
  duplicates: number
  /** Не коды: текст, «Итого», «нет», дробные числа. */
  skipped: number
  /** Числа, которые Excel хранит неточно (больше 15 цифр, «4.87181E+12»). */
  lossy: number
}
export interface KizLegacy {
  /** Строки с номером; уровень, идентификатор и вид — из файла, если в допустимом формате. */
  rows: Import40GoodsMarking[]
  /** Номера не в формате кода (текст, длиннее 100 знаков) — пропущены. */
  skipped: number
  /** Номера, искажённые Excel (больше 15 цифр, «4.87181E+12»). */
  lossy: number
}
export interface KizExcelScan {
  best: KizColumn | null
  /** Все непустые столбцы всех листов (выбор вручную); найденный — со своим источником. */
  options: KizColumn[]
  /** Старый формат без шапки — строки со значениями из файла. */
  legacy: KizLegacy | null
}

/** Шапку столбца кодов ищем в первых строках листа (сверху — реквизиты инвойса). */
const HEADER_SCAN_ROWS = 30

const colNumber = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1

/**
 * Диапазон листа — по реальным ячейкам. Выгрузки 1С/ERP объявляют «A1:AZ300000» при одной заполненной ячейке:
 * sheet_to_json с defval прошёл бы весь объявленный прямоугольник (секунды и сотни МБ на лист, вкладка могла упасть).
 * Только сужает: начало диапазона не меняется.
 */
export function trimSheetRange(ws: Record<string, unknown>): void {
  const ref = ws['!ref']
  const m = typeof ref === 'string' ? /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref) : null
  if (!m) return
  let maxR = -1
  let maxC = -1
  for (const k of Object.keys(ws)) {
    const a = /^([A-Z]+)(\d+)$/.exec(k)
    if (!a) continue
    maxR = Math.max(maxR, Number(a[2]) - 1)
    maxC = Math.max(maxC, colNumber(a[1]))
  }
  const r0 = Number(m[2]) - 1
  const c0 = colNumber(m[1])
  const r1 = Math.min(Number(m[4]) - 1, maxR)
  const c1 = Math.min(colNumber(m[3]), maxC)
  if (r1 < r0 || c1 < c0) return
  ws['!ref'] = `${m[1]}${m[2]}:${columnLetter(c1)}${r1 + 1}`
}

/** Все листы книги, каждый дважды (значения и текст) с одинаковыми опциями — матрицы совпадают по форме. */
export async function readKizWorkbook(file: Blob): Promise<KizSheet[]> {
  const XLSX = await loadXlsx()
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    trimSheetRange(ws as unknown as Record<string, unknown>)
    return {
      name,
      rows: XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: true, raw: true }),
      texts: XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: true, raw: false }),
    }
  })
}

export type KizCell = { codes: string[] } | { lossy: true } | null

/**
 * Коды из ячейки. Пусто — null. Число: дробное — не код ({ codes: [] }); больше 15 цифр или «e» — искажено Excel;
 * текст ячейки из одних цифр, длиннее и с тем же окончанием — ведущие нули формата («04871813090801»). Формат «Общий»
 * SheetJS показывает как «4.87181E+12» — поэтому текст только для нулей. Строка: «'» снимается, «4.87181E+12» —
 * искажено, цифры с пробелами склеиваются, несколько кодов через перевод строки, «,» и «;» делятся.
 */
export function cellCode(raw: unknown, text: unknown): KizCell {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw < 0) return { codes: [] }
    const s = String(raw)
    if (/e/i.test(s) || s.length > 15) return { lossy: true }
    const t = typeof text === 'string' ? text.trim() : ''
    return { codes: [/^\d+$/.test(t) && t.length > s.length && t.endsWith(s) ? t : s] }
  }
  if (typeof raw !== 'string') return { codes: [] }
  const s = raw.trim().replace(/^'+/, '').trim()
  if (!s) return null
  if (/^\d+([.,]\d+)?E\+?\d+$/i.test(s)) return { lossy: true }
  return { codes: splitKizText(s) }
}

/** A, B, …, Z, AA, … */
export function columnLetter(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

const at = (rows: readonly unknown[][], r: number, c: number): unknown => (Array.isArray(rows[r]) ? rows[r][c] ?? null : null)
const widthOf = (rows: readonly unknown[][]) => rows.reduce((w, r) => Math.max(w, Array.isArray(r) ? r.length : 0), 0)
const textOf = (v: unknown): string | null => {
  if (v == null) return null
  const s = String(v).trim().replace(/\s+/g, ' ')
  return s || null
}
/** «Итого / 合计 / TOTAL» в первой текстовой ячейке строки. */
const isTotalRow = (row: unknown): boolean => {
  if (!Array.isArray(row)) return false
  const first = row.find((c) => typeof c === 'string' && c.trim()) as string | undefined
  return !!first && TOTAL_ROW.test(first.trim())
}
// Строка шапки таблицы товаров — один раз на лист (нужна каждому столбцу при выборе вручную).
const goodsHeaderCache = new WeakMap<KizSheet, number | null>()
/** Строка шапки таблицы товаров листа (для подписи столбца и раскладки по товарам). */
const goodsHeaderRow = (sheet: KizSheet): number | null => {
  if (goodsHeaderCache.has(sheet)) return goodsHeaderCache.get(sheet)!
  const r = findGoodsHeader(sheet.rows, { details: true, tradeCodes: true })?.index ?? null
  goodsHeaderCache.set(sheet, r)
  return r
}

const HEADER_CELL_MAX = 40
const HEADER_CELL_WORDS = 3
/**
 * Ячейка с «GTIN / штрихкод / EAN…» — шапка столбца, только если похожа на шапку: строка шапки таблицы товаров, короткая
 * надпись (до 3 слов и 40 знаков) или строка, где узнаются ещё заголовки. Примечание «Note: barcode labels attached»
 * над таблицей шапкой не считается (описание товара «Сканер штрихкода» отсеивает уже счёт годных кодов).
 */
function headerLike(sheet: KizSheet, r: number, v: unknown): boolean {
  if (r === goodsHeaderRow(sheet)) return true
  const s = String(v).trim()
  if (s.length <= HEADER_CELL_MAX && s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length <= HEADER_CELL_WORDS) return true
  const row = sheet.rows[r]
  return Array.isArray(row) && Object.keys(goodsHeaderColumns(row, { details: true, tradeCodes: true })).length >= 2
}
/** Строка шапки столбца в первых строках листа (ранг и строка) — или null. */
function headerOf(sheet: KizSheet, c: number): { rank: number; row: number } | null {
  for (let r = 0; r < Math.min(sheet.rows.length, HEADER_SCAN_ROWS); r++) {
    const v = at(sheet.rows, r, c)
    const rank = kizHeaderRank(v)
    if (rank != null && headerLike(sheet, r, v)) return { rank, row: r }
  }
  return null
}
/** Повтор шапки внутри данных («GTIN», «EAN13» — постраничная выгрузка упаковочного листа): не код. */
const repeatedHeader = (v: unknown) => typeof v === 'string' && kizHeaderRank(v) != null && !/\d{8,}/.test(v)

const hasNtinHeader = (sheet: KizSheet, c: number) => {
  for (let r = 0; r < Math.min(sheet.rows.length, HEADER_SCAN_ROWS); r++) {
    const v = at(sheet.rows, r, c)
    if (typeof v === 'string' && normalizeHeader(v).includes('ntin')) return true
  }
  return false
}

/** Разбор столбца: content — только 12–14 цифр и контрольные знаки; header/manual — любой код в формате КИЗ. */
function buildColumn(
  sheets: readonly KizSheet[], si: number, col: number, headerRow: number | null, source: KizColumnSource,
  existing: ReadonlySet<string>,
): KizColumn {
  const sheet = sheets[si]
  const seen = new Set(existing)
  const codes: KizCode[] = []
  let badCheck = 0
  let valid = 0
  let duplicates = 0
  let skipped = 0
  let lossy = 0
  for (let r = headerRow == null ? 0 : headerRow + 1; r < sheet.rows.length; r++) {
    const raw = at(sheet.rows, r, col)
    if (repeatedHeader(raw)) { skipped += 1; continue }
    const cell = cellCode(raw, at(sheet.texts, r, col))
    if (!cell) continue
    if ('lossy' in cell) { lossy += 1; continue }
    if (!cell.codes.length) { skipped += 1; continue }
    const total = isTotalRow(sheet.rows[r])
    for (const c of cell.codes) {
      const ok = source === 'content' ? isCodeLike(c) : isKizCode(c) && (!total || isCodeLike(c))
      if (!ok) { skipped += 1; continue }
      const k = kizKey(c)
      if (seen.has(k)) { duplicates += 1; continue }
      seen.add(k)
      codes.push({ number: c, row: r })
      if (kizNumberProblem(c, null)) badCheck += 1
      if (isCodeLike(c) && isValidCode(c)) valid += 1
    }
  }
  return {
    sheet: si, sheetName: sheet.name, col, letter: columnLetter(col),
    header: headerRow == null ? null : textOf(at(sheet.rows, headerRow, col)),
    headerRow, source, codes, badCheck, valid, duplicates, skipped, lossy,
  }
}

/** Столбец, выбранный вручную: разбирается по правилам столбца по шапке (строка шапки — своя или таблицы товаров). */
export function kizColumn(sheets: readonly KizSheet[], sheet: number, col: number, existing: ReadonlySet<string>): KizColumn {
  const s = sheets[sheet]
  return buildColumn(sheets, sheet, col, headerOf(s, col)?.row ?? goodsHeaderRow(s), 'manual', existing)
}

const APPLICATIONS = ['00', '01', '02', '21', '91', '92']
const cellStr = (v: unknown): string | null => (v == null || v === '' ? null : String(v).trim() || null)

/**
 * Старый формат без шапки (пакет 5, «Книга1.xlsx»): у ≥80% строк с непустым A — B пусто или 0–4, C пусто / 1–2 цифры /
 * код применения, D пусто или 3 цифры, и заполнено C или D (в настоящих файлах есть идентификатор и вид; «GTIN | 2» —
 * это количество, а не уровень).
 */
export function isLegacyMarkingsSheet(rows: readonly unknown[][]): boolean {
  let n = 0
  let ok = 0
  for (const r of rows) {
    if (!Array.isArray(r) || cellStr(r[0]) == null) continue
    n += 1
    const b = cellStr(r[1])
    const c = cellStr(r[2])
    const d = cellStr(r[3])
    if ((b == null || /^[0-4]$/.test(b)) && (c == null || /^\d{1,2}$/.test(c) || APPLICATIONS.includes(c))
      && (d == null || /^\d{3}$/.test(d)) && (c != null || d != null)) ok += 1
  }
  return n > 0 && ok >= 0.8 * n
}

const legacyCell = (v: unknown): string | null => (v == null || v === '' ? null : String(v).trim() || null)
const pad2 = (v: unknown): string | null => {
  const s = legacyCell(v)
  return s == null ? null : s.length === 1 ? `0${s}` : s
}
const ifFormat = (v: string | null, re: RegExp) => (v != null && re.test(v) ? v : null)

/**
 * Старый формат: A — номер (как столбец кодов: заглавными, без «'», искажённые Excel числа и не коды — пропуск), B —
 * уровень (0–4), C — идентификатор применения (Excel теряет ведущий ноль у «02» — дополняем до 2 знаков; 2–4 цифры), D —
 * вид (3 цифры). Значение B–D не в формате — пусто (берётся из общих значений), а не текст в поле кода. Строки без номера
 * не берутся; флаги — «нет».
 */
export function parseLegacyMarkingsSheet(rows: readonly unknown[], texts: readonly unknown[] = []): KizLegacy {
  const out: Import40GoodsMarking[] = []
  let skipped = 0
  let lossy = 0
  rows.forEach((r, i) => {
    if (!Array.isArray(r)) return
    const t = texts[i]
    const cell = cellCode(r[0], Array.isArray(t) ? t[0] : null)
    if (!cell) return
    if ('lossy' in cell) { lossy += 1; return }
    const number = cell.codes.length === 1 && isKizCode(cell.codes[0]) ? cell.codes[0] : null
    if (!number) { skipped += 1; return }
    out.push({
      markingAfterRelease: false,
      kizCount: null,
      levelCode: ifFormat(legacyCell(r[1]), /^[0-4]$/),
      idTypeCode: ifFormat(legacyCell(r[3]), /^\d{3}$/),
      idApplicationCode: ifFormat(pad2(r[2]), /^\d{2,4}$/),
      number,
      aggregated: false,
    })
  })
  return { rows: out, skipped, lossy }
}

const keyOf = (c: { sheet: number; col: number }) => `${c.sheet}:${c.col}`

/**
 * Поиск столбца кодов: 1) по шапке в первых 30 строках каждого листа (ячейка, похожая на шапку — headerLike); из шапок —
 * больше годных GTIN (12–14 цифр с верной GS1), затем ранг образца, затем больше кодов; 2) нет шапки — старый формат без
 * шапки на первом листе; 3) по содержимому (годится, если кодов больше прочего и хотя бы половина с верной контрольной
 * цифрой; лучший — больше годных, больше разных, левее). Столбец по шапке без единого годного кода уступает столбцу по
 * содержимому: случайное «штрихкод» в описании товара не перебивает настоящий столбец GTIN.
 */
export function scanKizWorkbook(sheets: readonly KizSheet[], existing: ReadonlySet<string>): KizExcelScan {
  const byHeader: { rank: number; col: KizColumn }[] = []
  sheets.forEach((s, si) => {
    const w = widthOf(s.rows)
    for (let c = 0; c < w; c++) {
      const h = headerOf(s, c)
      if (h) byHeader.push({ rank: h.rank, col: buildColumn(sheets, si, c, h.row, 'header', existing) })
    }
  })
  const headerBest = byHeader.filter((x) => x.col.codes.length > 0)
    .sort((a, b) => b.col.valid - a.col.valid || a.rank - b.rank || b.col.codes.length - a.col.codes.length)[0]?.col ?? null
  let best = headerBest && headerBest.valid > 0 ? headerBest : null

  const legacy = !headerBest && sheets[0] && isLegacyMarkingsSheet(sheets[0].rows)
    ? parseLegacyMarkingsSheet(sheets[0].rows, sheets[0].texts) : null

  if (!best) {
    let bestStats: ReturnType<typeof kizColumnStats> | null = null
    let found: { si: number; c: number } | null = null
    for (let si = 0; si < sheets.length; si++) {
      const s = sheets[si]
      const w = widthOf(s.rows)
      for (let c = 0; c < w; c++) {
        // Столбец «NTIN» (гр. 33.3) — тоже 13 цифр с контрольной цифрой, но не КИЗ.
        if (hasNtinHeader(s, c)) continue
        const stats = kizColumnStats(s.rows.map((_, r) => {
          const cell = cellCode(at(s.rows, r, c), at(s.texts, r, c))
          if (!cell) return null
          return 'lossy' in cell || !cell.codes.length ? 'other' : cell.codes
        }))
        if (contentQualifies(stats) && (!bestStats || contentBetter(stats, bestStats))) { bestStats = stats; found = { si, c } }
      }
    }
    if (found) {
      const s = sheets[found.si]
      const c = found.c
      const hr = goodsHeaderRow(s)
      // Строка шапки таблицы — только подпись; коды выше неё (если есть) не терять.
      const firstCode = s.rows.findIndex((_, r) => {
        const cell = cellCode(at(s.rows, r, c), at(s.texts, r, c))
        return !!cell && 'codes' in cell && cell.codes.some(isCodeLike)
      })
      best = buildColumn(sheets, found.si, c, hr != null && hr < firstCode ? hr : null, 'content', existing)
    }
  }
  best ??= headerBest

  const options: KizColumn[] = []
  sheets.forEach((s, si) => {
    const w = widthOf(s.rows)
    for (let c = 0; c < w; c++) {
      if (best && best.sheet === si && best.col === c) { options.push(best); continue }
      if (!s.rows.some((r) => Array.isArray(r) && r[c] != null && String(r[c]).trim() !== '')) continue
      options.push(kizColumn(sheets, si, c, existing))
    }
  })
  return { best, options, legacy }
}

export const kizColumnKey = keyOf

// ---- Раскладка по товарам ДТ (12б-2) ----

export interface KizFileRow {
  codes: string[]
  description: string | null
  tnved: string | null
  article: string | null
  /** Модель: импорт (В11) отделяет её от артикула — сопоставляем и по ней. */
  model: string | null
}

const tnvedOf = (v: unknown): string | null => {
  if (v == null || v === '') return null
  const s = typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v)) : String(v)
  const d = s.replace(/[\s.]/g, '')
  const p = /^\d{9}$/.test(d) ? `0${d}` : d
  return /^\d{10}$/.test(p) ? p : null
}

/**
 * Строки файла с кодами и сведениями товара из той же строки шапки (наименование, код ТН ВЭД, артикул, модель —
 * goodsHeaderColumns, как импорт товаров). null — у столбца нет строки шапки (найден по содержимому) или в шапке нет
 * столбцов товара.
 */
export function kizFileRows(sheets: readonly KizSheet[], c: KizColumn): KizFileRow[] | null {
  if (c.headerRow == null || c.source === 'content') return null
  const s = sheets[c.sheet]
  const cols = goodsHeaderColumns(s.rows[c.headerRow] ?? [], { details: true }, s.rows.slice(c.headerRow + 1, c.headerRow + 201))
  const pick = (i: number | undefined) => (i != null && i !== c.col ? i : null)
  const di = pick(cols.description)
  const ti = pick(cols.tnvedCode)
  const ai = pick(cols.productArticle)
  const mi = pick(cols.productModelName)
  if (di == null && ti == null && ai == null && mi == null) return null
  const byRow = new Map<number, string[]>()
  for (const code of c.codes) {
    const list = byRow.get(code.row)
    if (list) list.push(code.number)
    else byRow.set(code.row, [code.number])
  }
  const get = (r: number, i: number | null) => (i == null ? null : at(s.rows, r, i))
  return [...byRow].map(([r, codes]) => ({
    codes,
    description: textOf(get(r, di)),
    tnved: tnvedOf(get(r, ti)),
    article: textOf(get(r, ai)),
    model: textOf(get(r, mi)),
  }))
}

// «Отсутствует» в артикуле/модели (шаблон декларанта переносит его как есть) — не ключ: совпало бы у всех товаров.
const normArticle = (s: string | null | undefined) =>
  (!s || ABSENT.test(s.trim()) ? '' : s.toLocaleUpperCase('ru-RU').replace(/[\s-]+/g, ''))
const normName = (s: string | null | undefined) =>
  (s ?? '').toLocaleUpperCase('ru-RU').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/**
 * Строка файла → товар ДТ. Правила по порядку: артикул/модель (без пробелов и «-», заглавными) = артикул или модель
 * строки характеристик; код ТН ВЭД (10 цифр); наименование = описание или наименование строки характеристик либо их
 * начало (от 6 знаков). Побеждает первое правило с ровно одним товаром; несколько — следующее правило выбирает среди
 * них (артикул «506» у двух товаров → по наименованию). Ничего — «не сопоставлено».
 */
export function matchKizRowsToGoods(
  rows: readonly KizFileRow[], goods: readonly Import40GoodsItemInput[],
): { groups: { goodsIndex: number; codes: string[] }[]; unmatched: string[] } {
  const arts = goods.map((g) => new Set((g.characteristics ?? [])
    .flatMap((c) => [normArticle(c.productArticle), normArticle(c.productModelName)]).filter(Boolean)))
  const tns = goods.map((g) => tnvedOf(g.tnvedCode))
  const names = goods.map((g) => [g.description, ...(g.characteristics ?? []).map((c) => c.name)].map(normName).filter(Boolean))

  const matchOne = (r: KizFileRow): number | null => {
    let cand = goods.map((_, i) => i)
    const fileArts = [normArticle(r.article), normArticle(r.model)].filter(Boolean)
    const tn = r.tnved
    const name = normName(r.description)
    const rules: ((i: number) => boolean)[] = []
    if (fileArts.length) rules.push((i) => fileArts.some((a) => arts[i].has(a)))
    if (tn) rules.push((i) => tns[i] === tn)
    // Наименование: сначала точное равенство («СУШИЛКА» при товарах «СУШИЛКА» и «СУШИЛКА ДЛЯ БЕЛЬЯ»), затем начало.
    if (name) rules.push((i) => names[i].some((x) => x === name))
    if (name && name.length >= 6) rules.push((i) => names[i].some((x) => x.startsWith(name)))
    for (const rule of rules) {
      const m = cand.filter(rule)
      if (m.length === 1) return m[0]
      if (m.length > 1) cand = m
    }
    return null
  }

  const byGoods = new Map<number, string[]>()
  const unmatched: string[] = []
  for (const r of rows) {
    const k = matchOne(r)
    if (k == null) { unmatched.push(...r.codes); continue }
    const list = byGoods.get(k)
    if (list) list.push(...r.codes)
    else byGoods.set(k, [...r.codes])
  }
  return {
    groups: [...byGoods].sort((a, b) => a[0] - b[0]).map(([goodsIndex, codes]) => ({ goodsIndex, codes })),
    unmatched,
  }
}

/** Что добавить после предпросмотра: коды по товарам (позиция с 0) или строки старого формата — в текущий товар. */
export interface KizExcelApply {
  groups: { goodsIndex: number; codes: string[] }[]
  legacy: Import40GoodsMarking[] | null
}
