// Разумный диапазон дат ДТ (правка декларантов №14б, 21.10.2026: дата инвойса 10.09.2202 сохранялась без вопросов).
// То же правило на сервере — CRM.API/Features/Import40/DtDateRanges.cs (пункты готовности КЕДЕН, графы А/31/40/44/47/48/54/В).
//   событие (дата документа, подачи, платежа, курса, периода поставки) — 01.01.2000 … сегодня + 1 год;
//   срок действия (гр. 44 «действует по», доверенность гр. 54, срок отсрочки гр. 48) — 01.01.2000 … сегодня + 10 лет;
//   дата выпуска товара и автомобиля (гр. 31) — 01.01.1900 … сегодня + 1 год (нижняя граница — решение владельца).
// «Сегодня» — по Казахстану (UTC+5), как CurrencyRatesOnDate.TodayKz на сервере. Границы допустимы.
// Это ПРЕДУПРЕЖДЕНИЯ: поле принимает дату (ZDate не откатывает), XML не блокируется. Проверяется значение, а не ввод —
// срабатывает и на датах из Excel, «Из документов», копирования и разделения ДТ.
import { formatDateText, toCalendarDate } from '@/ui/date'

export type DtDateKind = 'event' | 'validity' | 'manufacture'

export const DT_DATE_MIN = '2000-01-01'
/** Нижняя граница даты выпуска (гр. 31.1, автомобиль) — решение владельца, предложение 1900. */
export const DT_MANUFACTURE_MIN = '1900-01-01'
export const DT_EVENT_YEARS_AHEAD = 1
export const DT_VALIDITY_YEARS_AHEAD = 10

const KZ_OFFSET_MS = 5 * 3600_000

/** Сегодня по Казахстану (UTC+5), 'YYYY-MM-DD'. */
export const todayKzIso = (now = Date.now()): string => new Date(now + KZ_OFFSET_MS).toISOString().slice(0, 10)

export interface DtDateIssue {
  kind: 'tooEarly' | 'tooLate'
  /** Нарушенная граница, 'YYYY-MM-DD'. */
  limit: string
}

/** Граница вида даты: нижняя и верхняя ('YYYY-MM-DD'); today — 'YYYY-MM-DD'. */
export function dtDateLimits(kind: DtDateKind, today = todayKzIso()): { min: string; max: string } {
  const t = toCalendarDate(today)
  const years = kind === 'validity' ? DT_VALIDITY_YEARS_AHEAD : DT_EVENT_YEARS_AHEAD
  return {
    min: kind === 'manufacture' ? DT_MANUFACTURE_MIN : DT_DATE_MIN,
    max: t ? t.add({ years }).toString() : today,
  }
}

/** Дата вне диапазона — что не так; пусто, не дата или в диапазоне — null. Понимает и '2026-09-28T00:00:00'. */
export function dtDateIssue(value: string | null | undefined, kind: DtDateKind, today = todayKzIso()): DtDateIssue | null {
  const d = toCalendarDate(value)
  if (!d) return null
  const { min, max } = dtDateLimits(kind, today)
  const iso = d.toString()
  if (iso < min) return { kind: 'tooEarly', limit: min }
  if (iso > max) return { kind: 'tooLate', limit: max }
  return null
}

/** «Действует по» раньше начала — более поздней из переданных дат (дата документа, «действует с»). Пусто — false. */
export function validityBeforeStart(validity?: string | null, ...starts: (string | null | undefined)[]): boolean {
  const until = toCalendarDate(validity)
  if (!until) return false
  return starts.some((s) => {
    const d = toCalendarDate(s)
    return !!d && until.compare(d) < 0
  })
}

type T = (key: string, params?: Record<string, unknown>) => string

/** Текст предупреждения («10.09.2202 позже 21.10.2027 — проверьте год») или null. */
export function dtDateWarning(t: T, value: string | null | undefined, kind: DtDateKind, today?: string): string | null {
  const issue = dtDateIssue(value, kind, today)
  if (!issue) return null
  return t(`broker.dt.dates.${issue.kind}`, { date: formatDateText(value), limit: formatDateText(issue.limit) })
}

/** Для v-bind на ZField: предупреждение — { validateStatus: 'warning', help }, иначе {}. */
export function dtDateFieldProps(t: T, value: string | null | undefined, kind: DtDateKind, today?: string):
  { validateStatus: 'warning'; help: string } | Record<string, never> {
  const help = dtDateWarning(t, value, kind, today)
  return help ? { validateStatus: 'warning', help } : {}
}
