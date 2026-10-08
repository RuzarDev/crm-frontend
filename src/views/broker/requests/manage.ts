import type { ManageCase, StaffMember } from '@/api/manage'
import { needsDeclarant, needsKpp } from './requests'

// Чистая логика «Распределения» (сегменты, загрузка сотрудников) — без Vue и запросов, чтобы проверять тестами.
export { needsDeclarant, needsKpp }

export type ManageSegment = 'noDeclarant' | 'noKpp' | 'problem' | 'stale' | 'all'
export const MANAGE_SEGMENTS: ManageSegment[] = ['noDeclarant', 'noKpp', 'problem', 'stale', 'all']

/** Столько дней без движения — заявка «зависла» (то же число, что StaleDays на сервере). */
export const STALE_DAYS = 5
/** Нагрузка от этого числа активных заявок — полоса золотая. */
export const HEAVY_LOAD = 10

type CaseLike = Pick<ManageCase, 'status' | 'isProblem' | 'assignedDeclarantId' | 'assignedKppId' | 'daysSinceUpdate'>

/** Нужен по шагу и не назначен: декларант — «Декларирование»/«ДТ подана», КПП — «На границе», «ДТ выпущена», «Закрытие СВХ», «Счёт выставлен». */
export const lacksDeclarant = (c: Pick<ManageCase, 'status' | 'assignedDeclarantId'>): boolean => needsDeclarant(c.status) && !c.assignedDeclarantId
export const lacksKpp = (c: Pick<ManageCase, 'status' | 'assignedKppId'>): boolean => needsKpp(c.status) && !c.assignedKppId
export const isStale = (c: Pick<ManageCase, 'daysSinceUpdate'>): boolean => c.daysSinceUpdate >= STALE_DAYS

/** Входит ли заявка в сегмент («Все активные» — любая: сервер уже убрал черновики, завершённые и отменённые). */
export function inSegment(c: CaseLike, seg: ManageSegment): boolean {
  switch (seg) {
    case 'noDeclarant': return lacksDeclarant(c)
    case 'noKpp': return lacksKpp(c)
    case 'problem': return c.isProblem
    case 'stale': return isStale(c)
    default: return true
  }
}

/** Заявки сегмента. */
export const segmentOf = <T extends CaseLike>(cases: T[], seg: ManageSegment): T[] => cases.filter((c) => inSegment(c, seg))

/** Счётчики всех сегментов (по всем активным, без поиска). */
export function segmentCounts(cases: CaseLike[]): Record<ManageSegment, number> {
  const out: Record<ManageSegment, number> = { noDeclarant: 0, noKpp: 0, problem: 0, stale: 0, all: cases.length }
  for (const c of cases) {
    if (lacksDeclarant(c)) out.noDeclarant++
    if (lacksKpp(c)) out.noKpp++
    if (c.isProblem) out.problem++
    if (isStale(c)) out.stale++
  }
  return out
}

/** Сегмент при открытии: первый непустой из четырёх рабочих, иначе «Все активные». */
export function defaultSegment(cases: CaseLike[]): ManageSegment {
  const counts = segmentCounts(cases)
  return MANAGE_SEGMENTS.find((s) => s !== 'all' && counts[s] > 0) ?? 'all'
}

export interface StaffLoad {
  id: string
  name: string
  /** Рабочие роли в заявках: declarant и/или kpp (коды — подпись подбирает экран). */
  roles: string[]
  /** Активных заявок, где человек декларант или КПП (заявка считается один раз). */
  count: number
}

/** Нагрузка: сотрудники с ролью декларанта или КПП, по убыванию числа активных заявок. */
export function staffLoad(staff: StaffMember[], cases: Pick<ManageCase, 'assignedDeclarantId' | 'assignedKppId'>[]): StaffLoad[] {
  return staff
    .filter((u) => u.roles.includes('declarant') || u.roles.includes('kpp'))
    .map((u) => ({
      id: u.id,
      name: u.displayName || u.username,
      roles: u.roles.filter((r) => r === 'declarant' || r === 'kpp'),
      count: cases.filter((c) => c.assignedDeclarantId === u.id || c.assignedKppId === u.id).length,
    }))
    .sort((a, b) => b.count - a.count)
}

/** Ширина полосы нагрузки, %: у самого загруженного — 100, у ненулевых не меньше 6 (полоса видна). */
export function loadPercent(count: number, max: number): number {
  return Math.max(Math.round((count / Math.max(max, 1)) * 100), count ? 6 : 0)
}
