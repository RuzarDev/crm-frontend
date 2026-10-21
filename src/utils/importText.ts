// Тексты импорта в ДТ (пакет 21.10.2026, правки №4, №6, №7): чистые функции без справочников сервера.
// - normalizeIncotermsPlace — гр. 20 «место поставки»: только пункт, заглавными, город РК по-русски (№6);
// - parseForeignAddress — адрес отправителя гр. 2 из строки инвойса: страна, область, город, район, улица, дом, офис (№7);
// - countryFromText — страна происхождения текстом («CN», «156», «Китай», «China», «中国») → цифровой ОКСМ (№4);
// - packagingWord — вид упаковки по словам («ctns», «纸箱», «картонные коробки») → коробка / мешок / поддон (№3);
// - normPartyName — название стороны для сравнения со справочником сторон (без форм собственности и знаков).
// Те же правила места поставки и стран — в Zircon AI (aqniet/normalize.py), там — для разбора «Из документов».

const HAN_RE = /\p{Script=Han}/u
const HAN_ALL = /\p{Script=Han}+/gu

/** Есть иероглифы (описание на китайском — нужен перевод, гр. 31 подаётся на русском). */
export const hasHan = (s: string | null | undefined): boolean => HAN_RE.test(s ?? '')

/** ЗАГЛАВНЫМИ, как поля ДТ (правило UPPERCASE); пусто — null. */
export function upperRu(s: string | null | undefined): string | null {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t ? t.toLocaleUpperCase('ru-RU') : null
}

// ───────────────────────── №6. Гр. 20 «Место поставки» ─────────────────────────

const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DAT', 'DDP', 'DDU']
// Кириллица-двойник в документах («ДАР НУР ЖОЛЫ» = DAP), как в Zircon AI.
const CYR_INCOTERMS: Record<string, string> = {
  ДАР: 'DAP', ДАП: 'DAP', СИФ: 'CIF', ФОБ: 'FOB', ФСА: 'FCA', ДДП: 'DDP', СРТ: 'CPT', СПТ: 'CPT', СИП: 'CIP', ЕХW: 'EXW', ЕХВ: 'EXW',
}

/** Латинское название пункта РК → как пишут в ДТ по-русски (В12: только города РК, остальные — как в документе). */
export const KZ_CITY_RU: Readonly<Record<string, string>> = {
  ALMATY: 'АЛМАТЫ', ALMAATA: 'АЛМАТЫ', ASTANA: 'АСТАНА', NURSULTAN: 'АСТАНА', SHYMKENT: 'ШЫМКЕНТ', CHIMKENT: 'ШЫМКЕНТ',
  KHORGOS: 'ХОРГОС', HORGOS: 'ХОРГОС', KORGAS: 'ХОРГОС', DOSTYK: 'ДОСТЫК', ALTYNKOL: 'АЛТЫНКОЛЬ', NURZHOLY: 'НУР ЖОЛЫ',
  KARAGANDA: 'КАРАГАНДА', KARAGANDY: 'КАРАГАНДА', AKTOBE: 'АКТОБЕ', AKTAU: 'АКТАУ', ATYRAU: 'АТЫРАУ', PAVLODAR: 'ПАВЛОДАР',
  KOSTANAY: 'КОСТАНАЙ', KOSTANAI: 'КОСТАНАЙ', TARAZ: 'ТАРАЗ', URALSK: 'УРАЛЬСК', ORAL: 'УРАЛЬСК', SEMEY: 'СЕМЕЙ',
  OSKEMEN: 'УСТЬ-КАМЕНОГОРСК', USTKAMENOGORSK: 'УСТЬ-КАМЕНОГОРСК', KYZYLORDA: 'КЫЗЫЛОРДА', PETROPAVLOVSK: 'ПЕТРОПАВЛОВСК',
  TALDYKORGAN: 'ТАЛДЫКОРГАН', TURKESTAN: 'ТУРКЕСТАН', KONAEV: 'КОНАЕВ', KAPCHAGAY: 'КОНАЕВ', ZHEZKAZGAN: 'ЖЕЗКАЗГАН',
  EKIBASTUZ: 'ЭКИБАСТУЗ', TEMIRTAU: 'ТЕМИРТАУ', KOKSHETAU: 'КОКШЕТАУ', ZHANAOZEN: 'ЖАНАОЗЕН', BAKHTY: 'БАХТЫ', MAIKAPCHAGAY: 'МАЙКАПЧАГАЙ',
}

/** Только страна — не пункт поставки. */
const COUNTRY_ONLY = /^(KAZAKHSTAN|REPUBLIC OF KAZAKHSTAN|КАЗАХСТАН|РЕСПУБЛИКА КАЗАХСТАН|РК|RK|CHINA|PRC|КИТАЙ|КНР)$/

/**
 * Место поставки гр. 20 из строки документа: «/ 交货条件: CIF ALMATY, KAZAKHSTAN (Incoterms® 2020)» → «АЛМАТЫ»,
 * «DAP НУР ЖОЛЫ» → «НУР ЖОЛЫ», «FCA Guangzhou» → «GUANGZHOU», «Almaty city» → «АЛМАТЫ». Иероглифы и метки убираются,
 * код Инкотермс — тоже (место — текст после него), обрезка по «,», «(», «;», «Incoterms» и двойному пробелу (дальше в
 * той же ячейке — «Транспорт / …»). Только страна или пусто — null.
 */
export function normalizeIncotermsPlace(raw: string | null | undefined): string | null {
  if (!raw) return null
  let s = raw.normalize('NFKC').replace(HAN_ALL, ' ').replace(/®/g, ' ')
  s = s.replace(/(условия\s+поставки|базис\s+поставки|delivery\s+terms?|terms\s+of\s+delivery|place\s+of\s+delivery|место\s+поставки)/giu, ' ')
  // Код Инкотермс: место — после него. Латиница или кириллица-двойник.
  const latin = new RegExp(`(^|[^A-Za-z])(${INCOTERMS.join('|')})(?=$|[^A-Za-z])`, 'i').exec(s)
  const cyr = new RegExp(`(^|[^\\p{L}])(${Object.keys(CYR_INCOTERMS).join('|')})(?=$|[^\\p{L}])`, 'iu').exec(s)
  const hit = [latin, cyr].filter((m): m is RegExpExecArray => !!m).sort((a, b) => a.index - b.index)[0]
  if (hit) s = s.slice(hit.index + hit[0].length)
  s = s.replace(/^[\s/:,;.\-–—]+/u, '')
  const cut = /[,(;]|\bincoterms\b|\s{2,}/i.exec(s)
  if (cut) s = s.slice(0, cut.index)
  let place = (upperRu(s) ?? '')
    .replace(/[\s/:.\-–—]+$/u, '')
    .replace(/^(Г\.|Г\s|ГОРОД\s|CITY OF\s)/u, '')
    .replace(/(\s+(CITY|Г\.?|ГОРОД|KAZAKHSTAN|КАЗАХСТАН))+$/u, '')
    .trim()
  if (!place || COUNTRY_ONLY.test(place)) return null
  const key = place.replace(/[\s\-–—]/g, '')
  if (KZ_CITY_RU[key]) place = KZ_CITY_RU[key]
  return place
}

// ───────────────────────── №4. Страна текстом ─────────────────────────

/** Названия стран EN / CN / RU (и частые формы в документах) → цифровой ОКСМ. Список — на подтверждение (verify-list). */
export const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  CHINA: '156', PRC: '156', PRCHINA: '156', PEOPLESREPUBLICOFCHINA: '156', 中国: '156', 中华人民共和国: '156', КИТАЙ: '156', КНР: '156',
  HONGKONG: '344', 香港: '344', TAIWAN: '158', 台湾: '158',
  KAZAKHSTAN: '398', REPUBLICOFKAZAKHSTAN: '398', КАЗАХСТАН: '398', 哈萨克斯坦: '398',
  RUSSIA: '643', RUSSIANFEDERATION: '643', РОССИЯ: '643', РОССИЙСКАЯФЕДЕРАЦИЯ: '643', 俄罗斯: '643',
  TURKEY: '792', TURKIYE: '792', TÜRKIYE: '792', ТУРЦИЯ: '792', 土耳其: '792',
  UZBEKISTAN: '860', УЗБЕКИСТАН: '860', KYRGYZSTAN: '417', KYRGYZREPUBLIC: '417', КЫРГЫЗСТАН: '417', КИРГИЗИЯ: '417',
  KOREA: '410', SOUTHKOREA: '410', REPUBLICOFKOREA: '410', КОРЕЯ: '410', РЕСПУБЛИКАКОРЕЯ: '410', 韩国: '410',
  JAPAN: '392', ЯПОНИЯ: '392', 日本: '392', INDIA: '356', ИНДИЯ: '356', 印度: '356',
  VIETNAM: '704', VIETNAMSOCIALISTREPUBLIC: '704', ВЬЕТНАМ: '704', 越南: '704',
  GERMANY: '276', ГЕРМАНИЯ: '276', 德国: '276', ITALY: '380', ИТАЛИЯ: '380', 意大利: '380',
  USA: '840', UNITEDSTATES: '840', UNITEDSTATESOFAMERICA: '840', США: '840', 美国: '840',
  BELARUS: '112', БЕЛАРУСЬ: '112', POLAND: '616', ПОЛЬША: '616', IRAN: '364', ИРАН: '364',
  INDONESIA: '360', ИНДОНЕЗИЯ: '360', MALAYSIA: '458', МАЛАЙЗИЯ: '458', THAILAND: '764', ТАИЛАНД: '764',
  FRANCE: '250', ФРАНЦИЯ: '250', SPAIN: '724', ИСПАНИЯ: '724', UNITEDKINGDOM: '826', UK: '826', ВЕЛИКОБРИТАНИЯ: '826',
  UAE: '784', UNITEDARABEMIRATES: '784', ОАЭ: '784', PAKISTAN: '586', ПАКИСТАН: '586', BANGLADESH: '050', БАНГЛАДЕШ: '050',
}

export interface CountryOption { value: string; label: string; alpha2?: string | null }

const countryKey = (s: string) => s.toLocaleUpperCase('ru-RU').replace(/^(MADE\s+IN|ORIGIN|СДЕЛАНО\s+В|ПРОИЗВЕДЕНО\s+В)\s*:?\s*/u, '')
  .replace(/^THE\s+/, '').replace(/[^\p{L}\p{N}]/gu, '')

/**
 * Страна текстом → цифровой ОКСМ из справочника стран страницы (countries; value — цифры, alpha2 — буквы): буквенный
 * код («CN»), цифровой («156»), название RU из справочника («Китай»), EN/CN-название из таблицы («China», «中国»,
 * «Made in PRC»). Справочник пуст — по таблице и цифровому коду. Не узнано — null.
 */
export function countryFromText(text: string | null | undefined, countries: readonly CountryOption[] = []): string | null {
  const raw = (text ?? '').trim()
  if (!raw) return null
  const listed = (code: string) => (!countries.length || countries.some((c) => c.value === code) ? code : null)
  if (/^\d{1,3}$/.test(raw)) return listed(raw.padStart(3, '0'))
  const up = raw.toUpperCase()
  if (/^[A-Z]{2}$/.test(up)) {
    const byAlpha = countries.find((c) => (c.alpha2 ?? '').toUpperCase() === up)
    if (byAlpha) return byAlpha.value
    return up === 'CN' ? listed('156') : up === 'KZ' ? listed('398') : null
  }
  const key = countryKey(raw)
  if (!key) return null
  const alias = COUNTRY_ALIASES[key]
  if (alias) return listed(alias)
  // Название из справочника страницы: подпись «156 — КИТАЙ» или «CN — КИТАЙ».
  for (const c of countries) {
    const name = c.label.replace(/^[0-9A-Z]{2,3}\s*[—–-]\s*/u, '')
    if (countryKey(name) === key) return c.value
  }
  return null
}

// ───────────────────────── №7. Адрес отправителя ─────────────────────────

export interface ForeignAddress {
  countryText: string | null
  region: string | null
  district: string | null
  city: string | null
  street: string | null
  house: string | null
  apt: string | null
  /** Что-то обрезано по длине R.055 (область/город/улица 120, дом 50, офис 20). */
  clipped: boolean
}

/** Пределы R.055 для адреса стороны: Name120 / Id50 / Id20. */
export const ADDRESS_LIMITS = { region: 120, district: 120, city: 120, street: 120, house: 50, apt: 20 } as const

const COUNTRY_PART = /^(CHINA|P\.?\s*R\.?\s*CHINA|PRC|PEOPLE'?S\s+REPUBLIC\s+OF\s+CHINA|HONG\s*KONG(,?\s*CHINA)?|KAZAKHSTAN|REPUBLIC\s+OF\s+KAZAKHSTAN|RUSSIA|TURKEY|T[ÜU]RKIYE|UZBEKISTAN|KYRGYZSTAN|KOREA|JAPAN|INDIA|VIET\s*NAM|GERMANY|ITALY|USA|КИТАЙ|КАЗАХСТАН|РОССИЯ)$/i
const REGION_PART = /\b(province|prov\.?|autonomous\s+region|oblast|region|state)\b|省$|自治区$/i
const CITY_PART = /\b(city)\b|市$/i
const DISTRICT_PART = /\b(district|county|dist\.?)\b|[区县]$/i
const STREET_PART = /\b(street|st\.?|road|rd\.?|avenue|ave\.?|lane|ln\.?|boulevard|blvd\.?|highway|hwy\.?)\b|[路街道]$/i
const HOUSE_PART = /^(no\.?\s*\d+[\w-]*|#\s*\d+[\w-]*|building\s+\S+|bldg\.?\s*\S+|block\s+\S+|blk\.?\s*\S+)$/i
const APT_PART = /^(room|rm\.?|unit|suite|flat|apt\.?|office)\s*[\w-]+$|室$/i
const HOUSE_THEN_STREET = /^(no\.?\s*\d+[\w-]*)\s+(.+)$/i

const clip = (v: string | null, max: number, flag: { clipped: boolean }): string | null => {
  if (!v || v.length <= max) return v
  flag.clipped = true
  return v.slice(0, max).trim()
}

/**
 * Адрес иностранного отправителя из строки инвойса (№7): «Room 722, Block B, Soho Apartment, Wanda Plaza, Jiang Street,
 * Yiwu City, Jinhua City, Zhejiang Province, China» → страна «China», область «ZHEJIANG PROVINCE», город «YIWU», улица
 * «JIANG STREET, SOHO APARTMENT, WANDA PLAZA, JINHUA CITY», дом «BLOCK B», офис «ROOM 722». Город — первый «… City»
 * (самый мелкий), остальное нераспознанное дописывается к улице. Заглавными, по пределам R.055. Только иероглифы или
 * пусто — null (вызывающий предупреждает «заполните вручную»).
 */
export function parseForeignAddress(text: string | null | undefined): ForeignAddress | null {
  let s = (text ?? '').replace(/^\s*(address|адрес|地址)\s*[:：]\s*/iu, '').trim()
  if (!s) return null
  if (hasHan(s) && !/[A-Za-z]/.test(s.replace(HAN_ALL, ''))) return null
  s = s.replace(HAN_ALL, ' ')
  const parts = s.split(/[,;\n，；]+/).map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p && !/^[.\-–—]+$/.test(p))
  if (!parts.length) return null
  const out: ForeignAddress = { countryText: null, region: null, district: null, city: null, street: null, house: null, apt: null, clipped: false }
  if (COUNTRY_PART.test(parts[parts.length - 1])) out.countryText = parts.pop()!
  const rest: string[] = []
  for (const p of parts) {
    if (!out.apt && APT_PART.test(p)) out.apt = p
    else if (!out.house && HOUSE_PART.test(p)) out.house = p
    else if (!out.region && REGION_PART.test(p)) out.region = p
    else if (!out.city && CITY_PART.test(p)) out.city = p.replace(/\s*\bcity\b\s*/i, ' ').replace(/市$/, '').trim() || p
    else if (!out.district && DISTRICT_PART.test(p)) out.district = p
    else if (!out.street && STREET_PART.test(p)) {
      const hs = HOUSE_THEN_STREET.exec(p)
      if (hs && !out.house) {
        out.house = hs[1]
        out.street = hs[2]
      } else out.street = p
    } else rest.push(p)
  }
  const street = [out.street, ...rest].filter(Boolean).join(', ') || null
  // Ни одной узнанной части — вся строка улицей (как есть), чтобы не потерять адрес.
  const flag = { clipped: false }
  return {
    countryText: out.countryText,
    region: clip(upperRu(out.region), ADDRESS_LIMITS.region, flag),
    district: clip(upperRu(out.district), ADDRESS_LIMITS.district, flag),
    city: clip(upperRu(out.city), ADDRESS_LIMITS.city, flag),
    street: clip(upperRu(street), ADDRESS_LIMITS.street, flag),
    house: clip(upperRu(out.house), ADDRESS_LIMITS.house, flag),
    apt: clip(upperRu(out.apt), ADDRESS_LIMITS.apt, flag),
    clipped: flag.clipped,
  }
}

// ───────────────────────── Стороны ─────────────────────────

const PARTY_NOISE = new Set([
  'ТОО', 'TOO', 'ООО', 'OOO', 'АО', 'AO', 'ЗАО', 'ОАО', 'ПАО', 'ИП', 'LLP', 'LLC', 'LTD', 'LIMITED', 'CO', 'COMPANY', 'CORP',
  'CORPORATION', 'INC', 'GMBH', 'JSC', 'PLC', 'КОМПАНИЯ', '有限公司', '公司',
])

/** Название стороны для сравнения: заглавными, Ё → Е, без кавычек, знаков и форм собственности («Co., Ltd», «有限公司»). */
export function normPartyName(s: string | null | undefined): string {
  return (s ?? '')
    .toLocaleUpperCase('ru-RU')
    .replace(/Ё/g, 'Е')
    .replace(/有限公司|公司/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w && !PARTY_NOISE.has(w))
    .join(' ')
}

// ───────────────────────── №3. Вид упаковки словами ─────────────────────────

export type PackagingWord = 'carton' | 'bag' | 'pallet'

/**
 * Вид упаковки по однозначным словам (заголовок столбца мест «件数 Cartons», «Кол-во мест (ctn)», строка «Упаковка /
 * 包装: картонные коробки / 纸箱»): коробка, мешок, поддон. Иначе null — вид не подставляется (В7).
 */
export function packagingWord(text: string | null | undefined): PackagingWord | null {
  const s = (text ?? '').toLowerCase()
  if (!s.trim()) return null
  if (/\bpallets?\b|托盘|паллет|поддон/u.test(s)) return 'pallet'
  if (/\bbags?\b|袋|мешк|мешок/u.test(s)) return 'bag'
  if (/\bctns?\b|\bcartons?\b|纸箱|箱|картон|коробк/u.test(s)) return 'carton'
  return null
}

/** «Упаковка / 包装: картонные коробки / 纸箱» в строках документа — текст после подписи (или null). */
export function packagingLine(rows: readonly unknown[][]): string | null {
  for (const r of rows) {
    for (const c of r ?? []) {
      if (c == null) continue
      const m = /(?:^|[\s(])(?:упаковка|вид\s+упаковки|packing|packaging|包装)\s*(?:\/\s*[^:：]{0,12})?[:：]\s*(.+)$/imu.exec(String(c))
      if (m && packagingWord(m[1])) return m[1].trim()
    }
  }
  return null
}

// ───────────────────────── №8 «при импорте»: тягач / прицеп из подписи документа ─────────────────────────

/**
 * «АВТО: 184AFR19/48AEU19», «AUTO: …», «TRUCK NO: …», «车牌: …» под таблицей инвойса → тягач и прицеп. Нет подписи —
 * null. Номер — латиница/кириллица и цифры, 5–10 знаков.
 */
export function vehiclePlatesFrom(rows: readonly unknown[][]): { tractor: string; trailer: string | null } | null {
  const plate = '[A-Za-zА-Яа-я0-9]{5,10}'
  const re = new RegExp(`(?:^|[\\s(])(?:авто|auto|truck\\s*no\\.?|truck|车牌(?:号)?|номер\\s+(?:машины|авто|тс))\\s*[:：№#]?\\s*(${plate})(?:\\s*[/,;+]\\s*(${plate}))?`, 'iu')
  for (const r of rows) {
    for (const c of r ?? []) {
      if (c == null) continue
      const m = re.exec(String(c))
      if (m && /\d/.test(m[1])) return { tractor: m[1].toUpperCase(), trailer: m[2] && /\d/.test(m[2]) ? m[2].toUpperCase() : null }
    }
  }
  return null
}
