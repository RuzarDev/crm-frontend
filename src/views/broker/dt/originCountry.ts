/**
 * Особые значения страны происхождения — гр. 16 (шапка) и гр. 34а (товар). Те же правила на сервере:
 * crm-server Features/Import40/OriginCountryCodes.cs.
 *
 * - R.055 (Решение Коллегии ЕЭК № 75), гр. 16 — 19.14.1: код страны либо «00» неизвестно, «99» разные, «EU» Евросоюз;
 *   гр. 34а — 19.18.40.1: код страны либо «00», «EU» (без «99»).
 * - Решение КТС № 257, гр. 16: разные страны или неизвестна хотя бы у одного товара — «РАЗНЫЕ», у всех неизвестна —
 *   «НЕИЗВЕСТНО», Евросоюз — «ЕВРОСОЮЗ».
 * - КЕДЕН заполняет гр. 16 сам по товарам; в его списке стран — «00 Неизвестна» и «EU Евросоюз».
 *
 * У нас Евросоюз в справочнике стран — кириллическое «ЕС» (в XML и печати сервер пишет «EU»), «00» — неизвестна.
 * До 15.10.2026 «разные» хранились как «000» — читаются как «99».
 */
export const ORIGIN_VARIOUS = '99'
export const ORIGIN_UNKNOWN = '00'
export const LEGACY_VARIOUS = '000'
export const EU_CODES = ['ЕС', 'EU'] as const

export const isEuCode = (code: string | null | undefined): boolean =>
  (EU_CODES as readonly string[]).includes((code ?? '').trim().toUpperCase())

/** Код гр. 16 для хранения и показа: прежнее «000» → «99», остальное как есть. */
export const normalizeOrigin = (code: string | null | undefined): string => {
  const v = (code ?? '').trim()
  return v === LEGACY_VARIOUS ? ORIGIN_VARIOUS : v
}

/** Буквенный код страны по справочнику («156» → «CN»); нет в справочнике — null. */
export type CountryAlphaOf = (code: string) => string | null | undefined

/** Ключ страны: особое значение — код КЕДЕН; иначе буквенный код по справочнику («156» = «CN»), иначе написание. */
const originKey = (code: string, alphaOf?: CountryAlphaOf): string => {
  const special = specialCountryKey(code)
  if (special === 'eu') return 'EU'
  if (special) return normalizeOrigin(code)
  const v = code.trim()
  return (alphaOf?.(v) || v).trim().toUpperCase()
}

/**
 * Гр. 16 по гр. 34а товаров: у всех одна страна — её код (и «00», если неизвестна у всех; и Евросоюз), иначе «99».
 * Страны сравниваются по сути через alphaOf: «CN» и «156» — одна страна. Товары без страны не считаются; ни у одного
 * нет страны — null.
 */
export const originForGoods = (codes: (string | null | undefined)[], alphaOf?: CountryAlphaOf): string | null => {
  const byKey = new Map<string, string>()
  for (const raw of codes) {
    const c = (raw ?? '').trim()
    const k = c ? originKey(c, alphaOf) : ''
    if (c && !byKey.has(k)) byKey.set(k, c)
  }
  if (byKey.size === 0) return null
  return byKey.size === 1 ? [...byKey.values()][0] : ORIGIN_VARIOUS
}

/** Особое значение (гр. 11/15/16/17/34а): ключ подписи i18n `broker.dt.countries.special.*`, иначе null. */
export const specialCountryKey = (code: string | null | undefined): 'various' | 'unknown' | 'eu' | null => {
  const v = normalizeOrigin(code)
  if (v === ORIGIN_VARIOUS) return 'various'
  if (v === ORIGIN_UNKNOWN) return 'unknown'
  if (isEuCode(v)) return 'eu'
  return null
}
