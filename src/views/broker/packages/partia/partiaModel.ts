// Модель партии (клиентской консолидации) пакета документов: черновик, тело POST/PUT, проверки, заполненность транзита.
//
// PUT партии заменяет товары и гр.44 целиком и перезаписывает все скаляры и transitDataJson. Поэтому черновик
// содержит партию целиком (все поля DTO, включая таможню назначения), а тело строится из черновика полностью.
import { toRaw } from 'vue'
import type { documentPackagesApi } from '@/api/documentPackages'
import type {
  DocumentPackageClientConsolidationDto,
  PartyAddress,
  ReestrDoc44ItemInput,
  ReestrGoodsItemInput,
  ReestrTransitFields,
} from '@/types/api'
import { REESTR_TRANSIT_DEFAULTS } from '@/utils/reestrDtoMap'
import {
  assignDraft,
  assignObject,
  departureOfficeTooLong,
  mergeDrafts,
  sectionState,
  type Obj,
  type RecordDraft,
  type SectionKey,
} from '@/views/broker/transit/record/recordModel'

export interface PartiaDraft {
  clientName: string
  destinationStation: string | null
  destinationCustomsAuthority: string | null
  sealNumber: string | null
  shipper: PartyAddress
  consignee: PartyAddress
  /** goods, doc44, transit + 9 коллекций; fields/sealNumber/packagingType — пустые и не используются. */
  record: RecordDraft
}

/** Тело POST/PUT партии — тип из API (отдельного типа в types/api.ts нет). */
export type ClientConsolidationBody = Parameters<typeof documentPackagesApi.createClientConsolidation>[2]

/** Коллекции, которые вместе со скалярами transit сериализуются в transitDataJson (ConsolidationTransitData). */
const TRANSIT_COLLECTIONS = [
  'organizations', 'carriers', 'transportMeans', 'identificationMeans', 'packages',
  'containers', 'precedingDocs', 'cargoOperations', 'guarantees',
] as const
type TransitCollection = (typeof TRANSIT_COLLECTIONS)[number]

const TRANSIT_KEYS = Object.keys(REESTR_TRANSIT_DEFAULTS) as (keyof ReestrTransitFields)[]

/** Разделы транзитной декларации партии («n из 10 разделов»): всё, кроме товаров, гр.44 и строки реестра. */
export const PARTIA_TRANSIT_SECTIONS: SectionKey[] = [
  'main', 'organizations', 'carriers', 'transport', 'seals', 'containers', 'packaging', 'preceding', 'guarantees', 'misc',
]

/** Лимиты колонок сервера (DocumentPackageClientConsolidationConfiguration). */
export const PARTIA_LIMITS = { clientName: 200, destinationStation: 200, destinationCustomsAuthority: 200, sealNumber: 100 } as const

/** Лимиты колонок сторон (колонки Shipper… и Consignee… в DocumentPackageClientConsolidationConfiguration); сервер хранит как прислали. */
export const PARTY_LIMITS: Record<keyof PartyAddress, number> = { name: 200, countryCode: 8, region: 200, city: 200, street: 300 }

const clone = <T>(v: T): T => structuredClone(toRaw(v))
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

const party = (p: PartyAddress | null | undefined): PartyAddress => ({
  name: p?.name ?? null,
  countryCode: p?.countryCode ?? null,
  region: p?.region ?? null,
  city: p?.city ?? null,
  street: p?.street ?? null,
})

type ParsedTransit = { data: Obj | null; broken: boolean }

const parseTransit = (json: string | null | undefined): ParsedTransit => {
  if (json == null || json.trim() === '') return { data: null, broken: false }
  try {
    const v: unknown = JSON.parse(json)
    return isObj(v) ? { data: v, broken: false } : { data: null, broken: true }
  } catch {
    return { data: null, broken: true }
  }
}

/**
 * transitDataJson партии не читается (не JSON или не объект). Черновик тогда — со значениями по умолчанию,
 * и сохранение молча затёрло бы транзит партии: страница предупреждает и просит «Сохранить всё равно».
 */
export function transitJsonBroken(json: string | null | undefined): boolean {
  return parseTransit(json).broken
}

export function draftFromPartia(c: DocumentPackageClientConsolidationDto | null): PartiaDraft {
  const { data } = parseTransit(c?.transitDataJson)
  const transit = clone(REESTR_TRANSIT_DEFAULTS) as unknown as Obj
  if (data) for (const k of TRANSIT_KEYS) if (k in data) transit[k] = data[k]
  const collection = (k: TransitCollection) => (data && Array.isArray(data[k]) ? clone(data[k] as never[]) : [])
  const goods: ReestrGoodsItemInput[] = (c?.goodsItems ?? []).map((g) => ({
    description: g.description ?? null,
    tnvedCode: g.tnvedCode ?? null,
    tnvedDescription: g.tnvedDescription ?? null,
    countryOfOrigin: g.countryOfOrigin ?? null,
    quantity: g.quantity ?? null,
    unit: g.unit ?? null,
    unitCode: g.unitCode ?? null,
    grossWeightKg: g.grossWeightKg ?? null,
    netWeightKg: g.netWeightKg ?? null,
    packagesCount: g.packagesCount ?? null,
    quantityTypeCode: g.quantityTypeCode ?? null,
    customsValue: g.customsValue ?? null,
    currency: g.currency ?? null,
  }))
  // Дата гр.44 приходит строкой yyyy-MM-dd — как есть, без new Date (часовой пояс её не сдвигает).
  const doc44: ReestrDoc44ItemInput[] = (c?.doc44Items ?? []).map((d) => ({
    docTypeCode: d.docTypeCode ?? null,
    docTypeName: d.docTypeName ?? null,
    docNumber: d.docNumber ?? null,
    docDate: d.docDate ?? null,
  }))
  return {
    clientName: c?.clientName ?? '',
    destinationStation: c?.destinationStation ?? null,
    destinationCustomsAuthority: c?.destinationCustomsAuthority ?? null,
    sealNumber: c?.sealNumber ?? null,
    shipper: party(c?.shipper),
    consignee: party(c?.consignee),
    record: {
      fields: {},
      sealNumber: null,
      packagingType: null,
      goods,
      doc44,
      transit: transit as unknown as ReestrTransitFields,
      organizations: collection('organizations'),
      carriers: collection('carriers'),
      transportMeans: collection('transportMeans'),
      identificationMeans: collection('identificationMeans'),
      packages: collection('packages'),
      containers: collection('containers'),
      precedingDocs: collection('precedingDocs'),
      cargoOperations: collection('cargoOperations'),
      guarantees: collection('guarantees'),
    },
  }
}

const trimOrNull = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim()
  return s || null
}

/**
 * Типы полей ConsolidationTransitData на сервере (ReestrContracts.cs). При формировании строк сервер разбирает
 * transitDataJson целиком и при ЛЮБОЙ ошибке типа молча выбрасывает весь транзит партии (B9): дробное в int?,
 * null в bool, '' или «дд.мм.гггг» в DateTime?, текст в decimal?, число в string. Поэтому тело приводится к этим типам.
 */
type Kind = 'int' | 'dec' | 'date' | 'bool' | 'str'

const SCALAR_KINDS: Record<keyof ReestrTransitFields, Kind> = {
  purposeCode: 'str', departureCustomsOffice: 'str', entryMethodCode: 'str', movementDirectionCode: 'str', usedAsDeclarationCode: 'str',
  goodsQuantity: 'int', cargoPlacesCount: 'int', departureCountryCode: 'str', destinationCountryCode: 'str',
  grossWeightKg: 'dec', totalValue: 'dec', docCurrencyCode: 'str', transportDocTypeCode: 'str', transportDocNumber: 'str',
  transportDocDate: 'date', isMultimodal: 'bool', transportModeCode: 'str', loadingCountryCode: 'str', loadingRailStation: 'str',
  unloadingCountryCode: 'str', unloadingRailStation: 'str', destinationCustomsOffice: 'str', packagingInfoCode: 'str',
  tempStoragePlace: 'str', destinationPlace: 'str', submitterType: 'str', submitterBin: 'str', submitterName: 'str',
}

const ROW_KINDS: Record<TransitCollection, Record<string, Kind>> = {
  organizations: { role: 'str', subjectType: 'str', bin: 'str', name: 'str', shortName: 'str', address: 'str', phone: 'str', email: 'str' },
  carriers: { role: 'str', subjectType: 'str', bin: 'str', name: 'str', countryCode: 'str', phone: 'str', email: 'str' },
  transportMeans: {
    transportModeCode: 'str', purposeCode: 'str', vehicleTypeCode: 'str', wagonOrContainerNumber: 'str',
    isEmpty: 'bool', isWagonReturn: 'bool', inContainer: 'bool', matchesTransitVehicle: 'bool',
  },
  identificationMeans: { noSeal: 'bool', meansTypeCode: 'str', quantity: 'dec', number: 'str' },
  packages: { packagingInfoKindCode: 'str', packageTypeCode: 'str', packageCount: 'dec', description: 'str' },
  containers: { containerNumber: 'str', note: 'str' },
  precedingDocs: { docTypeCode: 'str', number: 'str', date: 'date' },
  cargoOperations: { operationTypeCode: 'str' },
  guarantees: { guaranteeTypeCode: 'str', amount: 'dec', currencyCode: 'str', number: 'str' },
}

const toNumber = (v: unknown): number | null => {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string' || v.trim() === '') return null
  const n = Number(v.trim().replace(/\s+/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Дата для DateTime?: yyyy-MM-dd (из ISO берётся дата, «дд.мм.гггг» переворачивается); пустое и прочее — null. */
const toDate = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  const iso = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(s)
  if (iso) return iso[1]
  const ru = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s)
  return ru ? `${ru[3]}-${ru[2]}-${ru[1]}` : null
}

const coerce = (kind: Kind, v: unknown): unknown => {
  switch (kind) {
    case 'int': {
      const n = toNumber(v)
      return n == null ? null : Math.round(n)
    }
    case 'dec':
      return toNumber(v)
    case 'date':
      return toDate(v)
    case 'bool':
      return v === true || v === 'true'
    case 'str':
      if (v == null || typeof v === 'string') return v ?? null
      return typeof v === 'number' || typeof v === 'boolean' ? String(v) : null
  }
}

/** Привести поля по типам сервера; ключи, которых сервер не знает, остаются как есть. */
const coerceObject = (o: Obj, kinds: Record<string, Kind>): Obj => {
  const out: Obj = { ...o }
  for (const [k, kind] of Object.entries(kinds)) if (k in out || kind === 'bool') out[k] = coerce(kind, out[k])
  return out
}

/** transitDataJson, который сервер разберёт: скаляры transit и 9 коллекций, приведённые к типам ConsolidationTransitData. */
export function transitDataJson(record: RecordDraft): string {
  const transit = coerceObject(clone(record.transit) as unknown as Obj, SCALAR_KINDS)
  for (const k of TRANSIT_COLLECTIONS) {
    const rows = Array.isArray(record[k]) ? (clone(record[k]) as unknown[]) : []
    transit[k] = rows.filter(isObj).map((row) => coerceObject(row, ROW_KINDS[k]))
  }
  return JSON.stringify(transit)
}

/** Полное тело POST/PUT: все поля партии из черновика; transitDataJson — всегда (скаляры transit + 9 коллекций). */
export function partiaToBody(d: PartiaDraft): ClientConsolidationBody {
  const x = clone(d)
  const r = x.record
  return {
    clientName: x.clientName.trim(),
    destinationStation: trimOrNull(x.destinationStation),
    destinationCustomsAuthority: trimOrNull(x.destinationCustomsAuthority),
    sealNumber: trimOrNull(x.sealNumber),
    shipper: x.shipper,
    consignee: x.consignee,
    goodsItems: r.goods.length ? r.goods : null,
    doc44Items: r.doc44.length ? r.doc44 : null,
    transitDataJson: transitDataJson(r),
  }
}

const tooLong = (v: string | null | undefined, max: number) => (v ?? '').trim().length > max

/** Поля стороны длиннее колонок сервера (длина как есть — сервер стороны не обрезает). */
export function partyTooLong(p: PartyAddress): (keyof PartyAddress)[] {
  return (Object.keys(PARTY_LIMITS) as (keyof PartyAddress)[]).filter((k) => (p[k] ?? '').length > PARTY_LIMITS[k])
}

/** Ошибки перед сохранением — ключи i18n. */
export function validatePartia(d: PartiaDraft): string[] {
  const errors: string[] = []
  if (!d.clientName.trim()) errors.push('broker.partia.errors.needClient')
  if (tooLong(d.clientName, PARTIA_LIMITS.clientName)) errors.push('broker.partia.errors.clientTooLong')
  if (tooLong(d.destinationStation, PARTIA_LIMITS.destinationStation)) errors.push('broker.partia.errors.stationTooLong')
  if (tooLong(d.destinationCustomsAuthority, PARTIA_LIMITS.destinationCustomsAuthority)) errors.push('broker.partia.errors.customsTooLong')
  if (tooLong(d.sealNumber, PARTIA_LIMITS.sealNumber)) errors.push('broker.partia.errors.sealTooLong')
  if (partyTooLong(d.shipper).length) errors.push('broker.partia.errors.shipperTooLong')
  if (partyTooLong(d.consignee).length) errors.push('broker.partia.errors.consigneeTooLong')
  // При генерации строк таможня отправления уходит в колонку записи (32 знака) — длинная уронит генерацию.
  if (departureOfficeTooLong(d.record.transit.departureCustomsOffice)) errors.push('broker.partia.errors.departureOfficeTooLong')
  return errors
}

/** Что заполнено в транзитной декларации партии — для строки «n из 10 разделов». */
export function transitFilled(d: PartiaDraft): { filled: SectionKey[]; total: number } {
  return {
    filled: PARTIA_TRANSIT_SECTIONS.filter((k) => sectionState(k, d.record) !== 'empty'),
    total: PARTIA_TRANSIT_SECTIONS.length,
  }
}

const json = (v: unknown) => JSON.stringify(v ?? null)
const SCALARS = ['clientName', 'destinationStation', 'destinationCustomsAuthority', 'sealNumber', 'shipper', 'consignee'] as const

/**
 * Трёхстороннее слияние при применении свежей партии (после сохранения, reload): то, что пользователь поменял
 * относительно base, остаётся его; остальное — с сервера. Стороны — целиком, record — как в записи транзита.
 */
export function mergePartia(base: PartiaDraft, mine: PartiaDraft, theirs: PartiaDraft): PartiaDraft {
  const out = clone(theirs)
  const m = clone(mine)
  const o = out as unknown as Obj
  for (const k of SCALARS) {
    if (json(m[k]) !== json(base[k])) o[k] = m[k]
  }
  out.record = mergeDrafts(base.record, m.record, out.record)
  return out
}

/** Положить src в target на месте: те же объекты сторон, transit и строк (ключи строк в разделах не сбрасываются). */
export function assignPartia(target: PartiaDraft, src: PartiaDraft) {
  target.clientName = src.clientName
  target.destinationStation = src.destinationStation
  target.destinationCustomsAuthority = src.destinationCustomsAuthority
  target.sealNumber = src.sealNumber
  assignObject(target.shipper as Obj, src.shipper as Obj)
  assignObject(target.consignee as Obj, src.consignee as Obj)
  assignDraft(target.record, src.record)
}
