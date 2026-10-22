// Импорт в ДТ (пакет 21.10.2026): товар ДТ из строки импорта — одни правила для «Из Excel» и «Из документов».
//
// №1  Количество: гр. 41 — только при ДЕИ кода; у кода без ДЕИ (или ДЕИ неизвестна) количество идёт в строку гр. 31 с
//     единицей ОКЕИ из файла. Единица файла ≠ ДЕИ — гр. 41 пусто, количество в строку, заметка (В6).
// №2/5/16 Строка характеристик гр. 31 есть у каждого товара: производитель, знак, марка, модель, артикул, ГОСТ, сорт,
//     серийные — из файла, ЗАГЛАВНЫМИ; стоимость строки — значением (В3); наименование строки — только из столбца
//     «ХАРАКТЕРИСТИКА» (В4). Производитель = отправитель — только по опции (В9, по умолчанию выключено).
// №3  Упаковка: наличие — из столбца, иначе «1 — С упаковкой» при местах; вид — из столбца или однозначных слов
//     документа («Cartons», «纸箱» → коробка); число упаковок — из столбца, иначе = мест при известном виде (В7).
// №4  Страна происхождения — из файла; нет — опция defaultOriginCode (В8, по умолчанию выключено).
// №9  Код — только действующий 10-значный, не номер документа; «Описание из ТН ВЭД» — название кода из справочника.
// Импорт 2.0 (22.10.2026): описание из двуязычной ячейки — только русская часть (2.4); модель — из описания, если
//     своего столбца нет (2.3); места текстом, которые однозначно не определить, — пусто с замечанием (2.5).
import type { ClassifierItem, Import40GoodsItemInput } from '@/types/api'
import { hasHan, modelFromText, packagingWord, russianPart, upperRu } from '@/utils/importText'
import { blankCharacteristic } from './editor/characteristics'
import { okeiFromText } from './editor/okei'
import { netOverGross } from './goodsStatus'
import { packageKindFrom } from './goodsImport'
import type { ImportRow } from './importRows'
import { normCode, type ResolveResult } from './importResolve'
import { newDtGoodsItem } from './useDtGoods'

export interface BuildOptions {
  /** В9: подставить отправителя производителем, где производителя нет (по умолчанию — нет). */
  senderAsManufacturer?: string | null
  /** В8: страна происхождения тем, у кого её нет (цифровой ОКСМ; по умолчанию — нет). */
  defaultOriginCode?: string | null
  /** Перенести коды не из справочника как есть (по умолчанию — поле кода пустое). */
  keepInvalidCodes?: boolean
}

/** Значения по умолчанию решений владельца В8/В9 — одни для «Из Excel» (галочки) и «Из документов» (без предпросмотра). */
export const SENDER_AS_MANUFACTURER_DEFAULT = false
export const DEFAULT_ORIGIN_DEFAULT = false

export interface BuildCtx {
  /** Гр. 22: валюта товаров (пусто — валюта строки файла или без валюты). */
  currency: string | null | undefined
  /** Классификатор 2013 (виды упаковки). */
  packageKinds: readonly ClassifierItem[]
  /** Проверка кодов; null — не проводилась (как «не удалась»). */
  resolved: ResolveResult | null
  options?: BuildOptions
}

export type BuildNoteKind =
  | 'invalidCode' | 'codesNotChecked' | 'toRow' | 'noUnit' | 'deiMismatch' | 'unknownUnit' | 'unknownPackaging'
  | 'unknownCountry' | 'packagingDefault' | 'netOverGross' | 'han' | 'placesRounded' | 'senderAsManufacturer' | 'defaultOrigin'
  /** Импорт 2.0: из двуязычного описания взята русская часть; модель — из описания; места текстом неоднозначны. */
  | 'hanDropped' | 'modelFromDescription' | 'placesAmbiguous'

export interface BuildNote {
  /** Позиция строки (с 0). */
  index: number
  kind: BuildNoteKind
  detail?: string
}

export interface BuildResult {
  goods: Import40GoodsItemInput[]
  notes: BuildNote[]
  /** Куда пошло количество каждой строки: 41 — гр. 41, 31 — строка гр. 31, null — количества нет. */
  quantityTo: (41 | 31 | null)[]
}

const has = (v: unknown) => v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && Number.isNaN(v))
const norm = (s: string) => s.trim().toLocaleUpperCase('ru')

/**
 * Вид упаковки по словам документа → код классификатора 2013: коробка — CT (или вид с «картон» в названии), мешок — BG
 * (или «мешок»), поддон — вид с «паллет/поддон» в названии (PX/PL — по классификатору). Классификатор не загружен —
 * только CT и BG.
 */
export function packageKindByWord(text: string | null | undefined, kinds: readonly ClassifierItem[]): string | null {
  const word = packagingWord(text)
  if (!word) return null
  const byCode = (code: string) => (!kinds.length || kinds.some((k) => norm(k.code) === code) ? code : null)
  const byName = (re: RegExp) => kinds.find((k) => re.test(k.nameRu ?? ''))?.code ?? null
  if (word === 'carton') return byCode('CT') ?? byName(/картон/i)
  if (word === 'bag') return byCode('BG') ?? byName(/меш[оо]?к|мешк/i)
  if (!kinds.length) return null
  return (['PX', 'PL'].map((c) => kinds.find((k) => norm(k.code) === c && /паллет|поддон/i.test(k.nameRu ?? ''))?.code).find(Boolean))
    ?? byName(/паллет|поддон/i)
}

export function buildGoods(rows: readonly ImportRow[], ctx: BuildCtx): BuildResult {
  const notes: BuildNote[] = []
  const quantityTo: BuildResult['quantityTo'] = []
  const opts = ctx.options ?? {}
  const resolved = ctx.resolved
  const failed = !resolved || resolved.failed
  const rejected = new Map((resolved?.rejected ?? []).map((r) => [r.code, r.reason]))
  if (failed && rows.some((r) => r.tnvedCode)) notes.push({ index: -1, kind: 'codesNotChecked' })

  const goods = rows.map((r, index) => {
    const note = (kind: BuildNoteKind, detail?: string) => notes.push({ index, kind, detail })
    const g = newDtGoodsItem(ctx.currency)
    g.currency = ctx.currency || r.currency || null

    // ---- №9: код ----
    const code = r.tnvedCode ? normCode(r.tnvedCode) : null
    let codeInfo = code ? resolved?.byCode.get(code) ?? null : null
    const reason = code ? rejected.get(code) : undefined
    if (code) {
      if (reason) {
        note('invalidCode', `${code}:${reason}`)
        g.tnvedCode = opts.keepInvalidCodes ? code : null
        codeInfo = null
      } else if (failed || codeInfo?.valid) {
        g.tnvedCode = code
      } else {
        note('invalidCode', `${code}:notInDirectory`)
        g.tnvedCode = opts.keepInvalidCodes ? code : null
      }
    }
    g.tnvedDescription = codeInfo?.valid ? codeInfo.name : null

    // ---- описание: двуязычная ячейка — только русская часть (2.4); только китайский — как есть, с замечанием ----
    const description = russianPart(r.description)
    g.description = upperRu(description)
    if (hasHan(description)) note('han')
    else if (hasHan(r.description)) note('hanDropped')

    // ---- №2/5: строка характеристик гр. 31 ----
    const row = { ...blankCharacteristic() }
    row.name = upperRu(r.rowName)
    row.manufacturerName = upperRu(r.manufacturerName)
    row.tradeMarkName = upperRu(r.tradeMarkName)
    row.productMarkName = upperRu(r.productMarkName)
    row.productModelName = upperRu(r.productModelName)
    if (!row.productModelName) {
      // «Model "RC1001"», «Модель: "CD1"», «型号“RC1001”» в описании (2.3); нет — пусто, «ОТСУТСТВУЕТ» не выдумываем
      row.productModelName = upperRu(modelFromText(r.description))
      if (row.productModelName) note('modelFromDescription', row.productModelName)
    }
    row.productArticle = upperRu(r.productArticle)
    row.standardName = upperRu(r.standardName)
    row.productSortName = upperRu(r.productSortName)
    row.serialNumbers = upperRu(r.serialNumbers)
    row.invoiceValue = r.value ?? null
    if (!row.manufacturerName && opts.senderAsManufacturer) {
      row.manufacturerName = upperRu(opts.senderAsManufacturer)
      note('senderAsManufacturer')
    }

    // ---- №1: количество — гр. 41 или строка гр. 31 ----
    const q = r.quantity != null && r.quantity > 0 ? r.quantity : null
    const unit = r.unitText ? okeiFromText(r.unitText) : null
    if (r.unitText && !unit) note('unknownUnit', r.unitText)
    const dei = failed || !codeInfo?.valid ? undefined : codeInfo.dei // undefined — ДЕИ неизвестна
    if (q == null) quantityTo.push(null)
    else if (dei && (!unit || unit === dei.code)) {
      g.quantity = q
      g.unitCode = dei.code
      g.unit = dei.shortName || dei.name
      quantityTo.push(41) // строка гр. 31 следует за гр. 41 (В2)
    } else {
      if (dei && unit && unit !== dei.code) note('deiMismatch', `${r.unitText} ≠ ${dei.shortName || dei.code}`)
      row.quantity = q
      row.unitCode = unit
      if (!unit) note('noUnit')
      if (dei === null || dei === undefined) note('toRow')
      quantityTo.push(31)
    }
    g.characteristics = [row]

    // ---- веса, стоимость, места ----
    g.grossWeightKg = r.grossWeightKg ?? null
    g.netWeightKg = r.netWeightKg ?? null
    g.customsValue = r.value ?? null
    if (netOverGross(g)) note('netOverGross')
    const places = r.places != null && r.places > 0 ? Math.round(r.places) : null
    if (places != null && places !== r.places) note('placesRounded', String(r.places))
    if (places == null && r.placesNote) note('placesAmbiguous', r.placesNote)
    g.packagesCount = places
    g.cargoPlacesQuantity = places

    // ---- №3: упаковка ----
    let kind = packageKindFrom(r.packageKindText, ctx.packageKinds) ?? packageKindByWord(r.packageKindText, ctx.packageKinds)
    if (r.packageKindText && !kind) note('unknownPackaging', r.packageKindText)
    let defaulted = false
    if (!kind && !r.packageKindText && places != null) {
      kind = packageKindByWord(r.packagingHint, ctx.packageKinds)
      if (kind) defaulted = true
    }
    g.packageKindCode = kind
    if (r.packageAvailabilityCode) g.packageAvailabilityCode = r.packageAvailabilityCode
    else if (places != null) {
      g.packageAvailabilityCode = '1'
      defaulted = true
    }
    if (r.packageQuantity != null && r.packageQuantity > 0) g.packageQuantity = Math.round(r.packageQuantity)
    else if (kind && places != null && g.packageAvailabilityCode === '1') {
      g.packageQuantity = places
      defaulted = true
    }
    if (defaulted) note('packagingDefault')

    // ---- №4: страна ----
    if (r.countryCode) g.countryOfOrigin = r.countryCode
    else {
      if (r.originText) note('unknownCountry', r.originText)
      if (opts.defaultOriginCode) {
        g.countryOfOrigin = opts.defaultOriginCode
        note('defaultOrigin')
      }
    }

    // ---- часть места, индивидуальные упаковки (шаблон декларанта) ----
    const cargoPart = r.cargoPartQuantity != null && r.cargoPartQuantity > 0 ? Math.round(r.cargoPartQuantity) : null
    const indiv = r.individualPackages != null && r.individualPackages > 0 ? r.individualPackages : null
    if (cargoPart != null || indiv != null) {
      // Как в редакторе (GoodsPackagingSection.ensureExtras): пустые списки марок и автомобилей.
      const extras = (g.extras ??= { traceable: false, exciseStamps: [], vehicles: [] })
      if (cargoPart != null) extras.cargoPartQuantity = cargoPart
      if (indiv != null) extras.packages = [{ kind: '1', packageKindCode: null, quantity: indiv, description: null }]
    }

    // ---- гр. 33.3 ----
    g.ntins = [...new Set(r.ntins)]
    g.gtin = r.gtin ?? null
    return g
  })
  return { goods, notes, quantityTo }
}

/** Заметки одного вида (без повторов detail) — для предпросмотра и окна замечаний. */
export function notesOf(notes: readonly BuildNote[], kind: BuildNoteKind): BuildNote[] {
  return notes.filter((n) => n.kind === kind)
}

/** Уникальные значения detail заметок одного вида («шт», «PC»…). */
export function noteDetails(notes: readonly BuildNote[], kind: BuildNoteKind): string[] {
  return [...new Set(notes.filter((n) => n.kind === kind && has(n.detail)).map((n) => n.detail!))]
}

/** Сколько строк с заметкой этого вида. */
export const noteCount = (notes: readonly BuildNote[], kind: BuildNoteKind): number =>
  new Set(notes.filter((n) => n.kind === kind && n.index >= 0).map((n) => n.index)).size
