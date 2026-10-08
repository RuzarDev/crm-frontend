import type { Import40DocumentDto } from '@/api/import40Contract'
import type { ClientCaseFile } from '@/api/clientDocuments'
import { isDocKind } from '@/views/client/docKinds'
import { currentDoc, historyStatus, sortDocs, type HistoryStatus } from '@/views/client/company/company'

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

/** Свежие сверху; при равной дате — по номеру поставки и имени, чтобы порядок не «прыгал» между загрузками. */
export function sortFiles(files: ClientCaseFile[]): ClientCaseFile[] {
  return [...files].sort((a, b) =>
    b.createdAtUtc.localeCompare(a.createdAtUtc)
    || b.caseNumber.localeCompare(a.caseNumber, undefined, { numeric: true })
    || a.fileName.localeCompare(b.fileName))
}

export type FileFilter = 'all' | 'aqniet' | 'client'
export const FILE_FILTERS: FileFilter[] = ['all', 'aqniet', 'client']
export const isFileFilter = (v: unknown): v is FileFilter => typeof v === 'string' && (FILE_FILTERS as string[]).includes(v)
export const passesFilter = (f: ClientCaseFile, filter: FileFilter) =>
  filter === 'all' || (filter === 'client' ? f.fromClient : !f.fromClient)

export type CompanyCardStatus = HistoryStatus | 'none'
export interface CompanyCard {
  doc: Import40DocumentDto | null
  status: CompanyCardStatus
}

/**
 * Карточка договора / доверенности: актуальный документ (ждёт подписи или действует — как в «Моей компании»),
 * иначе свежий неотозванный (истёкший, израсходованный разовый), иначе свежий отозванный. Нет документов — «Нет».
 */
export function companyCard(docs: Import40DocumentDto[]): CompanyCard {
  const sorted = sortDocs(docs)
  const doc = currentDoc(docs) ?? sorted.find((d) => d.status !== 4) ?? sorted[0] ?? null
  return { doc, status: doc ? historyStatus(doc) : 'none' }
}
