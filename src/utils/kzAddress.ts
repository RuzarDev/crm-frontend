// Эвристический разбор адресной строки ГБД ЮЛ (data.egov.kz) на регион/город/улицу.
// Формат в реестре нестрогий: «Казахстан, город Алматы, Бостандыкский район, улица Абая, дом 1»
// или «Республика Казахстан, Акмолинская область, г.Кокшетау, ул.Ауэзова, 189». Поэтому:
// разбиваем по запятым, ищем часть с «область/облысы» → регион, «г./город/қаласы» → город,
// остальное (кроме страны и района) склеиваем как улицу/дом. Результат — ПОДСКАЗКА для
// предзаполнения пустых полей, не истина; исходная строка сохраняется целиком отдельно.
export interface ParsedKzAddress {
  region: string | null
  city: string | null
  street: string | null
}

const COUNTRY_RE = /^(республика\s+)?(казахстан|қазақстан|kazakhstan)(\s+республикасы)?$/i
const REGION_RE = /(область|облысы|обл\.)/i
const CITY_RE = /^(г\.|г\s|город\s|қала\s|қаласы|к\.\s)/i
const CITY_SUFFIX_RE = /(қаласы|\sқ\.)$/i
const DISTRICT_RE = /(район|ауданы|р-н)/i

export function parseKzAddress(address: string): ParsedKzAddress {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean)
  let region: string | null = null
  let city: string | null = null
  const rest: string[] = []
  for (const p of parts) {
    if (COUNTRY_RE.test(p)) continue
    if (/^\d{6}$/.test(p)) continue // индекс
    if (!region && REGION_RE.test(p)) { region = p; continue }
    if (!city && (CITY_RE.test(p) || CITY_SUFFIX_RE.test(p))) {
      city = p.replace(CITY_RE, '').replace(CITY_SUFFIX_RE, '').trim()
      continue
    }
    if (DISTRICT_RE.test(p) && !city) continue // район без города — не улица
    rest.push(p)
  }
  return { region, city, street: rest.length ? rest.join(', ') : null }
}
