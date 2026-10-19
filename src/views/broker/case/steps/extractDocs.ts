// «Из документов» (19.10.2026): какие документы заявки можно отдать в распознавание и какие отметить сразу.
import type { Import40FileDto } from '@/api/import40'

/** Форматы, которые принимает распознавание (как прежний выбор файлов с диска). */
export const EXTRACT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx,.xlsx'
const EXTRACTABLE = /\.(pdf|jpe?g|png|docx|xlsx)$/i

/** Разделы заявки с документами поставки: документы клиента, сканы с границы, прежние пакеты «Из документов». */
const SECTIONS: ReadonlySet<string> = new Set(['documents', 'border-scans', 'extraction-batch'])

/** Документы заявки, подходящие для распознавания (доверенности, счета СВХ, чеки и отметки — нет). */
export function extractableCaseFiles(files: readonly Import40FileDto[]): Import40FileDto[] {
  return files.filter((f) => SECTIONS.has(f.section) && EXTRACTABLE.test(f.originalFileName))
}

/** Что отметить сразу: инвойс и упаковочный лист из чек-листа; если таких нет — все Excel из документов клиента. */
export function preselectedIds(files: readonly Import40FileDto[]): string[] {
  const byKind = files.filter((f) => f.docKind === 'invoice' || f.docKind === 'packing')
  if (byKind.length) return byKind.map((f) => f.id)
  return files.filter((f) => f.section === 'documents' && /\.xlsx$/i.test(f.originalFileName)).map((f) => f.id)
}
