// Импорт товаров из Excel («КЕДЕН ШАПКА», инвойсы, спецификации): лист и строка шапки ищутся (findGoodsHeader).
// Им пользуются раздел «Товары» записи транзита и раздел «Товары» ДТ (views/broker/dt/goods,
// с предпросмотром). Строки добавляются в конец списка — это делает экран.
import { loadXlsx } from '@/utils/xlsx'
import { parseCodes } from '@/views/broker/dt/goods/editor/tradeCodes'
import type { ReestrGoodsItemInput } from '@/types/api'

/**
 * Строка Excel. NTIN/GTIN (гр. 33.3, ДТ) — только с опцией tradeCodes: транзит их не знает, и лишние поля не должны
 * уйти в его товары.
 */
export type GoodsExcelRow = ReestrGoodsItemInput & { ntins?: string[]; gtin?: string | null; details?: GoodsExcelDetails }

/**
 * Сведения для ДТ из шаблона декларанта (опция details): строка характеристик гр. 31, часть места, индивидуальные
 * упаковки, наличие упаковки, документ гр. 44 и инвойс. Текст — ЗАГЛАВНЫМИ, даты — 'YYYY-MM-DD'. «Отсутствует» в марке,
 * товарном знаке, модели, ГОСТ, сорте и серийном номере — значение декларанта, переносится как есть («ОТСУТСТВУЕТ»,
 * решение владельца 21.10.2026); в остальных полях, а «нет», «-», «N/A» — везде, — пусто.
 */
export interface GoodsExcelDetails {
  manufacturerName: string | null
  tradeMarkName: string | null
  productMarkName: string | null
  productModelName: string | null
  productArticle: string | null
  serialNumbers: string | null
  standardName: string | null
  productSortName: string | null
  /** Единица количества как в файле («шт», «пара») — в строку характеристик кодом ОКЕИ. */
  measureUnit: string | null
  cargoPartQuantity: number | null
  individualPackages: number | null
  /** Код наличия упаковки гр. 31: 1 — с упаковкой, 0 — без, 2 — в оборудованных ёмкостях. */
  packageAvailabilityCode: string | null
  docTypeCode: string | null
  docNumber: string | null
  docDate: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  /** «ХАРАКТЕРИСТИКА» шаблона — наименование строки характеристик гр. 31 (пакет импорта 21.10). */
  rowName: string | null
  /** «Кол-во упаковок» — число упаковок гр. 31 (не места). */
  packageQuantity: number | null
  /** «№» строки таблицы — первый ключ сопоставления инвойса и упаковочного листа (№15). */
  lineNo: number | null
  /** Страна происхождения текстом, если резолвер (countryResolver) её не узнал («Made in PRC»). */
  originText: string | null
  /** Единица количества взята из заголовка столбца количества («Кол-во (pcs)»), а не из своего столбца. */
  unitFromHeader?: boolean
}

export interface GoodsExcelOptions {
  /** Столбцы «NTIN» и «GTIN» (гр. 33.3 ДТ): коды через запятую/пробел/перевод строки. */
  tradeCodes?: boolean
  /** Сведения шаблона декларанта для ДТ (GoodsExcelDetails); транзит их не знает. */
  details?: boolean
  /**
   * Страна происхождения текстом → цифровой код ОКСМ (ДТ: справочник стран страницы — «CN», «156», «Китай», «China»,
   * «中国»). Нет резолвера — как раньше, только две латинские буквы (транзит).
   */
  countryResolver?: (text: string) => string | null
}

export const GOODS_EXCEL_ACCEPT = '.xlsx,.xls'

/** Прежняя проверка файла: только .xlsx / .xls (иначе экран пишет dt.dopustimTolkoExcel). */
export function isExcelFileName(name: string): boolean {
  const n = name.toLowerCase()
  return n.endsWith('.xlsx') || n.endsWith('.xls')
}

export type GoodsExcelProblem = 'noSheets' | 'empty' | 'noGoods'

/** Ключи i18n для проблем разбора (тексты прежние). */
export const GOODS_EXCEL_MESSAGES: Record<GoodsExcelProblem, string> = {
  noSheets: 'dt.vFayleNetListov',
  empty: 'dt.faylPust',
  noGoods: 'dt.neNaydenoTovarovDlya',
}

// Столбцы источника нестабильны по написанию (пробелы/регистр/лишние слова), а сами файлы — не только шаблон
// «КЕДЕН ШАПКА», но и инвойсы/спецификации поставщиков: шапка компании сверху, «Наименование» вместо «Коммерческое
// описание», «ТН ВЭД» без «Код», английские заголовки (19.10.2026: декларант не смогла загрузить такой файл).
// Поэтому заголовки матчим по нормализованной подстроке, а «=…» — только точным совпадением (короткие слова).
type DetailField = Exclude<keyof GoodsExcelDetails, 'originText' | 'unitFromHeader'>
type ExcelField =
  | 'tnvedCode' | 'description' | 'grossWeightKg' | 'netWeightKg' | 'quantity' | 'unit' | 'packagesCount'
  | 'customsValue' | 'countryOfOrigin' | 'ntins' | 'gtin' | 'unitPrice' | DetailField

// Порядок важен: сначала более узкие поля, чтобы «Количество грузовых мест» досталось местам, а не количеству,
// «Вес нетто» — нетто, «Код ТН ВЭД» — коду, а не описанию. Каждый столбец — не больше чем одному полю.
// Китайские и английские синонимы (пакет импорта 21.10: 毛重 / 净重 / 件数 / 金额 / 品名…) — синхронно с
// zircon-ai/aqniet/generic.py GENERIC_COLUMNS.
const EXCEL_COLUMN_MATCHERS: { field: ExcelField; patterns: string[] }[] = [
  // Сведения ДТ (details) — до общих полей: «ЧАСТЬ МЕСТА» — не места, «КОЛ-ВО ИНДИВ. УПАК.» — не количество,
  // «№ ИНВОЙСА»/«КОД ДОКУМЕНТА» — не код ТН ВЭД, «ЕД.ИЗМЕРЕНИЯ» — не вид упаковки, «Кол-во упаковок» — не количество.
  { field: 'cargoPartQuantity', patterns: ['частьместа', 'частичнозанят'] },
  { field: 'individualPackages', patterns: ['колвоиндив', 'количествоиндив', 'индивупак', 'индивидуальн'] },
  { field: 'packageQuantity', patterns: ['колвоупаковок', 'количествоупаковок'] },
  { field: 'packageAvailabilityCode', patterns: ['наличиеупаковки', 'супаковкой', 'безупаковки'] },
  { field: 'invoiceDate', patterns: ['датаинвойса', 'invoicedate', 'датасчета'] },
  { field: 'invoiceNumber', patterns: ['инвойс', 'invoiceno', 'invoicenumber', 'номерсчета'] },
  { field: 'docDate', patterns: ['датадокумента'] },
  { field: 'docNumber', patterns: ['номердокумента'] },
  { field: 'docTypeCode', patterns: ['коддокумента', 'виддокумента'] },
  // Цена за единицу — никуда не переносится; столбец занят, чтобы «单价 / Цена» не взяли стоимость или единицу.
  { field: 'unitPrice', patterns: ['ценазаединицу', 'ценазаед', '单价', 'unitprice', '=цена', '=price'] },
  { field: 'measureUnit', patterns: ['единицаизмерения', 'едизмерения', 'едизм', '=ед', 'uom', '=unit', 'unitofmeasure', '计量单位', '=单位'] },
  { field: 'rowName', patterns: ['наименованиехарактеристики', '=характеристика', 'характеристикатовара'] },
  { field: 'manufacturerName', patterns: ['производитель', 'изготовитель', 'manufacturer', '生产商', '制造商'] },
  // Решение владельца 21.10.2026: «Brand / 品牌 / Бренд / Торговая марка» — товарный знак, «Марка» и «Марка товара» —
  // марка (как zircon-ai generic.py). Марка — раньше знака и только точным словом: в двуязычной шапке «Марка / 品牌»
  // русское «Марка» главнее, а «Торговая марка (товара)» маркой не становится.
  { field: 'productMarkName', patterns: ['=марка', '=маркатовара', '=mark'] },
  { field: 'tradeMarkName', patterns: ['товарныйзнак', 'торговыйзнак', 'торговаямарка', 'trademark', 'бренд', '=brand', 'brandname', '品牌', '商标'] },
  { field: 'productModelName', patterns: ['модель', '=model', 'modelno', '型号'] },
  { field: 'productArticle', patterns: ['артикул', 'article', '=sku', '=art', 'itemcode', 'productcode', '货号', '款号'] },
  { field: 'serialNumbers', patterns: ['серийн', 'serial'] },
  { field: 'standardName', patterns: ['гост', 'стандарт', '=ту'] },
  { field: 'productSortName', patterns: ['=сорт', 'сорттовара', '=grade'] },
  { field: 'packagesCount', patterns: ['количествогрузовыхмест', 'грузовыхмест', 'колвомест', 'количествомест', 'местгруза', '=мест', '=места', 'cartons', 'ctns', '=pkgs', 'places', 'numberofpackages', '件数', '箱数', '=boxes', 'cartonqty'] },
  { field: 'grossWeightKg', patterns: ['брутто', 'grossweight', '=gross', 'gw', '毛重'] },
  { field: 'netWeightKg', patterns: ['нетто', 'netweight', '=net', 'netto', 'nw', '净重'] },
  { field: 'tnvedCode', patterns: ['кодтнвэд', 'тнвэд', 'тнвед', 'hscode', '=hs', 'кодтн', '海关编码', 'hs编码', '商品编码'] },
  // Гр. 33.3 (только ДТ, опция tradeCodes): «NTIN», «NTIN (гр. 33.3)», «GTIN или другой идентификационный код (артикул)».
  { field: 'ntins', patterns: ['ntin'] },
  { field: 'gtin', patterns: ['gtin'] },
  { field: 'unit', patterns: ['видупаковки', 'типупаковки', 'packagetype', 'packingtype', '包装方式'] },
  { field: 'quantity', patterns: ['количествотовара', 'количество', 'колво', '=кол', 'qty', 'quantity', '数量', '=pcs'] },
  { field: 'customsValue', patterns: ['фактурнаястоимость', 'стоимость', 'сумма', 'amount', 'totalvalue', '=total', '=value', '金额', '总价', 'totalprice'] },
  { field: 'countryOfOrigin', patterns: ['странапроисхождения', 'countryoforigin', '=origin', '原产地', '=产地', 'madein'] },
  { field: 'description', patterns: ['коммерческоеописание', 'наименование', 'описание', 'description', 'goodsname', 'productname', '=товар', '=товары', '=product', '=goods', '=name', '品名', '货物名称', '产品描述', '商品名称', '产品名称', '=variety'] },
]
const TRADE_CODE_FIELDS: ReadonlySet<ExcelField> = new Set(['ntins', 'gtin'])
const DETAIL_FIELDS: ReadonlySet<ExcelField> = new Set<DetailField>([
  'manufacturerName', 'tradeMarkName', 'productMarkName', 'productModelName', 'productArticle', 'serialNumbers',
  'standardName', 'productSortName', 'measureUnit', 'cargoPartQuantity', 'individualPackages', 'packageAvailabilityCode',
  'docTypeCode', 'docNumber', 'docDate', 'invoiceNumber', 'invoiceDate', 'rowName', 'packageQuantity', 'lineNo',
])
/** «№», «No.», «#», «序号», «№ п/п» — номер строки таблицы (только ДТ: ключ сопоставления файлов). */
const LINE_NO_HEADER = /^(№|#|no\.?|n°|№\s*п\s*\/?\s*п|п\s*\/\s*п|item\s*no\.?|序号)$/i
/** «Отсутствует», «нет», «-», «N/A» — значения нет. */
export const ABSENT = /^(отсутству\S*|нет|не\s*указан\S*|[-—–]+|n\/?a|none)$/i
/**
 * «Отсутствует» в любом регистре — осознанное значение декларанта в марке, товарном знаке, модели, ГОСТ, сорте и серийном
 * номере строки гр. 31 (решение владельца 21.10.2026): переносится как есть, ЗАГЛАВНЫМИ.
 */
export const ABSENT_DECLARED = /^отсутству\S*$/i
/** Шапку таблицы ищем в первых строках листа (сверху бывают реквизиты, номер инвойса и т. п.). */
const HEADER_SCAN_ROWS = 30
/** Строки «Итого/Всего/Total» — не товары. */
// «Итого», «合计 / TOTAL» — где угодно в начале слова (\b в JS не видит границу кириллического слова).
export const TOTAL_ROW = /(^|[\s/|(])(итого|всего|total|subtotal|grand\s*total|合计|总计)(?=$|[\s:.,;/)])/i

/**
 * Ячейка с кодами (NTIN/GTIN). Excel хранит код числом и теряет ведущий ноль: NTIN «0200…» (13 цифр) читается как
 * 12-значное «200…» — ноль возвращаем. Текст — как есть (несколько кодов через запятую/перевод строки).
 */
function excelCodes(v: unknown): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v)) {
    const s = Math.round(v).toString()
    return s.length === 12 && s.startsWith('2') ? `0${s}` : s
  }
  return excelToStr(v)
}

/**
 * Код ТН ВЭД: «7323 99 000 0», «7323.99.000.0» — склеиваем; число теряет ведущий ноль (0101210000 → 101210000) —
 * возвращаем. Не похоже на код — как есть (предпросмотр покажет, проверка кода подсветит).
 */
function excelTnved(v: unknown): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v)) {
    const s = Math.round(v).toString()
    return s.length === 9 ? `0${s}` : s
  }
  const s = excelToStr(v)
  if (!s) return null
  const digits = s.replace(/[\s. -]/g, '')
  return /^\d{4,10}$/.test(digits) ? digits : s
}

export function normalizeHeader(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

function excelToStr(v: unknown): string | null {
  if (v == null || v === '') return null
  const s = String(v).trim()
  return s || null
}

/**
 * Число из ячейки: «1 234,5», «1,234.50», «1,234,567», «96,0», «12 кг» → 1234.5 / 1234.5 / 1234567 / 96 / 12.
 * Одна запятая — десятичная (как принято в РК/РФ: «1,234» = 1,234); разрядная — только если запятых несколько
 * или рядом есть точка.
 */
function excelToNum(v: unknown): number | null {
  if (v == null || v === '') return null
  // Excel хранит дроби с шумом (30.900000000000002) — до 6 знаков.
  const tidy = (n: number) => Math.round(n * 1e6) / 1e6
  if (typeof v === 'number') return Number.isFinite(v) ? tidy(v) : null
  let s = String(v).replace(/[\s ]/g, '')
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    // Десятичный разделитель — последний из двух, другой — разряды.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    s = s.indexOf(',') !== lastComma ? s.replace(/,/g, '') : s.replace(',', '.')
  }
  const n = parseFloat(s.replace(/[^0-9.+-]/g, ''))
  return isNaN(n) ? null : tidy(n)
}

/** Страна происхождения — только двухбуквенный код (CN, KZ); названия стран не угадываем. */
function excelCountry(v: unknown): string | null {
  const s = excelToStr(v)?.toUpperCase() ?? null
  return s && /^[A-Z]{2}$/.test(s) ? s : null
}

/** Номер строки таблицы: целое число 1…99999 (иначе пусто — это не номер позиции). */
function excelLineNo(v: unknown): number | null {
  const n = typeof v === 'number' ? v : excelToStr(v) && /^\d{1,5}\.?$/.test(excelToStr(v)!) ? parseInt(excelToStr(v)!, 10) : NaN
  return Number.isInteger(n) && n > 0 && n < 100000 ? n : null
}

/**
 * Единица количества из заголовка столбца: «Кол-во (pcs)», «Quantity, pairs», «数量(套)» → «PCS» / «PAIRS» / «SET».
 * Нет единицы в заголовке — null. Иероглифы — по смыслу: 个/件/只 → ШТ, 双 → ПАР, 套 → SET.
 */
export function unitFromHeader(header: unknown): string | null {
  const s = String(header ?? '')
  const m = /[(（,，]\s*(pcs|pc|шт\.?|sets?|pairs?|пар[аы]?|kgs?|кг|m2|м2|㎡|m|м|l|л|套|个|件|双|只)\s*[)）]?\s*$/iu.exec(s)
    ?? /[(（]\s*(pcs|pc|шт\.?|sets?|pairs?|пар[аы]?|kgs?|кг|m2|м2|㎡|套|个|件|双|只)\s*[)）]/iu.exec(s)
  if (!m) return null
  const u = m[1].toLocaleUpperCase('ru-RU').replace(/\.$/, '')
  const han: Record<string, string> = { 个: 'ШТ', 件: 'ШТ', 只: 'ШТ', 双: 'ПАР', 套: 'SET' }
  return han[u] ?? (u === '㎡' ? 'M2' : u)
}

/** Текст сведения: «Отсутствует» и т. п. — пусто, иначе ЗАГЛАВНЫМИ (как поля ДТ). */
function excelText(v: unknown): string | null {
  const s = excelToStr(v)
  if (!s || ABSENT.test(s)) return null
  return s.toLocaleUpperCase('ru-RU')
}

/** Марка, знак, модель, ГОСТ, сорт, серийный: «Отсутствует» — как есть, ЗАГЛАВНЫМИ; «нет», «-», «N/A» — пусто. */
function excelDeclaredText(v: unknown): string | null {
  const s = excelToStr(v)
  if (!s || (ABSENT.test(s) && !ABSENT_DECLARED.test(s))) return null
  return s.toLocaleUpperCase('ru-RU')
}

/** Дата: число Excel (46275 = 2026-09-10) или «10.09.2026» / «2026-09-10» → 'YYYY-MM-DD'; иначе пусто. */
function excelDate(v: unknown): string | null {
  if (v == null || v === '') return null
  const iso = (y: number, m: number, d: number) =>
    y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null
  if (v instanceof Date && !isNaN(v.getTime())) return iso(v.getFullYear(), v.getMonth() + 1, v.getDate())
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 80000) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000)
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
  }
  const s = String(v).trim()
  const ru = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s)
  if (ru) return iso(+ru[3], +ru[2], +ru[1])
  const is = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  return is ? iso(+is[1], +is[2], +is[3]) : null
}

/** Код вида документа гр. 44 — 5 цифр (Excel теряет ведущий ноль: 4021 → 04021). */
function excelDocCode(v: unknown): string | null {
  const s = excelToStr(v)?.replace(/\s/g, '') ?? null
  if (!s) return null
  return /^\d{4}$/.test(s) ? `0${s}` : /^\d{5}$/.test(s) ? s : null
}

/** Наличие упаковки: «С упаковкой» — 1, «Без упаковки» — 0, «в оборудованных ёмкостях» — 2, код 0/1/2 — как есть. */
function excelPackageAvailability(v: unknown): string | null {
  const s = excelToStr(v)?.toLowerCase() ?? null
  if (!s) return null
  if (/^[012]$/.test(s)) return s
  if (/без/.test(s)) return '0'
  if (/емкост|ёмкост|налив|насып/.test(s)) return '2'
  return /упаков/.test(s) ? '1' : null
}

/**
 * Части двуязычного заголовка для точных образцов «=…»: «Марка / 品牌», «品牌 Brand», «Brand\n品牌», «Цена (USD)» —
 * по «/», «|», переводу строки, скобкам и границе иероглифов. Целиком заголовок тоже проверяется.
 */
export function headerParts(raw: unknown): string[] {
  return String(raw ?? '')
    // «pcs/ctn», «G.W/ctn» — «на коробку», а не два заголовка: косую черту перед единицей не режем.
    .replace(/\/\s*(?=(ctns?|cartons?|box(es)?|pcs?|kgs?|units?|шт|кор|箱)\b)/giu, ' per ')
    .split(/[/|\n\r()（）]+/)
    .flatMap((p) => p.split(/(?<=\p{Script=Han})(?=[^\p{Script=Han}\s])|(?<=[^\p{Script=Han}\s])(?=\p{Script=Han})|(?<=\p{Script=Han})\s+|\s+(?=\p{Script=Han})/u))
    .map(normalizeHeader)
    .filter(Boolean)
}

function matches(norm: string, pattern: string, parts: readonly string[] = []): boolean {
  if (!pattern.startsWith('=')) return norm.includes(pattern)
  const p = pattern.slice(1)
  return norm === p || parts.includes(p)
}

/** Поля-итоги по товару: из «НЕТТО» (вес штуки) и «Вес нетто итого» в гр. 38 идёт итог. */
const TOTAL_FIELDS: ReadonlySet<ExcelField> = new Set(['grossWeightKg', 'netWeightKg', 'customsValue'])
// «TTL G.W», «TTL N.W» в инвойсах и упаковочных листах поставщиков (19.10.2026: UR0910) — тоже итог.
const TOTAL_HEADER = /итого|всего|total|ttl/
/** «на коробку / за единицу» (G.W/ctn, Цена за ед.) — не итог по товару. */
const PER_UNIT_HEADER = /ctn|carton|perpc|заед|накороб|коробк/

/**
 * Столбцы строки заголовков: поле → индекс столбца. Под одно поле бывает несколько столбцов (шаблон декларанта
 * 19.10.2026: «НЕТТО» — вес штуки, «Вес нетто итого» и его пустой дубль; «ХС (ВИД УПАКОВКИ)» пустой, «СТ (ВИД
 * УПАКОВКИ)» заполнен). Поэтому среди подходящих под самый точный образец: сначала столбец с данными (dataRows —
 * строки под шапкой), для весов и стоимости — с «итого/всего/total» в заголовке, затем первый по порядку.
 */
function headerColumns(
  headerRow: readonly unknown[], opts: GoodsExcelOptions, dataRows: readonly unknown[][] = [],
): Partial<Record<ExcelField, number>> {
  const norms = headerRow.map(normalizeHeader)
  const parts = headerRow.map(headerParts)
  const hasData = (idx: number) => dataRows.some((r) => r?.[idx] != null && String(r[idx]).trim() !== '')
  const used = new Set<number>()
  const colIndex: Partial<Record<ExcelField, number>> = {}
  if (opts.details) {
    const at = headerRow.findIndex((h) => LINE_NO_HEADER.test(String(h ?? '').trim()))
    if (at >= 0) {
      colIndex.lineNo = at
      used.add(at)
    }
  }
  for (const matcher of EXCEL_COLUMN_MATCHERS) {
    if (!opts.tradeCodes && TRADE_CODE_FIELDS.has(matcher.field)) continue
    if (!opts.details && DETAIL_FIELDS.has(matcher.field)) continue
    for (const pattern of matcher.patterns) {
      const candidates = norms.flatMap((n, i) => (n && !used.has(i) && matches(n, pattern, parts[i]) ? [i] : []))
      if (!candidates.length) continue
      const rank = (i: number) => (hasData(i) ? 0 : 4)
        + (TOTAL_FIELDS.has(matcher.field) ? (TOTAL_HEADER.test(norms[i]) ? 0 : PER_UNIT_HEADER.test(norms[i]) ? 2 : 1) : 0)
      const idx = candidates.reduce((best, i) => (rank(i) < rank(best) ? i : best))
      colIndex[matcher.field] = idx
      used.add(idx)
      break
    }
  }
  return colIndex
}

/** Поле товара, узнанное по заголовку столбца. */
export type GoodsExcelField = ExcelField

/**
 * Столбцы строки заголовков — та же логика, что у импорта товаров (headerColumns). Нужна КИЗ (гр. 31.13): раскладка
 * кодов из Excel по товарам ДТ по наименованию, коду ТН ВЭД, артикулу и модели в строке файла.
 */
export function goodsHeaderColumns(
  headerRow: readonly unknown[], opts: GoodsExcelOptions, dataRows: readonly unknown[][] = [],
): Partial<Record<GoodsExcelField, number>> {
  return headerColumns(headerRow, opts, dataRows)
}

/** Шапка таблицы — строка с кодом ТН ВЭД или описанием и хотя бы ещё одним узнанным столбцом; лучшая из первых строк. */
export function findGoodsHeader(rows: unknown[][], opts: GoodsExcelOptions = {}): { index: number; score: number } | null {
  let best: { index: number; score: number } | null = null
  for (let i = 0; i < Math.min(rows.length, HEADER_SCAN_ROWS); i++) {
    const cols = headerColumns(rows[i] ?? [], opts)
    // Цена и № строки сами по себе таблицу товаров не делают («Наименование | Цена» — не шапка товаров).
    const score = Object.keys(cols).filter((k) => k !== 'unitPrice' && k !== 'lineNo').length
    if ((cols.tnvedCode == null && cols.description == null) || score < 2) continue
    if (!best || score > best.score) best = { index: i, score }
  }
  return best
}

/** Товары из строк листа (шапка — найденная строка заголовков). Пустые и итоговые строки пропускаются. */
export function goodsFromSheetRows(rows: unknown[][], opts: GoodsExcelOptions = {}): GoodsExcelRow[] {
  const header = findGoodsHeader(rows, opts)
  if (!header) return []
  const headerRow = rows[header.index] ?? []
  const colIndex = headerColumns(headerRow, opts, rows.slice(header.index + 1, header.index + 201))
  const cell = (row: unknown[], f: ExcelField) => (colIndex[f] != null ? row[colIndex[f]!] : null)
  const headerUnit = opts.details && colIndex.quantity != null ? unitFromHeader(headerRow[colIndex.quantity]) : null

  const goods: GoodsExcelRow[] = []
  for (let i = header.index + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every((c) => c == null || c === '')) continue

    const tnvedCode = excelTnved(cell(row, 'tnvedCode'))
    const description = excelToStr(cell(row, 'description'))
    const grossWeightKg = excelToNum(cell(row, 'grossWeightKg'))
    const netWeightKg = excelToNum(cell(row, 'netWeightKg'))
    const quantity = excelToNum(cell(row, 'quantity'))
    const unit = excelToStr(cell(row, 'unit'))
    const packagesCount = excelToNum(cell(row, 'packagesCount'))
    const customsValue = excelToNum(cell(row, 'customsValue'))
    // ДТ: страна текстом — резолвером страницы (буквенный, цифровой код или название); не узнана — в details.originText.
    const countryRaw = excelToStr(cell(row, 'countryOfOrigin'))
    const countryOfOrigin = opts.countryResolver
      ? (countryRaw ? opts.countryResolver(countryRaw) : null)
      : excelCountry(cell(row, 'countryOfOrigin'))

    const ntinsCell = excelCodes(cell(row, 'ntins'))
    const ntins = ntinsCell ? parseCodes(ntinsCell) : []
    const gtinCell = excelCodes(cell(row, 'gtin'))
    // Несколько GTIN в ячейке — по одному в строке (как в поле редактора).
    const gtin = gtinCell ? gtinCell.split(/[\r\n,;]+/).map((s) => s.trim()).filter(Boolean).join('\n') || null : null

    // «Итого» без кода — не товар (в инвойсах итог стоит в столбце описания или в первой ячейке).
    const firstText = row.find((c) => typeof c === 'string' && c.trim()) as string | undefined
    if (!tnvedCode && (TOTAL_ROW.test(description ?? '') || TOTAL_ROW.test(firstText?.trim() ?? ''))) continue
    // Без кода и без наименования — не товар (итоги, подписи, «Всего мест» в объединённых ячейках).
    if (!tnvedCode && !description && (colIndex.tnvedCode != null || colIndex.description != null)) continue

    const isEmptyRow =
      !tnvedCode && !description && grossWeightKg == null && netWeightKg == null && quantity == null && unit == null
      && packagesCount == null && customsValue == null && !ntins.length && !gtin
    if (isEmptyRow) continue

    const cellUnit = excelText(cell(row, 'measureUnit'))
    const details: GoodsExcelDetails | undefined = opts.details
      ? {
          manufacturerName: excelText(cell(row, 'manufacturerName')),
          tradeMarkName: excelDeclaredText(cell(row, 'tradeMarkName')),
          productMarkName: excelDeclaredText(cell(row, 'productMarkName')),
          productModelName: excelDeclaredText(cell(row, 'productModelName')),
          productArticle: excelText(cell(row, 'productArticle')),
          serialNumbers: excelDeclaredText(cell(row, 'serialNumbers')),
          standardName: excelDeclaredText(cell(row, 'standardName')),
          productSortName: excelDeclaredText(cell(row, 'productSortName')),
          // Своего столбца единиц нет — единица из заголовка количества («总数量 Кол-во (pcs)» → PCS).
          measureUnit: cellUnit ?? headerUnit,
          ...(cellUnit == null && headerUnit ? { unitFromHeader: true } : {}),
          cargoPartQuantity: excelToNum(cell(row, 'cargoPartQuantity')),
          individualPackages: excelToNum(cell(row, 'individualPackages')),
          packageAvailabilityCode: excelPackageAvailability(cell(row, 'packageAvailabilityCode')),
          docTypeCode: excelDocCode(cell(row, 'docTypeCode')),
          docNumber: excelText(cell(row, 'docNumber')),
          docDate: excelDate(cell(row, 'docDate')),
          invoiceNumber: excelText(cell(row, 'invoiceNumber')),
          invoiceDate: excelDate(cell(row, 'invoiceDate')),
          rowName: excelText(cell(row, 'rowName')),
          packageQuantity: excelToNum(cell(row, 'packageQuantity')),
          lineNo: excelLineNo(cell(row, 'lineNo')),
          originText: countryRaw && !countryOfOrigin && opts.countryResolver ? countryRaw : null,
        }
      : undefined

    goods.push({
      ...(opts.tradeCodes ? { ntins, gtin } : {}),
      ...(details ? { details } : {}),
      description,
      tnvedCode,
      // ДТ: «Описание из ТН ВЭД» — название кода из справочника (подставит импорт после проверки кода), не текст инвойса.
      tnvedDescription: opts.details ? null : description,
      countryOfOrigin,
      quantity,
      unit,
      unitCode: null,
      grossWeightKg,
      netWeightKg,
      packagesCount,
      quantityTypeCode: null,
      customsValue,
      currency: null,
    })
  }
  return goods
}

/**
 * Читает книгу: лист с лучшей шапкой товаров (обычно первый; у инвойсов бывает «Invoice» и «Packing list»).
 * Проблема разбора — { problem } (экран показывает предупреждение); файл, который не читается, — исключение
 * (экран показывает dt.neUdalosProchitatFayl).
 */
export async function readGoodsExcel(
  file: Blob,
  opts: GoodsExcelOptions = {},
): Promise<{ goods: GoodsExcelRow[] } | { problem: GoodsExcelProblem }> {
  const doc = await readExcelDocument(file, opts)
  if ('problem' in doc) return doc
  return { goods: doc.goods }
}

/** Лист книги с таблицей товаров (пакет импорта 21.10: книга «Invoice» + «Packing list» — два документа). */
export interface ExcelSheetDoc {
  sheet: string
  goods: GoodsExcelRow[]
  /** Строки над таблицей: шапка инвойса/упаковочного листа (номер, дата, продавец, условия поставки). */
  headerRows: unknown[][]
  /** Строка заголовков таблицы. */
  tableHeader: unknown[]
  /** Все строки листа — подписи под таблицей («Упаковка / 包装: …», «АВТО: …»). */
  rows: unknown[][]
}

type SheetScan = { name: string; rows: unknown[][]; header: { index: number; score: number } | null }

async function scanWorkbook(file: Blob, opts: GoodsExcelOptions): Promise<{ sheets: SheetScan[] } | { problem: GoodsExcelProblem }> {
  const XLSX = await loadXlsx()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  if (!wb.SheetNames.length) return { problem: 'noSheets' }
  const sheets = wb.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: null, raw: true })
    return { name, rows, header: findGoodsHeader(rows, opts) }
  })
  if (!sheets.some((x) => x.rows.length)) return { problem: 'empty' }
  return { sheets }
}

const sheetDoc = (x: SheetScan, goods: GoodsExcelRow[]): ExcelSheetDoc => ({
  sheet: x.name, goods, headerRows: x.rows.slice(0, x.header!.index), tableHeader: x.rows[x.header!.index] ?? [], rows: x.rows,
})

/**
 * Документ Excel целиком: товары лучшего листа, строки над таблицей (шапка инвойса/упаковочного листа — номер, дата,
 * продавец, условия поставки) и строка заголовков таблицы. Для «Из документов» (case/steps/excelFallback).
 */
export async function readExcelDocument(
  file: Blob,
  opts: GoodsExcelOptions = {},
): Promise<{ goods: GoodsExcelRow[]; headerRows: unknown[][]; tableHeader: unknown[] } | { problem: GoodsExcelProblem }> {
  const scan = await scanWorkbook(file, opts)
  if ('problem' in scan) return scan
  let best: SheetScan | null = null
  for (const x of scan.sheets) if (x.header && (!best || x.header.score > best.header!.score)) best = x
  const goods = best ? goodsFromSheetRows(best.rows, opts) : []
  if (!best || !goods.length) return { problem: 'noGoods' }
  const doc = sheetDoc(best, goods)
  return { goods, headerRows: doc.headerRows, tableHeader: doc.tableHeader }
}

/**
 * Все листы книги с таблицей товаров — каждый отдельным документом (пакет импорта 21.10, №15: книга «Invoice» +
 * «Packing list»). Порядок — как листы в книге. Нет ни одного — { problem }.
 */
export async function readExcelDocuments(
  file: Blob,
  opts: GoodsExcelOptions = {},
): Promise<{ docs: ExcelSheetDoc[] } | { problem: GoodsExcelProblem }> {
  const scan = await scanWorkbook(file, opts)
  if ('problem' in scan) return scan
  const docs = scan.sheets.flatMap((x) => {
    if (!x.header) return []
    const goods = goodsFromSheetRows(x.rows, opts)
    return goods.length ? [sheetDoc(x, goods)] : []
  })
  return docs.length ? { docs } : { problem: 'noGoods' }
}
