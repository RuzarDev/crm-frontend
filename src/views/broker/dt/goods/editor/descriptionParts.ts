// Описание гр.31 в КЕДЕН-XML — части GoodsDescriptionText (Text250), на уровне товара до 4.
// То же правило, что KedenXmlExporter.SplitDescription на сервере: КЕДЕН (проверено 14.10.2026) показывает части
// через запятую без пробела, поэтому делим по последней запятой в пределах 250 (запятую КЕДЕН вернёт), иначе по
// последнему пробелу (на его месте КЕДЕН покажет запятую), посреди слова — только слово длиннее 250.

export const DESCRIPTION_PART = 250
export const DESCRIPTION_MAX_PARTS = 4

const isSpace = (c: string): boolean => /\s/.test(c)

function lastWhitespace(s: string, maxIndex: number): number {
  for (let i = Math.min(maxIndex, s.length - 1); i > 0; i--) if (isSpace(s[i])) return i
  return -1
}

/** Части описания, как их выгрузит сервер: каждая ≤ 250, без пустых, края без пробелов. */
export function splitDescription(text: string | null | undefined): string[] {
  const s = (text ?? '').trim()
  if (!s) return []
  const parts: string[] = []
  let rest = s
  while (rest.length > DESCRIPTION_PART) {
    const comma = rest.lastIndexOf(',', DESCRIPTION_PART)
    const byComma = comma > 0
    const cut = byComma ? comma : lastWhitespace(rest, DESCRIPTION_PART)
    if (cut > 0) {
      parts.push(rest.slice(0, cut).trimEnd())
      rest = rest.slice(cut + 1).trimStart()
      if (!byComma && rest.startsWith(',')) rest = rest.slice(1).trimStart()
    } else {
      parts.push(rest.slice(0, DESCRIPTION_PART)) // одно слово длиннее 250
      rest = rest.slice(DESCRIPTION_PART).trimStart()
    }
  }
  if (rest) parts.push(rest)
  return parts
}
