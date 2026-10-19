// «Из Excel» в ДТ (волна 6б): разбор файла — общий с транзитом (utils/goodsExcel.ts, правила не меняются); здесь —
// сопоставление разобранных строк с товаром ДТ и сводка для предпросмотра («N строк, что распознано, сколько без
// кода»). Товары добавляются в конец списка (useDtGoods.append).
//
// X1: столбец «Вид упаковки товара» общий разбор кладёт в `unit` (транзиту так и нужно). В ДТ `unit` — наименование
// ДЕИ (поле заблокировано, его задаёт код ТН ВЭД), поэтому здесь значение идёт в вид упаковки товара (гр. 31,
// packageKindCode, классификатор 2013): по коду, названию или «код — название». Не распознано — никуда не пишется,
// предпросмотр показывает такие значения.
import type { ClassifierItem, Import40Doc44ItemInput, Import40GoodsItemInput, ReestrGoodsItemInput } from '@/types/api'
import type { GoodsExcelDetails, GoodsExcelRow } from '@/utils/goodsExcel'
import { okeiFromText } from './editor/okei'
import { newDtGoodsItem } from './useDtGoods'

export interface DtExcelContext {
  /** Валюта гр. 22: товары получают её (пусто — без валюты, как прежде; страница подставит гр. 22, когда её зададут). */
  currency: string | null | undefined
  /** Классификатор 2013 (виды упаковки). Пустой — не загрузился: двухзначный код берётся как есть. */
  packageKinds: readonly ClassifierItem[]
}

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

/** Товары ДТ из строк Excel: пустой товар ДТ + распознанные поля; места — и в «места груза» (гр. 31, = кол-во мест). */
export function dtGoodsFromExcel(rows: readonly GoodsExcelRow[], ctx: DtExcelContext): Import40GoodsItemInput[] {
  return rows.map((r) => {
    const g = newDtGoodsItem(ctx.currency)
    g.currency = ctx.currency || null
    g.description = r.description
    g.tnvedCode = r.tnvedCode
    g.tnvedDescription = r.tnvedDescription
    g.quantity = r.quantity
    g.packageKindCode = packageKindFrom(r.unit, ctx.packageKinds)
    g.grossWeightKg = r.grossWeightKg
    g.netWeightKg = r.netWeightKg ?? null
    // Фактурная стоимость (гр. 42): в общем разборе — customsValue, как и в товаре ДТ на фронте (см. dtPayload).
    g.customsValue = r.customsValue ?? null
    if (r.countryOfOrigin) g.countryOfOrigin = r.countryOfOrigin
    g.packagesCount = r.packagesCount
    g.cargoPlacesQuantity = r.packagesCount
    // Гр. 33.3: NTIN (без повторов) и GTIN из столбцов «NTIN» / «GTIN».
    g.ntins = [...new Set(r.ntins ?? [])]
    g.gtin = r.gtin ?? null
    if (r.details) applyDetails(g, r, r.details)
    return g
  })
}

/**
 * Шаблон декларанта: строка характеристик гр. 31 (производитель, знак, марка, модель, артикул, серийные, ГОСТ, сорт;
 * количество — со своей единицей из файла, если она есть), часть места, индивидуальные упаковки (вид выбирается в
 * карточке), наличие упаковки.
 */
function applyDetails(g: Import40GoodsItemInput, r: GoodsExcelRow, d: GoodsExcelDetails): void {
  const row = g.characteristics?.[0]
  if (row) {
    row.manufacturerName = d.manufacturerName
    row.tradeMarkName = d.tradeMarkName
    row.productMarkName = d.productMarkName
    row.productModelName = d.productModelName
    row.productArticle = d.productArticle
    row.serialNumbers = d.serialNumbers
    row.standardName = d.standardName
    row.productSortName = d.productSortName
    // Своя единица строки («47 ШТ» в тексте гр. 31); без неё строка берёт количество и ДЕИ из гр. 41.
    const unitCode = d.measureUnit ? okeiFromText(d.measureUnit) : null
    if (unitCode && r.quantity != null) {
      row.quantity = r.quantity
      row.unitCode = unitCode
    }
  }
  if (d.packageAvailabilityCode) g.packageAvailabilityCode = d.packageAvailabilityCode
  const cargoPart = d.cargoPartQuantity != null && d.cargoPartQuantity > 0 ? Math.round(d.cargoPartQuantity) : null
  const indiv = d.individualPackages != null && d.individualPackages > 0 ? d.individualPackages : null
  if (cargoPart != null || indiv != null) {
    // Как в редакторе (GoodsPackagingSection.ensureExtras): пустые списки марок и автомобилей.
    const extras = (g.extras ??= { traceable: false, exciseStamps: [], vehicles: [] })
    if (cargoPart != null) extras.cargoPartQuantity = cargoPart
    if (indiv != null) extras.packages = [{ kind: '1', packageKindCode: null, quantity: indiv, description: null }]
  }
}

/** Код вида документа «Инвойс» гр. 44. */
export const INVOICE_DOC_CODE = '04021'

/**
 * Документы гр. 44 из шаблона: «КОД / НОМЕР / ДАТА ДОКУМЕНТА» и инвойс (04021) по каждой строке. Одинаковые
 * документы (код + номер + дата) — одна строка гр. 44 со всеми своими товарами (goodsItemIndexes — позиции с 0;
 * firstIndex — позиция первого добавляемого товара). Документ без кода или номера не создаётся.
 */
export function dtDocsFromExcel(rows: readonly GoodsExcelRow[], firstIndex: number): Import40Doc44ItemInput[] {
  const byKey = new Map<string, { doc: Import40Doc44ItemInput; goods: number[] }>()
  const add = (code: string | null, number: string | null, date: string | null, goodsIndex: number) => {
    if (!code || !number) return
    const key = `${code}|${number}|${date ?? ''}`
    let e = byKey.get(key)
    if (!e) {
      e = {
        doc: {
          docTypeCode: code, docTypeName: null, docNumber: number, docDate: date, goodsItemIndex: null, appliesToAll: false,
          goodsItemIndexes: null, docStartDate: null, docValidityDate: null, issueCountryCode: null, presentKindCode: '0',
        },
        goods: [],
      }
      byKey.set(key, e)
    }
    if (!e.goods.includes(goodsIndex)) e.goods.push(goodsIndex)
  }
  rows.forEach((r, i) => {
    const d = r.details
    if (!d) return
    add(d.docTypeCode, d.docNumber, d.docDate, firstIndex + i)
    add(INVOICE_DOC_CODE, d.invoiceNumber, d.invoiceDate, firstIndex + i)
  })
  return [...byKey.values()].map(({ doc, goods }) => ({ ...doc, goodsItemIndexes: goods.join(',') }))
}

/** Что распознано в файле: по каждому полю — в скольких строках есть значение. */
export interface DtExcelPreview {
  rows: number
  withCode: number
  withoutCode: number
  recognized: {
    description: number; gross: number; net: number; quantity: number; packaging: number; places: number; value: number
    country: number; tradeCodes: number
    /** Строк со сведениями для строки характеристик гр. 31 (производитель, знак, марка, модель, артикул…). */
    characteristics: number
    cargoPart: number
    individualPackages: number
  }
  /** Документов гр. 44 (с инвойсами), которые добавятся. */
  documents: number
  /** Значения «Вида упаковки», которых нет в классификаторе (без повторов) — в товары не попадут. */
  unknownPackaging: string[]
  /** Строк, где нетто больше брутто: перенесутся, но такой товар — ошибка (XML не сформируется). */
  netOverGross: number
}

export function excelPreview(rows: readonly GoodsExcelRow[], packageKinds: readonly ClassifierItem[]): DtExcelPreview {
  const has = (v: unknown) => v !== null && v !== undefined && v !== ''
  const count = (pick: (r: ReestrGoodsItemInput) => unknown) => rows.filter((r) => has(pick(r))).length
  const withCode = count((r) => r.tnvedCode)
  const unknown = new Set<string>()
  let packaging = 0
  for (const r of rows) {
    if (!has(r.unit)) continue
    if (packageKindFrom(r.unit, packageKinds)) packaging += 1
    else unknown.add(String(r.unit).trim())
  }
  return {
    rows: rows.length,
    withCode,
    withoutCode: rows.length - withCode,
    recognized: {
      description: count((r) => r.description),
      gross: count((r) => r.grossWeightKg),
      net: count((r) => r.netWeightKg),
      quantity: count((r) => r.quantity),
      packaging,
      places: count((r) => r.packagesCount),
      value: count((r) => r.customsValue),
      country: count((r) => r.countryOfOrigin),
      tradeCodes: rows.filter((r) => (r.ntins?.length ?? 0) > 0 || !!r.gtin).length,
      characteristics: rows.filter((r) => {
        const d = r.details
        return !!d && [d.manufacturerName, d.tradeMarkName, d.productMarkName, d.productModelName, d.productArticle,
          d.serialNumbers, d.standardName, d.productSortName].some((v) => !!v)
      }).length,
      cargoPart: rows.filter((r) => (r.details?.cargoPartQuantity ?? 0) > 0).length,
      individualPackages: rows.filter((r) => (r.details?.individualPackages ?? 0) > 0).length,
    },
    documents: dtDocsFromExcel(rows, 0).length,
    unknownPackaging: [...unknown],
    netOverGross: rows.filter((r) => r.grossWeightKg != null && r.netWeightKg != null && r.netWeightKg > r.grossWeightKg).length,
  }
}
