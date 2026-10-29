// Импорт в ДТ (пакет 21.10.2026, №15 и №10б): несколько файлов одной поставки и повторный импорт.
//
// mergeImportDocs — строки документов (инвойс, упаковочный лист, листы одной книги) в один список: база — документ со
//   стоимостью (инвойс), остальные дозаполняют пустые поля; разные значения — конфликт (взято значение базы). При слиянии
//   строк Zircon AI с разбором Excel (markTwinGuard) одно значение в разных графах пары «марка / товарный знак» в обе не
//   пишется — тоже конфликт (crossField, ревью 22.10).
//   Сопоставление строки, по порядку ключей, только однозначное (один кандидат): № строки (если он есть в обоих файлах и
//   не противоречит коду/артикулу) → код + артикул → артикул + описание (артикулы в UR0910 повторяются с разным
//   наименованием) → код + описание → артикул → описание → порядок (равное число строк, коды на тех же местах не
//   противоречат). Не нашлось — строка добавляется отдельным товаром («есть только в …»).
// matchExisting / planMerge / applyMerge — товары файла против уже имеющихся в ДТ: «Дополнить пустые поля» (по
//   умолчанию, В18), «Заменить значениями из файла» (пустое в файле ничего не стирает), «Добавить как новые товары».
//   Несопоставленные строки — новыми товарами в любом режиме.
import type { Import40GoodsCharacteristic, Import40GoodsItemInput } from '@/types/api'
import { blankCharacteristic, isBlankCharacteristic } from './editor/characteristics'
import type { ImportDoc, ImportRow } from './importRows'
import type { DtGoodsModel } from './useDtGoods'

type Goods = Import40GoodsItemInput

// ───────────────────────── общие сравнения ─────────────────────────

/** Ключ текста: заглавными, только буквы и цифры (как excelFallback). */
export const keyText = (s: string | null | undefined): string => (s ?? '').toLocaleUpperCase('ru-RU').replace(/Ё/g, 'Е').replace(/[^\p{L}\p{N}]/gu, '')
const keyCode = (s: string | null | undefined): string => (s ?? '').replace(/\D/g, '')

const blank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
  || (Array.isArray(v) && v.length === 0)

/** Значения равны: числа — с допуском 0,001 (или 1e-6 доли), строки — без регистра и пробелов. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (blank(a) || blank(b)) return blank(a) && blank(b)
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= Math.max(0.001, 1e-6 * Math.abs(a))
  return keyText(String(a)) === keyText(String(b))
}

// ───────────────────────── слияние документов ─────────────────────────

export type DocMatchBy = 'lineNo' | 'codeArticle' | 'articleDescription' | 'codeDescription' | 'article' | 'description' | 'position'

export interface ImportConflict {
  /** Позиция строки в слитом списке (с 0). */
  rowIndex: number
  field: ConflictField
  /** Значения документов; field — графа, в которой его прочитал документ (только у конфликта crossField). */
  values: { value: unknown; source: string; field?: ConflictField }[]
  chosen: unknown
  /**
   * Одно значение в разных графах пары «марка / товарный знак»: field — графа, где оно осталось (как в слитой строке),
   * crossField — графа, куда его не записали (так его прочитал другой документ). См. MARK_TWIN.
   */
  crossField?: MarkPairField
}

export type MarkPairField = 'tradeMarkName' | 'productMarkName'

/**
 * Поля, расхождение которых между документами показывается конфликтом. Марка, знак, модель, ГОСТ, сорт и серийный — тоже:
 * «ОТСУТСТВУЕТ» — значение декларанта (решение владельца 21.10.2026), и «ОТСУТСТВУЕТ» базы против «LONGJU» упаковочного
 * листа — расхождение, а не пустое поле (ревью 21.10).
 */
export const CONFLICT_FIELDS = [
  'tnvedCode', 'quantity', 'places', 'grossWeightKg', 'netWeightKg', 'value', 'countryCode',
  'tradeMarkName', 'productMarkName', 'productModelName', 'standardName', 'productSortName', 'serialNumbers',
] as const
export type ConflictField = (typeof CONFLICT_FIELDS)[number]

const FILL_FIELDS = [
  'lineNo', 'description', 'rowName', 'tnvedCode', 'quantity', 'unitText', 'places', 'placesNote', 'grossWeightKg', 'netWeightKg', 'value',
  'currency', 'countryCode', 'originText', 'packageAvailabilityCode', 'packageKindText', 'packageQuantity', 'packagingHint',
  'manufacturerName', 'tradeMarkName', 'productMarkName', 'productModelName', 'productArticle', 'standardName',
  'productSortName', 'serialNumbers', 'cargoPartQuantity', 'individualPackages', 'gtin',
] as const satisfies readonly (keyof ImportRow)[]

export interface MergeResult {
  rows: ImportRow[]
  conflicts: ImportConflict[]
  /** Строки, которых нет в базовом документе: по файлу — сколько. */
  onlyIn: { source: string; n: number }[]
  /** Сопоставлено строк по каждому ключу. */
  matchedBy: Partial<Record<DocMatchBy, number>>
}

/**
 * Предохранитель пары «марка / товарный знак» (ревью 22.10) — только при MergeOptions.markTwinGuard. У слитой строки
 * значение в одной графе пары, документ даёт то же значение в другой графе и своей «первой» графы не имеет — почти
 * наверняка это один столбец («Марка ↵ Brand»), который разные разборы прочитали по-разному: «Из документов» сливает
 * строки Zircon AI и разбора Excel того же файла. В обе графы одно значение не пишется: остаётся графа слитой строки,
 * расхождение — конфликтом crossField, решает декларант. Документ, где обе графы заполнены одним значением (два столбца),
 * — его данные, они переносятся как есть.
 */
const MARK_TWIN: Partial<Record<keyof ImportRow, MarkPairField>> = { tradeMarkName: 'productMarkName', productMarkName: 'tradeMarkName' }

export interface MergeOptions {
  /**
   * Предохранитель MARK_TWIN. Включать только при слиянии разных разборов — строк Zircon AI с разбором Excel
   * («Из документов», excelFallback.applyExcelFallback). Документы одного разбора Excel («Из Excel» с несколькими файлами
   * или листами) читают столбцы одним правилом markFieldOf: один столбец двумя графами они не прочитают, и одно значение
   * в «Товарном знаке» инвойса и в «Марке» упаковочного листа — два столбца, переносятся оба (решение владельца 21.10:
   * «Отсутствует» — как есть в каждую графу; ревью 22.10).
   */
  markTwinGuard?: boolean
}

type RowKey = (r: ImportRow) => string | null
const rowKeys: { by: Exclude<DocMatchBy, 'position'>; key: RowKey }[] = [
  { by: 'lineNo', key: (r) => (r.lineNo != null ? String(r.lineNo) : null) },
  { by: 'codeArticle', key: (r) => (keyCode(r.tnvedCode) && keyText(r.productArticle) ? `${keyCode(r.tnvedCode)}|${keyText(r.productArticle)}` : null) },
  { by: 'articleDescription', key: (r) => (keyText(r.productArticle) && keyText(r.description) ? `${keyText(r.productArticle)}|${keyText(r.description)}` : null) },
  { by: 'codeDescription', key: (r) => (keyCode(r.tnvedCode) && keyText(r.description) ? `${keyCode(r.tnvedCode)}|${keyText(r.description)}` : null) },
  { by: 'article', key: (r) => keyText(r.productArticle) || null },
  { by: 'description', key: (r) => keyText(r.description) || null },
]

/** Не противоречат: одно из значений пусто или они равны. */
const compatible = (a: string, b: string) => !a || !b || a === b

const copyRow = (r: ImportRow): ImportRow => ({ ...r, ntins: [...r.ntins], docs: r.docs.map((d) => ({ ...d })) })

/** Документ со стоимостью (инвойс) — база слияния; дальше — в исходном порядке. */
const docRank = (d: ImportDoc) => (d.kind === 'invoice' ? 0 : d.rows.some((r) => r.value != null) ? 1 : 2)

export function mergeImportDocs(docs: readonly ImportDoc[], opts: MergeOptions = {}): MergeResult {
  const ordered = docs.map((d, i) => ({ d, i })).sort((a, b) => docRank(a.d) - docRank(b.d) || a.i - b.i).map((x) => x.d)
  const rows: ImportRow[] = []
  const conflicts: ImportConflict[] = []
  const onlyIn: MergeResult['onlyIn'] = []
  const matchedBy: MergeResult['matchedBy'] = {}
  // Источники значений полей-конфликтов по строке: { field → [{value, source}] }.
  const valueSources: Map<ConflictField, { value: unknown; source: string }[]>[] = []
  // Значения, не записанные во вторую графу пары «марка / товарный знак» (MARK_TWIN, при markTwinGuard).
  const crossed: { at: number; kept: MarkPairField; field: MarkPairField; value: unknown; source: string }[] = []
  const record = (at: number, r: ImportRow) => {
    for (const f of CONFLICT_FIELDS) {
      if (blank(r[f])) continue
      const map = (valueSources[at] ??= new Map())
      const list = map.get(f) ?? []
      list.push({ value: r[f], source: r.source })
      map.set(f, list)
    }
  }

  ordered.forEach((doc, docIndex) => {
    if (docIndex === 0) {
      for (const r of doc.rows) {
        rows.push(copyRow(r))
        record(rows.length - 1, r)
      }
      return
    }
    const baseCount = rows.length
    const baseKeys = rowKeys.map(({ key }) => rows.slice(0, baseCount).map(key))
    const docKeys = rowKeys.map(({ key }) => doc.rows.map(key))
    const taken = new Set<number>()
    let extra = 0
    doc.rows.forEach((r, pos) => {
      let at: number | null = null
      for (const [ki, { by, key }] of rowKeys.entries()) {
        const k = key(r)
        if (!k) continue
        // Однозначно с обеих сторон: в слитом списке один такой ключ и в этом документе — тоже один.
        const cands = baseKeys[ki].map((x, i) => (x === k ? i : -1)).filter((i) => i >= 0)
        if (cands.length !== 1 || taken.has(cands[0]) || docKeys[ki].filter((x) => x === k).length !== 1) continue
        const m = rows[cands[0]]
        // № строки — только если код и артикул не противоречат (нумерация документов может не совпасть).
        if (by === 'lineNo' && !(compatible(keyCode(m.tnvedCode), keyCode(r.tnvedCode)) && compatible(keyText(m.productArticle), keyText(r.productArticle)))) continue
        at = cands[0]
        matchedBy[by] = (matchedBy[by] ?? 0) + 1
        break
      }
      if (at == null && doc.rows.length === baseCount && pos < rows.length && !taken.has(pos)
        && compatible(keyCode(rows[pos].tnvedCode), keyCode(r.tnvedCode))) {
        at = pos
        matchedBy.position = (matchedBy.position ?? 0) + 1
      }
      if (at == null) {
        rows.push(copyRow(r))
        taken.add(rows.length - 1)
        record(rows.length - 1, r)
        extra += 1
        return
      }
      taken.add(at)
      const m = rows[at]
      for (const f of FILL_FIELDS) {
        if (!blank(m[f]) || blank(r[f])) continue
        const kept = opts.markTwinGuard ? MARK_TWIN[f] : undefined
        if (kept && blank(r[kept]) && sameValue(r[f], m[kept])) {
          crossed.push({ at, kept, field: f as MarkPairField, value: r[f], source: r.source })
          continue
        }
        (m as unknown as Record<string, unknown>)[f] = r[f]
      }
      m.ntins = [...new Set([...m.ntins, ...r.ntins])]
      for (const d of r.docs) {
        if (!m.docs.some((x) => x.typeCode === d.typeCode && keyText(x.number) === keyText(d.number))) m.docs.push({ ...d })
      }
      record(at, r)
    })
    if (extra) onlyIn.push({ source: doc.source, n: extra })
  })

  valueSources.forEach((map, rowIndex) => {
    for (const [field, values] of map) {
      if (values.length < 2 || values.every((v) => sameValue(v.value, values[0].value))) continue
      conflicts.push({ rowIndex, field, values, chosen: rows[rowIndex][field] })
    }
  })
  // Пара «марка / товарный знак»: по строке и оставленной графе — один конфликт, кто как прочитал значение.
  const crossGroups = new Map<string, typeof crossed>()
  for (const c of crossed) {
    const key = `${c.at}|${c.kept}`
    crossGroups.set(key, [...(crossGroups.get(key) ?? []), c])
  }
  for (const group of crossGroups.values()) {
    const { at, kept, field } = group[0]
    const chosen = rows[at][kept]
    const keptBy = (valueSources[at]?.get(kept) ?? []).filter((v) => sameValue(v.value, chosen))
    conflicts.push({
      rowIndex: at, field: kept, crossField: field, chosen,
      values: [...keptBy.map((v) => ({ ...v, field: kept })), ...group.map((c) => ({ value: c.value, source: c.source, field: c.field }))],
    })
  }
  conflicts.sort((a, b) => a.rowIndex - b.rowIndex)
  return { rows, conflicts, onlyIn, matchedBy }
}

// ───────────────────────── товары файла против товаров ДТ ─────────────────────────

export type MatchBy = 'codeArticle' | 'articleDescription' | 'codeDescription' | 'article' | 'description' | 'position'
export interface ExistingMatch { incoming: number; existing: number | null; by: MatchBy | null }

const articleOf = (g: Goods): string => keyText((g.characteristics ?? []).map((r) => r.productArticle).find((a) => !blank(a)))
// Артикул + описание — как rowKeys слияния файлов (сверка 22.10, import-2): артикулы 506/905 UR0910 повторяются с
// одним кодом и разным наименованием («Полки для обуви 3 / 4 яруса») — без этого ключа при неравном числе товаров в ДТ
// и в файле они не сопоставлялись и «Дополнить» добавлял их второй раз.
const goodsKeys: { by: Exclude<MatchBy, 'position'>; key: (g: Goods) => string | null }[] = [
  { by: 'codeArticle', key: (g) => (keyCode(g.tnvedCode) && articleOf(g) ? `${keyCode(g.tnvedCode)}|${articleOf(g)}` : null) },
  { by: 'articleDescription', key: (g) => (articleOf(g) && keyText(g.description) ? `${articleOf(g)}|${keyText(g.description)}` : null) },
  { by: 'codeDescription', key: (g) => (keyCode(g.tnvedCode) && keyText(g.description) ? `${keyCode(g.tnvedCode)}|${keyText(g.description)}` : null) },
  { by: 'article', key: (g) => articleOf(g) || null },
  { by: 'description', key: (g) => keyText(g.description) || null },
]

export interface MatchOptions {
  /** Сопоставлять по порядку при равном числе товаров (по умолчанию да — «Из Excel»; «Из документов» в ДТ — нет). */
  positional?: boolean
}

/** Для каждого товара файла — товар ДТ (позиция) или null; неоднозначное совпадение — следующий ключ, затем новый товар. */
export function matchExisting(existing: readonly Goods[], incoming: readonly Goods[], opts: MatchOptions = {}): ExistingMatch[] {
  const taken = new Set<number>()
  const out: ExistingMatch[] = incoming.map((_, i) => ({ incoming: i, existing: null, by: null }))
  for (const { by, key } of goodsKeys) {
    const keysOfExisting = existing.map(key)
    incoming.forEach((g, i) => {
      if (out[i].existing != null) return
      const k = key(g)
      if (!k) return
      const cands = keysOfExisting.map((x, j) => (x === k && !taken.has(j) ? j : -1)).filter((j) => j >= 0)
      // Однозначно с обеих сторон: и в ДТ один такой товар, и в файле одна такая строка.
      if (cands.length !== 1 || incoming.filter((o, oi) => out[oi].existing == null && key(o) === k).length !== 1) return
      out[i] = { incoming: i, existing: cands[0], by }
      taken.add(cands[0])
    })
  }
  // По порядку — только при равном числе товаров и непротиворечивых кодах; «Из документов» в уже созданную ДТ — без него
  // (positional: false, 29.10.2026): дополнительный инвойс с тем же числом других товаров без артикулов и кодов сливался
  // бы с чужими товарами ДТ.
  if (opts.positional !== false && existing.length === incoming.length) {
    incoming.forEach((g, i) => {
      if (out[i].existing != null || taken.has(i)) return
      if (!compatible(keyCode(existing[i].tnvedCode), keyCode(g.tnvedCode))) return
      out[i] = { incoming: i, existing: i, by: 'position' }
      taken.add(i)
    })
  }
  return out
}

export type MergeMode = 'fill' | 'replace' | 'append'

/** Расхождение значения ДТ и файла у сопоставленного товара. */
export interface ExistingConflict { incoming: number; existing: number; field: keyof Goods; dtValue: unknown; fileValue: unknown }

export interface MergePlan {
  matches: ExistingMatch[]
  conflicts: ExistingConflict[]
  added: number
  updated: number
}

/** Поля товара, которые импорт пишет (в «Дополнить» — только в пустые). */
const GOODS_FIELDS = [
  'description', 'tnvedCode', 'tnvedDescription', 'countryOfOrigin', 'grossWeightKg', 'netWeightKg', 'packagesCount',
  'cargoPlacesQuantity', 'customsValue', 'packageAvailabilityCode', 'packageKindCode', 'packageQuantity', 'gtin',
] as const satisfies readonly (keyof Goods)[]
const COMPARE_FIELDS = ['tnvedCode', 'countryOfOrigin', 'grossWeightKg', 'netWeightKg', 'packagesCount', 'customsValue', 'quantity'] as const satisfies readonly (keyof Goods)[]
const ROW_FIELDS = [
  'name', 'quantity', 'unitCode', 'invoiceValue', 'manufacturerName', 'tradeMarkName', 'productMarkName', 'productModelName',
  'productArticle', 'standardName', 'productSortName', 'serialNumbers',
] as const satisfies readonly (keyof Import40GoodsCharacteristic)[]

export function planMerge(existing: readonly Goods[], incoming: readonly Goods[], mode: MergeMode, opts: MatchOptions = {}): MergePlan {
  if (mode === 'append' || !existing.length) {
    return { matches: incoming.map((_, i) => ({ incoming: i, existing: null, by: null })), conflicts: [], added: incoming.length, updated: 0 }
  }
  const matches = matchExisting(existing, incoming, opts)
  const conflicts: ExistingConflict[] = []
  for (const m of matches) {
    if (m.existing == null) continue
    const e = existing[m.existing]
    const g = incoming[m.incoming]
    for (const f of COMPARE_FIELDS) {
      if (!blank(e[f]) && !blank(g[f]) && !sameValue(e[f], g[f])) conflicts.push({ incoming: m.incoming, existing: m.existing, field: f, dtValue: e[f], fileValue: g[f] })
    }
  }
  const updated = matches.filter((m) => m.existing != null).length
  return { matches, conflicts, added: incoming.length - updated, updated }
}

/** Строка гр. 31 товара, в которую пишет импорт: единственная непустая (или первая/новая); при 2+ — с тем же артикулом. */
function targetRow(e: Goods, article: string | null | undefined): Import40GoodsCharacteristic | null {
  const rows = (e.characteristics ??= [])
  const filled = rows.filter((r) => !isBlankCharacteristic(r))
  if (filled.length <= 1) {
    const row = filled[0] ?? rows[0]
    if (row) return row
    rows.push(blankCharacteristic())
    return rows[rows.length - 1]
  }
  const a = keyText(article)
  return a ? filled.find((r) => keyText(r.productArticle) === a) ?? null : null
}

/** Записать товар файла в товар ДТ (fill — только пустые поля; replace — значения файла поверх, пустое не стирает). */
function mergeInto(model: DtGoodsModel, e: Goods, g: Goods, mode: 'fill' | 'replace'): { rowSkipped: boolean } {
  const take = (cur: unknown, next: unknown) => !blank(next) && (mode === 'replace' || blank(cur))
  // «Дополнить»: код ДТ остаётся, а у файла другой (сопоставлено по артикулу или описанию) — описание ТН ВЭД и гр. 41,
  // выведенные из кода файла и его ДЕИ, к коду ДТ не подходят (ревью 21.10, ошибка №1). ДЕИ кода ДТ здесь неизвестна —
  // как в importBuild при неизвестной ДЕИ, количество файла идёт в строку гр. 31.
  const otherCode = mode === 'fill' && !blank(e.tnvedCode) && !blank(g.tnvedCode) && !sameValue(e.tnvedCode, g.tnvedCode)
  for (const f of GOODS_FIELDS) {
    if (otherCode && f === 'tnvedDescription') continue
    if (take(e[f], g[f])) model.setField(e, f, g[f] as never)
  }
  if (blank(e.currency) && !blank(g.currency)) model.setField(e, 'currency', g.currency)
  // Гр. 41 — тройкой (количество, ДЕИ, наименование ДЕИ).
  let rowQuantity: { quantity: number; unitCode: string | null } | null = null
  if (take(e.quantity, g.quantity)) {
    if (otherCode) rowQuantity = { quantity: g.quantity!, unitCode: g.unitCode ?? null }
    else {
      model.setField(e, 'quantity', g.quantity)
      model.setField(e, 'unitCode', g.unitCode ?? null)
      e.unit = g.unit ?? null
    }
  }
  if ((g.ntins?.length ?? 0) > 0 && (mode === 'replace' || !(e.ntins?.length))) e.ntins = [...g.ntins!]
  if (g.extras) {
    if (!e.extras) e.extras = { ...g.extras, packages: g.extras.packages?.map((p) => ({ ...p })) }
    else {
      if (take(e.extras.cargoPartQuantity, g.extras.cargoPartQuantity)) e.extras.cargoPartQuantity = g.extras.cargoPartQuantity
      if ((g.extras.packages?.length ?? 0) > 0 && (mode === 'replace' || !(e.extras.packages?.length))) {
        e.extras.packages = g.extras.packages!.map((p) => ({ ...p }))
      }
    }
  }
  const src = g.characteristics?.[0]
  const srcBlank = !src || isBlankCharacteristic(src)
  if (srcBlank && !rowQuantity) return { rowSkipped: false }
  const row = targetRow(e, src?.productArticle)
  if (!row) return { rowSkipped: true }
  if (!srcBlank) {
    for (const f of ROW_FIELDS) {
      if (take(row[f], src![f])) (row as unknown as Record<string, unknown>)[f] = src![f]
    }
  }
  if (rowQuantity && blank(row.quantity)) {
    row.quantity = rowQuantity.quantity
    if (blank(row.unitCode)) row.unitCode = rowQuantity.unitCode
  }
  return { rowSkipped: false }
}

/**
 * «Дополнить» что-нибудь изменит в товаре ДТ (29.10.2026, «Из документов» в ДТ: повторный разбор тех же документов —
 * «применять нечего»): пробный прогон mergeInto на копии товара — те же правила, без своей копии условий.
 */
export function fillChanges(e: Goods, g: Goods): boolean {
  const copy = JSON.parse(JSON.stringify(e)) as Goods
  const before = JSON.stringify(copy)
  const dry = { setField: (x: Goods, f: keyof Goods, v: unknown) => { (x as unknown as Record<string, unknown>)[f] = v } } as unknown as DtGoodsModel
  mergeInto(dry, copy, g, 'fill')
  return JSON.stringify(copy) !== before
}

export interface ApplyResult {
  updated: number
  added: number
  /** Позиция товара ДТ для каждого товара файла (для привязки документов гр. 44). */
  targetIndex: number[]
  /** Товаров, у которых 2+ строки гр. 31 и нет строки с тем же артикулом — строки не тронуты. */
  rowsSkipped: number
}

export function applyMerge(model: DtGoodsModel, incoming: readonly Goods[], plan: MergePlan, mode: MergeMode): ApplyResult {
  const items = model.items.value
  const first = items.length
  const targetIndex: number[] = []
  const toAppend: Goods[] = []
  let updated = 0
  let rowsSkipped = 0
  incoming.forEach((g, i) => {
    const m = mode === 'append' ? null : plan.matches[i]?.existing ?? null
    if (m != null && items[m]) {
      if (mergeInto(model, items[m], g, mode as 'fill' | 'replace').rowSkipped) rowsSkipped += 1
      targetIndex[i] = m
      updated += 1
    } else {
      targetIndex[i] = first + toAppend.length
      toAppend.push(g)
    }
  })
  const added = toAppend.length ? model.append(toAppend) : 0
  return { updated, added, targetIndex, rowsSkipped }
}
