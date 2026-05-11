import dayjs from 'dayjs'
import type {
  ReestrColumnKey,
  ReestrEntry,
  ReestrEntryDto,
  ReestrEntryStatus,
  ReestrUpsertBody,
} from '@/types/api'
import { REESTR_COLUMN_KEYS } from '@/types/api'

export const REESTR_STATUS_OPTIONS: { value: ReestrEntryStatus; label: string }[] = [
  { value: 'release', label: 'Выпуск' },
  { value: 'problematic', label: 'Проблемный' },
  { value: 'inspectionNotice', label: 'Уведомление о досмотре' },
  { value: 'inspectionAct', label: 'Акт досмотра' },
  { value: 'submittedToCustoms', label: 'Подано в таможню' },
  { value: 'pendingClarification', label: 'Ожидает уточнения' },
  { value: 'exit', label: 'Выход' },
  { value: 'abbreviated', label: 'Сокращённый' },
]

export function formatReestrStatus(status: string): string {
  return REESTR_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
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
    status: dto.status,
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
