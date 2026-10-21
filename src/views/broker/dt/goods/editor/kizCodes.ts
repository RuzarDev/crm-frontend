import type { Import40GoodsItemInput, Import40GoodsMarking } from '@/types/api'
import { ABSENT, TOTAL_ROW, normalizeHeader } from '@/utils/goodsExcel'
import { gs1CheckDigitOk, type CodeProblem } from './tradeCodes'
import { hasKizNumber, markingFromDefaults, type KizDefaults } from './kizDefaults'

// Номера кодов идентификации гр. 31.13 (правка №12): вставка столбца GTIN из буфера, проверка GTIN (контрольная цифра
// GS1 — только предупреждение, как у сервера KedenXmlReadiness.KizWarnings), добавление без повторов. Те же правила
// столбца и шапки использует «Из Excel» (kizExcel.ts).

/** = maxlength поля номера и KedenXmlReadiness (номер длиннее 100 — пункт готовности). */
export const KIZ_NUMBER_MAX = 100
const GTIN_LENGTHS: readonly number[] = [8, 12, 13, 14]

/** Ключ номера для повторов: без пробелов, заглавными. */
export const kizKey = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, '').toLocaleUpperCase('ru-RU')

/** Код в столбце по шапке (или выбранном вручную): буквы/цифры латиницей, 4–100 знаков, без пробелов. */
export const KIZ_CODE_RE = /^[0-9A-Z][0-9A-Z\-_./]{3,99}$/
/** Контрольный (идентификационный) знак «RU-123456-ABCDE12345» — как KedenXmlExporter.IsControlMark. */
export const CONTROL_MARK_RE = /^[A-Z]{2}-[A-Z0-9]{6}-[A-Z0-9]{10}$/

/** Похоже на код по содержимому: 12–14 цифр или контрольный знак (8 цифр — нет: так выглядят даты 20261021). */
export const isCodeLike = (c: string) => /^\d{12,14}$/.test(c) || CONTROL_MARK_RE.test(c)
/** Код по содержимому «годный»: GS1 сходится (контрольный знак — годен). */
export const isValidCode = (c: string) => CONTROL_MARK_RE.test(c) || (/^\d+$/.test(c) && gs1CheckDigitOk(c))
/** Годится в номер КИЗ из столбца: формат кода, не «Итого», не «нет». */
export const isKizCode = (c: string) => KIZ_CODE_RE.test(c) && !TOTAL_ROW.test(c) && !ABSENT.test(c)

/**
 * Текст → коды: делится по переводам строк, «,» и «;»; ведущий «'» (так Excel помечает текст) снимается. Часть из цифр
 * и пробелов — один код («4 871813 090801»), кроме нескольких GTIN через пробел. Остальное — заглавными; splitSpaces —
 * ещё и по пробелам (вставка из буфера).
 */
export function splitKizText(text: string, splitSpaces = false): string[] {
  return text.split(/[\r\n,;]+/).flatMap((part) => {
    const p = part.trim().replace(/^'+/, '').trim()
    if (!p) return []
    if (/^[\d\s]+$/.test(p)) {
      const tokens = p.split(/\s+/)
      if (tokens.length > 1 && tokens.every((x) => GTIN_LENGTHS.includes(x.length))) return tokens
      return [p.replace(/\s+/g, '')]
    }
    const up = p.toLocaleUpperCase('ru-RU')
    return splitSpaces ? up.split(/\s+/).filter(Boolean) : [up]
  })
}

// Шапка столбца кодов — по приоритету групп. «ean» — только отдельным словом (подстрока ловила бы «european», «ocean»).
// «NTIN» — гр. 33.3, не КИЗ; «Кол-во КИЗ», «Вид средства идентификации», «Уровень» — не номера.
const HEADER_GROUPS: readonly { substr: readonly string[]; tokens: readonly string[] }[] = [
  { substr: ['gtin', 'штрихкод', 'barcode', '条形码', '条码', '商品条码'], tokens: ['upc'] },
  { substr: [], tokens: ['ean', 'ean8', 'ean13', 'ean14', 'ean码'] },
  { substr: ['кодидентификации', 'кодмаркировки', 'средствоидентификации', 'datamatrix'], tokens: ['киз'] },
]
const HEADER_EXCLUDE = ['ntin', 'колво', 'количество', 'qty', 'quantity', 'видсредства', 'видидентификации', 'уровень']

/** Ранг заголовка столбца кодов (0 — GTIN/штрихкод, 1 — EAN, 2 — КИЗ/код идентификации); не похоже — null. */
export function kizHeaderRank(v: unknown): number | null {
  if (v == null || typeof v === 'number') return null
  const s = String(v)
  const norm = normalizeHeader(s)
  if (!norm || HEADER_EXCLUDE.some((x) => norm.includes(x))) return null
  const tokens = new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean))
  const i = HEADER_GROUPS.findIndex((g) => g.substr.some((x) => norm.includes(x)) || g.tokens.some((x) => tokens.has(x)))
  return i >= 0 ? i : null
}

export interface KizColumnStats {
  codeLike: number
  valid: number
  other: number
  distinct: number
}

/** Счёт столбца по содержимому: ячейка — коды (null — пусто, 'other' — не код). */
export function kizColumnStats(cells: readonly (readonly string[] | 'other' | null)[]): KizColumnStats {
  let codeLike = 0
  let valid = 0
  let other = 0
  const seen = new Set<string>()
  for (const c of cells) {
    if (c == null) continue
    if (c === 'other') { other += 1; continue }
    let any = false
    for (const code of c) {
      if (!isCodeLike(code)) continue
      any = true
      codeLike += 1
      if (isValidCode(code)) valid += 1
      seen.add(code)
    }
    if (!any && c.length) other += 1
  }
  return { codeLike, valid, other, distinct: seen.size }
}

/** Столбец годится по содержимому: кодов больше прочего, и хотя бы половина — с верной контрольной цифрой. */
export const contentQualifies = (s: KizColumnStats) => s.codeLike >= 1 && s.codeLike > s.other && 2 * s.valid >= s.codeLike
/** Лучший по содержимому: больше годных, затем больше разных значений; при равенстве — левее (первый). */
export const contentBetter = (a: KizColumnStats, b: KizColumnStats) =>
  a.valid !== b.valid ? a.valid > b.valid : a.distinct > b.distinct

/**
 * Коды из вставки (столбец из Excel, письмо): строки по переводам строк, пустые — прочь. Несколько столбцов через Tab —
 * берётся столбец кодов (по шапке в первой строке, иначе по содержимому, как «Из Excel»). Иначе строка делится по «;»
 * и «,», затем по пробелам (цифры с пробелами — один код). Первая строка-шапка («GTIN», «Штрих-код») пропускается.
 */
export function parseKizPaste(text: string | null | undefined): string[] {
  const lines = (text ?? '').split(/\r\n|\r|\n/).filter((l) => l.trim())
  if (!lines.length) return []
  const rows = lines.map((l) => l.split('\t'))
  if (!rows.some((r) => r.filter((c) => c.trim()).length > 1)) {
    const start = kizHeaderRank(lines[0]) != null ? 1 : 0
    return lines.slice(start).flatMap((l) => splitKizText(l, true))
  }
  const width = Math.max(...rows.map((r) => r.length))
  let col = -1
  let start = 0
  let bestRank: number | null = null
  rows[0].forEach((c, i) => {
    const r = kizHeaderRank(c)
    if (r != null && (bestRank == null || r < bestRank)) { bestRank = r; col = i }
  })
  if (col >= 0) start = 1
  else {
    let best: KizColumnStats | null = null
    for (let i = 0; i < width; i++) {
      const s = kizColumnStats(rows.map((r) => (r[i]?.trim() ? splitKizText(r[i]) : null)))
      if (contentQualifies(s) && (!best || contentBetter(s, best))) { best = s; col = i }
    }
    // Ничего похожего на GTIN — столбец, где больше всего значений в формате кода (серийные номера, контрольные знаки).
    if (col < 0) {
      let most = 0
      for (let i = 0; i < width; i++) {
        const n = rows.reduce((acc, r) => acc + splitKizText(r[i] ?? '').filter(isKizCode).length, 0)
        if (n > most) { most = n; col = i }
      }
    }
  }
  if (col < 0) return []
  return rows.slice(start).flatMap((r) => splitKizText(r[col] ?? '').filter(isKizCode))
}

/**
 * GTIN в коде идентификации (§2.5, как KedenXmlReadiness.KizWarnings): номер только из цифр при идентификаторе
 * применения 01/02 или без него. 8/12/13/14 цифр — контрольная цифра GS1; другая длина — только при явном 01/02.
 * Контрольные знаки, номера с буквами, SSCC (00), серийные (21), 91/92 — не проверяются.
 */
export function kizNumberProblem(number: string | null | undefined, ai: string | null | undefined): CodeProblem | null {
  const no = (number ?? '').replace(/\s+/g, '')
  if (!no || !/^\d+$/.test(no)) return null
  const a = (ai ?? '').trim()
  if (a && a !== '01' && a !== '02') return null
  if (!GTIN_LENGTHS.includes(no.length)) return a ? { kind: 'gtinLength', n: no.length } : null
  return gs1CheckDigitOk(no) ? null : { kind: 'check' }
}

const list = (item: Import40GoodsItemInput): Import40GoodsMarking[] => {
  item.markings ??= []
  return item.markings
}

// Тысячи кодов: push(...) порциями (предел числа аргументов).
const pushAll = <T>(arr: T[], add: readonly T[]) => {
  for (let i = 0; i < add.length; i += 5000) arr.push(...add.slice(i, i + 5000))
}

/** Пустые строки (без номера): сначала строка at (если пуста), затем по порядку. */
const blankIndexes = (arr: readonly Import40GoodsMarking[], at?: number): number[] => {
  const out: number[] = []
  if (at != null && arr[at] && !hasKizNumber(arr[at])) out.push(at)
  arr.forEach((m, i) => { if (i !== at && !hasKizNumber(m)) out.push(i) })
  return out
}

/**
 * Добавить номера: повтор (в товаре или во вставке; без пробелов, заглавными) пропускается и считается; сначала
 * заполняются пустые строки (строка at — первой), остальные — в конец с общими значениями.
 */
export function appendKizNumbers(
  item: Import40GoodsItemInput, numbers: readonly string[], d: KizDefaults, at?: number,
): { added: number; duplicates: number } {
  const arr = list(item)
  const have = new Set(arr.map((m) => kizKey(m.number)).filter(Boolean))
  const blanks = blankIndexes(arr, at)
  const fresh: Import40GoodsMarking[] = []
  let added = 0
  let duplicates = 0
  for (const raw of numbers) {
    const n = raw.trim()
    const k = kizKey(n)
    if (!k) continue
    if (have.has(k)) { duplicates += 1; continue }
    have.add(k)
    const b = blanks.shift()
    if (b !== undefined) arr[b].number = n
    else fresh.push(markingFromDefaults(d, n))
    added += 1
  }
  pushAll(arr, fresh)
  return { added, duplicates }
}

/** Добавить готовые строки (старый формат Excel — значения из файла): без номера и повторы — пропускаются. */
export function appendKizRows(item: Import40GoodsItemInput, rows: readonly Import40GoodsMarking[]): { added: number; duplicates: number } {
  const arr = list(item)
  const have = new Set(arr.map((m) => kizKey(m.number)).filter(Boolean))
  const blanks = blankIndexes(arr)
  const fresh: Import40GoodsMarking[] = []
  let added = 0
  let duplicates = 0
  for (const row of rows) {
    const k = kizKey(row.number)
    if (!k) continue
    if (have.has(k)) { duplicates += 1; continue }
    have.add(k)
    const b = blanks.shift()
    if (b !== undefined) Object.assign(arr[b], row)
    else fresh.push({ ...row })
    added += 1
  }
  pushAll(arr, fresh)
  return { added, duplicates }
}
