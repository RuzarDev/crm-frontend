// Эвристический разбор адресной строки ГБД ЮЛ (data.egov.kz) на регион/район/город/улицу/дом/помещение.
// Формат в реестре нестрогий: «Казахстан, город Алматы, Жетысуский район, улица Абая, дом 1»
// или «Республика Казахстан, Акмолинская область, г.Кокшетау, ул.Ауэзова, 189». Поэтому:
// разбиваем по запятым, ищем часть с «область/облысы» → регион, «г./город/қаласы» → город,
// «… район» → район, «д./дом/зд.» → дом, «кв./оф./пом./н.п.» → помещение, остальное — улица.
// Результат — ПОДСКАЗКА для предзаполнения пустых полей, не истина; исходная строка сохраняется отдельно.
//
// Район («… РАЙОН») выделяется отдельно от области и идёт в поле «Район» (csdo:DistrictName);
// «… ОБЛАСТЬ» / «Г.АЛМАТЫ» — в «Область / регион» (RegionName).
export interface ParsedKzAddress {
  region: string | null
  /** «… РАЙОН» — отдельно от области, для поля «Район». */
  district: string | null
  city: string | null
  street: string | null
  /** Номер дома/здания («2А», «49», «15/1»). */
  house: string | null
  /** Квартира/офис/помещение («5», «101», «1»). */
  apt: string | null
}

export const EMPTY_PARSED_KZ_ADDRESS: ParsedKzAddress = {
  region: null, district: null, city: null, street: null, house: null, apt: null,
}

const COUNTRY_RE = /^(республика\s+)?(казахстан|қазақстан|kazakhstan)(\s+республикасы)?$/i
const REGION_RE = /(область|облысы|обл\.)/i
const CITY_RE = /^(г\.|г\s|город\s|қала\s|қаласы|к\.\s)/i
const CITY_SUFFIX_RE = /(қаласы|\sқ\.)$/i
const DISTRICT_RE = /(район|ауданы|р-н)/i
const CONTACT_RE = /^(тел\.?|телефон|факс|fax|phone|e-?mail|эл\.?\s*почта)(?![a-zа-яё])/i
const STREET_START_RE = /^(ул\.?|улица|көшесі|пр\.?|пр-т|проспект|пер\.?|переулок|мкр\.?|микрорайон|бульвар|б-р|шоссе|трасса|тупик)(\s|$|\.)/i

// Номер после маркера: «2А», «49», «15/1», «12-Б» — без запятых и пробелов.
const NUM = '(\\d[\\dA-Za-zА-Яа-яЁё/\\-]*)'
// Дом: «Д. 2А», «ДОМ 2А», «ЗД. 15/1», «ЗДАНИЕ 3», «СТР. 4», «№ 7».
const HOUSE_RE = new RegExp(`(?:^|[\\s,])(?:д\\.?|дом|зд\\.?|здание|стр\\.?|строение|№)\\s*${NUM}`, 'i')
// Помещение: «КВ. 5», «ОФ. 101», «ОФИС 12», «ПОМ. 3», «Н.П. 1», «КОМН. 2», «КАБ. 4».
const APT_RE = new RegExp(`(?:^|[\\s,])(?:кв\\.?|квартира|оф\\.?|офис|пом\\.?|помещение|н\\.\\s?п\\.?|нп|комн?\\.?|комната|каб\\.?|кабинет)\\s*${NUM}`, 'i')
// Голый номер сразу после улицы: «ул. Ауэзова, 189».
const BARE_HOUSE_RE = /^\d+[А-Яа-яA-Za-z]?(?:\/\d+[А-Яа-яA-Za-z]?)?$/

/** Достаёт из строки первое совпадение по регулярке и возвращает [значение, строка без совпадения]. */
function pull(text: string, re: RegExp): [string | null, string] {
  const m = re.exec(text)
  if (!m) return [null, text]
  const rest = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '')
  return [m[1].replace(/[.,]$/, ''), rest]
}

export function parseKzAddress(address: string): ParsedKzAddress {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean)
  const out: ParsedKzAddress = { ...EMPTY_PARSED_KZ_ADDRESS }
  const rest: string[] = []
  for (const p of parts) {
    if (COUNTRY_RE.test(p)) continue
    if (/^\d{6}$/.test(p)) continue // индекс
    if (CONTACT_RE.test(p) || /^\+?\d[\d\s\-()]{6,}$/.test(p)) continue // телефон/факс — не адрес
    if (!out.region && REGION_RE.test(p)) { out.region = p; continue }
    if (!out.city && (CITY_RE.test(p) || CITY_SUFFIX_RE.test(p))) {
      out.city = p.replace(CITY_RE, '').replace(CITY_SUFFIX_RE, '').trim()
      continue
    }
    if (!out.district && !STREET_START_RE.test(p) && DISTRICT_RE.test(p)) { out.district = p; continue }
    // дом / помещение — либо отдельной частью, либо внутри строки улицы («УЛ. АБАЯ Д. 2А»)
    let text = p
    if (!out.house) { const [h, t] = pull(text, HOUSE_RE); if (h) { out.house = h; text = t } }
    if (!out.apt) { const [a, t] = pull(text, APT_RE); if (a) { out.apt = a; text = t } }
    if (!text) continue
    if (!out.house && rest.length > 0 && BARE_HOUSE_RE.test(text)) { out.house = text; continue }
    rest.push(text)
  }
  out.street = rest.length ? rest.join(', ') : null
  return out
}
