import { loadXlsx } from '@/utils/xlsx'
import { saveBlob } from '@/ui/download'
import { formatDateText } from '@/ui/date'

// Общие функции брокерских списков (волны 3а и 3б): подпись «Обновлено», поиск, период, формы числа, Excel.

/** Две цифры: 7 → «07». */
export const pad = (n: number): string => String(n).padStart(2, '0')
/** Сегодняшняя дата 'YYYY-MM-DD' по местному времени. */
export const todayIso = (now: Date = new Date()): string => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
/** Форма числа для подписей «{n} счетов»: ru — один/несколько/много; языки без «few» — one/many. */
export function pluralForm(n: number, locale: string): 'one' | 'few' | 'many' {
  const c = new Intl.PluralRules(locale).select(n)
  return c === 'one' ? 'one' : c === 'few' ? 'few' : 'many'
}
const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** Когда обновлено: сегодня — HH:mm, вчера — подпись, иначе DD.MM, другой год — DD.MM.YYYY (локальное время). */
export function formatUpdated(iso: string, now: Date = new Date(), t: (k: string) => string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  if (sameDay(d, now)) return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (sameDay(d, y)) return t('broker.list.yesterday')
  const dm = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`
  return d.getFullYear() === now.getFullYear() ? dm : `${dm}.${d.getFullYear()}`
}

const squash = (s: string): string => s.toLowerCase().replace(/\s+/g, '')

/**
 * Поиск по набору полей: без учёта регистра; пустой запрос подходит всему;
 * пробелы не мешают: «8471 30» находит «8471300000».
 */
export function matchesQuery(q: string, parts: (string | null | undefined)[]): boolean {
  const query = q.trim().toLowerCase()
  if (!query) return true
  const compact = squash(query)
  return parts.some((p) => {
    if (!p) return false
    return p.toLowerCase().includes(query) || squash(p).includes(compact)
  })
}

/** Локальная дата 'YYYY-MM-DD' из метки времени или даты; null — не разобралось. */
function localDay(iso: string): string | null {
  // Голая дата — как есть: new Date('2026-10-08') считается UTC и в минусовом поясе дала бы 7-е.
  if (DATE_ONLY.test(iso)) return iso
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Дата ДД.ММ.ГГГГ по локальному дню (метка времени — в местном поясе, голая YYYY-MM-DD — как есть); нет или мусор — «—». */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '—'
  const day = localDay(iso)
  return day ? formatDateText(day) || '—' : '—'
}

/** Попадает ли дата в период; обе границы включительно, период null — фильтра нет. */
export function inPeriod(iso: string | null | undefined, period: [string, string] | null): boolean {
  if (!period) return true
  if (!iso) return false
  const day = localDay(iso)
  if (!day) return false
  return day >= period[0] && day <= period[1]
}

/** Подпись периода для чипа: «01.10–08.10»; если год не текущий — «01.10.2025–08.10.2025». */
export function formatPeriod(period: [string, string], now: Date = new Date()): string {
  const year = String(now.getFullYear())
  const short = period[0].startsWith(year) && period[1].startsWith(year)
  const f = (s: string) => (short ? formatDateText(s).slice(0, 5) : formatDateText(s))
  return `${f(period[0])}–${f(period[1])}`
}

/** Выгрузка строк в Excel: файл `${fileBase}_YYYY-MM-DD.xlsx`; библиотека грузится только здесь. */
export async function exportXlsx(fileBase: string, sheet: string, rows: Record<string, unknown>[]): Promise<void> {
  const XLSX = await loadXlsx()
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  // Имя листа в Excel: до 31 знака, без : \ / ? * [ ].
  XLSX.utils.book_append_sheet(wb, ws, sheet.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Sheet1')
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const stamp = todayIso()
  saveBlob(
    new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${fileBase}_${stamp}.xlsx`,
  )
}
