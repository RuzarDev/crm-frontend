// Справочники страницы записи транзита и правила значений, которые хранит запись.

/** Колонка ReestrEntry.DepartureCustomsOffice — 32 знака. */
export const DEPARTURE_OFFICE_MAX = 32

/** Код поста — ведущие 5–8 цифр названия: «57507 — ТАМОЖЕННЫЙ ПОСТ «…»» → «57507». */
export function customsPostCode(name: string | null | undefined): string | null {
  return /^\d{5,8}/.exec((name ?? '').trim())?.[0] ?? null
}

/**
 * Что сохранить в «Таможне отправления» при выборе поста (B.12): код поста; нет кода — название,
 * но название длиннее 32 знаков сервер не примет (tooLong — ошибка у поля).
 */
export function departureOfficeValue(name: string): { value: string; tooLong: boolean } {
  const code = customsPostCode(name)
  if (code) return { value: code, tooLong: false }
  return { value: name, tooLong: name.length > DEPARTURE_OFFICE_MAX }
}

/** Значение «Таможни отправления» без кода и длиннее 32 знаков — ошибка у поля. */
export function departureOfficeTooLong(value: string | null | undefined): boolean {
  const v = (value ?? '').trim()
  return v !== '' && !customsPostCode(v) && v.length > DEPARTURE_OFFICE_MAX
}
