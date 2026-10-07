import { Comment, Fragment, Text, isVNode } from 'vue'
import { cn } from './cn'
import { parseNumber } from './number'

// Логика ZTable: колонки в формате a-table (AntD), значение по dataIndex, сортировка, страницы,
// смещения закреплённых колонок, классы ячеек. Компонент только рисует.

export type ZSortOrder = 'ascend' | 'descend' | null
export type ZKey = string | number

export interface ZColumn<T = Record<string, unknown>> {
  key?: string
  title?: string
  /** 'a.b' или ['a', 'b'] — путь к значению в записи. */
  dataIndex?: string | string[]
  /** Число — px. Строка — как есть (у закреплённых колонок учитываются только px). */
  width?: number | string
  minWidth?: number
  align?: 'left' | 'center' | 'right'
  /** Обрезка в одну строку + title с полным текстом. */
  ellipsis?: boolean
  /** true — по значению (числа, даты, строки по-русски; пустые в конце), функция — как у AntD. */
  sorter?: boolean | ((a: T, b: T) => number)
  defaultSortOrder?: 'ascend' | 'descend'
  /** Управляемый порядок (как у AntD): если задан у какой-либо колонки, внутреннее состояние не используется. */
  sortOrder?: ZSortOrder
  fixed?: 'left' | 'right'
  /** VNode или строка. Слот #bodyCell, если вернул содержимое, главнее. */
  customRender?: (o: { text: unknown; value: unknown; record: T; index: number; column: ZColumn<T> }) => unknown
  /** Класс на <th> и <td> колонки. */
  className?: string
}

/** Сортировка для @change — как sorter у AntD. */
export interface ZSorter<T = Record<string, unknown>> {
  column?: ZColumn<T>
  columnKey?: string
  field?: string | string[]
  order: ZSortOrder
}

export interface ZTablePagination {
  current?: number
  /** По умолчанию 25. */
  pageSize?: number
  /** Задан — серверная пагинация: данные не режутся, страница меняется через @change / onChange. */
  total?: number
  onChange?: (page: number, pageSize: number) => void
  /** Подпись слева от страниц: «Всего 120». */
  showTotal?: (total: number, range: [number, number]) => string
  /** По умолчанию true — одна страница не показывается. */
  hideOnSinglePage?: boolean
}

export interface ZPaginationState { current: number; pageSize: number; total: number }

export interface ZRowSelection<T = Record<string, unknown>> {
  selectedRowKeys?: ZKey[]
  onChange?: (keys: ZKey[], rows: T[]) => void
  getCheckboxProps?: (record: T) => { disabled?: boolean }
}

export type ZRowKey<T = Record<string, unknown>> = string | ((record: T, index: number) => ZKey)

export const DEFAULT_PAGE_SIZE = 25

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Значение по dataIndex: 'a.b' / ['a','b']. Поле с точкой в имени ('a.b') берётся целиком, если есть. */
export const getValue = (record: unknown, dataIndex: string | string[] | undefined): unknown => {
  if (dataIndex === undefined || dataIndex === '' || !isObject(record)) return undefined
  if (typeof dataIndex === 'string' && dataIndex in record) return record[dataIndex]
  const path = Array.isArray(dataIndex) ? dataIndex : dataIndex.split('.')
  let cur: unknown = record
  for (const part of path) {
    if (!isObject(cur)) return undefined
    cur = cur[part]
  }
  return cur
}

export const columnKey = (col: Pick<ZColumn<never>, 'key' | 'dataIndex'>, index: number): string =>
  col.key ?? (Array.isArray(col.dataIndex) ? col.dataIndex.join('.') : col.dataIndex) ?? String(index)

/** Ключи всех колонок без повторов: две колонки без key с одним dataIndex («Сумма» и «Сумма ₸») получают
 *  второй ключ с номером колонки ('sum', 'sum-1') — иначе v-for с одинаковыми key и общая сортировка. */
export const columnKeys = (columns: Array<Pick<ZColumn<never>, 'key' | 'dataIndex'>>): string[] => {
  const seen = new Set<string>()
  return columns.map((c, i) => {
    let k = columnKey(c, i)
    if (seen.has(k)) k = `${k}-${i}`
    seen.add(k)
    return k
  })
}

/** Ключ строки: поле rowKey, функция (record, index) или номер строки, если поля нет. */
export const resolveRowKey = <T>(record: T, index: number, rowKey: ZRowKey<T>): ZKey => {
  if (typeof rowKey === 'function') return rowKey(record, index)
  const v = isObject(record) ? record[rowKey] : undefined
  return typeof v === 'string' || typeof v === 'number' ? v : index
}

export const nextSortOrder = (order: ZSortOrder): ZSortOrder =>
  order === null ? 'ascend' : order === 'ascend' ? 'descend' : null

const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' })

/** Сравнение двух непустых значений: числа и даты — по величине; строки-числа с сервера («10.5», «-3»,
 *  «1 000,00») — тоже по величине (parseNumber), причём раньше текста; остальное — строкой по-русски («ДТ-9» < «ДТ-10»). */
export const compareValues = (a: unknown, b: unknown): number => {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  if (typeof a === 'string' && typeof b === 'string') {
    const na = parseNumber(a)
    const nb = parseNumber(b)
    if (na !== null && nb !== null) return na - nb
    if (na !== null || nb !== null) return na !== null ? -1 : 1
  }
  return collator.compare(String(a), String(b))
}

const isBlank = (v: unknown) => v === null || v === undefined || v === ''

/** Новый массив в нужном порядке (устойчиво). Без порядка или sorter — исходный массив. */
export const sortRows = <T>(rows: T[], column: ZColumn<T> | undefined, order: ZSortOrder): T[] => {
  if (!column?.sorter || !order) return rows
  const dir = order === 'ascend' ? 1 : -1
  const { sorter } = column
  if (typeof sorter === 'function') return [...rows].sort((a, b) => dir * sorter(a, b))
  return [...rows].sort((a, b) => {
    const va = getValue(a, column.dataIndex)
    const vb = getValue(b, column.dataIndex)
    const ea = isBlank(va)
    const eb = isBlank(vb)
    if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1 // пустые — в конце при любом направлении
    return dir * compareValues(va, vb)
  })
}

export const pageCount = (total: number, pageSize: number): number => (total > 0 ? Math.ceil(total / Math.max(1, pageSize)) : 0)

export const paginate = <T>(rows: T[], current: number, pageSize: number): T[] =>
  rows.slice((current - 1) * pageSize, current * pageSize)

/** Кнопки страниц «1 2 3 4 5 … 9»: до 7 страниц — все, дальше — первая, последняя и окно вокруг текущей. */
export const pageItems = (current: number, count: number): Array<number | '…'> => {
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
  if (count <= 7) return range(1, count)
  if (current <= 4) return [...range(1, 5), '…', count]
  if (current >= count - 3) return [1, '…', ...range(count - 4, count)]
  return [1, '…', current - 1, current, current + 1, '…', count]
}

/** Ширина колонки в px для расчёта смещений: число или строка «NNpx»; иное (%, auto) — 0. */
const widthPx = (w: number | string | undefined): number => {
  if (typeof w === 'number') return w
  const m = typeof w === 'string' ? /^(\d+(?:\.\d+)?)px$/.exec(w.trim()) : null
  return m ? Number(m[1]) : 0
}

export interface ZFixedInfo { side?: 'left' | 'right'; offset?: number; edge?: boolean }

/** Смещения sticky-колонок: слева — сумма ширин закреплённых левее (+ колонка выбора), справа — правее.
 *  edge — крайняя закреплённая колонка, у неё тень-разделитель при прокрутке. */
export const fixedOffsets = (columns: Array<Pick<ZColumn<never>, 'fixed' | 'width'>>, lead: number): ZFixedInfo[] => {
  const out: ZFixedInfo[] = columns.map(() => ({}))
  let left = lead
  let lastLeft = -1
  columns.forEach((c, i) => {
    if (c.fixed !== 'left') return
    out[i] = { side: 'left', offset: left, edge: false }
    left += widthPx(c.width)
    lastLeft = i
  })
  let right = 0
  let firstRight = -1
  for (let i = columns.length - 1; i >= 0; i--) {
    const c = columns[i]
    if (c.fixed !== 'right') continue
    out[i] = { side: 'right', offset: right, edge: false }
    right += widthPx(c.width)
    firstRight = i
  }
  if (lastLeft >= 0) out[lastLeft].edge = true
  if (firstRight >= 0) out[firstRight].edge = true
  return out
}

/** Слот ничего не нарисовал (как у a-table: пустой #bodyCell/#headerCell → содержимое по умолчанию).
 *  Пусто: null/undefined/boolean/'', комментарий от v-if, фрагмент из пустого. */
export const isEmptyContent = (node: unknown): boolean => {
  if (node === null || node === undefined || typeof node === 'boolean' || node === '') return true
  if (Array.isArray(node)) return node.every(isEmptyContent)
  if (isVNode(node)) {
    if (node.type === Comment) return true
    if (node.type === Fragment) return isEmptyContent(node.children)
    if (node.type === Text) return node.children === ''
  }
  return false
}

/** Колонка, подготовленная к отрисовке (общая для шапки и тела). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ZColumnView<T = any> {
  column: ZColumn<T>
  key: string
  fixed: ZFixedInfo
  sortable: boolean
  order: ZSortOrder
}

export const alignClass = (align: ZColumn<never>['align']): string =>
  align === 'right' ? 'text-right tabular-nums' : align === 'center' ? 'text-center' : 'text-left'

export const fixedStyle = (f: ZFixedInfo): Record<string, string> | undefined =>
  f.side ? { [f.side]: `${f.offset ?? 0}px` } : undefined

/** sticky у закреплённой ячейки + тень-разделитель у крайней, когда под ней есть прокрученное содержимое. */
export const fixedClass = (f: ZFixedInfo, scrolled: { left: boolean; right: boolean }, cards: boolean): string =>
  f.side
    ? cn(
        'sticky',
        cards && 'max-sm:static',
        f.edge && f.side === 'left' && scrolled.left && 'shadow-[6px_0_8px_-6px_rgb(60_48_30/0.22)]',
        f.edge && f.side === 'right' && scrolled.right && 'shadow-[-6px_0_8px_-6px_rgb(60_48_30/0.22)]',
      )
    : ''
