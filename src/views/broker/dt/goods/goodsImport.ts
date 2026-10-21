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
export function dtDocsFromRows(rows: readonly ImportRow[], indexOf: (i: number) => number): Import40Doc44ItemInput[] {
  const byKey = new Map<string, { doc: Import40Doc44ItemInput; goods: number[] }>()
  rows.forEach((r, i) => {
    for (const d of r.docs) {
      if (!d.typeCode || !d.number) continue
      const key = `${d.typeCode}|${d.number}|${d.date ?? ''}`
      let e = byKey.get(key)
      if (!e) {
        e = {
          doc: {
            docTypeCode: d.typeCode, docTypeName: null, docNumber: d.number, docDate: d.date, goodsItemIndex: null, appliesToAll: false,
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
}

const has = (v: unknown) => v !== null && v !== undefined && v !== ''

export function excelPreview(rows: readonly ImportRow[], built: BuildResult): DtExcelPreview {
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
    documents: dtDocsFromRows(rows, (i) => i).length,
    unknownPackaging: [...new Set(built.notes.filter((n) => n.kind === 'unknownPackaging' && n.detail).map((n) => n.detail!.trim()))],
    netOverGross: noteRows('netOverGross'),
  }
}
