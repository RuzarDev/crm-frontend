import type { ZTone } from '@/components/z/ZTag.vue'
import { ReestrEntryStatus, type ReestrEntry } from '@/types/api'
import { formatReestrCellForDisplay } from '@/utils/reestrFormat'
import { parseNumber } from '@/ui/number'

// Чистая логика «Транзита» (редизайн, волна 3а): тона статусов, колонки и их выбор, суммы страницы, формат ячеек.
// Ключи entry.data — русские подписи колонок старого Excel-реестра; это данные, а не тексты: t() к ним не применять.

/** Цвет точки статуса: 0 В работе, 1 Подан, 2 Выпущено, 3 Условно выпущено, 4 Проблемный, 5 Отказ, 6 Отзыв, 7 Архив. */
const STATUS_TONE: Record<ReestrEntryStatus, ZTone> = {
  [ReestrEntryStatus.InProgress]: 'info',
  [ReestrEntryStatus.Submitted]: 'submitted',
  [ReestrEntryStatus.Released]: 'done',
  [ReestrEntryStatus.ConditionallyReleased]: 'pay',
  [ReestrEntryStatus.Problematic]: 'danger',
  [ReestrEntryStatus.Rejected]: 'danger',
  [ReestrEntryStatus.Withdrawn]: 'neutral',
  [ReestrEntryStatus.Archived]: 'neutral',
}
export const statusTone = (s: ReestrEntryStatus): ZTone => STATUS_TONE[s] ?? 'neutral'

/** Порядок статусов в фильтре и в окне смены статуса. */
export const TRANSIT_STATUSES: ReestrEntryStatus[] = [0, 1, 2, 3, 4, 5, 6, 7]
/** Ключ подписи статуса: t(`enum.reestrStatus.${statusKey(s)}`). */
const STATUS_KEYS = ['InProgress', 'Submitted', 'Released', 'ConditionallyReleased', 'Problematic', 'Rejected', 'Withdrawn', 'Archived'] as const
export const statusKey = (s: ReestrEntryStatus): string => STATUS_KEYS[s] ?? 'InProgress'

/** Колонки данных записи (кроме выбора, «Статуса» и действий) в порядке показа. */
export type TransitColumnId =
  | 'no' | 'date' | 'container' | 'consignee' | 'shipper' | 'station' | 'post' | 'shipment'
  | 'cargo' | 'tnved' | 'subcode' | 'places' | 'weight' | 'td' | 'tdCount' | 'extraSheets' | 'total'

/** Ключ в entry.data; «Итого» — не из data, а поле записи grandTotalWithVat. */
export const DATA_KEY: Record<Exclude<TransitColumnId, 'total'>, string> = {
  no: '№',
  date: 'Дата',
  container: 'Контейнер',
  consignee: 'Получатель',
  shipper: 'Отправитель',
  station: 'Станция назначения',
  post: 'Пост',
  shipment: 'Отправка',
  cargo: 'Груз',
  tnved: 'Код ТНВЭД',
  subcode: 'Подкод',
  places: 'Количество мест',
  weight: 'Вес',
  td: 'ТД',
  tdCount: 'Кол-во ТД',
  extraSheets: 'Количество доп.листов',
}

export const TRANSIT_COLUMNS: TransitColumnId[] = [
  'no', 'date', 'container', 'consignee', 'shipper', 'station', 'post', 'shipment',
  'cargo', 'tnved', 'subcode', 'places', 'weight', 'td', 'tdCount', 'extraSheets', 'total',
]
/** Всегда на месте — в меню «Колонки» их нет. */
export const FIXED_COLUMNS: TransitColumnId[] = ['no', 'container']
/** Колонки, которые можно скрыть (порядок — как в таблице). */
export const OPTIONAL_COLUMNS: TransitColumnId[] = TRANSIT_COLUMNS.filter((c) => !FIXED_COLUMNS.includes(c))
export const DEFAULT_HIDDEN: TransitColumnId[] = ['shipper', 'shipment', 'subcode', 'tdCount', 'extraSheets', 'post']

export const COLUMNS_STORAGE_KEY = 'zircon.transit.columns'

type Store = Pick<Storage, 'getItem' | 'setItem'>
const local = (): Store | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** Скрытые колонки из localStorage. Нет записи, битый JSON, недоступное хранилище — значения по умолчанию. */
export function readHiddenColumns(storage: Store | null = local()): TransitColumnId[] {
  try {
    const raw = storage?.getItem(COLUMNS_STORAGE_KEY)
    if (raw == null) return [...DEFAULT_HIDDEN]
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...DEFAULT_HIDDEN]
    return OPTIONAL_COLUMNS.filter((c) => parsed.includes(c))
  } catch {
    return [...DEFAULT_HIDDEN]
  }
}

/** Запомнить выбор; ошибка записи (приватный режим, квота) не мешает работе. */
export function writeHiddenColumns(hidden: TransitColumnId[], storage: Store | null = local()): void {
  try {
    storage?.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(OPTIONAL_COLUMNS.filter((c) => hidden.includes(c))))
  } catch {
    // выбор колонок — удобство: без хранилища он просто живёт до перезагрузки
  }
}

const num = (v: string | number | null | undefined): number | null => {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  return parseNumber(v)
}

export interface PageTotals { places: number | null; weight: number | null; total: number | null }

/** «Итого по странице»: места, вес, сумма. Нечисловые и пустые значения пропускаются; ни одного числа — null. */
export function pageTotals(entries: ReestrEntry[]): PageTotals {
  const sum = (pick: (e: ReestrEntry) => string | number | null | undefined) => {
    let acc: number | null = null
    for (const e of entries) {
      const n = num(pick(e))
      if (n !== null) acc = (acc ?? 0) + n
    }
    // Сумма дробей (12.1 + 0.2) не должна показывать хвост двоичной арифметики.
    return acc === null ? null : Math.round(acc * 1000) / 1000
  }
  return {
    places: sum((e) => e.data[DATA_KEY.places]),
    weight: sum((e) => e.data[DATA_KEY.weight]),
    total: sum((e) => e.grandTotalWithVat),
  }
}

/** Текст ячейки: пусто — «—», дата — ДД.ММ.ГГГГ, остальное как есть. */
export function cellText(entry: ReestrEntry, id: Exclude<TransitColumnId, 'total'>): string {
  const v = entry.data[DATA_KEY[id]] ?? null
  if (v == null || v.trim() === '') return '—'
  return formatReestrCellForDisplay(DATA_KEY[id], v)
}

/** Номер контейнера ISO 6346 «MRSU4885849» → «MRSU 488584 9»; иное — как есть. */
export function formatContainer(v: string): string {
  const s = v.trim()
  const m = /^([A-Za-z]{4})\s?(\d{6})\s?(\d)$/.exec(s)
  return m ? `${m[1].toUpperCase()} ${m[2]} ${m[3]}` : s
}

const qty = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 })
const money = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
// Узкие/обычные неразрывные пробелы Intl → U+00A0 (одинаково в браузерах и тестах).
const nbsp = (s: string) => s.replace(/[  ]/g, ' ')

/** Количество (места, вес): «8 529», «12,5»; пусто или не число — «—» (не число — как есть). */
export function formatQuantity(v: string | number | null | undefined): string {
  if (v == null || v === '') return '—'
  const n = num(v)
  return n === null ? String(v) : nbsp(qty.format(n))
}

/** Сумма без знака валюты (он в заголовке колонки): «86 400». */
export function formatAmount(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? '—' : nbsp(money.format(v))
}
