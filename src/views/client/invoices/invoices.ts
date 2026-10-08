import type { BillingRequisites, BrokerInvoice } from '@/api/billing'

// «Счета» клиента (редизайн, волна 2b, доска Invoices): группы списка, выбор по умолчанию, даты и реквизиты.

export type InvoiceGroupKey = 'toPay' | 'paid' | 'acts' | 'cancelled'
export interface InvoiceGroup {
  key: InvoiceGroupKey
  items: BrokerInvoice[]
}

const time = (v: string | null | undefined, empty: number) => {
  const n = v ? new Date(v).getTime() : NaN
  return Number.isNaN(n) ? empty : n
}

/** Счёт выставлен и ждёт оплаты — его можно оплатить и приложить чек. */
export const isPayable = (i: BrokerInvoice) => i.kind === 'invoice' && i.status === 1

/**
 * Группы списка по доске: «К оплате» (ближайший срок первым, без срока — в конце), «Оплаченные» и «Акты»
 * (свежие первыми). Аннулированные счета — отдельной группой в конце: молча прятать выставленный счёт нельзя,
 * клиент мог его уже видеть в письме. Черновики клиенту сервер не отдаёт; на всякий случай отсекаем и здесь.
 * Пустые группы не возвращаются.
 */
export function groupInvoices(list: BrokerInvoice[]): InvoiceGroup[] {
  const live = list.filter((i) => i.status !== 0)
  const byDue = (a: BrokerInvoice, b: BrokerInvoice) =>
    time(a.dueDateUtc, Infinity) - time(b.dueDateUtc, Infinity) || time(a.issuedAtUtc, 0) - time(b.issuedAtUtc, 0)
  const newest = (field: 'paidAtUtc' | 'issuedAtUtc') => (a: BrokerInvoice, b: BrokerInvoice) =>
    time(b[field] ?? b.issuedAtUtc, 0) - time(a[field] ?? a.issuedAtUtc, 0)

  const groups: InvoiceGroup[] = [
    { key: 'toPay', items: live.filter(isPayable).sort(byDue) },
    { key: 'paid', items: live.filter((i) => i.kind === 'invoice' && i.status === 2).sort(newest('paidAtUtc')) },
    { key: 'acts', items: live.filter((i) => i.kind === 'act').sort(newest('issuedAtUtc')) },
    { key: 'cancelled', items: live.filter((i) => i.kind === 'invoice' && i.status === 3).sort(newest('issuedAtUtc')) },
  ]
  return groups.filter((g) => g.items.length > 0)
}

/** По умолчанию — первый счёт «К оплате», иначе первый в списке. */
export const defaultInvoiceId = (groups: InvoiceGroup[]): string | null =>
  groups.find((g) => g.key === 'toPay')?.items[0]?.id ?? groups[0]?.items[0]?.id ?? null

/** «0214/2026»; без номера (у выставленного так не бывает) — прочерк. */
export const invoiceNo = (i: BrokerInvoice) => (i.number ? `${i.number}/${i.year}` : '—')

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Срок оплаты хранится как дата (полночь UTC) — берём дату из строки как есть, без сдвига пояса:
 * иначе западнее Гринвича «до 15.10» превратилось бы в «до 14.10».
 */
export function dueDayMonth(v: string | null | undefined): string {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null
  return m ? `${m[3]}.${m[2]}` : ''
}

/** Срок оплаты прошёл (сравнение дат, сегодняшний срок — ещё не просрочен). */
export function isOverdue(v: string | null | undefined, now = new Date()): boolean {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null
  if (!m) return false
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `${m[1]}-${m[2]}-${m[3]}` < today
}

/** «ДД.ММ» / «ДД.ММ.ГГГГ» момента (выставлен, оплачен, чек загружен) — по местному времени. */
export function localDate(v: string | null | undefined, withYear = false): string {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  const dm = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`
  return withYear ? `${dm}.${d.getFullYear()}` : dm
}

export type RequisiteKey = 'recipient' | 'bin' | 'bank' | 'iik' | 'bik' | 'kbe'

/**
 * Строки «Реквизитов для оплаты». Без получателя, БИН, ИИК, БИК или КБе платёж не оформить — тогда null
 * (экран просит уточнить у бухгалтера, а не рисует таблицу с дырами). Пустой банк просто не показывается.
 */
export function requisiteRows(r: BillingRequisites | null): Array<{ key: RequisiteKey; value: string }> | null {
  if (!r) return null
  const v = (s: string | null | undefined) => (s ?? '').trim()
  if (!(v(r.shortName) || v(r.companyName)) || !v(r.bin) || !v(r.iik) || !v(r.bik) || !v(r.kbe)) return null
  const rows: Array<{ key: RequisiteKey; value: string }> = [
    { key: 'recipient', value: v(r.shortName) || v(r.companyName) },
    { key: 'bin', value: v(r.bin) },
    { key: 'bank', value: v(r.bank) },
    { key: 'iik', value: v(r.iik) },
    { key: 'bik', value: v(r.bik) },
    { key: 'kbe', value: v(r.kbe) },
  ]
  return rows.filter((row) => row.value)
}

export type InvoiceStateKey = 'checkReview' | 'overdue' | 'due' | 'awaiting' | 'paid' | 'cancelled' | 'act'
export type InvoiceStateTone = 'pay' | 'danger' | 'wait' | 'done' | 'neutral'

/**
 * Состояние счёта для карточки и тега панели. Чек приложен к неоплаченному счёту — «на проверке» главнее срока:
 * клиент своё сделал, ждём бухгалтера. date — уже готовая «ДД.ММ» (или пусто).
 */
export function invoiceState(i: BrokerInvoice, now = new Date()): { key: InvoiceStateKey; date: string; tone: InvoiceStateTone } {
  if (i.status === 3) return { key: 'cancelled', date: '', tone: 'neutral' }
  if (i.kind === 'act') return { key: 'act', date: localDate(i.issuedAtUtc), tone: 'neutral' }
  if (i.status === 2) return { key: 'paid', date: localDate(i.paidAtUtc), tone: 'done' }
  if ((i.paymentChecks ?? []).length) return { key: 'checkReview', date: '', tone: 'pay' }
  const due = dueDayMonth(i.dueDateUtc)
  if (!due) return { key: 'awaiting', date: '', tone: 'wait' }
  return isOverdue(i.dueDateUtc, now) ? { key: 'overdue', date: due, tone: 'danger' } : { key: 'due', date: due, tone: 'wait' }
}
