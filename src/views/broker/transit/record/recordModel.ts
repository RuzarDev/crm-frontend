// Модель записи транзита для страницы /reestr/:id: черновик, тело PUT/POST, состояние разделов.
//
// Инцидент 08.10: PUT /api/reestr/{id} заменяет ВСЕ скаляры и вложенные списки записи. Поэтому тело
// строится только от полной исходной записи (getById) с наложенными правками черновика: цены импорта,
// ключи data, которых страница не показывает, и всё прочее уходят как были.
import { toRaw } from 'vue'
import type {
  ReestrCargoOperationInput,
  ReestrCarrierInput,
  ReestrContainerInput,
  ReestrDoc44ItemInput,
  ReestrEntry,
  ReestrGoodsItemInput,
  ReestrGuaranteeInput,
  ReestrIdentificationMeansInput,
  ReestrOrganizationInput,
  ReestrPackageInput,
  ReestrPrecedingDocInput,
  ReestrTransitFields,
  ReestrTransportMeansInput,
  ReestrUpsertBody,
} from '@/types/api'
import { REESTR_COLUMN_KEYS, ReestrEntryStatus } from '@/types/api'
import { REESTR_TRANSIT_DEFAULTS, reestrEntryToUpsertBody } from '@/utils/reestrDtoMap'
import { normalizeReestrFieldsForSubmit } from '@/utils/reestrFormat'

export type SectionKey = 'main' | 'row' | 'goods' | 'doc44' | 'organizations' | 'carriers' | 'transport'
  | 'seals' | 'containers' | 'packaging' | 'preceding' | 'guarantees' | 'misc'

/** Порядок меню разделов — как на доске TransitRecord. */
export const SECTION_ORDER: SectionKey[] = [
  'main', 'row', 'goods', 'doc44', 'organizations', 'carriers', 'transport',
  'seals', 'containers', 'packaging', 'preceding', 'guarantees', 'misc',
]

/** Ключ data «Пост» — показывается и правится в «Основном» (в REESTR_COLUMN_KEYS его нет). */
export const POST_KEY = 'Пост'
const SEAL_KEY = '№ Пломбы'
const PACKAGING_KEY = 'Вид упаковки'

export interface RecordDraft {
  /** Ключи REESTR_COLUMN_KEYS + 'Пост'; 'Дата' — ISO YYYY-MM-DD или null. */
  fields: Record<string, string | null>
  sealNumber: string | null
  packagingType: string | null
  goods: ReestrGoodsItemInput[]
  doc44: ReestrDoc44ItemInput[]
  transit: ReestrTransitFields
  organizations: ReestrOrganizationInput[]
  carriers: ReestrCarrierInput[]
  transportMeans: ReestrTransportMeansInput[]
  identificationMeans: ReestrIdentificationMeansInput[]
  packages: ReestrPackageInput[]
  containers: ReestrContainerInput[]
  precedingDocs: ReestrPrecedingDocInput[]
  cargoOperations: ReestrCargoOperationInput[]
  guarantees: ReestrGuaranteeInput[]
}

type CollectionKey = 'goods' | 'doc44' | 'organizations' | 'carriers' | 'transportMeans' | 'identificationMeans'
  | 'packages' | 'containers' | 'precedingDocs' | 'cargoOperations' | 'guarantees'

/** Раздел страницы, в котором показывается каждое поле transit (Task 2 — «Основное», Task 3 — «Упаковка», «Прочее»). */
export const TRANSIT_FIELD_SECTION: Record<keyof ReestrTransitFields, SectionKey> = {
  // «Основное» — декларация
  purposeCode: 'main',
  entryMethodCode: 'main',
  movementDirectionCode: 'main',
  usedAsDeclarationCode: 'main',
  departureCustomsOffice: 'main',
  // «Основное» — маршрут
  departureCountryCode: 'main',
  destinationCountryCode: 'main',
  isMultimodal: 'main',
  transportModeCode: 'main',
  loadingCountryCode: 'main',
  loadingRailStation: 'main',
  unloadingCountryCode: 'main',
  unloadingRailStation: 'main',
  destinationCustomsOffice: 'main',
  transportDocTypeCode: 'main',
  transportDocNumber: 'main',
  transportDocDate: 'main',
  // «Основное» — итоги
  goodsQuantity: 'main',
  cargoPlacesCount: 'main',
  grossWeightKg: 'main',
  totalValue: 'main',
  docCurrencyCode: 'main',
  // «Упаковка» — скаляр «Сведения об упаковке»
  packagingInfoCode: 'packaging',
  // «Прочее»
  tempStoragePlace: 'misc',
  destinationPlace: 'misc',
  submitterType: 'misc',
  submitterBin: 'misc',
  submitterName: 'misc',
}

/** Раздел каждой коллекции черновика. */
export const COLLECTION_SECTION: Record<CollectionKey, SectionKey> = {
  goods: 'goods',
  doc44: 'doc44',
  organizations: 'organizations',
  carriers: 'carriers',
  transportMeans: 'transport',
  identificationMeans: 'seals',
  packages: 'packaging',
  containers: 'containers',
  precedingDocs: 'preceding',
  cargoOperations: 'misc',
  guarantees: 'guarantees',
}

const COLLECTION_KEYS = Object.keys(COLLECTION_SECTION) as CollectionKey[]
const TRANSIT_KEYS = Object.keys(TRANSIT_FIELD_SECTION) as (keyof ReestrTransitFields)[]

/** Глубокая копия без реактивных обёрток (structuredClone не принимает Proxy). */
const clone = <T>(v: T): T => structuredClone(toRaw(v))

export function draftFromEntry(entry: ReestrEntry | null): RecordDraft {
  const data = entry?.data ?? {}
  const fields: Record<string, string | null> = {}
  for (const key of [...REESTR_COLUMN_KEYS, POST_KEY]) fields[key] = data[key] ?? null
  return {
    fields,
    sealNumber: data[SEAL_KEY] ?? null,
    packagingType: data[PACKAGING_KEY] ?? null,
    goods: clone(entry?.goods ?? []),
    doc44: clone(entry?.doc44 ?? []),
    transit: clone(entry?.transit ?? REESTR_TRANSIT_DEFAULTS),
    organizations: clone(entry?.organizations ?? []),
    carriers: clone(entry?.carriers ?? []),
    transportMeans: clone(entry?.transportMeans ?? []),
    identificationMeans: clone(entry?.identificationMeans ?? []),
    packages: clone(entry?.packages ?? []),
    containers: clone(entry?.containers ?? []),
    precedingDocs: clone(entry?.precedingDocs ?? []),
    cargoOperations: clone(entry?.cargoOperations ?? []),
    guarantees: clone(entry?.guarantees ?? []),
  }
}

/**
 * Запись, которую сохранит сервер: исходная запись целиком (цены импорта, id, createdAtUtc, прочие ключи data),
 * поверх — правки черновика. Статус — всегда исходный (меняется только «Сменить статус», PATCH с историей).
 */
export function draftToEntry(base: ReestrEntry | null, draft: RecordDraft, clientId: string): ReestrEntry {
  const d = clone(draft)
  return {
    id: base?.id ?? '',
    createdAtUtc: base?.createdAtUtc ?? '',
    sourceConsolidationId: base?.sourceConsolidationId ?? null,
    grandTotalWithVat: base?.grandTotalWithVat ?? null,
    pricePerDeclarationWithVat: base?.pricePerDeclarationWithVat ?? null,
    pricePerSupplementalSheetWithVat: base?.pricePerSupplementalSheetWithVat ?? null,
    supplementalSheetsTotalWithVat: base?.supplementalSheetsTotalWithVat ?? null,
    deprecationWarning: base?.deprecationWarning ?? null,
    status: base?.status ?? ReestrEntryStatus.InProgress,
    clientId,
    data: normalizeReestrFieldsForSubmit({
      ...(base?.data ?? {}),
      ...d.fields,
      [SEAL_KEY]: d.sealNumber,
      [PACKAGING_KEY]: d.packagingType,
    }),
    transit: d.transit,
    goods: d.goods,
    doc44: d.doc44,
    organizations: d.organizations,
    carriers: d.carriers,
    transportMeans: d.transportMeans,
    identificationMeans: d.identificationMeans,
    packages: d.packages,
    containers: d.containers,
    precedingDocs: d.precedingDocs,
    cargoOperations: d.cargoOperations,
    guarantees: d.guarantees,
  }
}

export function draftToUpsertBody(base: ReestrEntry | null, draft: RecordDraft, clientId: string): ReestrUpsertBody {
  return reestrEntryToUpsertBody(draftToEntry(base, draft, clientId))
}

const filled = (v: unknown): boolean => {
  if (v == null || v === false) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (typeof v === 'number') return !Number.isNaN(v)
  return true
}
const rowHasData = (row: object): boolean => Object.values(row).some(filled)
const anyRow = (rows: object[]): boolean => rows.some(rowHasData)

/** Колонка ReestrEntry.DepartureCustomsOffice — 32 знака. */
export const DEPARTURE_OFFICE_MAX = 32

/** Код поста — ведущие 5–8 цифр названия: «57507 — ТАМОЖЕННЫЙ ПОСТ «…»» → «57507». */
export function customsPostCode(name: string | null | undefined): string | null {
  return /^\d{5,8}/.exec((name ?? '').trim())?.[0] ?? null
}

/**
 * Что сохранить в «Таможне отправления» при выборе поста (B.12): код поста; нет кода — название,
 * но название длиннее 32 знаков сервер не примет (tooLong — ошибка у поля).
 */
export function departureOfficeValue(name: string): { value: string; tooLong: boolean } {
  const code = customsPostCode(name)
  if (code) return { value: code, tooLong: false }
  return { value: name, tooLong: name.length > DEPARTURE_OFFICE_MAX }
}

/**
 * Значение «Таможни отправления» длиннее 32 знаков сервер не сохранит (ошибка у поля, сохранение запрещено).
 * Выбор поста кладёт код, так что на деле это пост без кода с длинным названием.
 */
export function departureOfficeTooLong(value: string | null | undefined): boolean {
  const v = value ?? ''
  return v.trim() !== '' && v.length > DEPARTURE_OFFICE_MAX
}

/** Ключевые поля строки: сервер (IsMeaningfulRequest) требует хотя бы одно из них. */
const KEY_FIELDS = ['№', 'Контейнер', 'Получатель', 'Отправитель', 'Груз']

/** Ошибки перед сохранением — ключи i18n. */
export function validateDraft(draft: RecordDraft, opts: { isNew: boolean; clientId: string | null }): string[] {
  const errors: string[] = []
  if (!KEY_FIELDS.some((k) => filled(draft.fields[k]))) errors.push('broker.transitRecord.errors.needKeyField')
  if (opts.isNew && !filled(opts.clientId)) errors.push('broker.transitRecord.errors.needClient')
  if (departureOfficeTooLong(draft.transit.departureCustomsOffice)) errors.push('broker.transitRecord.errors.departureOfficeTooLong')
  return errors
}

export type SectionState = 'done' | 'warn' | 'empty'

const transitOf = (key: SectionKey, d: RecordDraft): unknown[] =>
  TRANSIT_KEYS.filter((k) => TRANSIT_FIELD_SECTION[k] === key).map((k) => d.transit[k])
const collectionsOf = (key: SectionKey): CollectionKey[] => COLLECTION_KEYS.filter((k) => COLLECTION_SECTION[k] === key)

const hasData = (key: SectionKey, d: RecordDraft): boolean => {
  if (key === 'row') {
    return Object.entries(d.fields).some(([k, v]) => k !== POST_KEY && filled(v)) || filled(d.sealNumber) || filled(d.packagingType)
  }
  if (key === 'main' && filled(d.fields[POST_KEY])) return true
  return transitOf(key, d).some(filled) || collectionsOf(key).some((c) => anyRow(d[c]))
}

const needsAttention = (key: SectionKey, d: RecordDraft): boolean => {
  switch (key) {
    case 'main':
      return !filled(d.transit.departureCountryCode) || !filled(d.transit.destinationCountryCode)
    case 'goods':
      return d.goods.some((g) => !filled(g.tnvedCode) || (!filled(g.description) && !filled(g.tnvedDescription)))
    case 'organizations':
      return d.organizations.some((o) => !filled(o.name) || !filled(o.bin))
    case 'carriers':
      return d.carriers.some((c) => !filled(c.name))
    case 'doc44':
      return d.doc44.some((x) => !filled(x.docTypeCode) || !filled(x.docNumber))
    default:
      return false
  }
}

/** Точка в меню: зелёная — заполнен, золотая — требует внимания, серая — пусто. */
export function sectionState(key: SectionKey, d: RecordDraft): SectionState {
  if (!hasData(key, d)) return 'empty'
  return needsAttention(key, d) ? 'warn' : 'done'
}

const COUNT_OF: Partial<Record<SectionKey, CollectionKey>> = {
  goods: 'goods',
  doc44: 'doc44',
  organizations: 'organizations',
  carriers: 'carriers',
  transport: 'transportMeans',
  seals: 'identificationMeans',
  containers: 'containers',
  packaging: 'packages',
  preceding: 'precedingDocs',
  guarantees: 'guarantees',
}

/** Число строк раздела в меню; у разделов без списка («Основное», «Строка реестра», «Прочее») — null. */
export function sectionCount(key: SectionKey, d: RecordDraft): number | null {
  const c = COUNT_OF[key]
  return c ? d[c].length : null
}

const json = (v: unknown) => JSON.stringify(v ?? null)

/** Разделы, в которых черновики различаются (для плашки «Есть несохранённые изменения · …»), в порядке меню. */
export function changedSections(a: RecordDraft, b: RecordDraft): SectionKey[] {
  const changed = new Set<SectionKey>()
  const keys = new Set([...Object.keys(a.fields), ...Object.keys(b.fields)])
  for (const k of keys) {
    if (json(a.fields[k]) !== json(b.fields[k])) changed.add(k === POST_KEY ? 'main' : 'row')
  }
  if (json(a.sealNumber) !== json(b.sealNumber) || json(a.packagingType) !== json(b.packagingType)) changed.add('row')
  for (const k of TRANSIT_KEYS) {
    if (json(a.transit?.[k]) !== json(b.transit?.[k])) changed.add(TRANSIT_FIELD_SECTION[k])
  }
  for (const c of COLLECTION_KEYS) {
    if (json(a[c]) !== json(b[c])) changed.add(COLLECTION_SECTION[c])
  }
  return SECTION_ORDER.filter((k) => changed.has(k))
}

export interface GoodsTotals {
  items: number
  places: number | null
  gross: number | null
  value: number | null
  currency: string | null
}

/** Сумма чисел поля; null — ни у одного товара нет числа (сумма неизвестна, а не 0). Округление до 4 знаков (decimal 18,4). */
const sumBy = (goods: ReestrGoodsItemInput[], key: 'packagesCount' | 'grossWeightKg' | 'customsValue'): number | null => {
  let acc: number | null = null
  for (const g of goods) {
    const v = g[key]
    if (typeof v === 'number' && Number.isFinite(v)) acc = (acc ?? 0) + v
  }
  return acc == null ? null : Math.round(acc * 10_000) / 10_000
}

const roundInt = (v: number | null): number | null => (v == null ? null : Math.round(v))

/** Итоги по товарам (items и places — целые, как колонки сервера); валюта — если у всех товаров одна и та же, иначе null. */
export function goodsTotals(goods: ReestrGoodsItemInput[]): GoodsTotals {
  const currencies = new Set(goods.map((g) => (g.currency ?? '').trim()))
  const only = currencies.size === 1 ? [...currencies][0] : ''
  return {
    items: goods.length,
    // goodsQuantity и cargoPlacesCount на сервере — int: дробную сумму мест округляем до целого.
    places: roundInt(sumBy(goods, 'packagesCount')),
    gross: sumBy(goods, 'grossWeightKg'),
    value: sumBy(goods, 'customsValue'),
    currency: only || null,
  }
}

export type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Объект на месте: ключей, которых нет в src, не остаётся; порядок ключей — как в src (иначе JSON черновика,
 * по которому считаются dirty и изменённые разделы, разошёлся бы со снимком при равных значениях).
 */
export function assignObject(target: Obj, src: Obj) {
  const tk = Object.keys(target)
  const sk = Object.keys(src)
  if (tk.length !== sk.length || tk.some((k, i) => k !== sk[i])) for (const k of tk) delete target[k]
  for (const k of sk) target[k] = src[k]
}

/** Список на месте: строки по индексу (Object.assign с удалением лишних ключей), длина — push/splice. */
function assignList(target: unknown[], src: unknown[]) {
  const n = Math.min(target.length, src.length)
  for (let i = 0; i < n; i++) {
    const t = target[i]
    const s = src[i]
    if (isObj(t) && isObj(s)) assignObject(t, s)
    else target[i] = s
  }
  if (target.length > src.length) target.splice(src.length)
  else if (src.length > target.length) target.push(...src.slice(n))
}

/**
 * Положить свежий черновик src в target на месте: те же объекты fields/transit, те же массивы и объекты строк.
 * Разделы держат ключи строк в WeakMap по объекту — так после сохранения и перечитывания не сбрасываются
 * развёрнутая карточка товара, «Ещё» в гр.44 и фокус в поле. src после вызова не использовать (его значения
 * становятся частью target).
 */
export function assignDraft(target: RecordDraft, src: RecordDraft) {
  assignObject(target.fields as Obj, src.fields as Obj)
  target.sealNumber = src.sealNumber
  target.packagingType = src.packagingType
  assignObject(target.transit as unknown as Obj, src.transit as unknown as Obj)
  for (const c of COLLECTION_KEYS) assignList(target[c], src[c])
}

/**
 * Трёхстороннее слияние при перечитывании записи с сервера: base — от чего шли правки (снимок или отправленный
 * черновик), mine — текущий черновик, theirs — свежая запись. Поля и списки, которые пользователь поменял
 * относительно base, остаются его; всё остальное — с сервера (статус сменили, автозаполнение, нормализация дат).
 * Скаляры — по полю, коллекции — целиком.
 */
export function mergeDrafts(base: RecordDraft, mine: RecordDraft, theirs: RecordDraft): RecordDraft {
  const b = clone(base)
  const m = clone(mine)
  const out = clone(theirs)
  for (const k of new Set([...Object.keys(m.fields), ...Object.keys(b.fields)])) {
    if (json(m.fields[k]) !== json(b.fields[k])) out.fields[k] = m.fields[k] ?? null
  }
  if (json(m.sealNumber) !== json(b.sealNumber)) out.sealNumber = m.sealNumber
  if (json(m.packagingType) !== json(b.packagingType)) out.packagingType = m.packagingType
  const t = out.transit as unknown as Record<string, unknown>
  for (const k of TRANSIT_KEYS) {
    if (json(m.transit[k]) !== json(b.transit[k])) t[k] = m.transit[k]
  }
  const o = out as unknown as Record<CollectionKey, unknown>
  for (const c of COLLECTION_KEYS) {
    if (json(m[c]) !== json(b[c])) o[c] = m[c]
  }
  return out
}
