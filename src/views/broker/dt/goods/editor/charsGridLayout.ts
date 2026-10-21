import { CHARACTERISTIC_FIELDS, type CharacteristicField, type GoodsRowValue } from './characteristics'

// Колонки таблицы строк гр. 31 (GoodsCharacteristicsGrid; правка №17, 21.10.2026: «Производител…», «INDUSTRIES S…» — колонки
// обрезались). Ширина колонки (rem) — наибольшее из:
//   • своего минимума (min) — ширина пустой колонки: редкие колонки (стандарт, сорт, серийные №) пустыми места не занимают;
//   • подписи колонки на текущем языке — подпись не режется ни на одном языке;
//   • самого длинного значения в колонке (у всех строк, с подсказкой «гр. 41: …» единственной строки), но не больше max —
//     длинный производитель («MONCLER INDUSTRIES S.P.A.») виден целиком, а колонка серийных номеров не растёт без конца.
// Ширина шагом в 1 rem — при наборе колонка не «дрожит» на каждой букве.
// Колонки с grow > 0 делят свободное место панели (minmax(ширина, grow·fr)): на широкой панели текст получает больше
// места, а горизонтальная прокрутка появляется, только когда сумма ширин не помещается.
// № и наименование закреплены слева (scroll-padding таблицы — по их ширине: nameRem). Закреплённое наименование по
// содержимому растёт не шире CHARS_GRID_NAME_SHARE видимой ширины таблицы (viewRem; но не уже своего минимума): иначе
// на узкой панели и планшете закреплённая часть съедала бы бо́льшую часть таблицы и до остальных колонок было бы трудно
// докрутить (ревью №17). Полное наименование — в подсказке ячейки и в самой ячейке при фокусе.
export interface CharsColumnSpec {
  /** Минимум, rem. */
  min: number
  /** Предел по содержимому, rem (подпись колонки может быть шире — её ширина не ограничена). */
  max: number
  /** Доля свободного места (fr); 0 — колонка не растёт. */
  grow: number
}

export const CHARS_GRID_COLUMNS: Readonly<Record<CharacteristicField, CharsColumnSpec>> = {
  name: { min: 16, max: 24, grow: 3 },
  quantity: { min: 6, max: 11, grow: 0 },
  unitCode: { min: 4.5, max: 9, grow: 0 },
  invoiceValue: { min: 7, max: 12, grow: 0 },
  manufacturerName: { min: 12, max: 28, grow: 2 },
  tradeMarkName: { min: 8, max: 20, grow: 1 },
  productMarkName: { min: 6, max: 16, grow: 1 },
  productModelName: { min: 7, max: 18, grow: 1 },
  productArticle: { min: 7, max: 14, grow: 1 },
  standardName: { min: 6, max: 14, grow: 0 },
  productSortName: { min: 4.5, max: 12, grow: 0 },
  serialNumbers: { min: 8, max: 24, grow: 1 },
}

/** Доля видимой ширины таблицы, до которой закреплённое наименование растёт по содержимому. */
export const CHARS_GRID_NAME_SHARE = 0.4

/** Предел закреплённого наименования по содержимому при такой видимой ширине таблицы (rem); ширина неизвестна — свой max. */
export function pinnedNameMaxRem(viewRem?: number | null): number {
  const spec = CHARS_GRID_COLUMNS.name
  if (!viewRem || !(viewRem > 0)) return spec.max
  return Math.min(spec.max, Math.max(spec.min, Math.floor(viewRem * CHARS_GRID_NAME_SHARE)))
}

/** Колонка «№», rem. */
export const CHARS_GRID_NO_W = 2.75
/** Колонка кнопок строки (копировать, удалить), rem. */
export const CHARS_GRID_ACTIONS_W = 5

/** Значение ячейки: 13 px, заглавные IBM Plex Sans ≈ 0,62 em → ~0,55 rem на знак; поля ячейки (px-2) и рамка. */
export const CELL_CHAR_REM = 0.55
export const CELL_PAD_REM = 1.25
/** Подпись колонки: 12 px, средний вес ≈ 0,62 em → ~0,5 rem на знак; поля (px-2) и рамка. */
export const HEAD_CHAR_REM = 0.5
export const HEAD_PAD_REM = 1.25

/** Знаков в числе, как его покажет ячейка: разряды через пробел, дробная часть до 6 знаков. */
export function numberChars(v: number): number {
  if (!Number.isFinite(v)) return 0
  const [int, frac] = String(Math.abs(v)).split('.')
  return (v < 0 ? 1 : 0) + int.length + Math.floor((int.length - 1) / 3) + (frac ? Math.min(frac.length, 6) + 1 : 0)
}

const ceilRem = (rem: number) => Math.ceil(rem)

/** Ширина подписи колонки, rem (без ограничения сверху). */
export const headWidthRem = (label: string): number => (label ? ceilRem(label.length * HEAD_CHAR_REM + HEAD_PAD_REM) : 0)

/** Ширина значения ячейки, rem (без ограничения сверху). */
export const cellWidthRem = (chars: number): number => (chars > 0 ? ceilRem(chars * CELL_CHAR_REM + CELL_PAD_REM) : 0)

export interface CharsGridOptions {
  readonly: boolean
  /** Подписи колонок на текущем языке. */
  labels?: Partial<Record<CharacteristicField, string>>
  /** Единица, как её покажет ячейка (кр. наименование ОКЕИ); нет — код. */
  unitText?: (code: string) => string
  /** Подсказки пустых ячеек (гр. 41 / гр. 42 единственной строки) — тоже должны помещаться. */
  placeholders?: Partial<Record<CharacteristicField, string>> | null
  /** Видимая ширина таблицы, rem (окно прокрутки); нет или 0 — неизвестна (наименование — до своего max). */
  viewRem?: number | null
}

/** Знаков в значении ячейки строки. */
function valueChars(r: GoodsRowValue, key: CharacteristicField, kind: 'text' | 'number' | 'unit', unitText?: (code: string) => string): number {
  const v = r[key]
  if (v == null || v === '') return 0
  if (kind === 'number') return typeof v === 'number' ? numberChars(v) : String(v).length
  if (kind === 'unit') return (unitText ? unitText(String(v)) : String(v)).length
  return String(v).length
}

/** Ширины колонок полей (rem) по правилам выше. */
export function charsColumnWidths(rows: readonly GoodsRowValue[], o: Omit<CharsGridOptions, 'readonly'> = {}): Record<CharacteristicField, number> {
  const longest = {} as Record<CharacteristicField, number>
  for (const c of CHARACTERISTIC_FIELDS) longest[c.key] = (o.placeholders?.[c.key] ?? '').length
  for (const r of rows) {
    for (const c of CHARACTERISTIC_FIELDS) {
      const n = valueChars(r, c.key, c.kind, o.unitText)
      if (n > longest[c.key]) longest[c.key] = n
    }
  }
  const out = {} as Record<CharacteristicField, number>
  for (const c of CHARACTERISTIC_FIELDS) {
    const spec = CHARS_GRID_COLUMNS[c.key]
    const cap = c.key === 'name' ? pinnedNameMaxRem(o.viewRem) : spec.max
    const content = Math.min(cap, cellWidthRem(longest[c.key]))
    out[c.key] = Math.max(spec.min, headWidthRem(o.labels?.[c.key] ?? ''), content)
  }
  return out
}

export interface CharsGridLayout {
  /** grid-template-columns у заголовка и строк. */
  template: string
  /** Сумма ширин (rem) — ширина таблицы при нехватке места (дальше — прокрутка вправо). */
  widthRem: number
  /** Ширины колонок полей, rem. */
  widths: Record<CharacteristicField, number>
  /** Ширина закреплённого наименования, rem (scroll-padding таблицы). */
  nameRem: number
}

export function charsGridLayout(rows: readonly GoodsRowValue[], o: CharsGridOptions): CharsGridLayout {
  const widths = charsColumnWidths(rows, o)
  const tracks = CHARACTERISTIC_FIELDS.map((c) => {
    const w = widths[c.key]
    const grow = CHARS_GRID_COLUMNS[c.key].grow
    return grow > 0 ? `minmax(${w}rem,${grow}fr)` : `${w}rem`
  })
  const template = [`${CHARS_GRID_NO_W}rem`, ...tracks, ...(o.readonly ? [] : [`${CHARS_GRID_ACTIONS_W}rem`])].join(' ')
  const widthRem = CHARS_GRID_NO_W + CHARACTERISTIC_FIELDS.reduce((s, c) => s + widths[c.key], 0) + (o.readonly ? 0 : CHARS_GRID_ACTIONS_W)
  return { template, widthRem, widths, nameRem: widths.name }
}
