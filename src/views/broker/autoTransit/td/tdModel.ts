// Модель страницы ТД партии «Авто-транзита» (очередь 2а): ответ сервера ↔ черновик разделов записи транзита,
// пункты «Не заполнено» → раздел и поле. Разделы views/broker/transit/record/sections/* правят RecordDraft;
// у ТД нет строки ЖД-реестра, поэтому fields — пустой объект и в тело PUT не уходит.
import { toRaw } from 'vue'
import type { AutoDriver, AutoVehicle, AutoVehicleRole, DeclarationData, DeclarationMissing, TotalsCheck } from '@/api/autoTransit'
import type { ReestrGoodsItemInput, ReestrTransitFields } from '@/types/api'
import { REESTR_TRANSIT_DEFAULTS } from '@/utils/reestrDtoMap'
import { COLLECTION_SECTION, TRANSIT_FIELD_SECTION, type RecordDraft, type SectionKey } from '@/views/broker/transit/record/recordModel'

/** Раздел страницы ПИ / ТД: разделы записи транзита и свой «Машины и водитель» (vehicles, очередь 3). */
export type TdSectionKey = SectionKey | 'vehicles'

/**
 * Разделы страницы ПИ / ТД по порядку. ЖД-раздела «Транспорт» нет (очередь 3, спека 2026-11-25, 4.3): вместо него
 * «Машины и водитель»; данные transportMeans в JSON остаются как были. «Пломбы» (identificationMeans) с этапа 4
 * (спека 2026-11-26) снова на странице: их вносит декларант, в «Не заполнено» они не входят (считает сервер).
 * Контейнеры — свёрнутым блоком в конце, в меню их нет.
 */
export const TD_SECTIONS: TdSectionKey[] = [
  'main', 'organizations', 'carriers', 'vehicles', 'seals', 'goods', 'doc44', 'packaging', 'preceding', 'guarantees', 'misc',
]
const PAGE_SECTIONS = new Set<TdSectionKey>([...TD_SECTIONS, 'containers'])
/** Скрытый на странице ПИ ЖД-раздел «Транспорт»: его пункты «Не заполнено» ведут в «Машины и водитель». */
const HIDDEN_TO_VEHICLES = new Set<string>(['transport'])

type CollectionKey = keyof typeof COLLECTION_SECTION
const COLLECTIONS = Object.keys(COLLECTION_SECTION) as CollectionKey[]

/**
 * Пустой транзит: те же ключи, что у записи транзита, но без ЖД-умолчаний (RW, ПИ, СД) — у авто их подставляет
 * сервер в черновике, а пропавшее из старого JSON поле не должно стать «железной дорогой».
 */
const EMPTY_TRANSIT = Object.fromEntries(
  Object.keys(REESTR_TRANSIT_DEFAULTS).map((k) => [k, k === 'isMultimodal' ? false : null]),
) as unknown as ReestrTransitFields

const clone = <T>(v: T): T => structuredClone(toRaw(v))
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Черновик разделов из data ответа. Терпит неполный и старый JSON: нет списка — пустой, нет поля транзита — null. */
export function dataToDraft(data: Partial<DeclarationData> | null | undefined): RecordDraft {
  const d = (isObj(data) ? data : {}) as Partial<DeclarationData>
  const list = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? clone(v) : [])
  const draft = {
    fields: {},
    sealNumber: d.sealNumber ?? null,
    packagingType: d.packagingType ?? null,
    // Незнакомые поля транзита (сервер новее фронта) сохраняются: уйдут обратно в PUT как были.
    transit: { ...EMPTY_TRANSIT, ...(isObj(d.transit) ? clone(d.transit) : {}) } as ReestrTransitFields,
  } as RecordDraft
  for (const c of COLLECTIONS) (draft as unknown as Record<string, unknown>)[c] = list(d[c] as unknown[] | undefined)
  return draft
}

/** Поля data, которые держат черновик и AutoPart; всё прочее верхнего уровня — «лишнее» (dataExtras). */
const KNOWN_DATA_KEYS = new Set<string>(['sealNumber', 'packagingType', 'transit', ...COLLECTIONS, 'vehicles', 'driver'])

/**
 * Незнакомые поля верхнего уровня data (сервер новее фронта): черновик их не держит, поэтому useTd хранит их рядом
 * и кладёт обратно в PUT — PUT заменяет ТД целиком, без них они бы стёрлись.
 */
export function dataExtras(data: Partial<DeclarationData> | null | undefined): Record<string, unknown> {
  if (!isObj(data)) return {}
  return Object.fromEntries(Object.entries(clone(data)).filter(([k]) => !KNOWN_DATA_KEYS.has(k)))
}

/**
 * Тело data для PUT: вся форма целиком (все разделы, в том числе пустые), без fields, глубокая копия без реактивных
 * обёрток; extras — незнакомые поля ответа (dataExtras), известные поля из черновика они не перекрывают;
 * auto — машины и водитель (без него vehicles/driver в тело не попадают).
 */
export function draftToData(draft: RecordDraft, extras: Record<string, unknown> = {}, auto?: AutoPart): DeclarationData {
  const { fields: _fields, ...rest } = clone(draft)
  return { ...clone(extras), ...rest, ...(auto ? autoToData(auto) : {}) }
}

// ---- Машины и водитель (очередь 3, этап 1) ----

/** Машины и водитель ПИ: держатся рядом с черновиком записи транзита (у RecordDraft таких полей нет). */
export interface AutoPart { vehicles: AutoVehicle[]; driver: AutoDriver }

const DRIVER_KEYS = ['fullName', 'countryCode', 'docKindCode', 'docNumber', 'personalNumber'] as const
const ROLES: AutoVehicleRole[] = ['tractor', 'trailer', 'truck']
/**
 * Тип ТС по классификатору 2024 по умолчанию: только у одиночного грузовика — 303 (в ТД КЕДЕН так у всех одиночных машин).
 * Сцепку молча не угадываем: связку выбирает декларант (VEHICLE_PAIRS), код тягача и прицепа без выбора пуст.
 */
export const DEFAULT_TYPE: Record<AutoVehicleRole, string | null> = { tractor: null, trailer: null, truck: '303' }

/** Связки типов ТС сцепки: голова + прицеп (по выборке ТД КЕДЕН 26.11: 307+319 чаще всего). */
export const VEHICLE_PAIRS = [
  { key: 'tractorSemi', head: '307', trailer: '319' },
  { key: 'truckTrailer', head: '303', trailer: '312' },
  { key: 'truckSemi', head: '303', trailer: '319' },
] as const
export type VehiclePair = (typeof VEHICLE_PAIRS)[number]

/**
 * Первая сцепка: первое головное ТС (не прицеп), у которого есть прицеп, и его прицепы. Прицеп привязан к головному через headIndex;
 * прицеп без ссылки считается прицепом первого головного ТС списка.
 */
export function firstHitch(list: AutoVehicle[]): { head: number; trailers: number[] } | null {
  const firstHead = list.findIndex((v) => v.role !== 'trailer')
  for (let head = 0; head < list.length; head++) {
    if (list[head]!.role === 'trailer') continue
    const trailers = list.flatMap((v, i) => (v.role === 'trailer' && (v.headIndex === head || (v.headIndex == null && head === firstHead)) ? [i] : []))
    if (trailers.length) return { head, trailers }
  }
  return null
}

/**
 * Ставит связку первой сцепке: головному ТС — роль tractor и код головного, прицепам — роль trailer, headIndex на головное ТС
 * и код прицепа. Остальные машины списка не трогаются.
 */
export function applyVehiclePair(list: AutoVehicle[], pair: VehiclePair): void {
  const hitch = firstHitch(list)
  if (!hitch) return
  const head = list[hitch.head]!
  head.role = 'tractor'
  head.typeCode = pair.head
  head.headIndex = null
  for (const i of hitch.trailers) {
    const v = list[i]!
    v.role = 'trailer'
    v.typeCode = pair.trailer
    v.headIndex = hitch.head
  }
}

/** Связка, коды которой стоят у первой сцепки (голова и её прицепы); null — коды другие или пусты, или сцепки нет. */
export function currentVehiclePair(list: AutoVehicle[]): VehiclePair | null {
  const hitch = firstHitch(list)
  if (!hitch) return null
  return VEHICLE_PAIRS.find((p) => list[hitch.head]!.typeCode === p.head && hitch.trailers.every((i) => list[i]!.typeCode === p.trailer)) ?? null
}

/** VIN по умолчанию — «-» (так вносят в КЕДЕН, спека 4.3). */
export const DEFAULT_VIN = '-'

const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null)
export const emptyDriver = (): AutoDriver => ({ fullName: null, countryCode: null, docKindCode: null, docNumber: null, personalNumber: null })

/** Машины и водитель из data ответа. Терпит старую ТД без полей и неполные строки. */
export function dataToAuto(data: Partial<DeclarationData> | null | undefined): AutoPart {
  const d = (isObj(data) ? data : {}) as Partial<DeclarationData>
  const vehicles = (Array.isArray(d.vehicles) ? d.vehicles : []).filter(isObj).map((raw): AutoVehicle => {
    const v = raw as unknown as Record<string, unknown>
    const role = ROLES.includes(v.role as AutoVehicleRole) ? (v.role as AutoVehicleRole) : 'truck'
    const head = typeof v.headIndex === 'number' && Number.isInteger(v.headIndex) ? v.headIndex : null
    return { role, typeCode: strOrNull(v.typeCode), regNumber: strOrNull(v.regNumber), countryCode: strOrNull(v.countryCode), vin: strOrNull(v.vin), headIndex: head }
  })
  const driver = emptyDriver()
  if (isObj(d.driver)) for (const k of DRIVER_KEYS) driver[k] = strOrNull((d.driver as unknown as Record<string, unknown>)[k])
  return { vehicles, driver }
}

const blank = (v: string | null | undefined) => !v || !v.trim()

/** vehicles и driver для PUT: копия; водитель без единого значения — null (как «не заполнен» у старой ТД). */
export function autoToData(auto: AutoPart): { vehicles: AutoVehicle[]; driver: AutoDriver | null } {
  const a = clone(auto)
  return { vehicles: a.vehicles, driver: DRIVER_KEYS.every((k) => blank(a.driver[k])) ? null : a.driver }
}

/** Новая строка: тип пуст у тягача и прицепа (выбирает декларант), грузовик 303; прицеп — со ссылкой на первый тягач списка; VIN «-». */
export function newVehicle(role: AutoVehicleRole, list: AutoVehicle[]): AutoVehicle {
  const head = role === 'trailer' ? list.findIndex((v) => v.role === 'tractor') : -1
  return { role, typeCode: DEFAULT_TYPE[role], regNumber: null, countryCode: null, vin: DEFAULT_VIN, headIndex: head >= 0 ? head : null }
}

/** Список без строки index: ссылки прицепов на удалённый тягач снимаются, на следующие — сдвигаются. Исходный не меняется. */
export function removeVehicle(list: AutoVehicle[], index: number): AutoVehicle[] {
  return clone(list).filter((_, i) => i !== index).map((v) => {
    if (v.headIndex == null) return v
    if (v.headIndex === index) return { ...v, headIndex: null }
    return v.headIndex > index ? { ...v, headIndex: v.headIndex - 1 } : v
  })
}

/** Точка в меню: пусто — ни машин, ни водителя; заполнен — у машин номер, страна и тип, у водителя ФИО и документ. */
export function vehiclesState(auto: AutoPart): 'done' | 'warn' | 'empty' {
  const driverEmpty = DRIVER_KEYS.every((k) => blank(auto.driver[k]))
  if (!auto.vehicles.length && driverEmpty) return 'empty'
  const vehiclesOk = auto.vehicles.length > 0 && auto.vehicles.every((v) => !blank(v.regNumber) && !blank(v.countryCode) && !blank(v.typeCode))
  const driverOk = !blank(auto.driver.fullName) && !blank(auto.driver.docNumber)
  return vehiclesOk && driverOk ? 'done' : 'warn'
}

// ---- Итоги товаров против партии (очередь 3, спека 4.6) ----

export type TotalsKey = 'places' | 'grossKg' | 'value'
/** partyMissing — в партии итог не внесён (0), а по товарам есть (ревью этапа 1, M8). */
export interface TotalsRow { key: TotalsKey; goods: number; party: number; diff: number; partyMissing?: true }

/** Точность сравнения — 4 знака (decimal 18,4 сервера): суммы целыми десятитысячными, без ошибок двоичной дроби. */
const SCALE = 10_000
const scaled = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * SCALE) : 0)
const GOODS_FIELD: Record<TotalsKey, 'packagesCount' | 'grossWeightKg' | 'customsValue'> = {
  places: 'packagesCount', grossKg: 'grossWeightKg', value: 'customsValue',
}

/**
 * Расхождения итогов: сторона партии — из totalsCheck сервера, сторона товаров — из goods (текущие правки формы),
 * а без goods — из totalsCheck. Сравнение точное (500 г на 19 т — расхождение). Итог партии не внесён (0 или null),
 * а по товарам есть — тоже строка, с partyMissing (ревью M8). Без товаров строк нет (о них говорит «Не заполнено»).
 */
export function totalsMismatch(check: TotalsCheck | null | undefined, goods?: ReestrGoodsItemInput[]): TotalsRow[] {
  if (!check || (goods && !goods.length)) return []
  const out: TotalsRow[] = []
  for (const key of ['places', 'grossKg', 'value'] as TotalsKey[]) {
    const party = scaled(check[key]?.party)
    const g = goods ? goods.reduce((acc, x) => acc + scaled(x[GOODS_FIELD[key]]), 0) : scaled(check[key]?.goods)
    if (g === party) continue
    out.push({ key, goods: g / SCALE, party: party / SCALE, diff: (g - party) / SCALE, ...(party ? {} : { partyMissing: true as const }) })
  }
  return out
}

// ---- Копия с прошлой ТД (Task 3) ----

/** Поля транзита, которые копируются из прошлой ТД: страны, органы отправления и назначения, сведения об упаковке. */
const COPY_TRANSIT: (keyof ReestrTransitFields)[] = [
  'departureCountryCode', 'destinationCountryCode', 'departureCustomsOffice', 'destinationCustomsOffice', 'packagingInfoCode',
]
/** Списки, которые копируются; товары — отдельно, по галочке. */
const COPY_LISTS = ['organizations', 'guarantees', 'packages'] as const

/**
 * Черновик с данными прошлой ТД того же получателя: организации, обеспечение, страны, органы отправления и назначения,
 * упаковка; товары — только при withGoods. Транспортные средства, перевозчики, пломбы, документы гр. 44 и итоги
 * остаются от текущей машины и партии. Ничего не сохраняет: результат — новый объект, исходные не меняются.
 * Источник из старого JSON без списка или поля даёт пустое значение (как dataToDraft).
 */
export function applyCopy(draft: RecordDraft, source: Partial<DeclarationData> | null | undefined, withGoods: boolean): RecordDraft {
  const src = dataToDraft(source)
  const out = clone(draft)
  for (const k of COPY_LISTS) (out as unknown as Record<string, unknown>)[k] = src[k]
  if (withGoods) out.goods = src.goods
  out.packagingType = src.packagingType
  const t = out.transit as unknown as Record<string, unknown>
  for (const k of COPY_TRANSIT) t[k] = src.transit[k]
  return out
}

const hasValue = (v: unknown): boolean => (typeof v === 'string' ? v.trim() !== '' : v != null && v !== false)

/** Копия заменит уже введённое (непустые организации, обеспечение, упаковка, страны, органы; товары — при withGoods). */
export function copyWouldReplace(draft: RecordDraft, withGoods: boolean): boolean {
  if (COPY_LISTS.some((k) => draft[k].length > 0)) return true
  if (withGoods && draft.goods.length > 0) return true
  if (hasValue(draft.packagingType)) return true
  return COPY_TRANSIT.some((k) => hasValue(draft.transit[k]))
}

// ---- «Не заполнено» ----

/** Ключ по частям: «goods[2].tnvedCode» → head goods, index 2, field tnvedCode; «transit.x» → head transit, field x. */
export function parseMissingKey(key: string): { head: string; index: number | null; field: string | null } {
  const m = /^([A-Za-z0-9_]+)(?:\[(\d+)\])?(?:\.([A-Za-z0-9_]+))?/.exec(key.trim())
  if (!m) return { head: key.trim(), index: null, field: null }
  return { head: m[1]!, index: m[2] != null ? Number(m[2]) : null, field: m[3] ?? null }
}

/**
 * Раздел страницы для пункта: section ответа, если такой раздел на странице есть; иначе — по ключу; иначе «Основное».
 * Машины и водитель (vehicles[i].*, driver.*) и скрытый ЖД-раздел «Транспорт» — «Машины и водитель»; пломбы — свой раздел.
 */
export function missingSection(m: DeclarationMissing): TdSectionKey {
  if (PAGE_SECTIONS.has(m.section as TdSectionKey)) return m.section as TdSectionKey
  if (HIDDEN_TO_VEHICLES.has(m.section)) return 'vehicles'
  const { head, field } = parseMissingKey(m.key)
  if (head === 'vehicles' || head === 'driver') return 'vehicles'
  const onPage = (s: SectionKey): TdSectionKey => (PAGE_SECTIONS.has(s) ? s : HIDDEN_TO_VEHICLES.has(s) ? 'vehicles' : 'main')
  if (head === 'transit' && field && field in TRANSIT_FIELD_SECTION) return onPage(TRANSIT_FIELD_SECTION[field as keyof ReestrTransitFields])
  if (head in COLLECTION_SECTION) return onPage(COLLECTION_SECTION[head as CollectionKey])
  if (head in TRANSIT_FIELD_SECTION) {
    const s = TRANSIT_FIELD_SECTION[head as keyof ReestrTransitFields]
    if (PAGE_SECTIONS.has(s)) return s
  }
  return 'main'
}

/**
 * Поле, к которому вести после прокрутки к разделу: имя для [data-f] и номер строки (среди одноимённых полей раздела).
 * У «transit.x» и «x» — поле x; у «organizations.consignee» — поля нет (роль, а не графа): только раздел.
 */
export function missingTarget(m: DeclarationMissing): { field: string | null; index: number } {
  const { head, index, field } = parseMissingKey(m.key)
  if (head === 'transit') return { field, index: 0 }
  // Поля водителя — data-f="driver.<поле>" (у машин свои countryCode); машины — поле в своей строке.
  if (head === 'driver') return { field: field ? `driver.${field}` : null, index: 0 }
  if (head === 'vehicles') return { field: index != null ? field : null, index: index ?? 0 }
  if (head in COLLECTION_SECTION) return { field: index != null ? field : null, index: index ?? 0 }
  if (head in TRANSIT_FIELD_SECTION) return { field: head, index: 0 }
  return { field: null, index: 0 }
}

/**
 * Подпись пункта: ключ в broker.autoTransit.td.missing.* и параметры. Строка товара — «goodsItem» с номером с 1
 * (индекс в ключе — с 0, как в массиве). Остальное — ключ без «transit.», точки → «_». Страница сама подставляет
 * запасную подпись, если такого ключа в локали нет.
 */
export function missingLabel(m: DeclarationMissing): { key: string; params: Record<string, unknown> } {
  const { head, index, field } = parseMissingKey(m.key)
  if (head === 'goods' && index != null) return { key: 'goodsItem', params: { n: index + 1, field: field ?? '' } }
  if (head === 'vehicles' && index != null) return { key: 'vehicleItem', params: { n: index + 1, field: field ?? '' } }
  return { key: m.key.trim().replace(/^transit\./, '').replace(/[.[\]]+/g, '_').replace(/_$/, ''), params: {} }
}
