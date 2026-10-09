// ДТ, раздел «Стороны» (гр. 2, 8, 9, 14): одна модель стороны поверх разных имён полей формы, копирование
// декларанта в гр. 8 / 9 («Совпадает с декларантом») и подстановки (БИН-поиск, справочник сторон, профиль
// клиента) — один в один с прежним DtSectionParties, но чистыми функциями: раздел пишет форму только по
// действию пользователя. Текст ДТ — UPPERCASE (подстановки поднимают регистр сами, ввод — директива v-uppercase).
import type { CompanyLookupDto } from '@/api/companyLookup'
import type { ClientCompanyProfileDto } from '@/api/import40Contract'
import type { PartyRefDto, PartyRefUpsert } from '@/api/partyRefs'
import { EMPTY_PARSED_KZ_ADDRESS, parseKzAddress } from '@/utils/kzAddress'
import { emptyParty, type DtFormState } from './dtPayload'

export type PartyKey = 'sender' | 'receiver' | 'financialSubject' | 'declarant'
export const PARTY_FIELDS = [
  'name', 'shortName', 'bin', 'countryCode', 'region', 'district', 'city', 'settlement', 'street', 'house', 'apt',
  'categoryCode', 'katoCode',
] as const
export type PartyField = (typeof PARTY_FIELDS)[number]
export type PartyValues = Record<PartyField, string | null>
export type PartyPatch = Partial<PartyValues>

/** Состав полей стороны: у гр. 2 (иностранный отправитель) нет БИН, категории и КАТО. */
export const partyHas = (key: PartyKey, field: PartyField): boolean =>
  key !== 'sender' || !['bin', 'categoryCode', 'katoCode'].includes(field)

// У гр. 2 и 8 наименование, страна, область, город и улица лежат в объекте sender/receiver, остальное — плоско
// (senderHouse, receiverBin…); у гр. 9 и 14 всё плоское: financialSubjectName, declarantKatoCode…
const NESTED = new Set<PartyField>(['name', 'countryCode', 'region', 'city', 'street'])
const flatKey = (key: PartyKey, field: PartyField) => `${key}${field[0].toUpperCase()}${field.slice(1)}`
type Bag = Record<string, string | null | undefined>

export function readParty(form: DtFormState, key: PartyKey): PartyValues {
  const out = {} as PartyValues
  for (const field of PARTY_FIELDS) {
    if (!partyHas(key, field)) { out[field] = null; continue }
    const nested = (key === 'sender' || key === 'receiver') && NESTED.has(field)
    const v = nested ? (form[key] as unknown as Bag | null)?.[field] : (form as unknown as Bag)[flatKey(key, field)]
    out[field] = v ?? null
  }
  return out
}

export function writeParty(form: DtFormState, key: PartyKey, patch: PartyPatch): void {
  for (const [field, value] of Object.entries(patch) as [PartyField, string | null | undefined][]) {
    if (value === undefined || !partyHas(key, field)) continue
    if ((key === 'sender' || key === 'receiver') && NESTED.has(field)) {
      if (!form[key]) form[key] = emptyParty()
      ;(form[key] as unknown as Bag)[field] = value
    } else {
      (form as unknown as Bag)[flatKey(key, field)] = value
    }
  }
}

/** Флажок «Совпадает с декларантом» у гр. 8 / 9. */
export const SAME_FLAG = { receiver: 'consigneeEqualsDeclarant', financialSubject: 'financialSubjectEqualsDeclarant' } as const
export type SameKey = keyof typeof SAME_FLAG

/** Все 13 полей декларанта (гр. 14) — в получателя (гр. 8) или лицо гр. 9. */
export function copyDeclarant(form: DtFormState, to: SameKey): void {
  writeParty(form, to, readParty(form, 'declarant'))
}

/** Пока включено «Совпадает с декларантом», гр. 8 / 9 повторяют гр. 14. */
export function syncWithDeclarant(form: DtFormState): void {
  for (const to of Object.keys(SAME_FLAG) as SameKey[]) if (form[SAME_FLAG[to]]) copyDeclarant(form, to)
}

/**
 * Загрузка ДТ: прежний экран держал раздел смонтированным с самого начала, и его слежение за гр. 14 при
 * применении загруженных данных копировало декларанта в гр. 8 / 9 с включённым «Совпадает с декларантом» (под
 * флагом applying — без пометки «изменено» и автосейва). Страница монтирует разделы лениво, поэтому то же
 * копирование делает она сама при загрузке. Слежение срабатывало, только если гр. 14 не пустая — так и здесь.
 */
export function syncLoadedParties(form: DtFormState): void {
  if (Object.values(readParty(form, 'declarant')).some((v) => v != null)) syncWithDeclarant(form)
}

/** Разница patch с текущими значениями — пишем только то, что меняется (лишняя запись = лишний автосейв). */
export const changedOnly = (cur: PartyValues, patch: PartyPatch): PartyPatch =>
  Object.fromEntries(Object.entries(patch).filter(([f, v]) => v !== undefined && (cur[f as PartyField] ?? null) !== (v ?? null)))

const up = (v: string | null | undefined): string | null => (v ? v.toLocaleUpperCase('ru-RU') : null)
const blank = (v: string | null | undefined) => !v

// ---- Код страны ----
// Страна стороны — цифровой код ОКСМ, как в справочнике стран (ref/countries) и при создании ДТ на сервере.
// Прежние подстановки (БИН-поиск, профиль клиента) писали «KZ» (ошибка P1): такие записи показываются по
// справочнику как «398 — Казахстан», а при следующей подстановке в сторону код приводится к цифровому.
/** Код Казахстана (ОКСМ) по умолчанию для подстановок из реестров РК. */
export const KZ_COUNTRY = '398'
/** Страна справочника: цифровой код и буквенный ISO (у старых записей — он). */
export type CountryRef = { value: string | number; alpha2?: unknown }
// Казахстан — и пока справочник стран не загрузился (подстановки из реестров РК ставят именно его).
const ALPHA2_FALLBACK: Record<string, string> = { KZ: KZ_COUNTRY }

/** Буквенный код (KZ, CN) — к цифровому ОКСМ по справочнику; цифровой и неизвестный — как есть. */
export function toNumericCountry(code: string | null | undefined, countries: readonly CountryRef[]): string | null {
  const v = (code ?? '').trim()
  if (!v) return code ?? null
  if (/^\d+$/.test(v)) return v
  const upper = v.toUpperCase()
  const hit = countries.find((c) => typeof c.alpha2 === 'string' && c.alpha2.toUpperCase() === upper)
  return hit ? String(hit.value) : ALPHA2_FALLBACK[upper] ?? v
}

// ---- Подстановки ----
/**
 * «Найти по БИН» (ГБД ЮЛ / КГД): наименование перезаписывается (явный запрос), краткое наименование и адрес —
 * только пустые (адрес разбирается эвристикой parseKzAddress), страна — Казахстан, если пусто. Населённый пункт
 * не трогается.
 */
export function lookupPatch(cur: PartyValues, c: CompanyLookupDto, countries: readonly CountryRef[]): PartyPatch {
  const name = up(c.nameRu ?? c.nameKz ?? '')
  const addr = c.addressRu ?? c.addressKz ?? null
  const p = addr ? parseKzAddress(addr) : EMPTY_PARSED_KZ_ADDRESS
  const patch: PartyPatch = {}
  if (name) patch.name = name
  patch.shortName = cur.shortName || name
  patch.countryCode = toNumericCountry(cur.countryCode, countries) || KZ_COUNTRY
  if (blank(cur.region) && p.region) patch.region = up(p.region)
  if (blank(cur.district) && p.district) patch.district = up(p.district)
  if (blank(cur.city) && p.city) patch.city = up(p.city)
  if (blank(cur.street) && p.street) patch.street = up(p.street)
  if (blank(cur.house) && p.house) patch.house = up(p.house)
  if (blank(cur.apt) && p.apt) patch.apt = up(p.apt)
  return patch
}

/** Сторона из справочника: всё из записи (UPPER), района в справочнике нет — очищается. */
export function refPatch(key: 'sender' | 'receiver', r: PartyRefDto, countries: readonly CountryRef[]): PartyPatch {
  const patch: PartyPatch = {
    name: up(r.name), countryCode: toNumericCountry(r.countryCode, countries), region: up(r.region), city: up(r.city), street: up(r.street),
    shortName: up(r.shortName), district: null, house: up(r.house), apt: up(r.apt),
  }
  if (key === 'receiver') Object.assign(patch, { bin: r.bin ?? null, categoryCode: r.categoryCode ?? null, katoCode: r.katoCode ?? null })
  return patch
}

/**
 * Гр. 8 из профиля компании клиента: наименование и БИН; адрес — из разобранных полей профиля, а если их нет —
 * разбором свободного адреса (улица с домом — тоже разбором). Краткое — только пустое.
 */
export function profilePatch(cur: PartyValues, p: ClientCompanyProfileDto, countries: readonly CountryRef[]): PartyPatch {
  const hasStructured = !!(p.legalCity || p.legalStreet || p.legalRegion)
  const parsed = !hasStructured && p.legalAddress
    ? parseKzAddress(p.legalAddress)
    : p.legalStreet ? parseKzAddress(p.legalStreet) : EMPTY_PARSED_KZ_ADDRESS
  const patch: PartyPatch = {
    name: up(p.companyName),
    countryCode: toNumericCountry(p.legalCountryCode || cur.countryCode, countries) || KZ_COUNTRY,
    region: up(p.legalRegion || parsed.region),
    city: up(p.legalCity || parsed.city),
    street: up(parsed.street ?? (p.legalStreet || null)),
    shortName: cur.shortName || up(p.companyName),
    bin: p.bin ?? null,
  }
  if (parsed.district) patch.district = up(parsed.district)
  if (parsed.house) patch.house = up(parsed.house)
  if (parsed.apt) patch.apt = up(parsed.apt)
  return patch
}

/** Тело «Сохранить в справочник»: у отправителя нет категории и КАТО. */
export function refBody(key: 'sender' | 'receiver', v: PartyValues): PartyRefUpsert {
  return {
    name: v.name ?? '', shortName: v.shortName ?? null, bin: key === 'receiver' ? v.bin ?? null : null,
    countryCode: v.countryCode ?? null, city: v.city ?? null, region: v.region ?? null, street: v.street ?? null,
    house: v.house ?? null, apt: v.apt ?? null,
    categoryCode: key === 'receiver' ? v.categoryCode ?? null : null,
    katoCode: key === 'receiver' ? v.katoCode ?? null : null,
  }
}

// ---- Длина полей адреса (правило КЕДЕН) ----
/** Дом и квартира: КЕДЕН не принимает длиннее 20 знаков (BuildingNumberId / RoomNumberId). */
export const MAX_HOUSE_LEN = 20
/** Населённый пункт. */
export const MAX_SETTLEMENT_LEN = 120
/** Длина без крайних пробелов, если она больше max; иначе null. */
export const overLimit = (v: string | null | undefined, max: number): number | null => {
  const n = (v ?? '').trim().length
  return n > max ? n : null
}
