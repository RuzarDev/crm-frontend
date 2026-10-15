// «Заполнить через текст / из Excel» (строки гр. 31, как кнопка «Заполнить через текст» КЕДЕН): разбор вставленного текста
// в строки характеристик. Чистые функции — окно GoodsCharacteristicsPasteModal только показывает и применяет.
//   Excel / Google Таблицы — колонки через табуляцию (ячейки с переводом строки — в кавычках, как их копирует Excel);
//   текст — строка на строку, колонки через «;» (или одна колонка — наименование).
// Колонки по умолчанию — порядок таблицы: Наименование, Кол-во, Ед., Стоимость, Производитель, Тов. знак, Марка, Модель,
// Артикул (дальше — Стандарт, Сорт, Серийные №); первая строка с подписями колонок узнаётся и задаёт порядок сама.
// Числа — с пробелами и запятыми («1 234,5», «1,234.5», «1.234.567»); единица — код ОКЕИ, краткое наименование или
// латинское обозначение (okeiFromText); «100 шт» в колонке количества — количество и единица. Что не разобралось — в issues
// (ячейка остаётся пустой), текст длиннее предела поля — обрезается и тоже в issues.
import { parseNumber } from '@/ui/number'
import { blankCharacteristic, CHARACTERISTIC_FIELDS, isBlankCharacteristic, type CharacteristicField, type GoodsRowValue } from './characteristics'
import { okeiFromText } from './okei'

export const DEFAULT_PASTE_ORDER: readonly CharacteristicField[] = CHARACTERISTIC_FIELDS.map((c) => c.key)

export type PasteDelimiter = 'tab' | 'semicolon' | 'none'

/** Ячейки вставленного текста: строки и колонки. Пустые строки пропускаются. */
export function splitPasted(text: string): { cells: string[][]; delimiter: PasteDelimiter } {
  const src = (text ?? '').replace(/\r\n?/g, '\n')
  const delimiter: PasteDelimiter = src.includes('\t') ? 'tab' : src.includes(';') ? 'semicolon' : 'none'
  const sep = delimiter === 'tab' ? '\t' : delimiter === 'semicolon' ? ';' : null
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let atCellStart = true
  const endCell = () => {
    row.push(cell)
    cell = ''
    atCellStart = true
  }
  const endRow = () => {
    endCell()
    if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()))
    row = []
  }
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
      continue
    }
    // Кавычки — только в начале ячейки (как их ставит Excel); внутри текста — обычный знак (дюймы: 27").
    if (ch === '"' && atCellStart && sep) {
      quoted = true
      atCellStart = false
    } else if (sep && ch === sep) endCell()
    else if (ch === '\n') endRow()
    else {
      cell += ch
      if (ch !== ' ') atCellStart = false
    }
  }
  endRow()
  return { cells: rows, delimiter }
}

// Подписи колонок (первая строка из Excel): ru / kk / en и частые варианты.
const HEADER_ALIASES: Record<CharacteristicField, readonly string[]> = {
  name: ['наименование', 'наименованиетовара', 'название', 'товар', 'описание', 'атауы', 'name', 'description', 'product', 'item'],
  quantity: ['колво', 'количество', 'кол', 'саны', 'qty', 'quantity', 'count'],
  unitCode: ['ед', 'едизм', 'единица', 'единицаизмерения', 'океи', 'бірлік', 'өлшембірлігі', 'unit', 'uom'],
  invoiceValue: ['стоимость', 'сумма', 'цена', 'фактурнаястоимость', 'құны', 'value', 'amount', 'price', 'total'],
  manufacturerName: ['производитель', 'изготовитель', 'өндіруші', 'manufacturer', 'producer'],
  tradeMarkName: ['товзнак', 'товарныйзнак', 'бренд', 'тауарлықбелгі', 'trademark', 'brand'],
  productMarkName: ['марка', 'mark'],
  productModelName: ['модель', 'model'],
  productArticle: ['артикул', 'art', 'article', 'sku', 'partnumber', 'pn'],
  standardName: ['стандарт', 'гост', 'стандартгост', 'standard'],
  productSortName: ['сорт', 'sort', 'grade'],
  serialNumbers: ['серийныеномера', 'серийныйномер', 'серийныеn', 'сериялықнөмірлер', 'serial', 'serials', 'serialnumbers', 'sn'],
}
const headerKey = (s: string) => s.toLocaleLowerCase('ru-RU').replace(/[\s.,\-_:№#()/]/g, '')
const HEADER_LOOKUP = new Map<string, CharacteristicField>(
  (Object.entries(HEADER_ALIASES) as [CharacteristicField, readonly string[]][]).flatMap(([f, list]) => list.map((a) => [a, f] as const)),
)

/** Первая строка — подписи колонок: колонка → поле (не узнана — null); не похожа на подписи — null. */
export function detectHeader(first: readonly string[] | undefined): (CharacteristicField | null)[] | null {
  if (!first?.length) return null
  const fields = first.map((c) => HEADER_LOOKUP.get(headerKey(c)) ?? null)
  const nonEmpty = first.filter((c) => c.trim() !== '').length
  const matched = fields.filter(Boolean).length
  if (!matched || matched < Math.ceil(nonEmpty / 2)) return null
  // Повтор поля — вторая колонка не загружается.
  const seen = new Set<CharacteristicField>()
  return fields.map((f) => {
    if (!f || seen.has(f)) return null
    seen.add(f)
    return f
  })
}

/** Порядок колонок по умолчанию для columnCount колонок (лишние — не загружаются). */
export const defaultMapping = (columnCount: number): (CharacteristicField | null)[] =>
  Array.from({ length: columnCount }, (_, i) => DEFAULT_PASTE_ORDER[i] ?? null)

/** Число из ячейки: пробелы — разделители тысяч, «,» или «.» — дробная часть; несколько одинаковых — тысячи. */
export function parseCellNumber(raw: string): number | null {
  let s = raw.replace(/[\s  ']/g, '')
  if (!s) return null
  const commas = (s.match(/,/g) ?? []).length
  const dots = (s.match(/\./g) ?? []).length
  if (commas > 1 && !dots) s = s.replace(/,/g, '')
  if (dots > 1 && !commas) s = s.replace(/\./g, '')
  const n = parseNumber(s)
  return n != null && n >= 0 ? n : null
}

export type PasteIssueKind = 'number' | 'unit' | 'tooLong'
export interface PasteIssue {
  /** Строка результата (с 0). */
  row: number
  field: CharacteristicField
  kind: PasteIssueKind
  raw: string
  max?: number
}
export interface PasteResult {
  rows: GoodsRowValue[]
  issues: PasteIssue[]
}

/**
 * Строки характеристик из ячеек по сопоставлению колонок (mapping[i] — поле i-й колонки, null — не загружать).
 * skipFirst — первая строка — подписи колонок. Строки, где ничего не загрузилось, пропускаются.
 */
export function buildRows(cells: readonly (readonly string[])[], mapping: readonly (CharacteristicField | null)[], skipFirst = false): PasteResult {
  const rows: GoodsRowValue[] = []
  const issues: PasteIssue[] = []
  const hasUnitColumn = mapping.includes('unitCode')
  for (const line of skipFirst ? cells.slice(1) : cells) {
    const row = blankCharacteristic()
    const rowIssues: Omit<PasteIssue, 'row'>[] = []
    let unitFromQuantity: string | null = null
    mapping.forEach((field, col) => {
      const raw = (line[col] ?? '').trim()
      if (!field || !raw) return
      const def = CHARACTERISTIC_FIELDS.find((c) => c.key === field)!
      if (def.kind === 'number') {
        let n = parseCellNumber(raw)
        // «100 шт» в колонке количества — количество и единица (если единицы в своей колонке нет).
        if (n == null && field === 'quantity') {
          const m = /^([\d\s  .,']+?)\s*([^\d\s.,].*)$/u.exec(raw)
          const unit = m ? okeiFromText(m[2]) : null
          if (m && unit) {
            n = parseCellNumber(m[1])
            if (n != null) unitFromQuantity = unit
          }
        }
        if (n == null) rowIssues.push({ field, kind: 'number', raw })
        else row[field as 'quantity' | 'invoiceValue'] = n
      } else if (def.kind === 'unit') {
        const code = okeiFromText(raw)
        if (code) row.unitCode = code
        else rowIssues.push({ field, kind: 'unit', raw })
      } else {
        let v = raw.toLocaleUpperCase('ru-RU')
        if (def.max && v.length > def.max) {
          rowIssues.push({ field, kind: 'tooLong', raw, max: def.max })
          v = v.slice(0, def.max)
        }
        ;(row as Record<string, unknown>)[field] = v
      }
    })
    if (unitFromQuantity && (!hasUnitColumn || !row.unitCode)) row.unitCode = unitFromQuantity
    if (isBlankCharacteristic(row) && !rowIssues.length) continue
    const at = rows.length
    rows.push(row)
    for (const x of rowIssues) issues.push({ ...x, row: at })
  }
  return { rows, issues }
}
