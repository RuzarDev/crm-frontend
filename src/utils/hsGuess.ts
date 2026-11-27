import type { Composer } from 'vue-i18n'
import type { Import40ExtractionResult } from '@/api/import40'
import type { FromDocumentsResult } from '@/api/autoTransit'

/** Товар без кода в документах и код, который предполагает Zircon AI (hs_guess, 27.11.2026). В графу не подставляется. */
export interface HsGuessRow { name: string; code: string }

const NAME_MAX = 40
const shortName = (s: string | null | undefined) => {
  const v = (s ?? '').replace(/\s+/g, ' ').trim()
  return v.length > NAME_MAX ? `${v.slice(0, NAME_MAX - 1)}…` : v
}

/** «870323» → «8703 23», «8703801090» → «8703 80 109 0» (как код пишут в гр. 33). */
export function formatHsGuess(code: string): string {
  const d = code.replace(/\D/g, '')
  return [d.slice(0, 4), d.slice(4, 6), d.slice(6, 9), d.slice(9)].filter(Boolean).join(' ')
}

/** «Импорт 40»: extras.goods[i].hsGuess (сервер отдаёт только у товаров без кода), название — из declaration.goodsItems[i]. */
export function hsGuessesFromImport40(result: Pick<Import40ExtractionResult, 'declaration' | 'extras'> | null | undefined): HsGuessRow[] {
  const items = result?.declaration?.goodsItems ?? []
  return (result?.extras?.goods ?? []).flatMap((g, i) =>
    g?.hsGuess && !items[i]?.tnvedCode ? [{ name: shortName(items[i]?.description), code: g.hsGuess }] : [])
}

/** Авто-транзит: hsGuesses[].index — номер товара в data.goods. */
export function hsGuessesFromAutoTransit(result: Pick<FromDocumentsResult, 'data' | 'hsGuesses'> | null | undefined): HsGuessRow[] {
  const goods = result?.data?.goods ?? []
  return (result?.hsGuesses ?? []).map((h) => ({ name: shortName(goods[h.index]?.description), code: h.code }))
}

const SHOWN = 10

/** Одна строка для окна замечаний; нет догадок — null. */
export function hsGuessText(rows: readonly HsGuessRow[], t: Composer['t']): string | null {
  if (!rows.length) return null
  const list = rows.slice(0, SHOWN).map((r, i) =>
    t('hsGuess.item', { name: r.name || t('hsGuess.noName', { n: i + 1 }), code: formatHsGuess(r.code) })).join('; ')
  const more = rows.length > SHOWN ? ` ${t('hsGuess.more', { n: rows.length - SHOWN })}` : ''
  return t('hsGuess.line', { list: list + more })
}
