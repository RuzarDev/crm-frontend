import { parseDate, type CalendarDate, type DateValue } from '@internationalized/date'

// Значение ZDate — строка 'YYYY-MM-DD' (как value-format у a-date-picker), календарь Reka — CalendarDate.
// ZDate — поле только даты: хвост времени ('2026-09-28T00:00:00' — DateTime с сервера) отбрасываем,
// a-date-picker (dayjs) такие значения показывал. parseDate бросает на несуществующей дате
// (2026-02-30) — это тоже «мусор».
export const toCalendarDate = (s: string | null | undefined): CalendarDate | undefined => {
  const m = s ? /^(\d{4}-\d{2}-\d{2})(?:[T ][\d:.]*(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(s) : null
  if (!m) return undefined
  try { return parseDate(m[1]) } catch { return undefined }
}
export const fromCalendarDate = (d: DateValue | null | undefined): string | null => (d ? d.toString().slice(0, 10) : null)

// en-US ставит месяц перед днём; для РК везде день первым.
const LOCALES: Record<string, string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-GB' }
export const calendarLocale = (appLocale: string): string => LOCALES[appLocale] ?? 'ru-RU'

// Текст поля ZDate — всегда ДД.ММ.ГГГГ (день первым во всех языках).
const pad2 = (n: number | string) => String(n).padStart(2, '0')
export const textOf = (d: DateValue): string => `${pad2(d.day)}.${pad2(d.month)}.${String(d.year).padStart(4, '0')}`
export const formatDateText = (s: string | null | undefined): string => {
  const d = toCalendarDate(s)
  return d ? textOf(d) : ''
}

const SEP = /[./\-\s]/
/** Маска при наборе: только цифры, точки ставятся сами (28092026 → 28.09.2026). Свои разделители
 *  («1.09.2026», «28/09/2026») сохраняются без дополнения нулями — иначе набор поверх выделенного дня
 *  сбивал бы каретку; нули добавляет разбор. ISO ('2026-09-28') при вставке переводится в ДД.ММ.ГГГГ. */
export const maskDateText = (raw: string): string => {
  const s = raw.trim()
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (iso) return `${pad2(iso[3])}.${pad2(iso[2])}.${iso[1]}`
  if (SEP.test(s)) {
    const parts = s.split(/[./\-\s]+/).map((p) => p.replace(/\D/g, ''))
    if (parts.length <= 3 && parts.slice(0, 2).every((p) => p.length <= 2)) {
      return parts.map((p, i) => (i === 2 ? p.slice(0, 4) : p)).join('.')
    }
  }
  const d = s.replace(/\D/g, '').slice(0, 8)
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter((p, i) => i === 0 || p).join('.')
}

/** Разбор текста поля: null — пусто, undefined — не дата (неполная, несуществующая, год < 1000).
 *  Двузначный год — 20ГГ. */
export const parseDateText = (text: string): CalendarDate | null | undefined => {
  const s = text.trim()
  if (!s) return null
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(s)
  if (!m) return undefined
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  if (year < 1000) return undefined
  return toCalendarDate(`${year}-${pad2(m[2])}-${pad2(m[1])}`)
}

/** Набор закончен (год из 4 цифр) — с этого момента неверная дата подсвечивается. */
export const isCompleteDateText = (text: string): boolean => /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(text.trim())
