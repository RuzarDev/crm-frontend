import type { TnvedRateChangeDto } from '@/types/api'
import { cleanName } from '@/views/references/tnvedShared'

// «Изменения» (волна 5а): одна лента из хронологии ТН ВЭД (вступление в силу и окончание действия ставок)
// и изменений ставок, найденных синхронизацией. Без Vue — проверяется отдельно.

export type ChangeKind = 'starts' | 'ends' | 'rate'

export interface ChangeEntry {
  /** Уникален в ленте: «источник:дата:…». */
  key: string
  kind: ChangeKind
  /** Дата события, «ГГГГ-ММ-ДД». */
  date: string
  /** До пяти кодов; остальные — moreCodes. */
  codes: string[]
  moreCodes: number
  /** Только изменение ставки. */
  name: string
  oldRate: string | null
  newRate: string | null
}

/** Дата из ответа сервера: «ГГГГ-ММ-ДД» от начала строки; DateTime без пояса не пересчитываем в местное время. */
export const isoDate = (s: string | null | undefined): string => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s ?? '')
  return m ? m[1] : ''
}

/** Изменения ставок (tnved/rate-changes): дата — detectedAtUtc, название — name (старый экран читал несуществующие поля). */
export function rateChangeEntries(items: TnvedRateChangeDto[] | null | undefined): ChangeEntry[] {
  return (items ?? []).map((c, i) => ({
    key: `rate:${isoDate(c.detectedAtUtc)}:${c.code}:${i}`,
    kind: 'rate' as const,
    date: isoDate(c.detectedAtUtc),
    codes: [c.code],
    moreCodes: 0,
    name: cleanName(c.name),
    oldRate: c.oldRateStr?.trim() || null,
    newRate: c.newRateStr?.trim() || null,
  }))
}
