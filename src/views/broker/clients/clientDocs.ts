import type { ClientDocumentRow } from '@/api/clientCard'
import { docStatusLabelKey } from './clients'
import { formatDay, matchesQuery } from '@/views/broker/list'

// Чистая логика реестра «Документы клиентов» (редизайн, волна 3б): фильтры, счётчики, срок действия, Excel.
// Тоны и подписи статуса документа — те же, что у списка «Клиенты» (clients.ts).

export type DocKind = 'all' | 'contract' | 'poa'
export type DocState = 'all' | 'active' | 'expiring' | 'awaiting' | 'aqniet'
export const DOC_KINDS: DocKind[] = ['all', 'contract', 'poa']
/** Порядок состояний над таблицей; «Ждут AQNIET» показывается только тем, кто может подписывать. */
export const DOC_STATES: DocState[] = ['all', 'active', 'expiring', 'awaiting', 'aqniet']

/** Договор: клиент подписал, AQNIET — нет (договор не отозван и не истёк). */
export const needsAqniet = (r: Pick<ClientDocumentRow, 'kind' | 'status' | 'clientSigned' | 'providerSigned'>): boolean => r.kind === 'contract' && r.status === 1 && r.clientSigned && !r.providerSigned

const inState = (r: ClientDocumentRow, state: DocState): boolean => {
  switch (state) {
    case 'active': return r.status === 2
    case 'expiring': return r.expiringSoon
    case 'awaiting': return r.status === 1
    case 'aqniet': return needsAqniet(r)
    default: return true
  }
}

/** Поиск: клиент, email, номер документа («14» и «14/2026»). */
export const matchesDoc = (q: string, r: ClientDocumentRow): boolean =>
  matchesQuery(q, [r.clientName, r.clientEmail, r.number, `${r.number}/${r.year}`])

const inKind = (r: ClientDocumentRow, kind: DocKind): boolean => kind === 'all' || r.kind === kind

export const filterDocs = (rows: ClientDocumentRow[], q: string, kind: DocKind, state: DocState): ClientDocumentRow[] =>
  rows.filter((r) => inKind(r, kind) && inState(r, state) && matchesDoc(q, r))

/** Счётчики состояний: по найденному (поиск и вид учтены, состояние нет) — видно, где совпадения. */
export function stateCounts(rows: ClientDocumentRow[], q: string, kind: DocKind): Record<DocState, number> {
  const out: Record<DocState, number> = { all: 0, active: 0, expiring: 0, awaiting: 0, aqniet: 0 }
  for (const r of rows) {
    if (!inKind(r, kind) || !matchesDoc(q, r)) continue
    for (const s of DOC_STATES) if (inState(r, s)) out[s]++
  }
  return out
}

const STATE_LABEL: Record<DocState, string> = {
  all: 'broker.list.all',
  active: 'broker.clientDocs.state.active',
  expiring: 'broker.clientDocs.state.expiring',
  awaiting: 'broker.clientDocs.state.awaiting',
  aqniet: 'broker.clientDocs.state.aqniet',
}
export const stateLabelKey = (s: DocState): string => STATE_LABEL[s]
const KIND_LABEL: Record<DocKind, string> = {
  all: 'broker.clientDocs.kind.all',
  contract: 'broker.clientDocs.kind.contract',
  poa: 'broker.clientDocs.kind.poa',
}
export const kindLabelKey = (k: DocKind): string => KIND_LABEL[k]

/** Срок действия: дата и пояснение под ней. */
export interface Validity {
  /** ДД.ММ.ГГГГ или «—», если даты нет. */
  date: string
  hint: { kind: 'left' | 'overdue' | 'unlimited'; n: number; soon: boolean } | null
}

/**
 * «осталось 84 дн.» / «просрочен 7 дн.» (срок прошёл; статус при этом сервер сам не меняет);
 * «без срока» — только у действующего документа без даты: у черновика и ждущего подписи срока ещё нет.
 */
export function validity(r: Pick<ClientDocumentRow, 'status' | 'validUntilUtc' | 'daysLeft' | 'expiringSoon'>): Validity {
  if (!r.validUntilUtc) return { date: '—', hint: r.status === 2 ? { kind: 'unlimited', n: 0, soon: false } : null }
  const date = formatDay(r.validUntilUtc)
  if (r.daysLeft === null) return { date, hint: null }
  if (r.daysLeft < 0) return { date, hint: { kind: 'overdue', n: -r.daysLeft, soon: false } }
  return { date, hint: { kind: 'left', n: r.daysLeft, soon: r.expiringSoon } }
}

/** Строки Excel: заголовки из i18n, все разные (имя клиента и подпись клиента — разные колонки). */
export function docExcelRows(rows: ClientDocumentRow[], t: (k: string) => string): Record<string, unknown>[] {
  const yn = (v: boolean) => t(v ? 'clientDocs.yes' : 'clientDocs.no')
  return rows.map((r) => ({
    [t('broker.clientDocs.col.client')]: r.clientName,
    [t('broker.clientDocs.xlsEmail')]: r.clientEmail,
    [t('broker.clientDocs.col.doc')]: t(r.kind === 'contract' ? 'admin.dogovor' : 'admin.doverennost'),
    [t('broker.clientDocs.xlsNumber')]: `${r.number}/${r.year}`,
    [t('broker.clientDocs.col.status')]: t(docStatusLabelKey(r.status)),
    [t('broker.clientDocs.singleUse')]: yn(r.isSingleUse),
    [t('broker.clientDocs.xlsClientSigned')]: yn(r.clientSigned),
    [t('broker.clientDocs.xlsProviderSigned')]: yn(r.providerSigned),
    [t('broker.clientDocs.xlsValidUntil')]: r.validUntilUtc ? formatDay(r.validUntilUtc) : '',
    [t('broker.clientDocs.xlsDaysLeft')]: r.daysLeft ?? '',
  }))
}
