import type { ZTone } from '@/components/z/ZTag.vue'
import {
  SALES_QUOTE_STATUS_CODES,
  type SalesCalcGoodsLine, type SalesCalcGoodsResult, type SalesCalcServiceLine, type SalesQuoteListItem, type SalesServiceItem,
} from '@/api/sales'
import type { TnvedTariffOptionDto } from '@/types/api'
import { formatMoney, roundTo } from '@/ui/number'
import { matchesQuery } from '@/views/broker/list'

// Чистая логика «Продаж» (редизайн, волна 3б, доски Sales и Quotes): строки расчёта, тело запроса,
// признак устаревшего результата, суммы «Итога», фильтр и статусы КП.

type T = (k: string, p?: Record<string, unknown>) => string

/** Строка услуги в форме: _k — ключ строки в таблице, на сервер не уходит. */
export interface ServiceRow extends SalesCalcServiceLine { _k: number }
/** Строка товара в форме: _k — ключ строки в таблице, на сервер не уходит. */
export interface GoodsRow extends SalesCalcGoodsLine {
  _k: number
  weightKg: number | null
  unit: string
}

/** Сумма строки услуги — как на сервере (SalesCalculatorService): цена × кол-во × (1 − скидка/100), до копеек. */
export const serviceLineTotal = (l: Pick<SalesCalcServiceLine, 'unitPrice' | 'quantity' | 'discountPercent'>): number =>
  roundTo((l.unitPrice || 0) * (l.quantity || 0) * (1 - (l.discountPercent || 0) / 100), 2)

/** Тело /sales/calculate и /sales/quotes (строки): без служебного _k. */
export function buildPayload(services: ServiceRow[], goods: GoodsRow[]): { services: SalesCalcServiceLine[]; goods: SalesCalcGoodsLine[] } {
  return {
    services: services.map(({ _k, ...rest }) => rest),
    goods: goods.map(({ _k, ...rest }) => rest),
  }
}

/** Отпечаток строк расчёта — сравнивается с отпечатком на момент расчёта. */
export const payloadKey = (p: ReturnType<typeof buildPayload>): string => JSON.stringify(p)

/** Результат устарел: расчёт был, а строки с тех пор изменились. Без расчёта — не устарел (его просто нет). */
export const isStale = (calculatedKey: string | null, currentKey: string): boolean =>
  calculatedKey !== null && calculatedKey !== currentKey

/** Прайс для выбора: только действующие услуги (раньше в списке были и выключенные). */
export const activeServices = (list: SalesServiceItem[]): SalesServiceItem[] => list.filter((s) => s.isActive)

export interface TpinBreakdown { duty: number; antiDumping: number; excise: number; vat: number; fee: number }

/** Расшифровка таможенных платежей «Итога» — суммы по товарам. */
export function tpinBreakdown(goods: SalesCalcGoodsResult[]): TpinBreakdown {
  const out: TpinBreakdown = { duty: 0, antiDumping: 0, excise: 0, vat: 0, fee: 0 }
  for (const g of goods) {
    out.duty += g.importDutyKzt || 0
    out.antiDumping += g.antiDumpingKzt || 0
    out.excise += g.exciseKzt || 0
    out.vat += g.vatKzt || 0
    out.fee += g.customsFeeKzt || 0
  }
  return out
}

export const hasAntiDumping = (goods: SalesCalcGoodsResult[]): boolean => goods.some((g) => (g.antiDumpingKzt ?? 0) > 0)

/** Текст ошибки товара: «{код или «Товар»}: {ошибка сервера}». */
export const goodsErrorText = (g: Pick<SalesCalcGoodsResult, 'code' | 'error'>, t: T): string =>
  `${g.code || t('broker.sales.goodsFallback')}: ${g.error ?? ''}`


const rateFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
/** Курс НБ РК: до двух знаков, «482,61»; пробелы — неразрывные, как у formatMoney. */
export const formatRate = (n: number): string => rateFormat.format(n).replace(/[  ]/g, ' ')

/** Варианты вида акциза (КЕДЕН): ставка — условие. */
export const exciseChoices = (opts: TnvedTariffOptionDto[] | null | undefined): { value: string; label: string }[] =>
  (opts ?? []).map((o) => ({ value: o.key, label: `${o.rate} — ${o.condition ?? ''}` }))

/** Варианты антидемпинга (КЕДЕН): первым — «Не начислять» (значение ''), дальше ставка (страна) — условие. */
export const antiDumpingChoices = (opts: TnvedTariffOptionDto[] | null | undefined, t: T): { value: string; label: string }[] => [
  { value: '', label: t('dt.tariffAntiDumpingNone') },
  ...(opts ?? []).map((o) => ({ value: o.key, label: `${o.rate} (${o.country ?? ''}) — ${o.condition ?? ''}` })),
]

/** Блок КЕДЕН у товара: есть пояснение, выбор вида акциза (вариантов больше одного) или антидемпинг. */
export const hasKedenBlock = (g: SalesCalcGoodsResult): boolean =>
  !!g.notes || (g.exciseOptions?.length ?? 0) > 1 || (g.antiDumpingOptions?.length ?? 0) > 0

// ---- КП ----

const QUOTE_TONE: ZTone[] = ['neutral', 'info', 'done', 'danger']
export const quoteTone = (s: number): ZTone => QUOTE_TONE[s] ?? 'neutral'
/** Ключ подписи статуса КП; неизвестный статус — пустая строка (экран покажет «—»). */
export const quoteStatusKey = (s: number): string => {
  const code = SALES_QUOTE_STATUS_CODES[s]
  return code ? `enum.salesQuoteStatus.${code}` : ''
}

/** «0037/КП/2026». */
export const quoteNumber = (q: Pick<SalesQuoteListItem, 'number' | 'year'>, t: T): string => t('sales.kpNumber', { n: q.number, y: q.year })

/** Поиск по клиенту и номеру («0037», «0037/2026», «0037/КП/2026»). */
export const matchesQuote = (query: string, q: SalesQuoteListItem, t: T): boolean =>
  matchesQuery(query, [q.clientName, q.number, `${q.number}/${q.year}`, quoteNumber(q, t)])

/** Поиск и статус (null — все). */
export const filterQuotes = (rows: SalesQuoteListItem[], query: string, status: number | null, t: T): SalesQuoteListItem[] =>
  rows.filter((q) => (status === null || q.status === status) && matchesQuote(query, q, t))

/** Подпись вкладки КП: администратор и руководитель отдела видят все КП, менеджер — свои (как на сервере). */
export const seesAllQuotes = (role: string | null | undefined, isRop: boolean): boolean =>
  (role ?? '').trim().toLowerCase() === 'administrator' || isRop
