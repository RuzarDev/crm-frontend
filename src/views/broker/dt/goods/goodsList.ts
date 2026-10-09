// Список товаров ДТ (волна 6б): строки таблицы с позицией и ключом, поиск и фильтры по статусу, ТПиН товара,
// итоги раздела и номера товаров для текстов («Удалить товары 1–3, 6?»). Чистые функции — без Vue-компонентов.
import type { Import40GoodsItemInput } from '@/types/api'
import { calendarLocale } from '@/ui/date'
import { placesOfGoods } from '@/utils/goodsPlaces'
import { matchesQuery } from '@/views/broker/list'
import { isErrorStatus, type GoodsStatus } from './goodsStatus'
import { keyOf } from './useDtGoods'

type Goods = Import40GoodsItemInput

/** Строка списка: сам товар (не копия), его позиция в форме (с 0) и стабильный ключ. */
export interface GoodsRow {
  item: Goods
  index: number
  key: number
}

/** «С ошибками» — не хватает данных или кода нет в справочнике; «Пересчитать» — платежи устарели; null — все. */
export type GoodsFilter = 'missing' | 'stale' | null

export interface GoodsFilterOptions {
  query: string
  filter: GoodsFilter
  statusOf: (g: Goods) => GoodsStatus
}

/** Поля поиска: код ТН ВЭД, описание (инвойса и ТН ВЭД), марка, знак, модель, артикул, изготовитель. */
const searchParts = (g: Goods) => [
  g.tnvedCode, g.description, g.tnvedDescription, g.tradeMarkName, g.productMarkName, g.productModelName, g.productArticle,
  g.manufacturerName,
]

/** Строки списка по запросу и фильтру; порядок — как в форме. */
export function filterGoods(items: readonly Goods[], o: GoodsFilterOptions): GoodsRow[] {
  const rows: GoodsRow[] = []
  items.forEach((item, index) => {
    if (o.filter) {
      const s = o.statusOf(item)
      if (o.filter === 'missing' ? !isErrorStatus(s) : s.kind !== o.filter) return
    }
    if (!matchesQuery(o.query, searchParts(item))) return
    rows.push({ item, index, key: keyOf(item) })
  })
  return rows
}

const round = (n: number, digits: number) => {
  const f = 10 ** digits
  return Math.round(n * f) / f
}
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** ТПиН товара — сумма строк гр. 47, ₸; строк нет — null (в таблице «—»). */
export function goodsTpin(g: Pick<Goods, 'payments'>): number | null {
  const rows = g.payments ?? []
  if (!rows.length) return null
  return round(rows.reduce((s, p) => s + num(p.amountKzt), 0), 2)
}

export interface GoodsTotals {
  count: number
  /** Места — как сервер (гр. 6): места груза товара, затем «кол-во мест». */
  places: number
  gross: number
  net: number
  /** Фактурная стоимость по валютам (обычно одна — гр. 22); порядок — первого появления. '' — валюта не указана. */
  invoice: { currency: string; amount: number }[]
  /** Σ гр. 45, ₸. */
  kzt45: number
  /** Σ гр. 47 всех товаров, ₸. */
  tpin: number
}

/** Итоги раздела «Товары» (строка внизу). */
export function goodsTotals(items: readonly Goods[]): GoodsTotals {
  let places = 0
  let gross = 0
  let net = 0
  let kzt45 = 0
  let tpin = 0
  const invoice = new Map<string, number>()
  for (const g of items) {
    places += num(placesOfGoods(g))
    gross += num(g.grossWeightKg)
    net += num(g.netWeightKg)
    kzt45 += num(g.customsValueKzt)
    tpin += goodsTpin(g) ?? 0
    if (typeof g.customsValue === 'number') {
      const cur = (g.currency ?? '').trim()
      invoice.set(cur, (invoice.get(cur) ?? 0) + g.customsValue)
    }
  }
  return {
    count: items.length,
    places: round(places, 4),
    gross: round(gross, 4),
    net: round(net, 4),
    invoice: [...invoice].map(([currency, amount]) => ({ currency, amount: round(amount, 2) })),
    kzt45: round(kzt45, 2),
    tpin: round(tpin, 2),
  }
}

/** Номера товаров (позиции с 0 → номера с 1) для текстов: подряд идущие — диапазоном «1–3, 6, 8–9». */
export function formatItemNumbers(indexes: readonly number[]): string {
  const sorted = [...new Set(indexes)].sort((a, b) => a - b).map((i) => i + 1)
  const parts: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]
    let end = start
    while (i + 1 < sorted.length && sorted[i + 1] === end + 1) end = sorted[++i]
    parts.push(end === start ? String(start) : `${start}–${end}`)
  }
  return parts.join(', ')
}

const moneyFormats = new Map<string, Intl.NumberFormat>()
/** Сумма с двумя знаками по языку интерфейса («25 000,00»), пробелы — неразрывные. */
export function formatMoney(n: number, locale = 'ru'): string {
  const tag = calendarLocale(locale)
  let f = moneyFormats.get(tag)
  if (!f) {
    f = new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    moneyFormats.set(tag, f)
  }
  return f.format(n).replace(/[\u202F\u00A0 ]/g, '\u00A0')
}
