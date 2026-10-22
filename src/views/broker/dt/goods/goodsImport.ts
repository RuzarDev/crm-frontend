// «Из Excel» в ДТ: разбор файла — общий с транзитом (utils/goodsExcel.ts); товар ДТ из строки строит importBuild (одни
// правила с «Из документов», пакет импорта 21.10.2026), слияние файлов и с товарами ДТ — importMerge. Здесь — вид
// упаковки по значению Excel, документы гр. 44 строк шаблона и сводка для предпросмотра.
//
// X1: столбец «Вид упаковки товара» общий разбор кладёт в `unit` (транзиту так и нужно). В ДТ `unit` — наименование
// ДЕИ (поле заблокировано, его задаёт код ТН ВЭД), поэтому значение идёт в вид упаковки товара (гр. 31,
// packageKindCode, классификатор 2013): по коду, названию или «код — название». Не распознано — никуда не пишется,
// предпросмотр показывает такие значения.
import type { ClassifierItem, Import40Doc44ItemInput } from '@/types/api'
import type { GoodsExcelRow } from '@/utils/goodsExcel'
import type { BuildResult } from './importBuild'
import { fromExcelRow, INVOICE_DOC_CODE, type ImportRow } from './importRows'

export { INVOICE_DOC_CODE }

const norm = (s: string) => s.trim().toLocaleUpperCase('ru').replace(/\s+/g, ' ')

/** Код вида упаковки по значению из Excel; null — не распознан. */
export function packageKindFrom(raw: string | null | undefined, kinds: readonly ClassifierItem[]): string | null {
  const v = norm(raw ?? '')
  if (!v) return null
  if (!kinds.length) return /^[0-9A-Z]{2}$/.test(v) ? v : null
  const byCode = kinds.find((k) => norm(k.code) === v)
  if (byCode) return byCode.code
  const byName = kinds.find((k) => norm(k.nameRu) === v)
  if (byName) return byName.code
  // «CT — картонная коробка», «CT - коробка», «CT коробка»
  const lead = /^([0-9A-ZА-Я]{1,3})\s*(?:[—–-]|\s)/.exec(v)?.[1]
  const byLead = lead ? kinds.find((k) => norm(k.code) === lead) : undefined
  return byLead ? byLead.code : null
}

/**
 * Документы гр. 44 строк импорта (шаблон декларанта: «КОД / НОМЕР / ДАТА ДОКУМЕНТА» и инвойс 04021). Одинаковые документы
 * (код + номер + дата) — одна строка гр. 44 со всеми своими товарами; indexOf — позиция товара ДТ строки i (новый товар
 * в конце или сопоставленный при повторном импорте). Документ без кода или номера не создаётся.
 */
export function dtDocsFromRows(
  rows: readonly ImportRow[], indexOf: (i: number) => number, names?: ReadonlyMap<string, string> | null,
): Import40Doc44ItemInput[] {
  const byKey = new Map<string, { doc: Import40Doc44ItemInput; goods: number[] }>()
  rows.forEach((r, i) => {
    for (const d of r.docs) {
      if (!d.typeCode || !d.number) continue
      const key = `${d.typeCode}|${d.number}|${d.date ?? ''}`
      let e = byKey.get(key)
      if (!e) {
        e = {
          doc: {
            // «Вид документа» — из классификатора 2009 (e2e-4: пустое название не уходило в XML); нет — сервер по коду
            docTypeCode: d.typeCode, docTypeName: names?.get(d.typeCode) ?? null, docNumber: d.number, docDate: d.date,
            goodsItemIndex: null, appliesToAll: false,
            goodsItemIndexes: null, docStartDate: null, docValidityDate: null, issueCountryCode: null, presentKindCode: '0',
          },
          goods: [],
        }
        byKey.set(key, e)
      }
      const at = indexOf(i)
      if (!e.goods.includes(at)) e.goods.push(at)
    }
  })
  return [...byKey.values()].map(({ doc, goods }) => ({ ...doc, goodsItemIndexes: goods.sort((a, b) => a - b).join(',') }))
}

/** Документы гр. 44 строк Excel, новые товары — с позиции firstIndex (прежний вызов «Добавить в конец»). */
export function dtDocsFromExcel(rows: readonly GoodsExcelRow[], firstIndex: number): Import40Doc44ItemInput[] {
  return dtDocsFromRows(rows.map((r) => fromExcelRow(r, '')), (i) => firstIndex + i)
}

/** Один документ (код + номер) с разными датами в файлах (e2e-5: опечатка в дате одной строки шаблона). */
export interface DocDateConflict {
  code: string
  number: string
  /** Даты и сколько строк с каждой; header — дата из шапки самого документа (инвойс в наборе файлов). */
  dates: { date: string | null; rows: number; header?: boolean }[]
}

const docKey = (code: string | null | undefined, number: string | null | undefined) =>
  `${(code ?? '').trim()}|${(number ?? '').toLocaleUpperCase('ru-RU').replace(/[^\p{L}\p{N}]/gu, '')}`

/**
 * Документы гр. 44 с одним кодом и номером, но разными датами: в строках файла (шаблон: «ДАТА ИНВОЙСА») и в шапке
 * документа (инвойс в наборе файлов). Одна дата — не расхождение.
 */
export function docDateConflicts(rows: readonly ImportRow[], headerDocs: readonly Import40Doc44ItemInput[] = []): DocDateConflict[] {
  const groups = new Map<string, DocDateConflict>()
  const group = (code: string, number: string) => {
    const k = docKey(code, number)
    let g = groups.get(k)
    if (!g) groups.set(k, (g = { code, number, dates: [] }))
    return g
  }
  for (const r of rows) {
    for (const d of r.docs) {
      if (!d.typeCode || !d.number) continue
      const g = group(d.typeCode, d.number)
      const at = g.dates.find((x) => x.date === (d.date ?? null) && !x.header)
      if (at) at.rows += 1
      else g.dates.push({ date: d.date ?? null, rows: 1 })
    }
  }
  for (const d of headerDocs) {
    if (!d.docTypeCode || !d.docNumber || !d.docDate) continue
    const g = groups.get(docKey(d.docTypeCode, d.docNumber))
    if (g && !g.dates.some((x) => x.date === d.docDate)) g.dates.push({ date: d.docDate, rows: 0, header: true })
  }
  return [...groups.values()].filter((g) => new Set(g.dates.map((x) => x.date)).size > 1)
    .map((g) => ({ ...g, dates: [...g.dates].sort((a, b) => b.rows - a.rows) }))
}

/** Что распознано в файлах: по каждому полю — в скольких строках есть значение. */
export interface DtExcelPreview {
  rows: number
  /** Строк с действующим кодом (после проверки; не проверено — с кодом как есть). */
  withCode: number
  withoutCode: number
  recognized: {
    description: number; gross: number; net: number; quantity: number; packaging: number; places: number; value: number
    country: number; tradeCodes: number
    /** Строк со сведениями для строки характеристик гр. 31 (производитель, знак, марка, модель, артикул…). */
    characteristics: number
    cargoPart: number
    individualPackages: number
    unit: number
    rowName: number
  }
  /** Документов гр. 44 (с инвойсами), которые добавятся. */
  documents: number
  /** Значения «Вида упаковки», которых нет в классификаторе (без повторов) — в товары не попадут. */
  unknownPackaging: string[]
  /** Строк, где нетто больше брутто (goodsStatus.netOverGross): перенесутся, но такой товар — ошибка (XML не сформируется). */
  netOverGross: number
  /** Один документ с разными датами (e2e-5). */
  docDates: DocDateConflict[]
}

const has = (v: unknown) => v !== null && v !== undefined && v !== ''

/** Документы гр. 44 из шапок файлов (инвойс, упаковочный, контракт), которых нет среди документов строк. */
export function extraHeaderDocs(rows: readonly ImportRow[], headerDocs: readonly Import40Doc44ItemInput[]): Import40Doc44ItemInput[] {
  const inRows = new Set(rows.flatMap((r) => r.docs.map((d) => docKey(d.typeCode, d.number))))
  return headerDocs.filter((d) => !inRows.has(docKey(d.docTypeCode, d.docNumber)))
}

/**
 * Документы шапок файлов «Из Excel» → строки гр. 44 этой ДТ (ревью 22.10):
 * - контракт 03011 — только если в ДТ контракта ещё нет (его ставит заявка);
 * - документ с тем же кодом и номером уже есть в ДТ (дата любая — старые строки бывают без даты или с датой контракта) —
 *   новая строка не добавляется: товары этого импорта дописываются к ней (appendDocs по коду, номеру и её дате);
 * - в ДТ уже были товары (goods — позиции товаров этого импорта) — документы привязываются к ним, а не «ко всем товарам»:
 *   инвойс B не попадёт в XML под товарами инвойса A. ДТ была пуста (goods = null) — «для всех товаров», как раньше.
 */
export function headerDocsForDt(
  rows: readonly ImportRow[], headerDocs: readonly Import40Doc44ItemInput[], existing: readonly Import40Doc44ItemInput[],
  goods: readonly number[] | null,
): Import40Doc44ItemInput[] {
  const hasContract = existing.some((d) => d.docTypeCode === '03011')
  const indexes = goods ? [...new Set(goods)].sort((a, b) => a - b).join(',') : null
  return extraHeaderDocs(rows, headerDocs)
    .filter((d) => !(hasContract && d.docTypeCode === '03011'))
    .map((d) => {
      const own = indexes != null ? { ...d, appliesToAll: false, goodsItemIndex: null, goodsItemIndexes: indexes } : d
      const same = existing.find((x) => docKey(x.docTypeCode, x.docNumber) === docKey(d.docTypeCode, d.docNumber))
      return same ? { ...own, docDate: same.docDate ?? null } : own
    })
}

export function excelPreview(rows: readonly ImportRow[], built: BuildResult, headerDocs: readonly Import40Doc44ItemInput[] = []): DtExcelPreview {
  const count = (pick: (r: ImportRow) => unknown) => rows.filter((r) => has(pick(r))).length
  const goods = built.goods
  const withCode = goods.filter((g) => has(g.tnvedCode)).length
  const noteRows = (kind: string) => new Set(built.notes.filter((n) => n.kind === kind && n.index >= 0).map((n) => n.index)).size
  return {
    rows: rows.length,
    withCode,
    withoutCode: rows.length - withCode,
    recognized: {
      description: count((r) => r.description),
      gross: count((r) => r.grossWeightKg),
      net: count((r) => r.netWeightKg),
      quantity: count((r) => r.quantity),
      packaging: goods.filter((g) => has(g.packageKindCode)).length,
      places: count((r) => r.places),
      value: count((r) => r.value),
      country: goods.filter((g) => has(g.countryOfOrigin)).length,
      tradeCodes: rows.filter((r) => r.ntins.length > 0 || !!r.gtin).length,
      characteristics: rows.filter((r) => [r.manufacturerName, r.tradeMarkName, r.productMarkName, r.productModelName,
        r.productArticle, r.serialNumbers, r.standardName, r.productSortName].some((v) => !!v)).length,
      cargoPart: rows.filter((r) => (r.cargoPartQuantity ?? 0) > 0).length,
      individualPackages: rows.filter((r) => (r.individualPackages ?? 0) > 0).length,
      unit: count((r) => r.unitText),
      rowName: count((r) => r.rowName),
    },
    documents: dtDocsFromRows(rows, (i) => i).length + extraHeaderDocs(rows, headerDocs).length,
    unknownPackaging: [...new Set(built.notes.filter((n) => n.kind === 'unknownPackaging' && n.detail).map((n) => n.detail!.trim()))],
    netOverGross: noteRows('netOverGross'),
    docDates: docDateConflicts(rows, headerDocs),
  }
}
