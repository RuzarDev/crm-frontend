import type { Import40CaseDto } from '@/api/import40'

// Поля черновика заявки (шаг 1): какие есть, какие относятся к виду транспорта и что делать при сохранении.

export type DraftField =
  | 'cargo' | 'post'
  | 'wagonNumber' | 'station'
  | 'vehicleNumber' | 'trailerNumber' | 'driverPhone'
  | 'flightNumber' | 'airWaybill'
  | 'vesselName' | 'billOfLading'

export const DRAFT_FIELDS: DraftField[] = [
  'cargo', 'post', 'wagonNumber', 'station', 'vehicleNumber', 'trailerNumber', 'driverPhone',
  'flightNumber', 'airWaybill', 'vesselName', 'billOfLading',
]

/** Поля по виду транспорта (код IMPORT40_TRANSPORT_MODES): 0 ЖД, 1 Авто, 2 Авиа, 3 Море. */
export const TRANSPORT_FIELDS: Record<number, DraftField[]> = {
  0: ['wagonNumber', 'station'],
  1: ['vehicleNumber', 'trailerNumber', 'driverPhone'],
  2: ['flightNumber', 'airWaybill'],
  3: ['vesselName', 'billOfLading'],
}

/**
 * Эти поля сервер не очищает: пустое значение он принимает, но оставляет прежнее (NormalizeText),
 * поэтому поле «откатывалось» без объяснения. Остальные (вагон, станция, прицеп, рейс, AWB, судно, коносамент) очищаются.
 */
export const NOT_CLEARABLE: ReadonlySet<DraftField> = new Set<DraftField>(['cargo', 'post', 'vehicleNumber', 'driverPhone'])

export const draftValueOf = (c: Import40CaseDto, f: DraftField): string => (c[f] as string | null | undefined) || ''

/** Что делать с полем при blur/Enter: ничего не менялось, нельзя очищать (подсказка под полем) или сохранить. */
export type CommitDecision = { kind: 'skip' } | { kind: 'blocked' } | { kind: 'save'; value: string }

export function decideCommit(c: Import40CaseDto, field: DraftField, raw: string): CommitDecision {
  const value = raw.trim()
  if (value === draftValueOf(c, field)) return { kind: 'skip' }
  if (!value && NOT_CLEARABLE.has(field)) return { kind: 'blocked' }
  return { kind: 'save', value }
}
