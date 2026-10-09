// «В Excel» (волна 6б, новое): все товары ДТ с ключевыми графами — по строке на товар, числа — числами (Excel
// считает суммы сам). Заголовки — на языке интерфейса. Выгрузка — общая exportXlsx брокерских списков.
import type { Import40GoodsItemInput } from '@/types/api'
import { exportXlsx } from '@/views/broker/list'
import { goodsTpin } from './goodsList'

type T = (key: string) => string

export const GOODS_EXPORT_COLUMNS = [
  'n', 'code', 'description', 'country', 'quantity', 'unit', 'gross', 'net', 'places', 'invoice', 'currency', 'kzt45', 'usd46', 'tpin',
] as const
export type GoodsExportColumn = (typeof GOODS_EXPORT_COLUMNS)[number]

const unitText = (g: Import40GoodsItemInput) => [g.unitCode, g.unit].filter((s) => !!s && String(s).trim()).join(' — ')

const cell = (g: Import40GoodsItemInput, index: number, col: GoodsExportColumn): string | number | null => {
  switch (col) {
    case 'n': return index + 1
    case 'code': return g.tnvedCode || null
    case 'description': return g.description || null
    case 'country': return g.countryOfOrigin || null
    case 'quantity': return g.quantity ?? null
    case 'unit': return unitText(g) || null
    case 'gross': return g.grossWeightKg ?? null
    case 'net': return g.netWeightKg ?? null
    case 'places': return g.cargoPlacesQuantity ?? g.packagesCount ?? null
    case 'invoice': return g.customsValue ?? null
    case 'currency': return g.currency || null
    case 'kzt45': return g.customsValueKzt ?? null
    case 'usd46': return g.statisticValueUsd ?? null
    case 'tpin': return goodsTpin(g)
  }
}

/** Строки листа: ключ — заголовок столбца (broker.dt.goods.export.cols.*). */
export function goodsExportRows(items: readonly Import40GoodsItemInput[], t: T): Record<string, unknown>[] {
  const heads = GOODS_EXPORT_COLUMNS.map((c) => t(`broker.dt.goods.export.cols.${c}`))
  return items.map((g, i) => Object.fromEntries(GOODS_EXPORT_COLUMNS.map((c, ci) => [heads[ci], cell(g, i, c)])))
}

/** Файл «Товары_ДТ_<номер>_ГГГГ-ММ-ДД.xlsx» (номер ДТ — без «/»). */
export function exportGoodsXlsx(items: readonly Import40GoodsItemInput[], t: T, dtNumber?: string | null): Promise<void> {
  const base = t('broker.dt.goods.export.file')
  const num = (dtNumber ?? '').replace(/[^\p{L}\p{N}-]+/gu, '_').replace(/^_+|_+$/g, '')
  return exportXlsx(num ? `${base}_${num}` : base, t('broker.dt.goods.export.sheet'), goodsExportRows(items, t))
}
