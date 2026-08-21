import dayjs from 'dayjs'
import type {
  ReestrColumnKey,
  ReestrEntry,
  ReestrEntryDto,
  ReestrUpsertBody,
  ReestrEntryStatus,
  ReestrGoodsItemInput,
  ReestrDoc44ItemInput,
  ReestrTransitFields,
  ReestrOrganizationInput,
  ReestrCarrierInput,
  ReestrTransportMeansInput,
  ReestrIdentificationMeansInput,
  ReestrPackageInput,
  ReestrContainerInput,
  ReestrPrecedingDocInput,
  ReestrCargoOperationInput,
  ReestrGuaranteeInput,
} from '@/types/api'
import { REESTR_COLUMN_KEYS, ReestrEntryStatus as ReestrEntryStatusValues } from '@/types/api'

// Дефолты КЕДЕН-транзита для новой записи реестра (§1 Общие сведения).
// Цель заявления «06» (транзит), вид декларации «СД» (сокращённая декларация),
// способ подачи «RW» (веб) — все редактируемы в форме.
export const REESTR_TRANSIT_DEFAULTS: ReestrTransitFields = {
  purposeCode: '06',
  departureCustomsOffice: null,
  entryMethodCode: 'RW',
  movementDirectionCode: 'ПИ',
  usedAsDeclarationCode: 'СД',
  goodsQuantity: null,
  cargoPlacesCount: null,
  departureCountryCode: null,
  destinationCountryCode: null,
  grossWeightKg: null,
  totalValue: null,
  docCurrencyCode: null,
  transportDocTypeCode: null,
  transportDocNumber: null,
  transportDocDate: null,
  isMultimodal: false,
  transportModeCode: null,
  loadingCountryCode: null,
  loadingRailStation: null,
  unloadingCountryCode: null,
  unloadingRailStation: null,
  destinationCustomsOffice: null,
  packagingInfoCode: null,
  tempStoragePlace: null,
  destinationPlace: null,
  submitterType: null,
  submitterBin: null,
  submitterName: null,
}

export const REESTR_STATUS_OPTIONS: { value: ReestrEntryStatus; label: string }[] = [
  { value: ReestrEntryStatusValues.InProgress, label: 'В работе' },
  { value: ReestrEntryStatusValues.Submitted, label: 'Подан' },
  { value: ReestrEntryStatusValues.Released, label: 'Выпущено' },
  { value: ReestrEntryStatusValues.ConditionallyReleased, label: 'Условно выпущено' },
  { value: ReestrEntryStatusValues.Problematic, label: 'Проблемный' },
  { value: ReestrEntryStatusValues.Rejected, label: 'Отказ' },
  { value: ReestrEntryStatusValues.Withdrawn, label: 'Отзыв' },
  { value: ReestrEntryStatusValues.Archived, label: 'Архив' },
]

const dtoStatusFromJson: Record<string, ReestrEntryStatus> = {
  inProgress: ReestrEntryStatusValues.InProgress,
  submitted: ReestrEntryStatusValues.Submitted,
  released: ReestrEntryStatusValues.Released,
  conditionallyReleased: ReestrEntryStatusValues.ConditionallyReleased,
  problematic: ReestrEntryStatusValues.Problematic,
  rejected: ReestrEntryStatusValues.Rejected,
  withdrawn: ReestrEntryStatusValues.Withdrawn,
  archived: ReestrEntryStatusValues.Archived,
}

export function dtoStatusToEntryStatus(raw: ReestrEntryDto['status']): ReestrEntryStatus {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 7) {
    return raw as ReestrEntryStatus
  }
  const s = String(raw).trim()
  return dtoStatusFromJson[s] ?? ReestrEntryStatusValues.InProgress
}

export function formatReestrStatus(status: ReestrEntryStatus): string {
  return REESTR_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? String(status)
}

function formatNum(n: number | null | undefined): string | null {
  if (n == null || Number.isNaN(n)) {
    return null
  }
  return String(n)
}

function documentDateToColumn(iso: string | null): string | null {
  if (!iso) {
    return null
  }
  const d = dayjs(iso)
  return d.isValid() ? d.format('YYYY-MM-DD') : null
}

export function reestrDtoToData(dto: ReestrEntryDto): Record<string, string | null> {
  const m: Record<string, string | null> = {}
  m['№'] = dto.rowNumber
  m['Дата'] = documentDateToColumn(dto.documentDate)
  m['Контейнер'] = dto.container
  m['Получатель'] = dto.consignee
  m['Станция назначения'] = dto.destinationStation
  m['Пост'] = dto.customsPost ?? null
  m['Отправитель'] = dto.shipper
  m['Отправка'] = dto.shipmentInfo
  m['Груз'] = dto.cargoDescription
  m['Подкод'] = dto.subcode
  m['Код ТНВЭД'] = dto.commodityCode
  m['Количество мест'] = formatNum(dto.packagesCount)
  m['Вес'] = formatNum(dto.weightKg)
  m['ТД'] = dto.customsDeclarationNumber
  m['Кол-во ТД'] = formatNum(dto.customsDeclarationCount)
  m['Количество доп.листов'] = formatNum(dto.supplementalSheetsCount)
  return m
}

export function reestrDtoToEntry(dto: ReestrEntryDto): ReestrEntry {
  return {
    id: dto.id,
    createdAtUtc: dto.createdAtUtc,
    status: dtoStatusToEntryStatus(dto.status),
    clientId: dto.clientId,
    data: reestrDtoToData(dto),
    deprecationWarning: dto.deprecationWarning ?? null,
    goods: (dto.goodsItems ?? []).map((g) => ({
      description: g.description,
      tnvedCode: g.tnvedCode,
      tnvedDescription: g.tnvedDescription,
      countryOfOrigin: g.countryOfOrigin,
      quantity: g.quantity,
      unit: g.unit,
      unitCode: g.unitCode,
      grossWeightKg: g.grossWeightKg,
      netWeightKg: g.netWeightKg,
      packagesCount: g.packagesCount,
      quantityTypeCode: g.quantityTypeCode,
      customsValue: g.customsValue,
      currency: g.currency,
    })),
    doc44: (dto.doc44Items ?? []).map((d) => ({
      docTypeCode: d.docTypeCode,
      docTypeName: d.docTypeName,
      docNumber: d.docNumber,
      docDate: d.docDate,
    })),
    transit: {
      purposeCode: dto.purposeCode ?? null,
      departureCustomsOffice: dto.departureCustomsOffice ?? null,
      entryMethodCode: dto.entryMethodCode ?? null,
      movementDirectionCode: dto.movementDirectionCode ?? null,
      usedAsDeclarationCode: dto.usedAsDeclarationCode ?? null,
      goodsQuantity: dto.goodsQuantity ?? null,
      cargoPlacesCount: dto.cargoPlacesCount ?? null,
      departureCountryCode: dto.departureCountryCode ?? null,
      destinationCountryCode: dto.destinationCountryCode ?? null,
      grossWeightKg: dto.grossWeightKg ?? null,
      totalValue: dto.totalValue ?? null,
      docCurrencyCode: dto.docCurrencyCode ?? null,
      transportDocTypeCode: dto.transportDocTypeCode ?? null,
      transportDocNumber: dto.transportDocNumber ?? null,
      transportDocDate: dto.transportDocDate ?? null,
      isMultimodal: dto.isMultimodal ?? false,
      transportModeCode: dto.transportModeCode ?? null,
      loadingCountryCode: dto.loadingCountryCode ?? null,
      loadingRailStation: dto.loadingRailStation ?? null,
      unloadingCountryCode: dto.unloadingCountryCode ?? null,
      unloadingRailStation: dto.unloadingRailStation ?? null,
      destinationCustomsOffice: dto.destinationCustomsOffice ?? null,
      packagingInfoCode: dto.packagingInfoCode ?? null,
      tempStoragePlace: dto.tempStoragePlace ?? null,
      destinationPlace: dto.destinationPlace ?? null,
      submitterType: dto.submitterType ?? null,
      submitterBin: dto.submitterBin ?? null,
      submitterName: dto.submitterName ?? null,
    },
    organizations: (dto.organizations ?? []).map((o) => ({
      role: o.role,
      subjectType: o.subjectType,
      bin: o.bin,
      name: o.name,
      shortName: o.shortName,
      address: o.address,
      phone: o.phone,
      email: o.email,
    })),
    carriers: (dto.carriers ?? []).map((c) => ({
      role: c.role,
      subjectType: c.subjectType,
      bin: c.bin,
      name: c.name,
      countryCode: c.countryCode,
      phone: c.phone,
      email: c.email,
    })),
    transportMeans: (dto.transportMeans ?? []).map((t) => ({
      transportModeCode: t.transportModeCode,
      purposeCode: t.purposeCode,
      vehicleTypeCode: t.vehicleTypeCode,
      wagonOrContainerNumber: t.wagonOrContainerNumber,
      isEmpty: t.isEmpty,
      isWagonReturn: t.isWagonReturn,
      inContainer: t.inContainer,
      matchesTransitVehicle: t.matchesTransitVehicle,
    })),
    identificationMeans: (dto.identificationMeans ?? []).map((i) => ({
      noSeal: i.noSeal,
      meansTypeCode: i.meansTypeCode,
      quantity: i.quantity,
      number: i.number,
    })),
    packages: (dto.packages ?? []).map((p) => ({
      packagingInfoKindCode: p.packagingInfoKindCode,
      packageTypeCode: p.packageTypeCode,
      packageCount: p.packageCount,
      description: p.description,
    })),
    containers: (dto.containers ?? []).map((c) => ({
      containerNumber: c.containerNumber,
      note: c.note,
    })),
    precedingDocs: (dto.precedingDocs ?? []).map((p) => ({
      docTypeCode: p.docTypeCode,
      number: p.number,
      date: p.date,
    })),
    cargoOperations: (dto.cargoOperations ?? []).map((c) => ({
      operationTypeCode: c.operationTypeCode,
    })),
    guarantees: (dto.guarantees ?? []).map((g) => ({
      guaranteeTypeCode: g.guaranteeTypeCode,
      amount: g.amount,
      currencyCode: g.currencyCode,
      number: g.number,
    })),
  }
}

export function reestrDataToUpsertBody(
  data: Record<string, string | null>,
  status: ReestrEntryStatus,
  clientId: string,
  goods: ReestrGoodsItemInput[] = [],
  doc44: ReestrDoc44ItemInput[] = [],
  transit: ReestrTransitFields = REESTR_TRANSIT_DEFAULTS,
  organizations: ReestrOrganizationInput[] = [],
  carriers: ReestrCarrierInput[] = [],
  transportMeans: ReestrTransportMeansInput[] = [],
  identificationMeans: ReestrIdentificationMeansInput[] = [],
  packages: ReestrPackageInput[] = [],
  containers: ReestrContainerInput[] = [],
  precedingDocs: ReestrPrecedingDocInput[] = [],
  cargoOperations: ReestrCargoOperationInput[] = [],
  guarantees: ReestrGuaranteeInput[] = [],
): ReestrUpsertBody {
  return reestrEntryToUpsertBody({
    id: '',
    createdAtUtc: '',
    status,
    clientId,
    data,
    goods,
    doc44,
    transit,
    organizations,
    carriers,
    transportMeans,
    identificationMeans,
    packages,
    containers,
    precedingDocs,
    cargoOperations,
    guarantees,
  })
}

export function reestrEntryToUpsertBody(entry: ReestrEntry): ReestrUpsertBody {
  const d = entry.data
  const t = entry.transit
  return {
    rowNumber: d['№'],
    documentDate: d['Дата'],
    container: d['Контейнер'],
    consignee: d['Получатель'],
    destinationStation: d['Станция назначения'],
    customsPost: d['Пост'],
    shipper: d['Отправитель'],
    shipmentInfo: d['Отправка'],
    cargoDescription: d['Груз'],
    subcode: d['Подкод'],
    commodityCode: d['Код ТНВЭД'],
    packagesCount: d['Количество мест'] ? Number(d['Количество мест']) : null,
    weightKg: d['Вес'] ? Number(d['Вес']) : null,
    customsDeclarationNumber: d['ТД'],
    customsDeclarationCount: d['Кол-во ТД'] ? Number(d['Кол-во ТД']) : null,
    supplementalSheetsCount: d['Количество доп.листов'] ? Number(d['Количество доп.листов']) : null,
    sealNumber: d['№ Пломбы'] ?? null,
    packagingType: d['Вид упаковки'] ?? null,
    status: entry.status,
    clientId: entry.clientId,
    goodsItems: entry.goods,
    doc44Items: entry.doc44,
    purposeCode: t.purposeCode,
    departureCustomsOffice: t.departureCustomsOffice,
    entryMethodCode: t.entryMethodCode,
    movementDirectionCode: t.movementDirectionCode,
    usedAsDeclarationCode: t.usedAsDeclarationCode,
    goodsQuantity: t.goodsQuantity,
    cargoPlacesCount: t.cargoPlacesCount,
    departureCountryCode: t.departureCountryCode,
    destinationCountryCode: t.destinationCountryCode,
    grossWeightKg: t.grossWeightKg,
    totalValue: t.totalValue,
    docCurrencyCode: t.docCurrencyCode,
    transportDocTypeCode: t.transportDocTypeCode,
    transportDocNumber: t.transportDocNumber,
    transportDocDate: t.transportDocDate,
    isMultimodal: t.isMultimodal,
    transportModeCode: t.transportModeCode,
    loadingCountryCode: t.loadingCountryCode,
    loadingRailStation: t.loadingRailStation,
    unloadingCountryCode: t.unloadingCountryCode,
    unloadingRailStation: t.unloadingRailStation,
    destinationCustomsOffice: t.destinationCustomsOffice,
    packagingInfoCode: t.packagingInfoCode,
    tempStoragePlace: t.tempStoragePlace,
    destinationPlace: t.destinationPlace,
    submitterType: t.submitterType,
    submitterBin: t.submitterBin,
    submitterName: t.submitterName,
    organizations: entry.organizations,
    carriers: entry.carriers,
    transportMeans: entry.transportMeans,
    identificationMeans: entry.identificationMeans,
    packages: entry.packages,
    containers: entry.containers,
    precedingDocs: entry.precedingDocs,
    cargoOperations: entry.cargoOperations,
    guarantees: entry.guarantees,
  }
}

export function isMeaningfulReestrData(data: Record<string, string | null>): boolean {
  return Boolean(
    data['№']?.trim() ||
      data['Контейнер']?.trim() ||
      data['Получатель']?.trim() ||
      data['Отправитель']?.trim() ||
      data['Груз']?.trim(),
  )
}

export function collectExtraColumnKeys(entries: ReestrEntry[]): ReestrColumnKey[] {
  const known = new Set<string>(REESTR_COLUMN_KEYS)
  const extras = new Set<string>()
  for (const entry of entries) {
    for (const key of Object.keys(entry.data)) {
      if (!known.has(key)) {
        extras.add(key)
      }
    }
  }
  return [...extras] as ReestrColumnKey[]
}
