import type { Import40DashboardDto } from '@/api/dashboard'
import type { ManageOverview } from '@/api/manage'
import type { BrokerInvoice } from '@/api/billing'
import type { Import40CaseDto } from '@/api/import40'
import { stepForStatus } from '@/utils/import40Steps'

export type AttentionTone = 'gold' | 'danger' | 'neutral'

export interface AttentionCard {
  key: 'awaitingMe' | 'unassigned' | 'problems' | 'stale' | 'overdue'
  tone: AttentionTone
  count: number
  amount?: number
  to: string
}

const MAX_ATTENTION = 4

/** Карточки «Требует внимания» в фиксированном порядке, не более четырёх. */
export const buildAttention = (i: {
  import40: Import40DashboardDto | null
  manage: ManageOverview | null
  invoices: BrokerInvoice[] | null
  now: Date
}): AttentionCard[] => {
  const { import40, manage, invoices, now } = i
  const cards: AttentionCard[] = []

  if (import40 && !import40.isManagerView && import40.awaitingMe > 0) {
    cards.push({ key: 'awaitingMe', tone: 'gold', count: import40.awaitingMe, to: '/import-40?tab=my' })
  }
  if (manage && manage.unassigned > 0) {
    cards.push({ key: 'unassigned', tone: 'gold', count: manage.unassigned, to: '/import-40/manage' })
  }
  const problems = manage ? manage.problems : import40?.problemCases ?? 0
  if (problems > 0) {
    cards.push({ key: 'problems', tone: 'danger', count: problems, to: manage ? '/import-40/manage' : '/import-40' })
  }
  if (manage && manage.stale > 0) {
    cards.push({ key: 'stale', tone: 'neutral', count: manage.stale, to: '/import-40/manage' })
  }
  const overdue = (invoices ?? []).filter(
    (x) => x.kind === 'invoice' && x.status === 1 && x.dueDateUtc && new Date(x.dueDateUtc) < now,
  )
  if (overdue.length > 0) {
    cards.push({
      key: 'overdue',
      tone: 'neutral',
      count: overdue.length,
      amount: overdue.reduce((s, x) => s + x.total, 0),
      to: '/billing',
    })
  }
  return cards.slice(0, MAX_ATTENTION)
}

export interface StageRow { step: number; count: number; color: string }

const STAGE_COLORS = [
  'var(--color-faint)',
  'var(--color-gold)',
  'var(--color-zircon)',
  'var(--color-tone-submitted-fg)',
  'var(--color-tone-pay-fg)',
  'var(--color-tone-done-fg)',
]

/** Шаги 1..6 всегда по порядку; нет данных — 0. */
export const stageRows = (bySteps: { step: number; count: number }[]): StageRow[] =>
  STAGE_COLORS.map((color, idx) => {
    const step = idx + 1
    return { step, count: bySteps.find((s) => s.step === step)?.count ?? 0, color }
  })

export const stepTone = (step: number): 'neutral' | 'wait' | 'info' | 'submitted' | 'pay' | 'done' =>
  step <= 1 ? 'neutral'
  : step === 2 ? 'wait'
  : step === 3 ? 'info'
  : step === 4 ? 'submitted'
  : step === 5 || step === 6 ? 'pay'
  : 'done'

export interface MoneySummary { issued: number; paid: number; awaiting: number }

/** Деньги за месяц `now` (UTC-месяц): выставлено, оплачено, ожидает оплаты (за всё время). */
export const moneyForMonth = (invoices: BrokerInvoice[], now: Date): MoneySummary => {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const inMonth = (iso: string | null): boolean => {
    if (!iso) return false
    const d = new Date(iso)
    return d.getUTCFullYear() === y && d.getUTCMonth() === m
  }
  const res: MoneySummary = { issued: 0, paid: 0, awaiting: 0 }
  for (const x of invoices) {
    if (x.kind !== 'invoice') continue
    if ((x.status === 1 || x.status === 2) && inMonth(x.issuedAtUtc)) res.issued += x.total
    if (x.status === 2 && inMonth(x.paidAtUtc)) res.paid += x.total
    if (x.status === 1) res.awaiting += x.total
  }
  return res
}

const pad = (n: number): string => String(n).padStart(2, '0')
const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** Время для ленты: сегодня — HH:mm, вчера — подпись, иначе DD.MM (локальные даты). */
export const shortWhen = (iso: string, now: Date, yesterday: string): string => {
  const d = new Date(iso)
  if (sameDay(d, now)) return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (sameDay(d, y)) return yesterday
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`
}

export interface TaskRow {
  id: string
  number: string
  clientName: string
  cargo: string
  step: number
  updatedAtUtc: string
}

/** Последние активные заявки: без выполненных/отменённых (status >= 8), свежие сверху. */
export const taskRows = (cases: Import40CaseDto[], limit = 6): TaskRow[] =>
  cases
    .filter((c) => c.status < 8)
    .sort((a, b) => new Date(b.updatedAtUtc).getTime() - new Date(a.updatedAtUtc).getTime())
    .slice(0, limit)
    .map((c) => ({
      id: c.id,
      number: c.number,
      clientName: c.clientName,
      cargo: c.cargo,
      step: stepForStatus(c.status),
      updatedAtUtc: c.updatedAtUtc,
    }))

/**
 * Подпись месяца для «Денег за месяц»: «Октябрь 2026» (хвост « г.» после года отброшен, первая буква заглавная).
 * Месяц — UTC, как у moneyForMonth: на стыке месяцев подпись и суммы не разъезжаются.
 */
export const monthCaption = (now: Date, locale: string): string => {
  const parts = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).formatToParts(now)
  while (parts.length && parts[parts.length - 1].type === 'literal') parts.pop()
  const s = parts.map((p) => p.value).join('')
  return s.charAt(0).toLocaleUpperCase(locale) + s.slice(1)
}
