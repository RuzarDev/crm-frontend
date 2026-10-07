import type { Import40CaseDto } from '@/api/import40'
import type { BrokerInvoice } from '@/api/billing'
import { isCompleted } from '@/utils/import40Steps'
import { greetingName } from '@/views/home/greeting'

// Расчёты «Главной» клиента (макет Client.dc): что нужно от клиента, поставки в работе, счёт к оплате.

const CANCELLED = 9
const DRAFT = 0
const INVOICED = 6
const PAID = 7

export type ClientAskKind = 'problem' | 'draft' | 'payCheck'
export interface ClientAsk {
  kind: ClientAskKind
  caseId: string
  number: string
  cargo: string
  message: string
}

/**
 * Ход за клиентом — те же три случая, что считает сервер в «Нужно ваше действие» (GetImport40Dashboard):
 * проблема, черновик (не отправлен или возвращён), счёт СВХ ждёт чека. Закрытые заявки — без вопросов.
 */
export function clientAskFor(c: Import40CaseDto): ClientAsk | null {
  if (isCompleted(c.status)) return null
  const base = { caseId: c.id, number: c.number, cargo: c.cargo }
  if (c.isProblem) return { ...base, kind: 'problem', message: c.problemClientMessage ?? '' }
  if (c.status === DRAFT) return { ...base, kind: 'draft', message: c.returnReason ?? '' }
  if (c.status === INVOICED) return { ...base, kind: 'payCheck', message: '' }
  return null
}

const ASK_ORDER: Record<ClientAskKind, number> = { problem: 0, payCheck: 1, draft: 2 }
const updatedDesc = (a: Import40CaseDto, b: Import40CaseDto) => Date.parse(b.updatedAtUtc) - Date.parse(a.updatedAtUtc)

/** Все вопросы к клиенту: сначала проблемы, потом оплата склада, потом черновики; внутри — свежие сверху. */
export function clientAsks(cases: Import40CaseDto[]): ClientAsk[] {
  return [...cases]
    .sort(updatedDesc)
    .map(clientAskFor)
    .filter((a): a is ClientAsk => !!a)
    .sort((a, b) => ASK_ORDER[a.kind] - ASK_ORDER[b.kind])
}

/** Поставки в работе: не выполненные и не отменённые, последние изменения сверху. */
export const activeShipments = (cases: Import40CaseDto[]): Import40CaseDto[] =>
  cases.filter((c) => !isCompleted(c.status) && c.status !== CANCELLED).sort(updatedDesc)

export type ShipmentTone = 'info' | 'wait' | 'done' | 'danger' | 'pay'

/** Цвет статуса на карточке поставки: проблема, ждёт клиента, оплата, выпущено, в работе. */
export const shipmentTone = (c: Import40CaseDto): ShipmentTone =>
  c.isProblem ? 'danger'
  : c.status === DRAFT ? 'wait'
  : c.status === INVOICED || c.status === PAID ? 'pay'
  : c.status >= 4 ? 'done'
  : 'info'

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
