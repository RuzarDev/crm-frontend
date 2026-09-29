// Признаки нетарифного регулирования / технического регулирования гр.33 («D0110», «C0300», «H0100»…).
// В КЕДЕН-XML это отдельные элементы ProhibitionCode, а в печатной форме код пишут с пробелом («D01 10»).
// Хранится строкой через запятую в goods.prohibitionCode; правила нормализации совпадают с бэкендом
// (KedenXmlExporter.FeatureCodes): пробелы внутри кода убираются, регистр верхний, похожие
// кириллические буквы заменяются латинскими.
const CYR_TO_LAT: Record<string, string> = {
  А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X',
}

export const FEATURE_CODE_RE = /^[A-Z]\d{4}$/

export function normalizeFeatureCode(raw: string): string {
  let out = ''
  for (const ch of raw) {
    if (/\s/.test(ch)) continue
    const up = ch.toUpperCase()
    out += CYR_TO_LAT[up] ?? up
  }
  return out
}

/** «D01 10, c03 00;H0100» → ['D0110', 'C0300', 'H0100'] (делим только по запятой/«;»/переводу строки). */
export function splitFeatureCodes(value: string | null | undefined): string[] {
  const seen = new Set<string>()
  for (const part of (value ?? '').split(/[,;\n\r]+/)) {
    const code = normalizeFeatureCode(part)
    if (code) seen.add(code)
  }
  return [...seen]
}

export function joinFeatureCodes(values: string[]): string | null {
  // каждое значение из тегов может само содержать запятые (вставка списка) — разбираем повторно
  const codes = splitFeatureCodes(values.join(','))
  return codes.length ? codes.join(',') : null
}

export const invalidFeatureCodes = (value: string | null | undefined): string[] =>
  splitFeatureCodes(value).filter((c) => !FEATURE_CODE_RE.test(c))
