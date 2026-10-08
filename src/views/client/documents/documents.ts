import { isDocumentEffective, type Import40DocumentDto } from '@/api/import40Contract'
import type { ClientCaseFile } from '@/api/clientDocuments'
import { isDocKind } from '@/views/client/docKinds'
import { historyStatus, isOpen, sortDocs, type HistoryStatus } from '@/views/client/company/company'

// «Документы» клиента (редизайн, волна 2b, доска Documents): чистые правила — без Vue, проверяются отдельно.

/** Подпись вида файла — ключ i18n: вид из чек-листа заявки, иначе по разделу заявки. */
const SECTION_KEY: Record<string, string> = {
  'svh-invoice': 'client.documents.section.svhInvoice',
  'declaration-stamp': 'client.documents.section.stamp',
  'payment-check': 'client.documents.section.check',
  'power-of-attorney': 'client.documents.section.poa',
  documents: 'client.documents.section.doc',
}
export function fileKindKey(f: Pick<ClientCaseFile, 'docKind' | 'section'>): string {
  if (isDocKind(f.docKind)) return `client.docKind.${f.docKind}.name`
  return SECTION_KEY[f.section] ?? 'client.documents.section.doc'
}

const timeOf = (v: string) => {
  const ms = Date.parse(v)
  return Number.isNaN(ms) ? 0 : ms
}

/**
 * Свежие сверху; при равной дате — по номеру поставки и имени, чтобы порядок не «прыгал» между загрузками.
 * Даты сравниваем как моменты (Date.parse), а не строки: «…Z» и «…+05:00» или разная точность долей секунды
 * в строках сортировались бы неверно.
 */
export function sortFiles(files: ClientCaseFile[]): ClientCaseFile[] {
  return [...files].sort((a, b) =>
    timeOf(b.createdAtUtc) - timeOf(a.createdAtUtc)
    || b.caseNumber.localeCompare(a.caseNumber, undefined, { numeric: true })
    || a.fileName.localeCompare(b.fileName))
}

/** Строка для поиска: регистр, пробелы и ё/е не различаются («счёт» находится по «счет»). */
export const normSearch = (s: string | null | undefined) =>
  (s ?? '').toLocaleLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()

export type FileFilter = 'all' | 'aqniet' | 'client'
export const FILE_FILTERS: FileFilter[] = ['all', 'aqniet', 'client']
export const isFileFilter = (v: unknown): v is FileFilter => typeof v === 'string' && (FILE_FILTERS as string[]).includes(v)
export const passesFilter = (f: ClientCaseFile, filter: FileFilter) =>
  filter === 'all' || (filter === 'client' ? f.fromClient : !f.fromClient)

export type CompanyCardStatus = HistoryStatus | 'none'
export interface CompanyCard {
  doc: Import40DocumentDto | null
  status: CompanyCardStatus
  /** Документ действует, а более новый ждёт подписи — подсказка «Новая на подписи». */
  newAwaiting: boolean
}

/**
 * Состояние раздела от сервера (GET import40/can-create через useClientRegistration) — тот же источник,
 * что у шагов «Моей компании» и плашки регистрации. null — не загружено: судим только по документам.
 */
export interface CompanyCardReg {
  /** contractDone / poaDone: документ годится для новой поставки. */
  done: boolean
  /** Договор подписан клиентом, ждём подпись AQNIET (contractAwaitingUs). */
  awaitingUs?: boolean
}

/**
 * Карточка договора / доверенности на «Документах»:
 * - готово по серверу → действующий документ («Действует», его номер и срок); если более новый ждёт подписи —
 *   подсказка «Новая на подписи»;
 * - не готово → ждущий подписи («На подписи»), иначе свежий неотозванный: действующий по датам документ,
 *   который сервер не принимает (разовый занят открытой поставкой), — не «Действует»;
 * - состояние сервера неизвестно → по документам: действующий, иначе ждущий подписи, иначе свежий неотозванный.
 * Нет документов — «Нет».
 */
export function companyCard(docs: Import40DocumentDto[], reg: CompanyCardReg | null = null, now = Date.now()): CompanyCard {
  const sorted = sortDocs(docs)
  const effective = sorted.find((d) => isDocumentEffective(d)) ?? null
  const open = sorted.find(isOpen) ?? null
  const fallback = sorted.find((d) => d.status !== 4) ?? sorted[0] ?? null
  // sortDocs — свежие сверху: меньший индекс = новее.
  const newerOpen = !!(open && effective && sorted.indexOf(open) < sorted.indexOf(effective))

  if (reg && !reg.done) {
    if (open) return { doc: open, status: 'awaiting', newAwaiting: false }
    const doc = effective ?? fallback
    if (!doc) return { doc: null, status: 'none', newAwaiting: false }
    let status = reg.awaitingUs ? 'awaiting' : historyStatus(doc, now)
    if (status === 'effective') status = doc.isSingleUse ? 'consumed' : 'expired'
    return { doc, status, newAwaiting: false }
  }

  if (effective && (reg?.done || historyStatus(effective, now) === 'effective')) {
    return { doc: effective, status: 'effective', newAwaiting: newerOpen }
  }
  const doc = open ?? fallback
  return { doc, status: doc ? historyStatus(doc, now) : 'none', newAwaiting: false }
}
