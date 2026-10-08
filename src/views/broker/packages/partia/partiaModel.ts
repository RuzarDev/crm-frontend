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

/** goodsQuantity и cargoPlacesCount на сервере — int?: дробное или строковое число роняет весь JSON при генерации (B9). */
const toInt = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

/** Полное тело POST/PUT: все поля партии из черновика; transitDataJson — всегда (скаляры transit + 9 коллекций). */
export function partiaToBody(d: PartiaDraft): ClientConsolidationBody {
  const x = clone(d)
  const r = x.record
  const transit: Obj = { ...(r.transit as unknown as Obj) }
  transit.goodsQuantity = toInt(transit.goodsQuantity)
  transit.cargoPlacesCount = toInt(transit.cargoPlacesCount)
  for (const k of TRANSIT_COLLECTIONS) transit[k] = r[k]
  return {
    clientName: x.clientName.trim(),
    destinationStation: trimOrNull(x.destinationStation),
    destinationCustomsAuthority: trimOrNull(x.destinationCustomsAuthority),
    sealNumber: trimOrNull(x.sealNumber),
    shipper: x.shipper,
    consignee: x.consignee,
    goodsItems: r.goods.length ? r.goods : null,
    doc44Items: r.doc44.length ? r.doc44 : null,
    transitDataJson: JSON.stringify(transit),
  }
}

const tooLong = (v: string | null | undefined, max: number) => (v ?? '').trim().length > max

/** Ошибки перед сохранением — ключи i18n. */
export function validatePartia(d: PartiaDraft): string[] {
  const errors: string[] = []
  if (!d.clientName.trim()) errors.push('broker.partia.errors.needClient')
  if (tooLong(d.clientName, PARTIA_LIMITS.clientName)) errors.push('broker.partia.errors.clientTooLong')
  if (tooLong(d.destinationStation, PARTIA_LIMITS.destinationStation)) errors.push('broker.partia.errors.stationTooLong')
  if (tooLong(d.destinationCustomsAuthority, PARTIA_LIMITS.destinationCustomsAuthority)) errors.push('broker.partia.errors.customsTooLong')
  if (tooLong(d.sealNumber, PARTIA_LIMITS.sealNumber)) errors.push('broker.partia.errors.sealTooLong')
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
