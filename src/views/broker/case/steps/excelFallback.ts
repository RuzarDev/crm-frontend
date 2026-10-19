// «Из документов» (19.10.2026): Zircon AI понимает только шаблон заявки KTZE — инвойс и упаковочный лист поставщика
// (UR0910: шапка с продавцом, «HS Code / ТН ВЭД | Артикул | Наименование | Cartons | Кол-во | Сумма | TTL G.W…») он
// отдаёт пустыми. Поэтому Excel из выбранных документов читает и наш разбор (utils/goodsExcel): товары инвойса и
// упаковочного листа сливаются (стоимость — из инвойса, нетто и места — из упаковочного листа), из шапки — номер и дата,
// условия поставки, продавец, валюта. Товары подставляются, только если наш разбор нашёл их больше, чем Zircon AI.
import type { Import40Doc44ItemInput } from '@/types/api'
import type { Import40ExtractionPreview, Import40ExtractionPreviewGoodsItem } from '@/api/import40'
import type { GoodsExcelRow } from '@/utils/goodsExcel'

export type ExcelDocKind = 'invoice' | 'packing' | null

export interface ExcelDocHeader {
  kind: ExcelDocKind
  number: string | null
  /** 'YYYY-MM-DD' */
  date: string | null
  incoterms: string | null
  incotermsPlace: string | null
  sellerName: string | null
  currency: string | null
}

export interface ExcelDoc {
  fileName: string
  goods: GoodsExcelRow[]
  header: ExcelDocHeader
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

/** Шапка документа над таблицей товаров (строки до заголовков) и сама строка заголовков (валюта столбцов). */
export function docHeaderFrom(fileName: string, headerRows: readonly unknown[][], tableHeader: readonly unknown[]): ExcelDocHeader {
  const cells = cellsText(headerRows)
  const text = cells.join('\n')
  const kind = docKindOf(fileName, text)

  // «№ UR0910     Дата / 日期: 10.09.2026»
  const numDate = /№\s*([A-Za-zА-Яа-я0-9][\w\-/.]*)[\s\S]{0,60}?(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(text)
  const number = numDate?.[1] ?? /№\s*([A-Za-zА-Яа-я0-9][\w\-/.]*)/.exec(text)?.[1] ?? null
  const date = numDate ? `${numDate[4]}-${numDate[3].padStart(2, '0')}-${numDate[2].padStart(2, '0')}` : null

  // «Условия поставки: CIF ALMATY, KAZAKHSTAN (Incoterms® 2020)»
  const terms = new RegExp(`\\b(${INCOTERMS})\\b[\\s,:]*([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\\- ]*?)(?=\\s*[,(;]|\\s{2,}|$)`, 'm').exec(text)
  const incoterms = terms?.[1]?.toUpperCase() ?? null
  const incotermsPlace = terms?.[2]?.trim().toUpperCase() || null

  // «卖方 / Продавец (Seller):\nYiwu Longju Trading Firm\nAddress: …» — строка после подписи (в той же ячейке или в следующей).
  let sellerName: string | null = null
  for (let i = 0; i < cells.length && !sellerName; i++) {
    const lines = cells[i].split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const at = lines.findIndex((l) => /продавец|seller|shipper|экспортер|exporter/i.test(l))
    if (at < 0) continue
    const after = lines[at].split(':').slice(1).join(':').trim()
    sellerName = after || lines[at + 1] || (cells[i + 1]?.split(/\r?\n/)[0]?.trim() ?? null) || null
  }

  const headerLine = (tableHeader ?? []).map((c) => String(c ?? '')).join(' ').toUpperCase()
  const currency = CURRENCIES.find((c) => new RegExp(`\\b${c}\\b`).test(headerLine)) ?? null

  return { kind, number, date, incoterms, incotermsPlace, sellerName, currency }
}

const norm = (s: string | null | undefined) => (s ?? '').toLocaleUpperCase('ru-RU').replace(/[^\p{L}\p{N}]/gu, '')
const keyOf = (g: GoodsExcelRow) => `${g.tnvedCode ?? ''}|${norm(g.details?.productArticle)}|${norm(g.description)}`

/**
 * Товары нескольких документов одной поставки одним списком: одинаковые (код + артикул + наименование) — один товар,
 * пустые поля дополняются из следующих документов. Порядок — как в первом документе; сначала инвойсы, затем остальные.
 */
export function mergeExcelGoods(docs: readonly ExcelDoc[]): GoodsExcelRow[] {
  const ordered = [...docs].sort((a, b) => (a.header.kind === 'invoice' ? 0 : 1) - (b.header.kind === 'invoice' ? 0 : 1))
  const byKey = new Map<string, GoodsExcelRow>()
  const out: GoodsExcelRow[] = []
  for (const doc of ordered) {
    const seen = new Map<string, number>()
    for (const g of doc.goods) {
      // Повтор одного и того же товара внутри документа (две строки «КОРЗИНА» с тем же артикулом) — отдельные товары.
      const base = keyOf(g)
      const n = (seen.get(base) ?? 0) + 1
      seen.set(base, n)
      const key = `${base}#${n}`
      const cur = byKey.get(key)
      if (!cur) {
        const copy: GoodsExcelRow = { ...g, details: g.details ? { ...g.details } : undefined }
        byKey.set(key, copy)
        out.push(copy)
        continue
      }
      for (const f of ['tnvedCode', 'description', 'tnvedDescription', 'countryOfOrigin', 'quantity', 'unit', 'grossWeightKg',
        'netWeightKg', 'packagesCount', 'customsValue'] as const) {
        if (cur[f] == null && g[f] != null) (cur as unknown as Record<string, unknown>)[f] = g[f]
      }
      if (g.details) {
        cur.details ??= { ...g.details }
        for (const [k, v] of Object.entries(g.details)) {
          const d = cur.details as unknown as Record<string, unknown>
          if (d[k] == null && v != null) d[k] = v
        }
      }
    }
  }
  return out
}

/** Код вида документа гр. 44: инвойс и упаковочный (отгрузочный) лист. */
const DOC_CODE: Record<'invoice' | 'packing', string> = { invoice: '04021', packing: '04131' }

/**
 * Дополнить предпросмотр распознавания тем, что прочитал наш разбор Excel: товары (если их больше, чем у Zircon AI),
 * условия поставки, продавец, валюта, итог стоимости, документы гр. 44 (инвойс и упаковочный лист — на все товары).
 * usedExcelGoods — товары взяты из Excel (экран говорит об этом).
 */
export function applyExcelFallback(preview: Import40ExtractionPreview, docs: readonly ExcelDoc[]): {
  preview: Import40ExtractionPreview
  doc44Items: Import40Doc44ItemInput[]
  usedExcelGoods: boolean
} {
  if (!docs.length) return { preview, doc44Items: [], usedExcelGoods: false }
  const merged = mergeExcelGoods(docs)
  const headers = docs.map((d) => d.header)
  const first = <K extends keyof ExcelDocHeader>(k: K) =>
    (headers.find((h) => h.kind === 'invoice' && h[k]) ?? headers.find((h) => h[k]))?.[k] ?? null
  const currency = preview.currency ?? first('currency')

  const usedExcelGoods = merged.length > (preview.goodsItems?.length ?? 0)
  const goodsItems: Import40ExtractionPreviewGoodsItem[] | null | undefined = usedExcelGoods
    ? merged.map((g) => ({
        description: g.description, tnvedCode: g.tnvedCode, countryOfOrigin: g.countryOfOrigin, quantity: g.quantity,
        packagesCount: g.packagesCount, grossWeightKg: g.grossWeightKg, netWeightKg: g.netWeightKg, invoiceValue: g.customsValue,
        currency, tradeMarkName: g.details?.tradeMarkName ?? null, productMarkName: g.details?.productMarkName ?? null,
        manufacturerName: g.details?.manufacturerName ?? null, productArticle: g.details?.productArticle ?? null,
      }))
    : preview.goodsItems

  const total = usedExcelGoods && merged.some((g) => g.customsValue != null)
    ? Math.round(merged.reduce((s, g) => s + (g.customsValue ?? 0), 0) * 100) / 100
    : preview.totalInvoiceValue ?? null
  const sellerName = first('sellerName')

  const doc44Items: Import40Doc44ItemInput[] = []
  for (const kind of ['invoice', 'packing'] as const) {
    const h = headers.find((x) => x.kind === kind && x.number)
    if (!h) continue
    doc44Items.push({
      docTypeCode: DOC_CODE[kind], docTypeName: null, docNumber: h.number, docDate: h.date, goodsItemIndex: null,
      appliesToAll: true, goodsItemIndexes: null, docStartDate: null, docValidityDate: null, issueCountryCode: null,
      presentKindCode: '0',
    })
  }

  return {
    preview: {
      ...preview,
      goodsItems,
      currency,
      totalInvoiceValue: total,
      incoterms: preview.incoterms ?? first('incoterms'),
      incotermsPlace: preview.incotermsPlace ?? first('incotermsPlace'),
      sender: preview.sender?.name ? preview.sender : sellerName ? { ...(preview.sender ?? {}), name: sellerName } as Import40ExtractionPreview['sender'] : preview.sender,
    },
    doc44Items,
    usedExcelGoods,
  }
}
