import type { DtGuideEntry } from '@/types/api'

// Порядок заполнения ДТ: поиск по графам и очистка текста. Без Vue — проверяется отдельно.

const PREFIX = /^(?:гр(?:афа)?\.?|box|№|n)\s*/i
const norm = (s: string): string => s.toLocaleLowerCase('ru').replace(/\s+/g, ' ').trim()

/**
 * Поиск по номеру графы и названию (текст графы и разметка в поиске не участвуют).
 * Номер — с начала («3» находит 3, 30–39…; «гр. 31», «графа 31» — тоже), точное совпадение номера — первым;
 * название — по вхождению, без учёта регистра. Остальной порядок — как у сервера.
 */
export function filterGuide(entries: DtGuideEntry[], query: string): DtGuideEntry[] {
  const q = norm(query)
  if (!q) return entries
  const num = q.replace(PREFIX, '')
  const exact: DtGuideEntry[] = []
  const rest: DtGuideEntry[] = []
  for (const e of entries) {
    const g = norm(e.graph)
    if (num && g === num) exact.push(e)
    else if ((num && g.startsWith(num)) || norm(e.title).includes(q)) rest.push(e)
  }
  return [...exact, ...rest]
}

/** Текст графы приходит с отступом из &nbsp; и пустыми абзацами — убираем, чтобы абзацы не «ползли» вправо. */
export function tidyGuideHtml(html: string): string {
  return html
    .replace(/(<(?:p|li|td|th|div)\b[^>]*>)(?:\s|&nbsp;| )+/gi, '$1')
    .replace(/<p\b[^>]*>(?:\s|&nbsp;| |<br\s*\/?>)*<\/p>/gi, '')
}
