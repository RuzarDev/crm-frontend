import type { RefCodeItem } from '@/types/api'

// Справочник стран (5.13): опции вида «Китай (CN)», поиск по названию/alpha2/цифровому коду
// ОКСМ, но хранимое значение — всегда цифровой код ОКСМ, как в справочнике ref/countries.

export interface CountryOption {
  value: string
  label: string
  searchText: string
}

export function buildCountryOptions(countries: RefCodeItem[]): CountryOption[] {
  return countries.map((c) => ({
    value: c.code,
    label: c.alpha2 ? `${c.name} (${c.alpha2})` : c.name,
    searchText: `${c.name} ${c.alpha2 ?? ''} ${c.code}`.toLowerCase(),
  }))
}

export function filterCountryOption(input: string, option: { searchText?: string }): boolean {
  return (option.searchText ?? '').includes(input.trim().toLowerCase())
}

/**
 * Старые записи (до 5.13) могли хранить буквенный код (KZ/CN) вместо цифрового ОКСМ —
 * приводим к цифровому, если в справочнике есть соответствие по alpha2. Уже цифровой код
 * или код без соответствия — возвращаем как есть, не теряя данные.
 */
export function normalizeCountryCode(raw: string | null | undefined, countries: RefCodeItem[]): string | null {
  if (!raw) return raw ?? null
  const trimmed = raw.trim()
  if (!trimmed || /^\d+$/.test(trimmed)) return trimmed
  const match = countries.find((c) => (c.alpha2 || '').toLowerCase() === trimmed.toLowerCase())
  return match ? match.code : raw
}

/** Название страны по коду для отображения (карточка заявки и т.п.) — код может быть
 *  легаси буквенным или цифровым ОКСМ. Нет совпадения — показываем сам код. */
export function countryName(raw: string | null | undefined, countries: RefCodeItem[]): string {
  if (!raw) return ''
  const byCode = countries.find((c) => c.code === raw)
  if (byCode) return byCode.name
  const byAlpha = countries.find((c) => (c.alpha2 || '').toLowerCase() === raw.toLowerCase())
  return byAlpha ? byAlpha.name : raw
}
