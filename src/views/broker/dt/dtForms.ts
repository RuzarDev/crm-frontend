import { NOTICE130_SUBITEMS, type Notice130Subitem } from '@/api/dtForms'
import type { Import40Doc44ItemInput, Import40GoodsItemInput } from '@/types/api'
import { isBlankCharacteristic, rowMeasure } from './goods/editor/characteristics'
import { gr31Number, gr31Text } from './goods/editor/gr31Text'
import { okeiCode, okeiShort } from './goods/editor/okei'

// Окна документов по ДТ (23.10.2026): «Уведомление (Решение 130)» — строки таблицы товаров, группировка уведомлений по
// подпунктам, строки гр. 44 01416; общее для него и «Обязательства» (dtObligation.ts) — даты и имена файлов. Тексты самих
// документов строит сервер; здесь — только то, что окно показывает и отправляет.

type T = (k: string, p?: Record<string, unknown>) => string

// ---- Таблица товаров ----

/** Строка таблицы выбора товаров: index — позиция товара в ДТ (= SortOrder сервера после сохранения). */
export interface DtPickRow {
  index: number
  tnvedCode: string | null
  country: string | null
  /** Текст гр. 31 без «1.» и без мест/упаковки (как строка товара в документе); пусто — ''. */
  description: string
  /** Количество гр. 31.1 по строкам характеристик, иначе гр. 41 с единицей. */
  quantity: string | null
  /** Сколько штук (гр. 41, без неё — сумма строк) — для предупреждения подпункта «л». */
  quantityValue: number | null
  netWeightKg: number | null
  /** Фактурная стоимость гр. 42 (в форме — customsValue). */
  invoiceValue: number | null
}

const unitShort = (code: string | null | undefined): string | null => {
  const c = okeiCode(code)
  return c ? okeiShort(c) ?? c : null
}
const measureText = (q: number | null | undefined, unitCode: string | null | undefined): string | null => {
  const n = gr31Number(q)
  if (n == null) return null
  const unit = unitShort(unitCode)
  return unit ? `${n} ${unit}` : n
}

type PickGoods = Pick<Import40GoodsItemInput, 'description' | 'tnvedDescription' | 'tnvedCode' | 'countryOfOrigin' | 'quantity'
  | 'unitCode' | 'netWeightKg' | 'customsValue' | 'characteristics'>

/** Строки окна из товаров формы; countryOf — код ОКСМ в подпись (буквенный «CN»), нет — код как есть. */
export function pickRows(goods: readonly PickGoods[], countryOf: (code: string) => string | null = () => null): DtPickRow[] {
  return goods.map((g, index) => {
    const rows = (g.characteristics ?? []).filter((r) => !isBlankCharacteristic(r))
    const single = rows.length === 1 ? g : null
    const measures = rows.map((r) => rowMeasure(r, single)).filter((m): m is NonNullable<typeof m> => !!m)
    const quantity = measures.length
      ? measures.map((m) => measureText(m.quantity, m.unitCode)).join('; ')
      : measureText(g.quantity, g.unitCode)
    const rowsTotal = measures.length ? measures.reduce((s, m) => s + m.quantity, 0) : null
    // Без мест и вида упаковки — без строки «2. …»; «1. » в начале — нумерация бланка, в окне не нужна.
    const text = gr31Text({ ...g, packageKindCode: null, packageQuantity: null, packagesCount: null, cargoPlacesQuantity: null })
    const code = (g.countryOfOrigin ?? '').trim()
    return {
      index,
      tnvedCode: (g.tnvedCode ?? '').trim() || null,
      country: code ? countryOf(code) ?? code : null,
      description: text.replace(/^1\. /, ''),
      quantity,
      quantityValue: g.quantity ?? rowsTotal,
      netWeightKg: g.netWeightKg ?? null,
      invoiceValue: g.customsValue ?? null,
    }
  })
}

// ---- Уведомление по Решению 130 ----

/** Ключ перевода подписи подпункта (буквы кириллицей — в ключах латиница). */
export const SUBITEM_KEY: Record<Notice130Subitem, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', к: 'k', л: 'l',
}

/** Что приложить к уведомлению по подпункту (п. 6 Порядка): вид документа гр. 44. */
export const SUBITEM_ATTACH: Partial<Record<Notice130Subitem, string>> = { а: '01410', б: '01417', ж: '01418', и: '01419' }

export type Notice130Letters = Record<number, Notice130Subitem | null | undefined>

/** Одна форма уведомления: подпункт (null — «__»), номер, товары (позиции в ДТ). */
export interface Notice130Form {
  subitem: Notice130Subitem | null
  number: string | null
  indexes: number[]
}

/**
 * Формы, которые сформирует сервер: одна на подпункт (в форме одно поле буквы), по алфавиту букв, без буквы — последней.
 * Номер: форм больше одной и номер задан — «{номер}-1», «{номер}-2»…; номер пуст — пусто во всех.
 */
export function notice130Forms(selected: readonly number[], letters: Notice130Letters, number: string | null): Notice130Form[] {
  const order: (Notice130Subitem | null)[] = [...NOTICE130_SUBITEMS, null]
  const groups = order
    .map((subitem) => ({ subitem, indexes: [...selected].filter((i) => (letters[i] ?? null) === subitem).sort((a, b) => a - b) }))
    .filter((g) => g.indexes.length)
  const base = (number ?? '').trim() || null
  return groups.map((g, k) => ({ ...g, number: base && groups.length > 1 ? `${base}-${k + 1}` : base }))
}

/** Не заполнено перед формированием (ключи broker.dt.forms.missing.*): должность, Ф.И.О., подпункт у отмеченного товара. */
export function notice130Missing(position: string, name: string, selected: readonly number[], letters: Notice130Letters): string[] {
  const out: string[] = []
  if (!position.trim()) out.push('position')
  if (!name.trim()) out.push('name')
  if (selected.some((i) => !letters[i])) out.push('subitem')
  return out
}

/** Товары с подпунктом «л» (единичный экземпляр) и количеством больше 1 — номера товаров с 1. */
export const singleItemOverOne = (rows: readonly DtPickRow[], selected: readonly number[], letters: Notice130Letters): number[] =>
  rows.filter((r) => selected.includes(r.index) && letters[r.index] === 'л' && (r.quantityValue ?? 0) > 1).map((r) => r.index + 1)

/** Код вида документа гр. 44 «Уведомление о подтверждении использования…» (Решение Коллегии ЕЭК № 76). */
export const NOTICE130_DOC_CODE = '01416'
/** Название 01416, если классификатора 2009 нет под рукой. */
export const NOTICE130_DOC_NAME = 'Уведомление о подтверждении использования в заявленных нуждах и целях (Решение 130)'

export interface Notice130Doc44Entry { number: string | null; date: string; indexes: number[] }

const normNumber = (n: string | null | undefined) => (n ?? '').trim().toLocaleUpperCase('ru')
const sameNumber = (a: string | null | undefined, b: string | null | undefined) => normNumber(a) === normNumber(b)

/** Номер из той же серии уведомления: «N» или «N-k» (notice130Forms: одна форма — «N», несколько — «N-1», «N-2»…). */
const inSeries = (n: string | null | undefined, base: string) => {
  const v = normNumber(n)
  const b = normNumber(base)
  return !!b && (v === b || (v.startsWith(`${b}-`) && /^\d+$/.test(v.slice(b.length + 1))))
}

/**
 * Строки гр. 44 01416 после формирования уведомления (в форму ДТ — сохранит автосейв): по строке на форму. Строка 01416 с
 * тем же номером уже есть — обновить дату и товары (не дублировать); каждая строка обновляется одной формой. Точного
 * совпадения нет — взять строку 01416 той же серии номеров («N» ↔ «N-1», «N-2»: повторное формирование с другим числом
 * форм) или без номера (прошлое формирование без номера) и записать в неё номер — иначе оставались дубли (ревью
 * 23.10.2026). Товары — отмеченные; все товары ДТ — «на все товары». Признак представления новой строки — «0», как у
 * новой строки гр. 44.
 */
export function upsertNotice130Doc44(
  items: Import40Doc44ItemInput[],
  entries: readonly Notice130Doc44Entry[],
  name: string,
  goodsCount: number,
): { added: number; updated: number } {
  const isNotice = (d: Import40Doc44ItemInput) => (d.docTypeCode ?? '').trim() === NOTICE130_DOC_CODE
  const used = new Set<Import40Doc44ItemInput>()
  const take = (pred: (d: Import40Doc44ItemInput) => boolean) => {
    const found = items.find((d) => !used.has(d) && isNotice(d) && pred(d))
    if (found) used.add(found)
    return found
  }
  // Сначала точные совпадения номеров у всех форм, потом — серия и строки без номера (чтобы «N-1» не занял строку «N-2»).
  const exact = entries.map((e) => take((d) => sameNumber(d.docNumber, e.number)))
  const first = (entries[0]?.number ?? '').trim()
  const base = entries.length > 1 ? first.replace(/-\d+$/, '') : first
  const target = entries.map((e, k) => exact[k]
    ?? ((e.number ?? '').trim() ? take((d) => inSeries(d.docNumber, base)) ?? take((d) => !(d.docNumber ?? '').trim()) : undefined))
  let added = 0
  let updated = 0
  entries.forEach((e, k) => {
    const all = goodsCount > 0 && e.indexes.length >= goodsCount
    const goods = { appliesToAll: all, goodsItemIndexes: all ? null : [...e.indexes].sort((a, b) => a - b).join(','), goodsItemIndex: null }
    const found = target[k]
    if (found) {
      Object.assign(found, { docDate: e.date, ...goods })
      if (!exact[k]) found.docNumber = e.number
      if (!(found.docTypeName ?? '').trim()) found.docTypeName = name
      updated++
      return
    }
    items.push({
      docTypeCode: NOTICE130_DOC_CODE, docTypeName: name, docNumber: e.number, docDate: e.date,
      ...goods, docStartDate: null, docValidityDate: null, issueCountryCode: null, presentKindCode: '0',
    })
    added++
  })
  return { added, updated }
}

// ---- Выбор в окне уведомления — в браузере по id ДТ (сервер его не хранит, первая версия) ----

const choiceKey = (dtId: string) => `zircon.dt.notice130.${dtId}`

/**
 * Отпечаток товара на позиции — код ТН ВЭД и начало описания. Выбор и буквы хранятся по позиции; после перестановки,
 * удаления или замены товара на позиции другой товар — его выбор не восстанавливаем (ревью 23.10.2026: раньше сверялось
 * только число товаров, и буквы переезжали на чужие товары).
 */
export const notice130GoodsKeys = (rows: readonly Pick<DtPickRow, 'tnvedCode' | 'description'>[]): string[] =>
  rows.map((r) => `${r.tnvedCode ?? ''}|${r.description.slice(0, 60)}`)

/** Сохранённый выбор — только для позиций, где тот же товар (отпечаток совпал); ничего не осталось — null. */
export function loadNotice130Choice(dtId: string, keys: readonly string[]): { selected: number[]; letters: Notice130Letters } | null {
  try {
    const raw = localStorage.getItem(choiceKey(dtId))
    if (!raw) return null
    const v = JSON.parse(raw) as { keys?: unknown; selected?: unknown; letters?: unknown }
    if (!Array.isArray(v.keys) || !Array.isArray(v.selected) || typeof v.letters !== 'object' || !v.letters) return null
    const saved = v.keys as unknown[]
    const ok = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < keys.length && saved[i as number] === keys[i as number]
    const letters: Notice130Letters = {}
    for (const [k, l] of Object.entries(v.letters as Record<string, unknown>)) {
      const i = Number(k)
      if (ok(i) && (NOTICE130_SUBITEMS as readonly unknown[]).includes(l)) letters[i] = l as Notice130Subitem
    }
    const selected = v.selected.filter(ok)
    return selected.length || Object.keys(letters).length ? { selected, letters } : null
  } catch {
    return null
  }
}
export function saveNotice130Choice(dtId: string, keys: readonly string[], selected: readonly number[], letters: Notice130Letters): void {
  try {
    localStorage.setItem(choiceKey(dtId), JSON.stringify({ keys, selected, letters }))
  } catch { /* приватный режим — без запоминания */ }
}

// ---- Общее ----

/** Сегодня по часам браузера, 'YYYY-MM-DD'. */
export function todayIso(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/** 'YYYY-MM-DD' → 'ДД.ММ.ГГГГ'. */
export const dotDate = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso
}

/** «Уведомление_130_ТОО_ТЕСТ_23.10.2026.docx»: без запрещённых в именах файлов знаков и кавычек, пробелы — «_». */
export function dtFormFileName(prefix: string, declarant: string | null | undefined, date: string): string {
  const name = (declarant ?? '')
    .replace(/[\\/:*?"<>|«»„“”'`]|\p{Cc}/gu, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 80)
    .replace(/_+$/, '')
  return [prefix, name, dotDate(date)].filter(Boolean).join('_') + '.docx'
}

/** «ТОО ТЕСТ, БИН 000000000000» — декларант гр. 14 для окна. */
export const declarantText = (name: string | null | undefined, bin: string | null | undefined, t: T): string =>
  [(name ?? '').trim(), (bin ?? '').trim() ? t('broker.dt.forms.binOf', { bin: (bin ?? '').trim() }) : ''].filter(Boolean).join(', ')
