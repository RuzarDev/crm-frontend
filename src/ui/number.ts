/**
 * Разбор числа, как его вводят/вставляют в РК и из Excel/банка: «1 234,56», «1234.56»,
 * «1,234.56», «1.234,56», неразрывные пробелы, «−5», «+5». Мусор → null.
 * Если есть и «,», и «.», десятичный — последний из них, другой — разделитель тысяч;
 * одиночный «,» или «.» — десятичный.
 */
export const parseNumber = (text: string): number | null => {
  let s = text.replace(/[\s  ]/g, '').replace(/−/g, '-')
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else {
    s = s.replace(',', '.')
  }
  if (s === '' || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Сдвиг десятичного порядка через строку (без ошибок двоичного умножения: 1.005e2 = 100.5). */
const shift = (v: number, p: number): number => {
  const [m, e] = String(v).split('e')
  return Number(`${m}e${Number(e ?? 0) + p}`)
}

/** Денежное округление: half-up, симметрично для отрицательных (половина — от нуля). */
export const roundTo = (v: number, precision: number): number => {
  const r = shift(Math.round(shift(Math.abs(v), precision)), -precision)
  return (v < 0 ? -r : r) + 0 // + 0 убирает -0
}

export const clampRound = (n: number, o: { min?: number; max?: number; precision?: number }): number => {
  let v = n
  if (o.min !== undefined) v = Math.max(o.min, v)
  if (o.max !== undefined) v = Math.min(o.max, v)
  if (o.precision !== undefined) v = roundTo(v, o.precision)
  return v
}

/** Показ с фиксированным числом знаков и тем же округлением, что у clampRound. */
export const formatFixed = (v: number, precision: number): string => roundTo(v, precision).toFixed(precision)

const moneyFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

/** Деньги для карточек: «2 840 000 ₸». Узкие/обычные неразрывные пробелы Intl → U+00A0 (стабильно в тестах и разных ОС). */
export const formatMoney = (n: number, currency = '₸'): string =>
  `${moneyFormat.format(n).replace(/[  ]/g, ' ')} ${currency}`
