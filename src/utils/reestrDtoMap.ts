import dayjs from 'dayjs'
import type { ReestrColumnKey, ReestrEntry, ReestrEntryDto, ReestrUpsertBody, ReestrEntryStatus } from '@/types/api'
import { REESTR_COLUMN_KEYS, ReestrEntryStatus as ReestrEntryStatusValues } from '@/types/api'

export const REESTR_STATUS_OPTIONS: { value: ReestrEntryStatus; label: string }[] = [
  { value: ReestrEntryStatusValues.Release, label: 'Выпуск' },
  { value: ReestrEntryStatusValues.Problematic, label: 'Проблемный' },
  { value: ReestrEntryStatusValues.InspectionNotice, label: 'Уведомление о досмотре' },
  { value: ReestrEntryStatusValues.InspectionAct, label: 'Акт досмотра' },
  { value: ReestrEntryStatusValues.SubmittedToCustoms, label: 'Подано в таможню' },
  { value: ReestrEntryStatusValues.PendingClarification, label: 'Ожидает уточнения' },
  { value: ReestrEntryStatusValues.Exit, label: 'Выход' },
  { value: ReestrEntryStatusValues.Abbreviated, label: 'Сокращённый' },
]

const dtoStatusFromJson: Record<string, ReestrEntryStatus> = {
  release: ReestrEntryStatusValues.Release,
  problematic: ReestrEntryStatusValues.Problematic,
  inspectionNotice: ReestrEntryStatusValues.InspectionNotice,
  inspectionAct: ReestrEntryStatusValues.InspectionAct,
  submittedToCustoms: ReestrEntryStatusValues.SubmittedToCustoms,
  pendingClarification: ReestrEntryStatusValues.PendingClarification,
  exit: ReestrEntryStatusValues.Exit,
  abbreviated: ReestrEntryStatusValues.Abbreviated,
}

export function dtoStatusToEntryStatus(raw: ReestrEntryDto['status']): ReestrEntryStatus {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 7) {
    return raw as ReestrEntryStatus
  }
  const s = String(raw).trim()
  return dtoStatusFromJson[s] ?? ReestrEntryStatusValues.Release
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
    data: reestrDtoToData(dto),
  }
}

function parseDecimal(raw: string | null | undefined): number | null {
  if (raw == null) {
    return null
  }
  const s = String(raw).trim().replace(/\s/g, '').replace(',', '.')
  if (!s) {
    return null
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function reestrDataToUpsertBody(
  data: Record<string, string | null>,
  status: ReestrEntryStatus,
): ReestrUpsertBody {
  const d = (k: ReestrColumnKey) => data[k] ?? null
  const t = (k: ReestrColumnKey) => {
    const v = d(k)
    if (v == null) {
      return null
    }
    const s = String(v).trim()
    return s === '' ? null : s
  }
  const dateStr = t('Дата')
  const documentDate =
    dateStr && dateStr.trim()
      ? dayjs(dateStr.trim(), 'YYYY-MM-DD', true).isValid()
        ? dateStr.trim()
        : dayjs(dateStr.trim(), 'DD.MM.YYYY', true).isValid()
          ? dayjs(dateStr.trim(), 'DD.MM.YYYY', true).format('YYYY-MM-DD')
          : dateStr.trim()
      : null

  return {
    rowNumber: t('№'),
    documentDate,
    container: t('Контейнер'),
    consignee: t('Получатель'),
    destinationStation: t('Станция назначения'),
    shipper: t('Отправитель'),
    shipmentInfo: t('Отправка'),
    cargoDescription: t('Груз'),
    subcode: t('Подкод'),
    commodityCode: t('Код ТНВЭД'),
    packagesCount: parseDecimal(d('Количество мест')),
    weightKg: parseDecimal(d('Вес')),
    customsDeclarationNumber: t('ТД'),
    customsDeclarationCount: parseDecimal(d('Кол-во ТД')),
    pricePerDeclarationWithVat: parseDecimal(d('Цена одной ТД, с НДС')),
    supplementalSheetsCount: parseDecimal(d('Количество доп.листов')),
    pricePerSupplementalSheetWithVat: parseDecimal(d('Цена одного доп.листа, с НДС')),
    supplementalSheetsTotalWithVat: parseDecimal(d('Всего, ДЛ с НДС')),
    grandTotalWithVat: parseDecimal(d('Итого, с НДС')),
    status,
  }
}

export function emptyReestrDataRow(): Record<ReestrColumnKey, string | null> {
  const row = {} as Record<ReestrColumnKey, string | null>
  for (const k of REESTR_COLUMN_KEYS) {
    row[k] = null
  }
  return row
}
