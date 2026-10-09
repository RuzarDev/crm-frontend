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

const BLANK = String.raw`(?:\s|&nbsp;|\u00a0|<br\s*\/?>|<p\b[^>]*>(?:\s|&nbsp;|\u00a0|<br\s*\/?>)*<\/p>)`
const LEADING = new RegExp(`^${BLANK}+`, 'i')
const TRAILING = new RegExp(`${BLANK}+$`, 'i')

/**
 * Текст графы приходит с отступом из &nbsp;, пустыми абзацами и <br> по краям (на adilet.zan.kz перед текстом стоит
 * <br><p><img></p><br>) — убираем, чтобы абзацы не «ползли» вправо и над текстом не было пустого места.
 */
export function tidyGuideHtml(html: string): string {
  return html
    .replace(/(<(?:p|li|td|th|div)\b[^>]*>)(?:\s|&nbsp;| )+/gi, '$1')
    .replace(/<p\b[^>]*>(?:\s|&nbsp;| |<br\s*\/?>)*<\/p>/gi, '')
    .replace(LEADING, '')
    .replace(TRAILING, '')
}

/**
 * Картинка графы не загрузилась (внешний адрес недоступен): прячем её, а абзац, в котором не осталось
 * ничего видимого, — вместе с ней, иначе над текстом остаётся пустой зазор.
 */
export function hideBrokenImage(img: HTMLElement): void {
  img.hidden = true
  img.style.display = 'none'
  const p = img.parentElement
  if (!p || p.tagName !== 'P') return
  const visible = Array.from(p.childNodes).some((n) =>
    n.nodeType === 3 ? (n.textContent ?? '').replace(/[\s\u00a0]+/g, '') !== ''
      : n.nodeType === 1 && (n as HTMLElement).tagName !== 'BR' && !(n as HTMLElement).hidden)
  if (!visible) p.hidden = true
}
