import type { TnvedRegulationDto } from '@/types/api'
import { calendarLocale, toCalendarDate } from '@/ui/date'
import { matchesQuery } from '@/views/broker/list'

// Нормативные акты (НПА): строки, поиск по номеру и дате, сортировка по дате. Без Vue — проверяется отдельно.

export interface RegulationRow {
  id: number
  number: string
  /** Дата как 'YYYY-MM-DD' ('' — не разобралась). */
  iso: string
  /** Дата для показа по языку интерфейса; не разобралась, но у сервера есть строка — она как есть; иначе пусто. */
  dateText: string
  /** Только http(s): иначе ссылки нет. */
  url: string | null
}

export type RegulationOrder = 'newest' | 'oldest'

const DMY = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/
const pad = (n: number | string): string => String(n).padStart(2, '0')

/** День документа: ISO-дата сервера, а без неё — «ДД.ММ.ГГГГ» из строки; иначе ''. Часовой пояс не двигает день. */
export function regulationDay(dto: Pick<TnvedRegulationDto, 'date' | 'dateStr'>): string {
  const d = toCalendarDate(dto.date)
  if (d) return d.toString()
  const m = dto.dateStr ? DMY.exec(dto.dateStr.trim()) : null
  if (m) return toCalendarDate(`${m[3]}-${pad(m[2])}-${pad(m[1])}`)?.toString() ?? ''
  return ''
}

/** 'YYYY-MM-DD' → дата по языку интерфейса («08.10.2026» / «08/10/2026»). */
export function formatDay(iso: string, locale: string): string {
  const d = toCalendarDate(iso)
  if (!d) return ''
  return new Intl.DateTimeFormat(calendarLocale(locale), { day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(d.year, d.month - 1, d.day))
}

const safeUrl = (u: string | null | undefined): string | null => (u && /^https?:\/\//i.test(u.trim()) ? u.trim() : null)

export function regulationRows(data: TnvedRegulationDto[] | null | undefined, locale: string): RegulationRow[] {
  return (data ?? []).map((r) => {
    const iso = regulationDay(r)
    return { id: r.id, number: r.number, iso, dateText: iso ? formatDay(iso, locale) : (r.dateStr ?? '').trim(), url: safeUrl(r.url) }
  })
}

/** Сначала новые/старые; без даты — в конце при любом порядке, равные даты — по номеру. */
export function sortRegulations(rows: RegulationRow[], order: RegulationOrder): RegulationRow[] {
  const sign = order === 'newest' ? -1 : 1
  return [...rows].sort((a, b) => {
    if (!a.iso !== !b.iso) return a.iso ? -1 : 1
    if (a.iso !== b.iso) return a.iso < b.iso ? -sign : sign
    return a.number.localeCompare(b.number, undefined, { numeric: true })
  })
}

/** Поиск по номеру и дате: «2018», «08.2024», «ДТ-12» — по номеру, показанной дате и ISO-дате; пробелы не мешают. */
export function filterRegulations(rows: RegulationRow[], q: string): RegulationRow[] {
  if (!q.trim()) return rows
  return rows.filter((r) => matchesQuery(q, [r.number, r.dateText, r.iso, r.iso.split('-').reverse().join('.')]))
}
