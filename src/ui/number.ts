/** Разбор числа, как его вводят/вставляют в РК: «1 234,56», «1234.56», неразрывные пробелы. Мусор → null. */
export const parseNumber = (text: string): number | null => {
  const s = text.replace(/[\s  ]/g, '').replace(',', '.')
  if (s === '' || !/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export const clampRound = (n: number, o: { min?: number; max?: number; precision?: number }): number => {
  let v = n
  if (o.min !== undefined) v = Math.max(o.min, v)
  if (o.max !== undefined) v = Math.min(o.max, v)
  if (o.precision !== undefined) {
    const f = 10 ** o.precision
    v = Math.round((v + Number.EPSILON) * f) / f
  }
  return v
}
