import type { Import40CaseDto } from '@/api/import40'

// Названия ДТ (23.10.2026, задача владельца: в заявке бывает до 7 ДТ, «ДТ 1 … ДТ 7» не различить).
// Подпись ДТ = короткий идентификатор (рег. номер или «ДТ {позиция}») + название: своё (title, сервер хранит отдельно от
// PUT ДТ) или автоназвание — описание первого товара гр. 31 (до ~40 знаков по слову, «· ещё N» при нескольких товарах),
// иначе номер инвойса из гр. 44 (04021), иначе названия нет — остаётся «ДТ {позиция}» или номер, как раньше.

type T = (k: string, p?: Record<string, unknown>) => string

/** Длина своего названия (колонка Title на сервере, varchar(200)). */
export const DT_TITLE_MAX = 200
/** Длина начала описания товара в автоназвании. */
const AUTO_LEN = 40
/** Вид документа гр. 44 «Инвойс» (классификатор 2009). */
const INVOICE_CODE = '04021'

interface TitleGoods { description?: string | null }
interface TitleDoc44 { docTypeCode?: string | null; docNumber?: string | null }
/** Что нужно для названия: подходят и DTO ДТ (список заявки), и форма страницы ДТ. */
export interface DtTitleSource {
  title?: string | null
  goodsItems?: readonly TitleGoods[] | null
  doc44Items?: readonly TitleDoc44[] | null
}

const squash = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** Всё заглавными (гр. 31 так и пишут) — как предложение: «КУШЕТКА С …» → «Кушетка с …». Иначе как есть. */
const sentence = (s: string) => (/\p{Ll}/u.test(s) ? s : s.charAt(0) + s.slice(1).toLocaleLowerCase('ru'))

const TAIL_PUNCT = /[\s,.;:·–—-]+$/u

/**
 * Начало текста до max знаков целыми словами и «…» (знак препинания в конце слова не считается); висящий предлог или
 * союз в конце («… высоты и…») отбрасывается; первое слово длиннее max — режется по max.
 */
export function clipWords(s: string, max = AUTO_LEN): string {
  const text = squash(s)
  if (text.length <= max) return text
  let head = ''
  for (const word of text.split(' ')) {
    const next = head ? `${head} ${word}` : word
    if (next.replace(TAIL_PUNCT, '').length > max) break
    head = next
  }
  if (!head) return `${text.slice(0, max)}…`
  head = head.replace(TAIL_PUNCT, '')
  if (head.includes(' ')) head = head.replace(/\s+[\p{L}\d]{1,2}$/u, '').replace(TAIL_PUNCT, '')
  return `${head}…`
}

/**
 * Автоназвание ДТ: «Кушетка с винтовой регулировкой… · ещё 1» (первый товар с описанием, N — остальные товары ДТ),
 * без описаний — «Инвойс № …» (гр. 44, 04021), иначе null.
 */
export function dtAutoTitle(d: DtTitleSource, t: T): string | null {
  const goods = d.goodsItems ?? []
  const first = goods.find((g) => squash(g.description))
  if (first) {
    const head = clipWords(sentence(squash(first.description)))
    const more = goods.length - 1
    return more > 0 ? `${head} · ${t('import40Case.dtTitle.more', { n: more })}` : head
  }
  const invoice = (d.doc44Items ?? []).find((x) => squash(x.docTypeCode) === INVOICE_CODE && squash(x.docNumber))
  return invoice ? t('import40Case.dtTitle.invoice', { n: squash(invoice.docNumber) }) : null
}

/** Название для показа: своё (auto=false) или автоназвание (auto=true, показывается приглушённым); text=null — нет. */
export function dtTitleOf(d: DtTitleSource, t: T): { text: string | null; auto: boolean } {
  const own = squash(d.title)
  return own ? { text: own, auto: false } : { text: dtAutoTitle(d, t), auto: true }
}

/** Короткий идентификатор: рег. номер или «ДТ i» (i — место в списке ДТ заявки; порядок сервера — по созданию). */
export const dtShortId = (c: Pick<Import40CaseDto, 'declarations'>, declarationId: string, t: T): string => {
  const i = c.declarations.findIndex((d) => d.id === declarationId)
  const dt = i >= 0 ? c.declarations[i] : null
  return dt?.declarationNumber || t('import40Case.dtFallback', { n: i >= 0 ? i + 1 : '?' })
}

/** Строка подписи: «ДТ 1 · Кушетка с винтовой регулировкой… · ещё 1»; без названия — «ДТ 1» или номер. */
export const dtLabelOf = (shortId: string, title: string | null): string => (title ? `${shortId} · ${title}` : shortId)

/** Подпись для узких мест (выпадающие списки, запросы таможни): то же, своё длинное название — с обрезкой. */
export const clipLabel = (label: string, max = 72): string => clipWords(label, max)
