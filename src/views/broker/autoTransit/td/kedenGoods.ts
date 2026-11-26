// «Товары для КЕДЕН» (этап 4, спека 2026-11-26; раунд 2 — по живой проверке 26.11): таблица товаров ПИ / ТД партии для окна
// «Импорт из файла» списка товаров ПИ в КЕДЕН — без строки заголовков, столбцы в порядке KEDEN_GOODS_COLUMNS. Чистые функции: строки, проверка, TSV (буфер обмена), .xlsx (все ячейки
// текстом — код ТН ВЭД не теряет ведущие нули и не становится числом). Числа — как сохранены, без округления.
import type { TotalsCheck } from '@/api/autoTransit'
import type { ReestrGoodsItemInput } from '@/types/api'
import type { RecordDraft } from '@/views/broker/transit/record/recordModel'
import { loadXlsx } from '@/utils/xlsx'
import { totalsMismatch } from './tdModel'

/** Что нужно от формы: товары, места и контейнеры партии. Подходит и RecordDraft, и сохранённая ТД (dataToDraft). */
export type KedenGoodsSource = Pick<RecordDraft, 'goods' | 'packages' | 'containers'> & {
  /** Валюта ТД: подставляется товару без своей валюты. У сохранённой ТД и RecordDraft есть, в тестах может не быть. */
  transit?: { docCurrencyCode?: string | null } | null
}
export interface KedenTable { header: string[]; rows: string[][] }

/**
 * Столбцы по порядку (живая проверка в КЕДЕН 26.11): КЕДЕН заголовков не распознаёт — у каждого столбца брокер выбирает
 * «тип» вручную (есть галочка «Сохранить схему граф для импорта»); первая строка считается товаром, поэтому в данных
 * заголовков нет. name — наше название (лист «Схема», окно), kedenType — тип столбца в КЕДЕН.
 */
export const KEDEN_GOODS_COLUMNS = [
  { name: 'Код ТН ВЭД', kedenType: '*Код ТН ВЭД' },
  { name: 'Описание товара', kedenType: '*Коммерческое описание товара' },
  { name: 'Страна происхождения', kedenType: 'Страна происхождения' },
  { name: 'Стоимость', kedenType: '*Стоимость товара' },
  { name: 'Валюта', kedenType: '*Валюта' },
  { name: 'Масса брутто, кг', kedenType: '*Вес брутто, кг' },
  { name: 'Масса нетто, кг', kedenType: 'Вес нетто, кг' },
  { name: 'Количество в доп. ед.', kedenType: '*Количество товара с указанием дополнительной ед.изм.' },
  { name: 'Вид информации об упаковке (всегда 0)', kedenType: '*Вид информации об упаковке' },
  { name: 'Количество грузовых мест', kedenType: '*Количество грузовых мест' },
  { name: 'Наличие упаковки (1/0)', kedenType: '*Информация об упаковке' },
  { name: 'Вид упаковки', kedenType: '*Вид упаковки' },
  { name: 'Количество упаковок', kedenType: '*Количество упаковок' },
  { name: 'Описание грузового места', kedenType: 'Описание грузового места' },
  { name: 'Номер контейнера', kedenType: 'Контейнеры → Номер' },
] as const
/** Подписи столбцов (для листа «Схема» и окна); в данные TSV и листа «Товары» не попадают. */
export const KEDEN_GOODS_HEADER: string[] = KEDEN_GOODS_COLUMNS.map((c) => c.name)

/** КЕДЕН импортирует не больше 1000 строк за раз. */
export const KEDEN_GOODS_MAX = 1000

const blank = (v: unknown): boolean => v == null || (typeof v === 'string' && v.trim() === '')
const digits = (v: string | null | undefined): string => (v ?? '').replace(/\D/g, '')

/** Число как строка из данных: точка, без разделителей тысяч, без округления; не число — пусто. */
function num(v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return ''
  const s = String(v)
  return /e/i.test(s) ? v.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 }) : s
}
const text = (v: string | null | undefined): string => (v ?? '').trim()

/** Единственное непустое значение из списка (нет или разные — пусто: к конкретному товару его не отнести). */
function single(values: (string | null | undefined)[]): string {
  const set = new Set(values.map(text).filter(Boolean))
  return set.size === 1 ? [...set][0]! : ''
}

/** Валюта товара; пусто — валюта ТД (transit.docCurrencyCode); нет и её — пусто. */
const currencyOf = (g: ReestrGoodsItemInput, draft: KedenGoodsSource): string => text(g.currency) || text(draft.transit?.docCurrencyCode)

export function kedenGoodsRows(draft: KedenGoodsSource): KedenTable {
  const goods = Array.isArray(draft.goods) ? draft.goods : []
  // Вид упаковки и описание места у товара не хранятся: берём из «Упаковки» партии, когда оно одно; контейнер — тоже один.
  const packageType = single((draft.packages ?? []).map((p) => p.packageTypeCode))
  const packageText = single((draft.packages ?? []).map((p) => p.description))
  const container = (draft.containers ?? []).length === 1 ? text(draft.containers[0]!.containerNumber) : ''
  const rows = goods.map((g: ReestrGoodsItemInput) => {
    const places = typeof g.packagesCount === 'number' && Number.isFinite(g.packagesCount) ? g.packagesCount : 0
    const packed = places > 0
    return [
      digits(g.tnvedCode), text(g.description), text(g.countryOfOrigin), num(g.customsValue), currencyOf(g, draft),
      num(g.grossWeightKg), num(g.netWeightKg), num(g.quantity), '0',
      num(g.packagesCount), packed ? '1' : '0', packed ? packageType : '', packed ? num(g.packagesCount) : '',
      packed ? packageText : '', container,
    ]
  })
  return { header: [...KEDEN_GOODS_HEADER], rows }
}

export type KedenIssueKind = 'noQuantity' | 'noGoods' | 'tooMany' | 'codeShort' | 'noDescription' | 'noGross' | 'noValue' | 'noCurrency' | 'codeNot10' | 'totals'
/** Пункт проверки: key — вид (для подписи на нужном языке), numbers — номера товаров с 1, text — подпись по-русски. */
export interface KedenIssue { key: KedenIssueKind; text: string; numbers?: number[]; totalsKey?: 'places' | 'grossKg' | 'value' }

const list = (numbers: number[]): string => {
  const shown = numbers.slice(0, 15).join(', ')
  return numbers.length > 15 ? `${shown} … (всего ${numbers.length})` : shown
}

export function kedenGoodsCheck(draft: KedenGoodsSource, totals?: TotalsCheck | null): { errors: KedenIssue[]; warnings: KedenIssue[] } {
  const goods = Array.isArray(draft.goods) ? draft.goods : []
  const errors: KedenIssue[] = []
  const warnings: KedenIssue[] = []
  if (!goods.length) return { errors: [{ key: 'noGoods', text: 'В ТД нет товаров' }], warnings }
  if (goods.length > KEDEN_GOODS_MAX) {
    errors.push({ key: 'tooMany', text: `Товаров ${goods.length}: разделите партию — КЕДЕН импортирует до ${KEDEN_GOODS_MAX} строк` })
  }
  const pick = (pred: (g: ReestrGoodsItemInput) => boolean): number[] => goods.flatMap((g, i) => (pred(g) ? [i + 1] : []))
  const add = (to: KedenIssue[], key: KedenIssueKind, numbers: number[], label: string) => {
    if (numbers.length) to.push({ key, numbers, text: `${label}: товары ${list(numbers)}` })
  }
  add(errors, 'codeShort', pick((g) => digits(g.tnvedCode).length < 6), 'Код ТН ВЭД короче 6 знаков')
  add(errors, 'noDescription', pick((g) => blank(g.description)), 'Нет описания')
  add(errors, 'noGross', pick((g) => !(typeof g.grossWeightKg === 'number' && g.grossWeightKg > 0)), 'Нет массы брутто')
  add(errors, 'noValue', pick((g) => !(typeof g.customsValue === 'number' && g.customsValue > 0)), 'Нет стоимости')
  add(errors, 'noQuantity', pick((g) => !(typeof g.quantity === 'number' && g.quantity > 0)), 'КЕДЕН не загрузит товары без количества')
  add(errors, 'noCurrency', pick((g) => !currencyOf(g, draft)), 'Нет валюты')
  add(warnings, 'codeNot10', pick((g) => { const n = digits(g.tnvedCode).length; return n >= 6 && n < 10 }), 'Код ТН ВЭД короче 10 знаков')
  for (const r of totalsMismatch(totals, goods)) {
    const label = r.key === 'places' ? 'мест' : r.key === 'grossKg' ? 'брутто, кг' : 'стоимость'
    warnings.push({ key: 'totals', totalsKey: r.key, text: `Итоги товаров не сходятся с партией (${label}): по товарам ${r.goods}, в партии ${r.party}` })
  }
  return { errors, warnings }
}

/** Строка буфера для вставки в КЕДЕН (без заголовков): табуляции, перевод строки \n; табы и переводы строк внутри значения — пробел. */
export function kedenGoodsTsv(table: KedenTable): string {
  const cell = (v: string) => v.replace(/[\t\r\n]+/g, ' ')
  return table.rows.map((r) => r.map(cell).join('\t')).join('\n')
}

/** Ширины столбцов по содержимому: от 10 до 60 знаков. */
const widths = (table: KedenTable): { wch: number }[] =>
  table.header.map((_, c) => ({ wch: Math.min(60, Math.max(10, ...table.rows.map((r) => (r[c] ?? '').length))) + 1 }))

/** Все ячейки листа — текстом (тип s): код ТН ВЭД не теряет нули. */
function textSheet(XLSX: typeof import('xlsx'), rows: string[][], cols: { wch: number }[]) {
  const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((v) => String(v))))
  for (const addr of Object.keys(ws)) {
    if (addr[0] === '!') continue
    const c = ws[addr] as { t: string; v: unknown; w?: string; z?: string }
    c.t = 's'
    c.v = String(c.v ?? '')
    delete c.w
    delete c.z
  }
  ws['!cols'] = cols
  return ws
}

/**
 * .xlsx: лист «Товары» — только строки товаров, без заголовков (КЕДЕН читает первую строку как товар); лист «Схема» —
 * «№ столбца — что в нём — тип в КЕДЕН» (подсказка для сопоставления; импорт читает первый лист).
 */
export async function kedenGoodsXlsx(table: KedenTable): Promise<Blob> {
  const XLSX = await loadXlsx()
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, textSheet(XLSX, table.rows, widths(table)), 'Товары')
  const scheme = [['№ столбца', 'Что в нём', 'Тип в КЕДЕН'], ...KEDEN_GOODS_COLUMNS.map((c, i) => [String(i + 1), c.name, c.kedenType])]
  XLSX.utils.book_append_sheet(wb, textSheet(XLSX, scheme, [{ wch: 11 }, { wch: 40 }, { wch: 56 }]), 'Схема')
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/** Имя файла: Товары-КЕДЕН-<госномер>-<номер партии>.xlsx; неудобные для файла символы — «_». */
export function kedenGoodsFileName(plate: string | null | undefined, partyNumber: number | string | null | undefined): string {
  const part = (v: unknown) => String(v ?? '').trim().replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '')
  return `Товары-КЕДЕН-${[part(plate), part(partyNumber)].filter(Boolean).join('-')}.xlsx`.replace('КЕДЕН-.xlsx', 'КЕДЕН.xlsx')
}
