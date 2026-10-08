import type { ZTone } from '@/components/z/ZTag.vue'
import type { BrokerInvoice } from '@/api/billing'
import type { ClientCard, ClientCardCase, ClientCardDoc, ClientCardProfile } from '@/api/clientCard'
import type { ClientStatus } from '@/api/clientsOnboarding'
import type { ReestrEntry } from '@/types/api'
import { matchesQuery } from '@/views/broker/list'
import { stageTone } from '@/views/broker/requests/requests'
import { billingStats } from '@/views/broker/finance/billing'
import { DATA_KEY } from '@/views/broker/transit/transit'
import { docStatusLabelKey, docStatusTone } from './clients'

// Чистая логика карточки клиента /clients/:id (редизайн, волна 4а): вкладки, показатели, документы, заявки.

/**
 * «Действует на основании»: у клиента без профиля (updatedAtUtc == null) сервер собирает пустой профиль
 * с основанием по умолчанию «устава» — это не данные клиента, показываем «—».
 */
export const directorBasisOf = (p: Pick<ClientCardProfile, 'directorBasis' | 'updatedAtUtc'>): string =>
  p.updatedAtUtc == null ? '—' : p.directorBasis || '—'

// ---- Вкладки ----
export type ClientCardTab = 'overview' | 'cases' | 'transit' | 'docs' | 'invoices'
export const CLIENT_CARD_TABS: ClientCardTab[] = ['overview', 'cases', 'transit', 'docs', 'invoices']

/** Вкладки по правам: «Транзит» — reestr.read, «Счета» — finance.read. */
export const availableTabs = (can: { reestr: boolean; finance: boolean }): ClientCardTab[] =>
  CLIENT_CARD_TABS.filter((k) => (k === 'transit' ? can.reestr : k === 'invoices' ? can.finance : true))

/** ?tab= из адреса: неизвестная или недоступная по правам вкладка — «Обзор». */
export const resolveTab = (raw: unknown, available: ClientCardTab[]): ClientCardTab => {
  const v = Array.isArray(raw) ? raw[0] : raw
  return available.find((k) => k === v) ?? 'overview'
}

/** Статус аккаунта клиента: строка карточки — тот же ClientStatus, что в списке «Клиенты». */
export const accountStatusOf = (c: Pick<ClientCard, 'status'>): ClientStatus => c.status as ClientStatus

/** Вид клиента в шапке: компания, а без неё логин. */
export const cardTitle = (c: Pick<ClientCard, 'companyName' | 'username'>): string => c.companyName || c.username

// ---- Заявки ----
/** Тон тега статуса заявки: проблема — красный, иначе этап (как в списке заявок). */
export const caseTone = (c: Pick<ClientCardCase, 'status' | 'isProblem'>): ZTone => (c.isProblem ? 'danger' : stageTone(c.status))

/** Поиск по заявкам клиента: номер, груз, пост. */
export const matchesCase = (q: string, c: ClientCardCase): boolean => matchesQuery(q, [c.number, c.cargo, c.post])

/** Последние заявки для обзора: новые сверху (сервер отдаёт так же, но не полагаемся на порядок). */
export const recentCases = (cases: ClientCardCase[], n = 3): ClientCardCase[] =>
  [...cases].sort((a, b) => (a.createdAtUtc < b.createdAtUtc ? 1 : a.createdAtUtc > b.createdAtUtc ? -1 : 0)).slice(0, n)

// ---- Документы ----
/** «Подписать за AQNIET» нужно этому документу: договор, клиент подписал, AQNIET — нет. */
export const awaitingAqniet = (d: Pick<ClientCardDoc, 'kind' | 'status' | 'clientSigned' | 'providerSigned'>): boolean =>
  d.kind === 'contract' && d.status === 1 && d.clientSigned && !d.providerSigned

/** Тег состояния документа: у действующего — «Истекает» (30 дней) и «Истёк» (срок прошёл), иначе как в «Клиентах». */
export function docTag(d: Pick<ClientCardDoc, 'status' | 'daysLeft' | 'expiringSoon'>): { tone: ZTone; labelKey: string } {
  if (d.status === 2 && d.daysLeft !== null && d.daysLeft < 0) return { tone: 'danger', labelKey: 'admin.istek' }
  if (d.status === 2 && d.expiringSoon) return { tone: 'wait', labelKey: 'broker.clientCard.doc.expiring' }
  return { tone: docStatusTone(d.status), labelKey: docStatusLabelKey(d.status) }
}

/**
 * «Выпустить новую»: доверенность действующая (2), срок которой истекает в ближайшие 30 дней или уже вышел, либо истёкшая (3).
 * Отозванной (4), черновику и ждущей подписи — нет.
 */
export const canRenewPoa = (d: Pick<ClientCardDoc, 'kind' | 'status' | 'daysLeft' | 'expiringSoon'>): boolean =>
  d.kind === 'poa' && (d.status === 3 || (d.status === 2 && (d.expiringSoon || (d.daysLeft !== null && d.daysLeft < 0))))

const RANK = (d: ClientCardDoc): number => (d.status === 2 && !(d.daysLeft !== null && d.daysLeft < 0) ? 0 : d.status === 1 ? 1 : 2)

/**
 * Что показать в обзоре: по одному «текущему» документу каждого вида — действующий, иначе ждущий подписи,
 * иначе самый свежий (сервер отдаёт от новых к старым). Остальное — на вкладке «Документы».
 */
export function currentDocs(docs: ClientCardDoc[]): ClientCardDoc[] {
  const pick = (kind: ClientCardDoc['kind']) => {
    const own = docs.filter((d) => d.kind === kind)
    return own.reduce<ClientCardDoc | null>((best, d) => (!best || RANK(d) < RANK(best) ? d : best), null)
  }
  return [pick('contract'), pick('poa')].filter((d): d is ClientCardDoc => d !== null)
}

// ---- Транзит ----
/** Что искать в «Транзите» по клику на запись: номер контейнера, а без него № записи; нет обоих — null. */
export function transitQuery(e: Pick<ReestrEntry, 'data'>): string | null {
  const container = (e.data[DATA_KEY.container] ?? '').trim()
  if (container) return container
  return (e.data[DATA_KEY.no] ?? '').trim() || null
}

// ---- Счета ----
/** Счета именно этого клиента (на случай, если сервер фильтр по клиенту не применил). */
export const invoicesOf = (clientId: string, rows: BrokerInvoice[]): BrokerInvoice[] => rows.filter((r) => r.clientId === clientId)

export interface Unpaid { sum: number; count: number; overdue: number }
/** «Не оплачено»: выставленные счета (акты и черновики не считаются), из них просроченные. */
export function unpaidOf(rows: BrokerInvoice[], now: Date = new Date()): Unpaid {
  const s = billingStats(rows, now)
  return { sum: s.awaitingSum, count: s.awaitingCount, overdue: s.overdueCount }
}

// ---- Контакт и реквизиты ----
export interface ContactRow { key: 'name' | 'position' | 'phone' | 'email'; value: string }
/** Контакт клиента: только заполненные строки. */
export function contactRows(p: Pick<ClientCardProfile, 'contactPersonName' | 'contactPersonPosition' | 'contactPhone' | 'contactEmail'>): ContactRow[] {
  const rows: ContactRow[] = [
    { key: 'name', value: p.contactPersonName },
    { key: 'position', value: p.contactPersonPosition },
    { key: 'phone', value: p.contactPhone },
    { key: 'email', value: p.contactEmail },
  ]
  return rows.filter((r) => (r.value ?? '').trim() !== '').map((r) => ({ ...r, value: r.value.trim() }))
}
