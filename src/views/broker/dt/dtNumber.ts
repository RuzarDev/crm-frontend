// Регистрационный номер ДТ (гр. А): «пост/ДДММГГ/7 цифр». Чистые функции — сборка и разбор.

/** Стандартный номер: код поста (цифры), дата ДДММГГ, 7 цифр. */
const STANDARD = /^\d+\/\d{6}\/\d{7}$/

/** ДДММГГ из даты 'YYYY-MM-DD' (допускается метка времени после даты); не дата — null. */
export const ddmmyyOf = (iso: string | null | undefined): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}${m[2]}${m[1].slice(2)}` : null
}

/** Дата 'YYYY-MM-DD' из ДДММГГ (год — 20ГГ); не дата — null. */
export const isoOfDdmmyy = (d6: string): string | null => {
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(d6)
  if (!m) return null
  const [, dd, mm, yy] = m
  return Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31 ? `20${yy}-${mm}-${dd}` : null
}

/** Только цифры, не больше 7. */
export const cleanTail = (raw: string): string => raw.replace(/\D/g, '').slice(0, 7)

/** Номер из частей (дата — ДДММГГ); пока чего-то не хватает (пост, дата, ровно 7 цифр) — пустая строка. */
export const buildFromParts = (post: string | null | undefined, d6: string | null | undefined, tail: string): string => {
  const code = (post ?? '').trim()
  return code && d6 && /^\d{6}$/.test(d6) && /^\d{7}$/.test(tail) ? `${code}/${d6}/${tail}` : ''
}

/** То же, но дата — 'YYYY-MM-DD'. */
export const buildDtNumber = (post: string | null | undefined, iso: string | null | undefined, tail: string): string =>
  buildFromParts(post, ddmmyyOf(iso), tail)

/** Части стандартного номера; у номера другого формата и у пустого — null. */
export const partsOf = (num: string | null | undefined): { post: string; d6: string; tail: string } | null => {
  const m = /^(\d+)\/(\d{6})\/(\d{7})$/.exec(num ?? '')
  return m ? { post: m[1], d6: m[2], tail: m[3] } : null
}

export const isStandardNumber = (num: string | null | undefined): boolean => STANDARD.test(num ?? '')

/** 7 цифр хвоста стандартного номера; у номера другого формата и у пустого — ''. */
export const tailOf = (num: string | null | undefined): string => (isStandardNumber(num) ? (num as string).slice(-7) : '')
