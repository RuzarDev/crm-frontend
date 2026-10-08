import type { ZTone } from '@/components/z/ZTag.vue'
import type { FinanceRow } from '@/api/manage'
import { formatDay, matchesQuery } from '@/views/broker/list'

// Чистая логика обзора «Финансы» (редизайн, волна 3б): фильтры и счётчики, тон этапа, состояние оплаты, Excel.
// Показатели над таблицей считает сервер за период; поиск и фильтр оплаты — на клиенте, по загруженным строкам.

/** Import40Status: 6 — счёт СВХ выставлен, 7 — СВХ оплачен (ждёт счёта AQNIET), 8 — выполнена, 9 — отменена. */
export const STATUS_INVOICED = 6
export const STATUS_PAID = 7
export const STATUS_DONE = 8
export const STATUS_CANCELLED = 9

export type FinanceFilter = 'all' | 'awaiting' | 'paid' | 'invoiced'
/** Порядок сегментов над таблицей. */
export const FINANCE_FILTERS: FinanceFilter[] = ['all', 'awaiting', 'paid', 'invoiced']

/** Заявка оплатила СВХ и ждёт счёта AQNIET (аудит §4.4: отдельный список бухгалтера). */
export const isAwaitingAqniet = (r: FinanceRow): boolean => r.status === STATUS_PAID

/** Поиск: номер, клиент, груз (без учёта регистра и пробелов). */
export const matchesFinance = (q: string, r: FinanceRow): boolean => matchesQuery(q, [r.number, r.clientName, r.cargo])

export const inFilter = (r: FinanceRow, f: FinanceFilter): boolean => {
  switch (f) {
    case 'awaiting': return r.status === STATUS_INVOICED && !r.paymentConfirmed
    case 'paid': return r.paymentConfirmed
    case 'invoiced': return !!r.invoicedAtUtc || r.status >= STATUS_INVOICED
    default: return true
  }
}

export const filterFinance = (rows: FinanceRow[], q: string, f: FinanceFilter): FinanceRow[] =>
  rows.filter((r) => inFilter(r, f) && matchesFinance(q, r))

/** Счётчики сегментов: по найденному (поиск учтён, сегмент нет) — видно, где совпадения. */
export function filterCounts(rows: FinanceRow[], q: string): Record<FinanceFilter, number> {
  const out: Record<FinanceFilter, number> = { all: 0, awaiting: 0, paid: 0, invoiced: 0 }
  for (const r of rows) {
    if (!matchesFinance(q, r)) continue
    for (const f of FINANCE_FILTERS) if (inFilter(r, f)) out[f]++
  }
  return out
}

/** Тон этапа: проблема — danger; 6 и 7 — ждут; 8 — готово; 9 (отменена) — нейтральный, не зелёный; прочее — info. */
export function stageTone(r: Pick<FinanceRow, 'status' | 'isProblem'>): ZTone {
  if (r.isProblem) return 'danger'
  if (r.status === STATUS_INVOICED || r.status === STATUS_PAID) return 'wait'
  if (r.status === STATUS_DONE) return 'done'
  if (r.status === STATUS_CANCELLED) return 'neutral'
  return 'info'
}

export type PaymentState =
  | { kind: 'paid'; date: string | null }
  | { kind: 'check' }
  | { kind: 'wait' }
  | { kind: 'none' }

/** Оплата клиента: оплачено (с датой) → чек на проверке → ждёт оплаты (счёт выставлен) → ничего. */
export function paymentState(r: FinanceRow): PaymentState {
  if (r.paymentConfirmed) return { kind: 'paid', date: r.paidAtUtc }
  if (r.hasPaymentCheck) return { kind: 'check' }
  if (r.status === STATUS_INVOICED) return { kind: 'wait' }
  return { kind: 'none' }
}

const PAY_TONE: Record<PaymentState['kind'], ZTone | null> = { paid: 'done', check: 'pay', wait: 'wait', none: null }
export const paymentTone = (s: PaymentState): ZTone | null => PAY_TONE[s.kind]

/** Подпись оплаты: «Оплачено 27.09» / «Чек на проверке» / «Ждёт оплаты»; нет — пустая строка. */
export function paymentLabel(s: PaymentState, t: (k: string, p?: Record<string, unknown>) => string): string {
  switch (s.kind) {
    case 'paid': return s.date ? t('broker.finance.pay.paidOn', { date: formatDay(s.date) }) : t('broker.finance.pay.paid')
    case 'check': return t('broker.finance.pay.check')
    case 'wait': return t('broker.finance.pay.wait')
    default: return ''
  }
}

/** Что показать в ячейке «Счёт СВХ»: есть ли вообще счёт (дата выставления или заметка). */
export const hasInvoice = (r: FinanceRow): boolean => !!r.invoicedAtUtc || !!r.svhInvoiceNote

/** Excel: отфильтрованные строки; колонки и порядок — как раньше, заголовки из i18n. */
export function financeExcelRows(
  rows: FinanceRow[],
  t: (k: string) => string,
  statusLabel: (id: number) => string,
): Record<string, unknown>[] {
  return rows.map((r) => ({
    [t('admin.nomer')]: r.number,
    [t('admin.klient')]: r.clientName,
    [t('admin.gruz')]: r.cargo,
    [t('admin.status')]: statusLabel(r.status),
    [t('admin.schetSvh2')]: r.svhInvoiceAmount ?? '',
    [t('admin.scheta')]: r.svhInvoiceNumber,
    [t('admin.zametkaPoSchetu')]: r.svhInvoiceNote,
    [t('admin.schetVystavlen')]: r.invoicedAtUtc ? formatDay(r.invoicedAtUtc) : '',
    [t('admin.oplata')]: r.paymentConfirmed
      ? t('admin.oplacheno2')
      : r.hasPaymentCheck
        ? t('admin.chekNaProverke')
        : r.status === STATUS_INVOICED ? t('admin.zhdetOplaty') : '',
    [t('admin.oplacheno')]: r.paidAtUtc ? formatDay(r.paidAtUtc) : '',
    [t('admin.tamozhPlatezhiGrv')]: r.customsPaymentsKzt,
    [t('admin.dt')]: r.declarationsCount,
    [t('admin.sozdana')]: formatDay(r.createdAtUtc),
  }))
}
