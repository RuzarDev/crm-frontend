// «Из документов» (19.10.2026; пакет импорта 21.10.2026, №6, №7, №10, №16): Zircon AI понимает шаблон заявки KTZE и
// generic-инвойсы, но не .xls и не всё из шапки. Поэтому Excel из выбранных документов читает и наш разбор
// (utils/goodsExcel): товары инвойса и упаковочного листа сливаются (importMerge), из шапки — номер и дата, условия
// поставки, продавец с адресом, покупатель с БИН, валюта, вид упаковки («Упаковка / 包装: …»), номера машины («АВТО: …»).
//
// Правило выбора товаров (§3 №10): товары Zircon AI — база, если у них есть числа (веса, места, стоимость, количество);
// пробелы дозаполняются из Excel тем же сопоставлением, что «Из Excel» (№15). Нет товаров или они без чисел (подсказки
// PDF, только коды) — берутся товары Excel.
import type { Import40Doc44ItemInput, Import40TransportMeans } from '@/types/api'
import type { Import40ExtractionExtras, Import40ExtractionPreview } from '@/api/import40'
import type { GoodsExcelRow, GoodsSheetTotals } from '@/utils/goodsExcel'
import { countryFromText, normalizeIncotermsPlace, packagingLine, packagingWord, vehiclePlatesFrom, type CountryOption } from '@/utils/importText'
import { mergeImportDocs, type ImportConflict } from '@/views/broker/dt/goods/importMerge'
import { fromExcelRow, fromExtraction, rowHasNumbers, type ImportDoc, type ImportRow } from '@/views/broker/dt/goods/importRows'

export type ExcelDocKind = 'invoice' | 'packing' | null

export interface ExcelDocHeader {
  kind: ExcelDocKind
  number: string | null
  /** 'YYYY-MM-DD' */
  date: string | null
  incoterms: string | null
  /** Только пункт, заглавными (normalizeIncotermsPlace). */
  incotermsPlace: string | null
  sellerName: string | null
  /** Адрес продавца — строки после «Address: / Адрес: / 地址» в ячейке продавца (гр. 2, №7); без метки — вторая строка. */
  sellerAddress: string | null
  buyerName: string | null
  buyerBin: string | null
  /** Адрес покупателя/получателя из документа (запасной, если поиск по БИН не ответил). */
  buyerAddress?: string | null
  currency: string | null
  /** Контракт из шапки («CONTRACT NO: X date 02.02.2026») — гр. 44 03011 (Импорт 2.0, правка 2.8). */
  contractNumber?: string | null
  contractDate?: string | null
  /** Страна происхождения документа текстом («MADE IN CHINA» под таблицей). */
  originText?: string | null
  /**
   * Номер взят из ячейки с подписью инвойса («⑧Invoice NO.&Date», «Invoice No:»), а не из первого «№» шапки: только такой
   * номер главнее разбора Zircon AI (ревью 22.10 — первый «№» шапки часто номер контракта).
   */
  numberLabeled?: boolean
}

export interface ExcelDoc {
  fileName: string
  goods: GoodsExcelRow[]
  header: ExcelDocHeader
  /** Лист книги (у книги с несколькими таблицами — свой документ на лист). */
  sheet?: string | null
  /** Все строки листа: подписи под таблицей («Упаковка / 包装: …», «АВТО: …»). */
  rows?: unknown[][]
  /** Подпись столбца мест («件数 Cartons») — подсказка вида упаковки. */
  placesHeader?: string | null
  /** Строка-итог таблицы (места, веса, стоимость) — сверка мест по строкам с итогом документа (Импорт 2.0). */
  totals?: GoodsSheetTotals | null
}

const INCOTERMS = 'EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DAT|DDP|DDU'
const CURRENCIES = ['USD', 'EUR', 'CNY', 'RUB', 'KZT', 'GBP', 'AED', 'TRY', 'JPY', 'KRW']

const cellsText = (rows: readonly unknown[][]): string[] =>
  rows.flatMap((r) => (r ?? []).filter((c) => c != null && String(c).trim() !== '').map((c) => String(c)))

/** Вид документа по имени файла и шапке: упаковочный лист / инвойс. */
export function docKindOf(fileName: string, headerText: string): ExcelDocKind {
  const s = `${fileName} ${headerText}`.toLowerCase()
  if (/packing[\s_-]*list|упаковочн|装箱单/.test(s)) return 'packing'
  if (/invoice|инвойс|счет[\s-]*фактур|счёт[\s-]*фактур|发票/.test(s)) return 'invoice'
  return null
}

// ───────────────────────── ячейки шапки с позицией ─────────────────────────

/** Ячейка листа с текстом: строка, столбец, текст как есть (NFKC: «：» → «:», полноширинные цифры). */
interface PosCell { r: number; c: number; text: string; lines: string[] }

const posCells = (rows: readonly unknown[][]): PosCell[] =>
  rows.flatMap((row, r) => (row ?? []).flatMap((v, c) => {
    if (v == null || String(v).trim() === '') return []
    // «①…» в тексте остаётся — по нему узнаём подпись графы; строки — NFKC («：» → «:»)
    const text = String(v)
    return [{ r, c, text, lines: text.normalize('NFKC').split(/\r?\n/).map((l) => l.trim()).filter(Boolean) }]
  }))

const SELLER_LABEL = /продавец|seller|shipper|экспорт[её]р|exporter|consignor|отправитель|卖方|发货人/i
const BUYER_LABEL = /покупатель|buyer|consignee|получатель|импорт[её]р|importer|买方|收货人/i
const INVOICE_LABEL = /invoice\s*(?:no\.?|number|nr\.?|#|№)(?:\s*(?:&|and|\/)\s*date)?|инвойс\s*(?:№|no\.?|номер)|номер\s+инвойса|发票号码?|发票编号/i
const CONTRACT_LABEL = /(?:contract|контракт|договор|合同)\s*(?:no\.?|№|number|номер)?\s*[:：]?\s*/i
/** Подпись графы бланка: «①Shipper/Exporter», «②Consignee», «⑧Invoice No& Date» (номер графы ①…⑳). */
const CIRCLED = /^\s*[①-⑳]/
const LABEL_WORDS = /^[\s\d/&().,:#№-]*(?:продавец|seller|shipper|exporter|consignor|buyer|consignee|notify\s+party|покупатель|получатель|отправитель|invoice\s*(?:no\.?|number)?(?:\s*(?:&|and)\s*date)?|date|дата|port\s+of\s+(?:loading|discharge)|carrier|payment\s+terms)[\s/&().,:#№-]*(?:(?:продавец|seller|shipper|exporter|buyer|consignee|покупатель|получатель|date|дата)[\s/&().,:#№-]*)*$/i

/** Ячейка — подпись графы, а не значение («②Consignee», «Seller:»). */
const isLabelCell = (cell: PosCell): boolean =>
  CIRCLED.test(cell.text) || (cell.lines.length === 1 && LABEL_WORDS.test(cell.lines[0]))

/**
 * Значение подписи: текст после «:» в той же строке, строки ячейки ниже подписи, иначе соседняя ячейка справа (если она
 * сама не подпись — «①Shipper/Exporter | ②Consignee» в одной строке, инвойс 39th), иначе ячейка под подписью.
 */
function valueOf(cells: readonly PosCell[], cell: PosCell, lineAt: number, label: RegExp): string[] | null {
  const line = cell.lines[lineAt]
  const m = label.exec(line)
  const after = m ? line.slice(m.index + m[0].length).replace(/^[\s:：/)(-]+/, '').trim() : ''
  if (after && !LABEL_WORDS.test(after)) return [after, ...cell.lines.slice(lineAt + 1)]
  if (lineAt + 1 < cell.lines.length) return cell.lines.slice(lineAt + 1)
  const right = cells.filter((x) => x.r === cell.r && x.c > cell.c && x.c <= cell.c + 8).sort((a, b) => a.c - b.c)[0]
  if (right && !isLabelCell(right)) return right.lines
  const below = cells.find((x) => x.r === cell.r + 1 && x.c === cell.c)
  return below && !isLabelCell(below) ? below.lines : null
}

const ADDRESS_LINE = /^(?:address|add|адрес|地址)\s*[:：]?\s*/i
// Контакты и реквизиты — не адрес (ревью 22.10: «Attn: Mr. Wang», «USCC 9133…» становились адресом гр. 2). Как у Zircon AI
// (generic._STOP_LINE).
const STOP_LINE = /^(?:tel|phone|fax|e-?mail|тел|телефон|контакт|whatsapp|wechat|电话|contact|attn|attention|uscc|vat|tax\s*id|统一社会信用代码)(?![\p{L}])/iu
/**
 * Строка без метки «Address:» похожа на адрес: страна, город, провинция, улица, дом/офис (как generic._ADDRESS_LIKE Zircon
 * AI). Иначе это не адрес — лучше пусто, чем «Attn: …» в гр. 2.
 */
const ADDRESS_LIKE = /\b(?:city|province|district|county|country|street|str|road|rd|avenue|ave|building|bldg|room|floor|zone|town|village|china|p\.?\s?r\.?\s?c|kazakhstan|uzbekistan|russia|turkey|korea|india|germany)\b|[省市区县路街号]|город|г\.|ул\.|улиц|област|район|проспект|пр-т|мкр|микрорайон|дом(?![а-яё])|казахстан|китай/iu
const BIN_RE = /(?:БИН|ИИН|BIN)[^0-9]{0,12}(\d{12})/i

/** Сторона из ячейки: первая строка — имя, «БИН …» — БИН, «Address/Add/Адрес …» — адрес, без метки — строка после имени. */
function partyOf(cells: readonly PosCell[], label: RegExp, unlabeledAddress: boolean): { name: string | null; address: string | null; bin: string | null } {
  for (const cell of cells) {
    const at = cell.lines.findIndex((l) => label.test(l) && (l.length <= 60 || /[:：]/.test(l)))
    if (at < 0) continue
    const lines = valueOf(cells, cell, at, label)
    if (!lines?.length) continue
    const name = lines[0].replace(/^компания\s+/i, '').trim() || null
    const rest = lines.slice(1)
    const bin = BIN_RE.exec(lines.join('\n'))?.[1] ?? null
    const labeled = rest.find((l) => ADDRESS_LINE.test(l))
    const first = unlabeledAddress ? rest.find((l) => !BIN_RE.test(l)) : undefined
    const plain = first && !STOP_LINE.test(first) && ADDRESS_LIKE.test(first) ? first : undefined
    const address = (labeled ?? plain)?.replace(ADDRESS_LINE, '').trim() || null
    if (name) return { name, address, bin }
  }
  return { name: null, address: null, bin: null }
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const iso = (y: number, m: number, d: number) =>
  y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null

const RU_MONTHS: Record<string, number> = {
  янв: 1, фев: 2, мар: 3, апр: 4, мая: 5, май: 5, июн: 6, июл: 7, авг: 8, сен: 9, окт: 10, ноя: 11, дек: 12,
}

/**
 * Дата в тексте: «10.09.2026», «2026-09-10», ««26» января 2026 г.» (договорная форма, ревью 22.10), «September,21, 2026»,
 * «21 Sep 2026» → 'YYYY-MM-DD'; нет — null. Как parse_date Zircon AI.
 */
export function dateInText(text: string): string | null {
  const s = text.normalize('NFKC')
  let m = /(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?!\d)/.exec(s)
  if (m) return iso(+m[3], +m[2], +m[1])
  m = /(?<!\d)(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?!\d)/.exec(s)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = /(?<!\d)[«"“„']?\s*(\d{1,2})\s*[»"”“']?\s+(январ[а-яё]*|феврал[а-яё]*|март[а-яё]*|апрел[а-яё]*|ма[яй]|июн[а-яё]*|июл[а-яё]*|август[а-яё]*|сентябр[а-яё]*|октябр[а-яё]*|ноябр[а-яё]*|декабр[а-яё]*)\s+(\d{4})/iu.exec(s)
  if (m) return iso(+m[3], RU_MONTHS[m[2].toLowerCase().slice(0, 3)], +m[1])
  m = /\b([A-Za-z]{3,9})\.?,?\s*(\d{1,2})(?:st|nd|rd|th)?\s*[.,]?\s*(\d{4})\b/.exec(s)
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return iso(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2])
  m = /\b(\d{1,2})(?:st|nd|rd|th)?[\s.-]*([A-Za-z]{3,9})\.?[\s,.-]*(\d{4})\b/.exec(s)
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return iso(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1])
  return null
}

/** Номер документа: буквы любого алфавита, цифры, «-/._» (ревью 22.10: `\w` обрезал номер на первой кириллической букве). */
const DOC_NO = '[\\p{L}\\p{N}][\\p{L}\\p{N}_\\-/.]*'

/** Номер документа — первое слово, если в нём есть цифра («INV-0921     September,21, 2026» → INV-0921). */
function docNumberIn(text: string): string | null {
  const word = new RegExp(`^[\\s:#№.]*(${DOC_NO})`, 'u').exec(text)?.[1]?.replace(/[.]+$/, '') ?? ''
  return /\d/.test(word) ? word : null
}

/**
 * Контракт «CTR-… date 02.02.2026», «№ 36/СМ от 26.01.2026», «№ 5 от «26» января 2026 г.» → номер и дата. «от» делит
 * всегда (ревью 22.10: дата договорной формы — в кавычках и словами), английские слова — только перед цифрой. Как
 * parse_contract Zircon AI.
 */
export function contractFrom(text: string): { number: string | null; date: string | null } {
  const s = text.normalize('NFKC').replace(/^[\s:#№]+/, '').trim()
  const [no, rest] = s.split(/\s+от\s+|\s+(?:from|dated|date|dd\.?)\s*[:.]?\s*(?=\d)/i)
  const number = (no ?? '').replace(/^(?:no\.?|№)\s*/i, '').replace(/[\s.,;]+$/, '').trim() || null
  return { number: number && /\d/.test(number) ? number : null, date: rest ? dateInText(rest) : null }
}

/** «MADE IN CHINA», «Страна происхождения: Китай» в строках документа → страна текстом. */
function originIn(rows: readonly unknown[][]): string | null {
  for (const t of cellsText(rows)) {
    const m = /^\s*made\s+in\s+([A-Za-z .]{2,40}?)\s*\.?\s*$/i.exec(t) ?? /^\s*(?:страна\s+происхождения|country\s+of\s+origin)\s*[:：]\s*(.{2,40})$/i.exec(t)
    if (m) return m[1].trim()
  }
  return null
}

/**
 * Шапка документа над таблицей товаров (строки до заголовков), строка заголовков (валюта столбцов) и все строки листа —
 * подписи под таблицей («⑫Work Term: FCA …», «MADE IN CHINA»; Импорт 2.0, 22.10.2026).
 */
export function docHeaderFrom(
  fileName: string, headerRows: readonly unknown[][], tableHeader: readonly unknown[], allRows: readonly unknown[][] = [],
): ExcelDocHeader {
  const cells = posCells(headerRows)
  const text = cellsText(headerRows).join('\n')
  const kind = docKindOf(fileName, text)

  // Номер и дата: сначала ячейка с подписью инвойса («⑧Invoice NO.&Date», «Invoice No: INV-5»; значение справа или ниже
  // — инвойс 39th; дата — в значении или в соседней ячейке строки «Date: …»), затем «№ UR0910     Дата / 日期: 10.09.2026»
  // в строках без контракта (ревью 22.10: первый «№» шапки часто — контракт, его номер и дата становились инвойсом).
  let number: string | null = null
  let date: string | null = null
  let numberLabeled = false
  const notContract = (x: PosCell) => !x.lines.some((l) => CONTRACT_LABEL.test(l))
  for (const cell of cells) {
    const at = cell.lines.findIndex((l) => INVOICE_LABEL.test(l) && !CONTRACT_LABEL.test(l))
    if (at < 0) continue
    const v = valueOf(cells, cell, at, INVOICE_LABEL)?.join(' ') ?? ''
    const n = docNumberIn(v)
    if (!n) continue
    number = n
    numberLabeled = true
    date = dateInText(v) ?? dateInText(cells.filter((x) => x.r === cell.r && x !== cell && notContract(x)).map((x) => x.text).join('\n'))
    break
  }
  if (!number || !date) {
    const plain = cells.flatMap((c) => c.text.split(/\r?\n/)).filter((l) => !CONTRACT_LABEL.test(l.normalize('NFKC'))).join('\n')
    const numDate = new RegExp(`№\\s*(${DOC_NO})[\\s\\S]{0,60}?(\\d{1,2})[./-](\\d{1,2})[./-](\\d{4})`, 'u').exec(plain)
    number ??= numDate?.[1] ?? new RegExp(`№\\s*(${DOC_NO})`, 'u').exec(plain)?.[1] ?? null
    if (!date && numDate && numDate[1] === number) date = iso(+numDate[4], +numDate[3], +numDate[2])
  }

  // Контракт: «CONTRACT NO: CTR-… date 02.02.2026».
  let contract: { number: string | null; date: string | null } = { number: null, date: null }
  for (const cell of cells) {
    const at = cell.lines.findIndex((l) => CONTRACT_LABEL.test(l))
    if (at < 0) continue
    const v = valueOf(cells, cell, at, CONTRACT_LABEL)?.join(' ') ?? ''
    contract = contractFrom(v)
    if (contract.number) break
  }

  // «Условия поставки / 交货条件: CIF ALMATY, KAZAKHSTAN (Incoterms® 2020)» → CIF и «АЛМАТЫ» (№6); в шапке нет — подпись
  // под таблицей со словом условий («⑫Work Term ：FCA 新疆霍尔果斯» → FCA и «ХОРГОС»).
  const codeRe = new RegExp(`\\b(${INCOTERMS})\\b`)
  const footer = cellsText(allRows.slice(headerRows.length + 1)).flatMap((c) => c.split(/\r?\n/))
  const termsLine = text.split('\n').find((l) => codeRe.test(l))
    ?? footer.find((l) => codeRe.test(l.normalize('NFKC')) && /term|услови|базис|инкотерм|incoterm|交货|贸易/i.test(l))
    ?? null
  const incoterms = termsLine ? codeRe.exec(termsLine.normalize('NFKC'))![1].toUpperCase() : null
  const incotermsPlace = termsLine ? normalizeIncotermsPlace(termsLine) : null

  const seller = partyOf(cells, SELLER_LABEL, true)
  const buyer = partyOf(cells, BUYER_LABEL, false)

  const headerLine = (tableHeader ?? []).map((c) => String(c ?? '')).join(' ').toUpperCase()
  const currency = CURRENCIES.find((c) => new RegExp(`\\b${c}\\b`).test(headerLine)) ?? null

  return {
    kind, number, date, numberLabeled, incoterms, incotermsPlace, sellerName: seller.name, sellerAddress: seller.address,
    buyerName: buyer.name, buyerBin: buyer.bin, buyerAddress: buyer.address, currency,
    contractNumber: contract.number, contractDate: contract.date,
    originText: originIn(allRows.length ? allRows : headerRows),
  }
}

/**
 * Документ Excel → документ импорта (подсказка упаковки — «Упаковка: …» под таблицей или подпись столбца мест). Страна
 * происхождения документа («MADE IN CHINA» под таблицей) — строкам без своей страны (Импорт 2.0): это сведения документа,
 * а не подстановка страны отправителя (та — только галочкой, В8).
 */
export function excelImportDoc(d: ExcelDoc, countries: readonly CountryOption[] = []): ImportDoc {
  const source = d.sheet ? `${d.fileName} · ${d.sheet}` : d.fileName
  const hint = (d.rows ? packagingLine(d.rows) : null) ?? (packagingWord(d.placesHeader) ? d.placesHeader! : null)
  const origin = countryFromText(d.header.originText, countries)
  return {
    source, kind: d.header.kind,
    rows: d.goods.map((g) => {
      const row = fromExcelRow(g, source, hint)
      // своя страна текстом, которую не узнали («VIET NAM»), — не перезаписывается: замечание «Страна не распознана» нужно
      return origin && !row.countryCode && !row.originText ? { ...row, countryCode: origin } : row
    }),
  }
}

/**
 * Товары нескольких документов одной поставки одним списком (importMerge.mergeImportDocs): база — инвойс, пустые поля
 * дополняются из следующих документов, одинаковые строки (№, код + артикул, артикул + наименование…) — один товар.
 */
export function mergeExcelGoods(docs: readonly ExcelDoc[]): ImportRow[] {
  return mergeImportDocs(docs.map((d) => excelImportDoc(d))).rows
}

/**
 * Код вида транспортного документа гр. 44 (как сервер Import40TransportModeMap.DefaultDoc44): по виду транспорта заявки, а
 * если в документах есть номера машины — CMR 02015 (правка 2.8: «02011 Коносамент» при авто — ошибка).
 */
export function transportDocCode(mode: number | null | undefined, road = false): string {
  if (road) return '02015'
  return mode === 0 ? '02013' : mode === 2 ? '02017' : mode === 3 ? '02011' : '02015'
}

export interface DocumentsContext {
  /** Extras разбора (пакет импорта 21.10). */
  extras?: Import40ExtractionExtras | null
  /** Вид транспорта заявки (0 ЖД, 1 Авто, 2 Авиа, 3 Море) — код транспортного документа гр. 44. */
  transportMode?: number | null
  /** У заявки выбран внешнеторговый контракт — гр. 44 03011 поставит сервер, из документов не пишем. */
  hasCaseContract?: boolean
  countries?: readonly CountryOption[]
  /** Названия видов документов (классификатор 2009, код → наименование) — «Вид документа» строк гр. 44 (e2e-4). */
  docKindNames?: ReadonlyMap<string, string> | null
  /**
   * В наборе есть CMR (документ заявки с видом «CMR» или «cmr» в имени файла) — транспорт автомобильный: гр. 44 02015,
   * даже если номер CMR не распознан (скан; правка 2.8 — без «02011 Коносамент» при авто).
   */
  road?: boolean
}

/** Места по строкам против итога документа («共计19件. 19 мест»): сумма, итог, строк без однозначных мест. */
export interface PlacesCheck { total: number; sum: number; unknown: number }

export interface DocumentsResult {
  preview: Import40ExtractionPreview
  /** Строки товаров для importBuild. */
  rows: ImportRow[]
  doc44Items: Import40Doc44ItemInput[]
  usedExcelGoods: boolean
  /** Разные значения в документах (инвойс / упаковочный / Zircon AI). */
  conflicts: ImportConflict[]
  /** Отправитель: имя и адрес строкой (разбор — на шаге создания). */
  senderAddress: string | null
  /** БИН получателя из документов. */
  receiverBin: string | null
  /** Адрес получателя из документов (запасной к поиску по БИН). */
  receiverAddress: string | null
  /** Итог мест документа не сошёлся со строками (или есть строки без однозначных мест); null — сошёлся или итога нет. */
  placesCheck: PlacesCheck | null
}

/** Строка гр. 44 «для всех товаров»; вид документа — из классификатора 2009 (пусто — сервер дозаполнит по коду). */
export const docLine = (
  code: string, number: string | null | undefined, date: string | null | undefined, names?: ReadonlyMap<string, string> | null,
): Import40Doc44ItemInput => ({
  docTypeCode: code, docTypeName: names?.get(code) ?? null, docNumber: number ?? null, docDate: date ?? null, goodsItemIndex: null,
  appliesToAll: true, goodsItemIndexes: null, docStartDate: null, docValidityDate: null, issueCountryCode: null, presentKindCode: '0',
})

/** Один номер документа: без регистра, пробелов и знаков («UR 0910» = «ur-0910»). */
const sameDocNo = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const n = (v: string | null | undefined) => (v ?? '').toLocaleUpperCase('ru-RU').replace(/[^\p{L}\p{N}]/gu, '')
  return !!n(a) && n(a) === n(b)
}

/** «2Consignee», «⑧Invoice No& Date» — подпись графы, а не значение (старый разбор Zircon AI, правка 2.1). */
export const looksLikeLabel = (v: string | null | undefined): boolean => !!v && (CIRCLED.test(v) || LABEL_WORDS.test(v.normalize('NFKC')))

export interface HeaderDocsInput {
  headers: readonly ExcelDocHeader[]
  extras?: Import40ExtractionExtras | null
  transportMode?: number | null
  /** В документах есть номера машины или CMR — транспорт автомобильный (CMR 02015). */
  road?: boolean
  /** В наборе есть сам CMR (файл) — строка 02015 нужна и без распознанного номера. */
  cmrInBatch?: boolean
  hasCaseContract?: boolean
  docKindNames?: ReadonlyMap<string, string> | null
}

/**
 * Гр. 44 из шапок документов (правка 2.8): инвойс 04021 (номер и дата), упаковочный лист 04131 (свой номер, иначе номер
 * инвойса или «Б/Н»; своя дата, иначе дата инвойса), транспортный документ с номером (CMR 02015 при авто), контракт 03011
 * с датой (если у заявки нет своего контракта). Шапка Excel — первой (свой разбор файла), затем Zircon AI.
 */
export function headerDocs(i: HeaderDocsInput): Import40Doc44ItemInput[] {
  const { headers, extras } = i
  const names = i.docKindNames
  const out: Import40Doc44ItemInput[] = []
  const invoiceHeader = headers.find((h) => h.kind === 'invoice' && h.number)
  const excelNo = invoiceHeader?.number ?? null
  const aiNo = extras?.invoiceNumber ?? null
  const same = sameDocNo(excelNo, aiNo)
  // Номер шапки Excel главнее разбора Zircon AI, только если он из подписи инвойса или совпал с Zircon AI; иначе — как до
  // пакета: Zircon AI первым (ревью 22.10: первый «№» шапки — часто номер контракта). Дата другого разбора — только при
  // том же номере (иначе это дата другого документа).
  const excelFirst = !!excelNo && (!!invoiceHeader?.numberLabeled || !aiNo || same)
  const invoiceNo = excelFirst ? excelNo : aiNo
  const invoiceDate = excelFirst
    ? invoiceHeader?.date ?? (same ? extras?.invoiceDate ?? null : null)
    : extras?.invoiceDate ?? (same ? invoiceHeader?.date ?? null : null)
  if (invoiceNo) out.push(docLine('04021', invoiceNo, invoiceDate, names))
  const packingHeader = headers.find((h) => h.kind === 'packing')
  if (packingHeader) out.push(docLine('04131', packingHeader.number ?? invoiceNo ?? 'Б/Н', packingHeader.date ?? invoiceDate, names))
  if (extras?.transportDocument) out.push(docLine(transportDocCode(i.transportMode, i.road), extras.transportDocument, null, names))
  // CMR в наборе, а номер не распознан (скан без текста) — строка CMR без номера: декларант впишет номер, сервер не
  // добавит транспортный документ по виду транспорта заявки.
  else if (i.road && i.cmrInBatch) out.push(docLine('02015', null, null, names))
  if (!i.hasCaseContract) {
    const h = headers.find((x) => x.contractNumber)
    const number = h?.contractNumber ?? extras?.contractNumber ?? null
    const date = h?.contractNumber ? h.contractDate ?? null : extras?.contractDate ?? null
    if (number) out.push(docLine('03011', number, date, names))
  }
  return out
}

/** Сверка мест: строки против итога документа (упаковочный лист — первым). */
export function placesCheckOf(rows: readonly ImportRow[], docs: readonly ExcelDoc[]): PlacesCheck | null {
  const withTotal = [...docs].sort((a, b) => Number(b.header.kind === 'packing') - Number(a.header.kind === 'packing'))
    .find((d) => d.totals?.places != null)
  const total = withTotal?.totals?.places
  if (total == null) return null
  const sum = rows.reduce((s, r) => s + (r.places != null && r.places > 0 ? Math.round(r.places) : 0), 0)
  const unknown = rows.filter((r) => (r.places == null || r.places <= 0) && !!r.placesNote).length
  return sum === Math.round(total) && !unknown ? null : { total: Math.round(total), sum, unknown }
}

/**
 * Дополнить предпросмотр распознавания тем, что прочитал наш разбор Excel: товары (правило выше), условия поставки (только
 * пункт), продавец с адресом, покупатель с БИН, валюта, итог стоимости, номера машины («АВТО: …»), документы гр. 44
 * (headerDocs). usedExcelGoods — товары взяты из Excel (экран говорит об этом).
 */
export function applyExcelFallback(preview: Import40ExtractionPreview, docs: readonly ExcelDoc[], ctx: DocumentsContext = {}): DocumentsResult {
  const extras = ctx.extras ?? null
  const countries = ctx.countries ?? []
  const zirconRows = (preview.goodsItems ?? []).map((g, i) => fromExtraction(g, extras?.goods?.[i], 'Zircon AI', countries))
  const excelDocs = docs.map((d) => excelImportDoc(d, countries))
  const zirconHasNumbers = zirconRows.some(rowHasNumbers)
  let rows: ImportRow[] = zirconRows
  let conflicts: ImportConflict[] = []
  let usedExcelGoods = false
  if (excelDocs.length && zirconHasNumbers) {
    // База — товары Zircon AI, Excel дозаполняет пробелы и добавляет строки, которых у Zircon AI нет. Разборы разные —
    // предохранитель пары «марка / товарный знак»: столбец, прочитанный ими по-разному, не попадёт в обе графы.
    const m = mergeImportDocs([{ source: 'Zircon AI', kind: 'invoice', rows: zirconRows }, ...excelDocs], { markTwinGuard: true })
    rows = m.rows
    conflicts = m.conflicts
    usedExcelGoods = m.rows.length > zirconRows.length
  } else if (excelDocs.length) {
    // Только Excel — одно правило столбцов, предохранителя нет: «Товарный знак» одного файла и «Марка» другого — обе графы.
    const m = mergeImportDocs(excelDocs)
    if (m.rows.length) {
      rows = m.rows
      conflicts = m.conflicts
      usedExcelGoods = true
    }
  }

  const headers = docs.map((d) => d.header)
  const first = <K extends keyof ExcelDocHeader>(k: K) =>
    (headers.find((h) => h.kind === 'invoice' && h[k]) ?? headers.find((h) => h[k]))?.[k] ?? null
  // Страна происхождения документа: «MADE IN CHINA» в Excel — строкам без своей страны (и без своей нераспознанной —
  // «VIET NAM» остаётся с замечанием). Страна разбора Zircon AI (preview.originCountryCode) в товары не копируется: её
  // бывает выводит сам разбор из стран части позиций (_infer_origin_country), это не сведения документа — только гр. 16.
  const docOrigin = countryFromText(first('originText') as string | null, countries)
  if (docOrigin) rows = rows.map((r) => (r.countryCode || r.originText ? r : { ...r, countryCode: docOrigin }))
  const currency = preview.currency ?? first('currency')
  // Гр. 22 — сумма стоимости товаров документа (e2e-3: не ориентировочная сумма клиента из заявки и не итог, который
  // разошёлся бы с гр. 42 с первой минуты).
  const total = rows.some((r) => r.value != null)
    ? Math.round(rows.reduce((s, r) => s + (r.value ?? 0), 0) * 100) / 100
    : preview.totalInvoiceValue ?? null
  // Стороны: шапка Excel (свой разбор файла) — первой; «2Consignee» и прочие подписи граф — не имя (правка 2.1).
  const okName = (v: string | null | undefined) => (v && !looksLikeLabel(v) ? v : null)
  const sellerName = okName(first('sellerName') as string | null) ?? okName(preview.sender?.name)
  const buyerName = okName(first('buyerName') as string | null) ?? okName(preview.receiver?.name)

  // Тягач и прицеп из подписи «АВТО:» Excel — если разбор их не нашёл (№8 при импорте; роли — как у сервера).
  let arrival = preview.arrivalTransportNumbers
  let border = preview.borderTransportNumbers
  if (!arrival?.length) {
    const plates = docs.map((d) => (d.rows ? vehiclePlatesFrom(d.rows) : null)).find(Boolean)
    if (plates) {
      const head: Import40TransportMeans = { number: plates.tractor, typeCode: null, isTrailer: false, headNumber: null }
      arrival = plates.trailer ? [head, { number: plates.trailer, typeCode: null, isTrailer: true, headNumber: plates.tractor }] : [head]
      if (!border?.length) border = [head]
    }
  }

  const doc44Items = headerDocs({
    headers, extras, transportMode: ctx.transportMode, road: !!arrival?.length || !!ctx.road, cmrInBatch: !!ctx.road,
    hasCaseContract: ctx.hasCaseContract, docKindNames: ctx.docKindNames,
  })

  return {
    preview: {
      ...preview,
      // Номер инвойса — не номер ДТ (В21): он в гр. 44 04021.
      declarationNumber: null,
      goodsItems: preview.goodsItems,
      currency,
      totalInvoiceValue: total,
      incoterms: preview.incoterms ?? first('incoterms'),
      incotermsPlace: normalizeIncotermsPlace(preview.incotermsPlace) ?? first('incotermsPlace'),
      originCountryCode: preview.originCountryCode ?? docOrigin ?? null,
      sender: sellerName ? { ...(preview.sender ?? {}), name: sellerName } : (looksLikeLabel(preview.sender?.name) ? null : preview.sender),
      receiver: buyerName ? { ...(preview.receiver ?? {}), name: buyerName } : (looksLikeLabel(preview.receiver?.name) ? null : preview.receiver),
      arrivalTransportNumbers: arrival,
      borderTransportNumbers: border,
    },
    rows,
    doc44Items,
    usedExcelGoods,
    conflicts,
    // Адрес отправителя: разбора Zircon AI — первым, как до пакета (ревью 22.10), если он прочитал отправителя, а не подпись
    // графы («2Consignee» старого разбора); иначе шапка Excel.
    senderAddress: (okName(preview.sender?.name) && extras?.senderAddress && !looksLikeLabel(extras.senderAddress) ? extras.senderAddress : null)
      ?? first('sellerAddress') as string | null ?? extras?.senderAddress ?? null,
    receiverBin: extras?.receiverBin ?? first('buyerBin'),
    receiverAddress: first('buyerAddress') as string | null ?? extras?.receiverAddress ?? null,
    placesCheck: placesCheckOf(rows, docs),
  }
}
