// «Из документов» (19.10.2026): какие документы заявки можно отдать в распознавание и какие отметить сразу.
import type { Import40ExtractionDocument, Import40FileDto } from '@/api/import40'

/**
 * Форматы «Из документов»: как прежний выбор файлов с диска и ещё Excel .xls (пакет импорта 21.10) — его читает разбор в
 * браузере, в Zircon AI он не уходит (сервер сохраняет файл в заявку).
 */
export const EXTRACT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx,.xlsx,.xls'
const EXTRACTABLE = /\.(pdf|jpe?g|png|docx|xlsx?)$/i

/** Разделы заявки с документами поставки: документы клиента, сканы с границы, прежние пакеты «Из документов». */
const SECTIONS: ReadonlySet<string> = new Set(['documents', 'border-scans', 'extraction-batch'])

/** Документы заявки, подходящие для распознавания (доверенности, счета СВХ, чеки и отметки — нет). */
export function extractableCaseFiles(files: readonly Import40FileDto[]): Import40FileDto[] {
  // Каждая неудачная попытка оставляет в заявке копии пакета (04.11.2026): одно имя и размер — один документ, остаётся новый.
  const unique = new Map<string, Import40FileDto>()
  for (const f of files) {
    if (!SECTIONS.has(f.section) || !EXTRACTABLE.test(f.originalFileName)) continue
    const key = `${f.originalFileName}\n${f.sizeBytes}`
    const seen = unique.get(key)
    if (!seen || f.createdAtUtc > seen.createdAtUtc) unique.set(key, f)
  }
  return [...unique.values()]
}

/** Что отметить сразу: инвойс и упаковочный лист из чек-листа; если таких нет — все Excel из документов клиента. */
export function preselectedIds(files: readonly Import40FileDto[]): string[] {
  const byKind = files.filter((f) => f.docKind === 'invoice' || f.docKind === 'packing')
  if (byKind.length) return byKind.map((f) => f.id)
  return files.filter((f) => f.section === 'documents' && /\.xlsx?$/i.test(f.originalFileName)).map((f) => f.id)
}

/** Разные номера инвойсов пакета (без учёта порядка документов). */
export const invoiceNumbers = (documents?: readonly Import40ExtractionDocument[] | null): string[] => [...new Set(
  (documents ?? [])
    .filter((d) => d.kind === 'invoice')
    .map((d) => d.number?.trim() ?? '')
    .filter(Boolean),
)]
