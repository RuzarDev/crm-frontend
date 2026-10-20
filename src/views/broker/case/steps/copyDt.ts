// «Копировать ДТ» (20.10.2026): ДТ-образцы клиента в окне — поиск и подпись строки.
import type { Import40CopySource } from '@/api/import40'

const norm = (s: string | null | undefined) => (s ?? '').toLocaleLowerCase('ru-RU')

/** Поиск по номеру заявки, номеру ДТ, отправителю и первому товару; пустой запрос — все. */
export function filterCopySources(rows: readonly Import40CopySource[], query: string): Import40CopySource[] {
  const q = norm(query).trim()
  if (!q) return [...rows]
  return rows.filter((r) =>
    [r.caseNumber, r.declarationNumber, r.senderName, r.firstGoodsDescription].some((v) => norm(v).includes(q)))
}

/** Что выбрать сразу: единственную ДТ этой заявки, иначе свежую ДТ прошлой заявки (список уже свежими сверху). */
export function defaultCopySource(rows: readonly Import40CopySource[], caseId: string): string | null {
  const own = rows.filter((r) => r.caseId === caseId)
  if (own.length === 1) return own[0].id
  return rows.find((r) => r.caseId !== caseId)?.id ?? rows[0]?.id ?? null
}
