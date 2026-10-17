import type { RepDeclarationRow, RepProcedureCount } from '@/api/reports'
import { formatDateText } from '@/ui/date'

// Чистая логика «Отчёта представителя»: кварталы (по умолчанию — прошлый), быстрые кнопки, имя файла, процедуры строкой.

export interface Period { from: string; to: string }
export interface Quarter { year: number; q: 1 | 2 | 3 | 4 }

const pad2 = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

export const quarterOf = (date: Date): Quarter => ({ year: date.getFullYear(), q: (Math.floor(date.getMonth() / 3) + 1) as Quarter['q'] })

export const shiftQuarter = (x: Quarter, by: number): Quarter => {
  const idx = x.year * 4 + (x.q - 1) + by
  return { year: Math.floor(idx / 4), q: ((idx % 4) + 1) as Quarter['q'] }
}

export const quarterPeriod = (x: Quarter): Period => {
  const m1 = (x.q - 1) * 3 + 1
  return { from: iso(x.year, m1, 1), to: iso(x.year, m1 + 2, lastDay(x.year, m1 + 2)) }
}

/** Период по умолчанию — прошлый квартал (отчёт сдают за закрытый квартал). */
export const defaultPeriod = (today: Date): Period => quarterPeriod(shiftQuarter(quarterOf(today), -1))

/** Быстрые кнопки: текущий квартал и три предыдущих, от нового к старому. */
export const quickQuarters = (today: Date): Quarter[] => [0, -1, -2, -3].map((by) => shiftQuarter(quarterOf(today), by))

export const quarterKey = (x: Quarter): string => `${x.year}-Q${x.q}`

/** Какой из быстрых кварталов совпадает с периодом (иначе — null: период свой). */
export const matchingQuarter = (p: Period, quarters: Quarter[]): Quarter | null =>
  quarters.find((x) => { const qp = quarterPeriod(x); return qp.from === p.from && qp.to === p.to }) ?? null

const ROMAN = ['I', 'II', 'III', 'IV']
export const romanQuarter = (x: Quarter): string => ROMAN[x.q - 1]

/** «01.07.2026–30.09.2026». */
export const periodText = (p: Period): string => `${formatDateText(p.from)}–${formatDateText(p.to)}`

/** Имя файла Excel: «Отчёт представителя 01.07.2026–30.09.2026.xlsx» (префикс переводится). */
export const xlsxFileName = (prefix: string, p: Period): string => `${prefix} ${periodText(p)}.xlsx`

/** «ИМ 40: 12 · ЭК 10: 1». */
export const proceduresText = (list: RepProcedureCount[]): string => list.map((p) => `${p.procedure}: ${p.count}`).join(' · ')

/** ДТ поста в сводке: по коду органа (null — «Орган не указан»), без отменённых заявок — их в сводке нет. */
export const rowsOfPost = (rows: RepDeclarationRow[], dgdCode: string | null, postCode: string | null): RepDeclarationRow[] =>
  rows.filter((r) => r.status !== 'cancelled' && r.dgdCode === dgdCode && r.postCode === postCode)

/** ДТ отменённых заявок — отдельным списком под сводкой. */
export const cancelledRows = (rows: RepDeclarationRow[]): RepDeclarationRow[] => rows.filter((r) => r.status === 'cancelled')

export const postKey = (dgdCode: string | null, postCode: string | null): string => `${dgdCode ?? '-'}_${postCode ?? '-'}`
