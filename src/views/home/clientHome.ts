import type { ClientShipment } from '@/api/clientShipments'
import type { BrokerInvoice } from '@/api/billing'
import { askFor, type AskKind } from '@/views/client/shipment'
import { greetingName } from '@/views/home/greeting'

// Расчёты «Главной» клиента (макет Client.dc): что нужно от клиента, поставки в работе, счёт к оплате.
// Чей ход и тег поставки — общие правила views/client/shipment.ts.

const ASK_ORDER: Record<AskKind, number> = { problem: 0, returned: 1, paySvh: 2, draft: 3 }
const updatedDesc = (a: ClientShipment, b: ClientShipment) => Date.parse(b.updatedAtUtc) - Date.parse(a.updatedAtUtc)

/** Поставки, где ход за клиентом: проблемы, возвраты, оплата склада, черновики; внутри — свежие сверху. */
export function clientAsks(list: ClientShipment[]): ClientShipment[] {
  return list
    .filter((s) => askFor(s))
    .sort(updatedDesc)
    .sort((a, b) => ASK_ORDER[askFor(a)!] - ASK_ORDER[askFor(b)!])
}

/** Поставки в работе: не выполненные и не отменённые, последние изменения сверху. */
export const activeShipments = (list: ClientShipment[]): ClientShipment[] =>
  list.filter((s) => s.status < 8).sort(updatedDesc)

const issuedTime = (i: BrokerInvoice) => Date.parse(i.issuedAtUtc ?? i.createdAtUtc)

/** Выставленные и не оплаченные счета брокера, самый ранний — первым. */
export const unpaidInvoices = (list: BrokerInvoice[]): BrokerInvoice[] =>
  list.filter((i) => i.kind === 'invoice' && i.status === 1).sort((a, b) => issuedTime(a) - issuedTime(b))

/** «ДД.ММ» по местному времени. */
export function dayMonth(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Организационно-правовые формы: у клиента отображаемое имя при регистрации = название компании.
const LEGAL_FORMS = new Set(['тоо', 'ип', 'ао', 'пк', 'кх', 'too', 'llp', 'llc', 'jsc', 'ip', 'жшс', 'ақ', 'жк'])

/**
 * Имя для приветствия клиента. Саморегистрация и приглашение пишут в отображаемое имя название компании —
 * «Добрый день, ТОО» звучало бы нелепо, поэтому такое имя не используем.
 */
export function clientGreetingName(displayName: string | null | undefined, companyName: string | null | undefined): string {
  const display = (displayName ?? '').trim()
  if (!display) return ''
  if (display.toLowerCase() === (companyName ?? '').trim().toLowerCase()) return ''
  const first = greetingName(display)
  if (LEGAL_FORMS.has(first.toLowerCase().replace(/[^\p{L}]/gu, ''))) return ''
  if (/[«"“]/.test(first)) return ''
  return first
}
