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
import type { GoodsExcelRow } from '@/utils/goodsExcel'
import { normalizeIncotermsPlace, packagingLine, packagingWord, vehiclePlatesFrom, type CountryOption } from '@/utils/importText'
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
  /** Адрес продавца — строки после «Address: / Адрес: / 地址» в ячейке продавца (гр. 2, №7). */
  sellerAddress: string | null
  buyerName: string | null
  buyerBin: string | null
  currency: string | null
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

/** Ячейка стороны: строки после подписи («Продавец (Seller):», «Покупатель (Buyer):») — имя, адрес, БИН. */
function partyCell(cells: readonly string[], label: RegExp): { name: string | null; address: string | null; bin: string | null } {
  for (let i = 0; i < cells.length; i++) {
    const lines = cells[i].split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const at = lines.findIndex((l) => label.test(l))
    if (at < 0) continue
    const after = lines[at].split(/[:：]/).slice(1).join(':').trim()
    const name = after || lines[at + 1] || (cells[i + 1]?.split(/\r?\n/)[0]?.trim() ?? null) || null
    const addrLine = lines.find((l) => /^(address|адрес|地址)\s*[:：]/i.test(l))
    const address = addrLine ? addrLine.replace(/^(address|адрес|地址)\s*[:：]\s*/i, '').trim() || null : null
    const bin = /(?:БИН|ИИН|BIN)[^0-9]{0,12}(\d{12})/i.exec(lines.join('\n'))?.[1] ?? null
    return { name, address, bin }
  }
  return { name: null, address: null, bin: null }
}

/** Шапка документа над таблицей товаров (строки до заголовков) и сама строка заголовков (валюта столбцов). */
export function docHeaderFrom(fileName: string, headerRows: readonly unknown[][], tableHeader: readonly unknown[]): ExcelDocHeader {
  const cells = cellsText(headerRows)
  const text = cells.join('\n')
  const kind = docKindOf(fileName, text)

  // «№ UR0910     Дата / 日期: 10.09.2026»
  const numDate = /№\s*([A-Za-zА-Яа-я0-9][\w\-/.]*)[\s\S]{0,60}?(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(text)
  const number = numDate?.[1] ?? /№\s*([A-Za-zА-Яа-я0-9][\w\-/.]*)/.exec(text)?.[1] ?? null
  const date = numDate ? `${numDate[4]}-${numDate[3].padStart(2, '0')}-${numDate[2].padStart(2, '0')}` : null

  // «Условия поставки / 交货条件: CIF ALMATY, KAZAKHSTAN (Incoterms® 2020)» → CIF и «АЛМАТЫ» (№6).
  const termsLine = text.split('\n').find((l) => new RegExp(`\\b(${INCOTERMS})\\b`).test(l)) ?? null
  const incoterms = termsLine ? new RegExp(`\\b(${INCOTERMS})\\b`).exec(termsLine)![1].toUpperCase() : null
  const incotermsPlace = termsLine ? normalizeIncotermsPlace(termsLine) : null

  const seller = partyCell(cells, /продавец|seller|shipper|экспортер|exporter|卖方/i)
  const buyer = partyCell(cells, /покупатель|buyer|consignee|получатель|импортер|importer|买方/i)

  const headerLine = (tableHeader ?? []).map((c) => String(c ?? '')).join(' ').toUpperCase()
  const currency = CURRENCIES.find((c) => new RegExp(`\\b${c}\\b`).test(headerLine)) ?? null

  return {
    kind, number, date, incoterms, incotermsPlace, sellerName: seller.name, sellerAddress: seller.address,
    buyerName: buyer.name?.replace(/^компания\s+/i, '') ?? null, buyerBin: buyer.bin, currency,
  }
}

/** Документ Excel → документ импорта (подсказка упаковки — «Упаковка: …» под таблицей или подпись столбца мест). */
export function excelImportDoc(d: ExcelDoc): ImportDoc {
  const source = d.sheet ? `${d.fileName} · ${d.sheet}` : d.fileName
  const hint = (d.rows ? packagingLine(d.rows) : null) ?? (packagingWord(d.placesHeader) ? d.placesHeader! : null)
  return { source, kind: d.header.kind, rows: d.goods.map((g) => fromExcelRow(g, source, hint)) }
}

/**
 * Товары нескольких документов одной поставки одним списком (importMerge.mergeImportDocs): база — инвойс, пустые поля
 * дополняются из следующих документов, одинаковые строки (№, код + артикул, артикул + наименование…) — один товар.
 */
export function mergeExcelGoods(docs: readonly ExcelDoc[]): ImportRow[] {
  return mergeImportDocs(docs.map(excelImportDoc)).rows
}

/** Код вида транспортного документа гр. 44 по виду транспорта заявки (как сервер Import40TransportModeMap.DefaultDoc44). */
export function transportDocCode(mode: number | null | undefined): string {
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
}

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
}

const docLine = (code: string, number: string | null | undefined, date: string | null | undefined): Import40Doc44ItemInput => ({
  docTypeCode: code, docTypeName: null, docNumber: number ?? null, docDate: date ?? null, goodsItemIndex: null, appliesToAll: true,
  goodsItemIndexes: null, docStartDate: null, docValidityDate: null, issueCountryCode: null, presentKindCode: '0',
})

/**
 * Дополнить предпросмотр распознавания тем, что прочитал наш разбор Excel: товары (правило выше), условия поставки (только
 * пункт), продавец с адресом, покупатель с БИН, валюта, итог стоимости, номера машины («АВТО: …»), документы гр. 44:
 * инвойс 04021, упаковочный лист 04131, транспортный документ (02015…) с номером, контракт 03011 (если у заявки нет
 * своего контракта). usedExcelGoods — товары взяты из Excel (экран говорит об этом).
 */
export function applyExcelFallback(preview: Import40ExtractionPreview, docs: readonly ExcelDoc[], ctx: DocumentsContext = {}): DocumentsResult {
  const extras = ctx.extras ?? null
  const zirconRows = (preview.goodsItems ?? []).map((g, i) => fromExtraction(g, extras?.goods?.[i], 'Zircon AI', ctx.countries ?? []))
  const excelDocs = docs.map(excelImportDoc)
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
  const currency = preview.currency ?? first('currency')
  const total = usedExcelGoods && rows.some((r) => r.value != null)
    ? Math.round(rows.reduce((s, r) => s + (r.value ?? 0), 0) * 100) / 100
    : preview.totalInvoiceValue ?? null
  const sellerName = preview.sender?.name || first('sellerName')
  const buyerName = preview.receiver?.name || first('buyerName')

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

  // Гр. 44: инвойс, упаковочный лист, транспортный документ, контракт.
  const doc44Items: Import40Doc44ItemInput[] = []
  const invoiceHeader = headers.find((h) => h.kind === 'invoice' && h.number)
  const invoiceNo = extras?.invoiceNumber ?? invoiceHeader?.number ?? null
  const invoiceDate = extras?.invoiceDate ?? invoiceHeader?.date ?? null
  if (invoiceNo) doc44Items.push(docLine('04021', invoiceNo, invoiceDate))
  const packingHeader = headers.find((h) => h.kind === 'packing')
  if (packingHeader) doc44Items.push(docLine('04131', packingHeader.number ?? invoiceNo, packingHeader.date ?? invoiceDate))
  if (extras?.transportDocument) doc44Items.push(docLine(transportDocCode(ctx.transportMode), extras.transportDocument, null))
  if (extras?.contractNumber && !ctx.hasCaseContract) doc44Items.push(docLine('03011', extras.contractNumber, extras.contractDate ?? null))

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
      sender: sellerName ? { ...(preview.sender ?? {}), name: sellerName } : preview.sender,
      receiver: buyerName ? { ...(preview.receiver ?? {}), name: buyerName } : preview.receiver,
      arrivalTransportNumbers: arrival,
      borderTransportNumbers: border,
    },
    rows,
    doc44Items,
    usedExcelGoods,
    conflicts,
    senderAddress: extras?.senderAddress ?? first('sellerAddress'),
    receiverBin: extras?.receiverBin ?? first('buyerBin'),
  }
}
