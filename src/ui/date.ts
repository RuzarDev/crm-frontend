import { parseDate, type CalendarDate, type DateValue } from '@internationalized/date'

// Значение ZDate — строка 'YYYY-MM-DD' (как value-format у a-date-picker), Reka работает с CalendarDate.
// Хвост времени ('2026-09-28T00:00:00' — DateTime с сервера) отбрасываем: a-date-picker (dayjs) такие
// значения показывал. parseDate бросает на несуществующей дате (2026-02-30) — это тоже «мусор».
export const toCalendarDate = (s: string | null | undefined): CalendarDate | undefined => {
  const m = s ? /^(\d{4}-\d{2}-\d{2})(?:[T ][\d:.]*(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(s) : null
  if (!m) return undefined
  try { return parseDate(m[1]) } catch { return undefined }
}
export const fromCalendarDate = (d: DateValue | null | undefined): string | null => (d ? d.toString().slice(0, 10) : null)

// en-US ставит месяц перед днём; для РК везде день первым.
const LOCALES: Record<string, string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-GB' }
export const calendarLocale = (appLocale: string): string => LOCALES[appLocale] ?? 'ru-RU'
