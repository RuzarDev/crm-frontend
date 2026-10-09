// Регистрационный номер ДТ (гр. А): «пост/ДДММГГ/7 цифр». Чистые функции — сборка и разбор.

/** Стандартный номер: код поста (цифры), дата ДДММГГ, 7 цифр. */
const STANDARD = /^\d+\/\d{6}\/\d{7}$/

/** ДДММГГ из даты 'YYYY-MM-DD' (допускается метка времени после даты); не дата — null. */
export const ddmmyyOf = (iso: string | null | undefined): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}${m[2]}${m[1].slice(2)}` : null
}

/** Только цифры, не больше 7. */
export const cleanTail = (raw: string): string => raw.replace(/\D/g, '').slice(0, 7)

/** Номер из частей; пока чего-то не хватает (пост, дата, ровно 7 цифр) — пустая строка. */
export const buildDtNumber = (post: string | null | undefined, iso: string | null | undefined, tail: string): string => {
  const code = (post ?? '').trim()
  const date = ddmmyyOf(iso)
  return code && date && /^\d{7}$/.test(tail) ? `${code}/${date}/${tail}` : ''
}

export const isStandardNumber = (num: string | null | undefined): boolean => STANDARD.test(num ?? '')

/** 7 цифр хвоста стандартного номера; у номера другого формата и у пустого — ''. */
export const tailOf = (num: string | null | undefined): string => (isStandardNumber(num) ? (num as string).slice(-7) : '')
