import dayjs from 'dayjs'
import type { ReestrColumnKey, ReestrEntry, ReestrEntryDto, ReestrUpsertBody, ReestrEntryStatus } from '@/types/api'
import { REESTR_COLUMN_KEYS, ReestrEntryStatus as ReestrEntryStatusValues } from '@/types/api'

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
  m['Цена одной ТД, с НДС'] = formatNum(dto.pricePerDeclarationWithVat)
  m['Количество доп.листов'] = formatNum(dto.supplementalSheetsCount)
  m['Цена одного доп.листа, с НДС'] = formatNum(dto.pricePerSupplementalSheetWithVat)
  m['Всего, ДЛ с НДС'] = formatNum(dto.supplementalSheetsTotalWithVat)
  m['Итого, с НДС'] = formatNum(dto.grandTotalWithVat)
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
  }
}

export function reestrDataToUpsertBody(
  data: Record<string, string | null>,
  status: ReestrEntryStatus,
  clientId: string,
): ReestrUpsertBody {
  return {
    ...reestrEntryToUpsertBody({
      id: '',
      createdAtUtc: '',
      status,
      clientId,
      data,
    }),
  }
}

export function reestrEntryToUpsertBody(entry: ReestrEntry): ReestrUpsertBody {
  const d = entry.data
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
    pricePerDeclarationWithVat: d['Цена одной ТД, с НДС'] ? Number(d['Цена одной ТД, с НДС']) : null,
    supplementalSheetsCount: d['Количество доп.листов'] ? Number(d['Количество доп.листов']) : null,
    pricePerSupplementalSheetWithVat: d['Цена одного доп.листа, с НДС']
      ? Number(d['Цена одного доп.листа, с НДС'])
      : null,
    supplementalSheetsTotalWithVat: d['Всего, ДЛ с НДС'] ? Number(d['Всего, ДЛ с НДС']) : null,
    grandTotalWithVat: d['Итого, с НДС'] ? Number(d['Итого, с НДС']) : null,
    status: entry.status,
    clientId: entry.clientId,
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
