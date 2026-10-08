import type { ZTone } from '@/components/z/ZTag.vue'
import type { BrokerInvoice, BrokerInvoiceKind } from '@/api/billing'
import { formatDay, matchesQuery, todayIso } from '@/views/broker/list'

// Чистая логика «Счетов и актов» сотрудника (редизайн, волна 3б, доска Billing): показатели, фильтры и счётчики,
// главная кнопка строки и меню, даты, Excel. Один запрос без фильтров — всё считается здесь, по загруженным строкам.

/** BrokerInvoiceStatus: 0 черновик, 1 выставлен, 2 оплачен, 3 аннулирован. */
export const ST_DRAFT = 0
export const ST_ISSUED = 1
export const ST_PAID = 2
export const ST_CANCELLED = 3

export type BillingKindFilter = 'all' | BrokerInvoiceKind
export const KIND_FILTERS: BillingKindFilter[] = ['all', 'invoice', 'act']

export type BillingStatusFilter = 'all' | 'draft' | 'issued' | 'paid' | 'cancelled'
/** Порядок сегментов статуса. Аннулированные раньше нельзя было отфильтровать. */
export const STATUS_FILTERS: BillingStatusFilter[] = ['all', 'draft', 'issued', 'paid', 'cancelled']
const STATUS_OF: Record<Exclude<BillingStatusFilter, 'all'>, number> = {
  draft: ST_DRAFT, issued: ST_ISSUED, paid: ST_PAID, cancelled: ST_CANCELLED,
}

/** «0214/2026»; у черновика номера нет — пустая строка. */
export const docNumber = (r: Pick<BrokerInvoice, 'number' | 'year'>): string => (r.number ? `${r.number}/${r.year}` : '')

/** Поиск: клиент, номер (и «N/ГГГГ», и «N»), номер заявки, заметка. */
export const matchesBilling = (q: string, r: BrokerInvoice): boolean =>
  matchesQuery(q, [r.clientName, docNumber(r), r.caseNumber, r.note])

export const inKind = (r: BrokerInvoice, k: BillingKindFilter): boolean => k === 'all' || r.kind === k
export const inStatus = (r: BrokerInvoice, s: BillingStatusFilter): boolean => s === 'all' || r.status === STATUS_OF[s]

export const filterBilling = (
  rows: BrokerInvoice[], q: string, kind: BillingKindFilter, status: BillingStatusFilter,
): BrokerInvoice[] => rows.filter((r) => inKind(r, kind) && inStatus(r, status) && matchesBilling(q, r))

/** Счётчики сегментов статуса: по найденному с учётом вида (сам сегмент статуса не учитывается). */
export function statusCounts(rows: BrokerInvoice[], q: string, kind: BillingKindFilter): Record<BillingStatusFilter, number> {
  const out: Record<BillingStatusFilter, number> = { all: 0, draft: 0, issued: 0, paid: 0, cancelled: 0 }
  for (const r of rows) {
    if (!inKind(r, kind) || !matchesBilling(q, r)) continue
    for (const s of STATUS_FILTERS) if (inStatus(r, s)) out[s]++
  }
  return out
}

/**
 * Срок оплаты хранится датой (полночь UTC) — берём дату из строки как есть, без сдвига пояса:
 * иначе западнее Гринвича «срок 15.10» стал бы 14.10.
 */
export const dueDay = (v: string | null | undefined): string | null => (v ? /^\d{4}-\d{2}-\d{2}/.exec(v)?.[0] ?? null : null)

/** Просрочен: выставлен (не оплачен), срок оплаты раньше сегодняшнего дня. Сегодняшний срок — ещё не просрочен. */
export function isOverdue(r: Pick<BrokerInvoice, 'status' | 'dueDateUtc'>, now: Date = new Date()): boolean {
  const due = dueDay(r.dueDateUtc)
  return r.status === ST_ISSUED && !!due && due < todayIso(now)
}

/** На сколько дней просрочен (0 — не просрочен). */
export function overdueDays(r: Pick<BrokerInvoice, 'status' | 'dueDateUtc'>, now: Date = new Date()): number {
  if (!isOverdue(r, now)) return 0
  const [y, m, d] = dueDay(r.dueDateUtc)!.split('-').map(Number)
  const from = Date.UTC(y, m - 1, d)
  const to = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((to - from) / 86_400_000)
}

export interface BillingStats {
  issuedSum: number
  issuedCount: number
  paidSum: number
  paidCount: number
  awaitingSum: number
  awaitingCount: number
  overdueCount: number
  drafts: number
}

/**
 * Показатели по всем строкам (без поиска и фильтров). Суммы — только по счетам: акт закрывает ту же услугу,
 * и в суммах она считалась бы дважды. Черновики — число всех черновиков, и счетов, и актов.
 */
export function billingStats(rows: BrokerInvoice[], now: Date = new Date()): BillingStats {
  const s: BillingStats = { issuedSum: 0, issuedCount: 0, paidSum: 0, paidCount: 0, awaitingSum: 0, awaitingCount: 0, overdueCount: 0, drafts: 0 }
  for (const r of rows) {
    if (r.status === ST_DRAFT) s.drafts++
    if (r.kind !== 'invoice') continue
    if (r.status === ST_ISSUED || r.status === ST_PAID) { s.issuedSum += r.total; s.issuedCount++ }
    if (r.status === ST_PAID) { s.paidSum += r.total; s.paidCount++ }
    if (r.status === ST_ISSUED) {
      s.awaitingSum += r.total
      s.awaitingCount++
      if (isOverdue(r, now)) s.overdueCount++
    }
  }
  return s
}

export type BillingAction = 'issue' | 'markPaid' | 'remind' | 'pdf' | 'delete' | 'cancel'

/**
 * Главная кнопка строки (только при праве записи — проверяет экран): черновик — «Выставить»; выставленный счёт
 * с чеком клиента — «Отметить оплату», без чека — «Напомнить»; выставленный акт — «Отметить оплату».
 */
export function primaryAction(r: BrokerInvoice): 'issue' | 'markPaid' | 'remind' | null {
  if (r.status === ST_DRAFT) return 'issue'
  if (r.status !== ST_ISSUED) return null
  if (r.kind === 'act') return 'markPaid'
  return (r.paymentChecks ?? []).length ? 'markPaid' : 'remind'
}

/**
 * Пункты меню «⋯»: PDF — всем; остальное — при праве записи и тех же условиях, что раньше:
 * «Напомнить» — выставленный счёт (акт не оплачивают), «Отметить оплату» — выставленный документ,
 * «Удалить черновик» — черновик, «Аннулировать» — выставленный или оплаченный. Главная кнопка в меню не повторяется.
 */
export function menuActions(r: BrokerInvoice, canWrite: boolean): BillingAction[] {
  const out: BillingAction[] = ['pdf']
  if (!canWrite) return out
  const primary = primaryAction(r)
  if (r.status === ST_ISSUED && r.kind !== 'act' && primary !== 'remind') out.push('remind')
  if (r.status === ST_ISSUED && primary !== 'markPaid') out.push('markPaid')
  if (r.status === ST_DRAFT) out.push('delete')
  if (r.status === ST_ISSUED || r.status === ST_PAID) out.push('cancel')
  return out
}

const TONE: Record<number, ZTone> = { [ST_DRAFT]: 'neutral', [ST_ISSUED]: 'info', [ST_PAID]: 'done', [ST_CANCELLED]: 'danger' }
export const statusTone = (s: number): ZTone => TONE[s] ?? 'neutral'

const STATUS_KEY: Record<number, string> = { [ST_DRAFT]: 'draft', [ST_ISSUED]: 'issued', [ST_PAID]: 'paid', [ST_CANCELLED]: 'cancelled' }
export const statusLabelKey = (s: number): string => `broker.billing.status.${STATUS_KEY[s] ?? 'draft'}`

type T = (k: string, p?: Record<string, unknown>) => string

/** «Счёт № 0214/2026» / «Акт № 0098/2026»; без номера — «Черновик» (у акта — «Черновик акта»). */
export function docTitle(r: BrokerInvoice, t: T): string {
  const no = docNumber(r)
  if (!no) return t(r.kind === 'act' ? 'broker.billing.doc.draftAct' : 'broker.billing.doc.draft')
  return t(r.kind === 'act' ? 'broker.billing.doc.act' : 'broker.billing.doc.invoice', { no })
}

/** Имя PDF — как раньше: «Счёт-0214.pdf», «Акт-0098.pdf», без номера — «…-черновик.pdf». */
export const pdfFileName = (r: BrokerInvoice, t: T): string =>
  `${t(r.kind === 'act' ? 'broker.billing.file.act' : 'broker.billing.file.invoice')}-${r.number || t('broker.billing.file.draft')}.pdf`

/** Excel: отфильтрованные строки; колонки и порядок — как раньше, заголовки из i18n. */
export function billingExcelRows(rows: BrokerInvoice[], t: T, statusText: (s: number) => string): Record<string, unknown>[] {
  return rows.map((r) => ({
    [t('billing.colDoc')]: r.kind === 'act' ? t('billing.act') : t('billing.invoice'),
    [t('broker.billing.xls.number')]: docNumber(r),
    [t('billing.colClient')]: r.clientName,
    [t('billing.case')]: r.caseNumber ?? '',
    [t('billing.colStatus')]: statusText(r.status),
    [t('billing.colTotal')]: r.total,
    [t('billing.vat')]: r.vatAmount,
    [t('billing.issuedAtCol')]: r.issuedAtUtc ? formatDay(r.issuedAtUtc) : '',
    [t('billing.paidAtCol')]: r.paidAtUtc ? formatDay(r.paidAtUtc) : '',
  }))
}
