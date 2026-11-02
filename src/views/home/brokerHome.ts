import type { StaffHomeDto, StaffHomeOwners, StaffHomeTask, StaffHomeUrgent } from '@/api/dashboard'
import type { BrokerInvoice } from '@/api/billing'
import type { DashboardDto } from '@/types/api'

export type AttentionTone = 'gold' | 'danger' | 'neutral'

export interface AttentionCard {
  key: 'awaitingMe' | 'awaitingClient' | 'stuck' | 'expiringDocs' | 'transitProblems' | 'transitSubmitted'
  tone: AttentionTone
  count: number
  to: string
}

const MAX_ATTENTION = 4

/** «Истекают документы»: окно в днях — как на сервере (GetStaffHome.ExpiringDays). */
export const EXPIRING_DAYS = 14

/**
 * Карточки «Требует внимания» (пакет G, 02.11.2026) в фиксированном порядке, только ненулевые, не более четырёх:
 * «Ждут вас» (только у декларанта и КПП — сервер отдаёт null остальным), «Ждут клиента», «Застряли», «Истекают
 * документы»; у кого есть транзит — его проблемные и поданные записи (S-50). Каждая ведёт в отфильтрованный список.
 */
export const buildAttention = (i: {
  home: StaffHomeDto | null
  /** Сводка транзита (/dashboard) — у кого reestr.read и не «только финансы». */
  transit?: DashboardDto | null
}): AttentionCard[] => {
  const { home, transit } = i
  const cards: AttentionCard[] = []
  const a = home?.attention
  if (a?.awaitingMe) cards.push({ key: 'awaitingMe', tone: 'gold', count: a.awaitingMe, to: '/import-40?tab=my' })
  if (a?.awaitingClient) cards.push({ key: 'awaitingClient', tone: 'neutral', count: a.awaitingClient, to: '/import-40?tab=waiting' })
  if (a?.stuck) {
    // Декларант и КПП — по своим заявкам («Мои»), руководитель — по всем в работе.
    cards.push({ key: 'stuck', tone: 'danger', count: a.stuck, to: `/import-40?tab=${a.stuckMine ? 'my' : 'active'}&stuck=1` })
  }
  if (a?.expiringDocs) {
    cards.push({ key: 'expiringDocs', tone: 'neutral', count: a.expiringDocs, to: `/client-documents?state=expiring&within=${EXPIRING_DAYS}` })
  }
  // S-50 (30.10.2026): МПП — «Требует внимания» по транзиту: проблемные записи и поданные, ждущие выпуска;
  // карточка ведёт в «Транзит» с фильтром статуса (?status=N, номер — как ReestrEntryStatus).
  const byStatus = (key: string) => transit?.byStatus.find((x) => x.status === key)?.count ?? 0
  const transitProblems = byStatus('Problematic')
  if (transitProblems > 0) {
    cards.push({ key: 'transitProblems', tone: 'danger', count: transitProblems, to: transitStatusHref('Problematic')! })
  }
  const transitSubmitted = byStatus('Submitted')
  if (transitSubmitted > 0) {
    cards.push({ key: 'transitSubmitted', tone: 'neutral', count: transitSubmitted, to: transitStatusHref('Submitted')! })
  }
  return cards.slice(0, MAX_ATTENTION)
}

/** Сколько строк «Срочно» видно сразу; остальные — под «Ещё N». */
export const URGENT_VISIBLE = 5

/** Подпись срока строки «Срочно»: ключ home.urgent.* и параметры. */
export const urgentWhen = (u: Pick<StaffHomeUrgent, 'kind' | 'dueTime' | 'overdueDays' | 'past'>): { key: string; params: Record<string, string | number> } => {
  if (u.kind === 'invoice') {
    return u.overdueDays > 0 ? { key: 'payOverdue', params: { n: u.overdueDays } } : { key: 'payToday', params: {} }
  }
  if (u.overdueDays > 0) return { key: 'overdue', params: { n: u.overdueDays } }
  if (u.dueTime) return u.past ? { key: 'expiredAt', params: { time: u.dueTime } } : { key: 'answerBy', params: { time: u.dueTime } }
  return { key: 'dueToday', params: {} }
}

/** Куда ведёт строка «Срочно»: счёт — список счетов с его номером в поиске (как ⌘K), остальное — заявка. */
export const urgentHref = (u: Pick<StaffHomeUrgent, 'kind' | 'caseId' | 'invoiceNumber'>): string =>
  u.kind === 'invoice'
    ? `/billing?q=${encodeURIComponent(u.invoiceNumber ?? '')}`
    : `/import-40/${u.caseId}`

/** Чей ход в шапке: только ненулевые части, по порядку декларанты · КПП · клиенты. */
export const ownerParts = (o: StaffHomeOwners | null | undefined): { key: 'declarants' | 'kpp' | 'clients'; n: number }[] =>
  !o ? [] : (['declarants', 'kpp', 'clients'] as const).filter((k) => o[k] > 0).map((k) => ({ key: k, n: o[k] }))

/** «Что дальше» под заявкой в «Моих задачах»: ключ home.tasks.next.* либо этап (enum.step.sN). */
export const taskNext = (r: Pick<StaffHomeTask, 'next' | 'step' | 'filled' | 'total'>): { key: string; params: Record<string, number> } =>
  r.next === 'stage'
    ? { key: `enum.step.s${r.step}`, params: {} }
    : r.next === 'fill'
      ? { key: 'home.tasks.next.fill', params: { filled: r.filled ?? 0, total: r.total ?? 0 } }
      : { key: `home.tasks.next.${r.next}`, params: {} }

/**
 * Строка «Заявки по этапам» → список заявок с фильтром шага (?step=N, пакет G). Шаг 1 — черновики: вкладка «Черновики»
 * (возвращённые на доработку — во вкладке «Ждут клиента»); остальные шаги — вкладка «В работе».
 */
export const stageHref = (step: number): string =>
  step <= 1 ? '/import-40?tab=drafts' : `/import-40?tab=active&step=${step}`

// Порядок — как серверный ReestrEntryStatus (0..7) и STATUS_KEYS в transit.ts.
const REESTR_STATUS_NAMES = ['InProgress', 'Submitted', 'Released', 'ConditionallyReleased', 'Problematic', 'Rejected', 'Withdrawn', 'Archived']
/** «Транзит» с фильтром статуса по имени из сводки /dashboard (S-50); неизвестный статус — null. */
export const transitStatusHref = (status: string): string | null => {
  const n = REESTR_STATUS_NAMES.indexOf(status)
  return n < 0 ? null : `/reestr?status=${n}`
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

/**
 * Подпись месяца для «Денег за месяц»: «<Месяц> <год>» в любом языке — «Октябрь 2026», «Қазан 2026»,
 * «October 2026» (без « г.»/« ж.» и без порядка «год месяц»). Собираем из частей month и year сами.
 * Месяц — UTC, как у moneyForMonth: на стыке месяцев подпись и суммы не разъезжаются.
 */
export const monthCaption = (now: Date, locale: string): string => {
  const parts = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).formatToParts(now)
  const month = parts.find((p) => p.type === 'month')?.value ?? ''
  const year = parts.find((p) => p.type === 'year')?.value ?? ''
  return `${month.charAt(0).toLocaleUpperCase(locale)}${month.slice(1)} ${year}`.trim()
}
