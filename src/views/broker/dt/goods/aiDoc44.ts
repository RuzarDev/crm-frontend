// Гр. 44 из перечня документов Zircon AI («Из документов», 29.10.2026): ответ extract-batch несёт extras.documents — вид,
// код, номер, дата и пометки каждого документа пакета. Строки добавляются к тому, что уже есть в гр. 44, одной
// дедупликацией (тот же код и номер — второй строки нет; номер пуст — дописываем номер и дату). Решения декларанта
// (Ира, 29.10) и владельца — docs/superpowers/gr44-from-ai-1029/brief.md.
import type { Import40ExtractionDocument } from '@/api/import40'
import type { Import40Doc44ItemInput } from '@/types/api'

/** Номер документа без своего номера (упаковочный лист, номер которого Zircon AI взял у инвойса). */
export const DOC_NO_NUMBER = 'Б/Н'

/** Коды, которые из перечня не добавляются: 09034 — ждём ответа декларанта (29.10.2026). */
const SKIP_CODES = new Set(['09034'])
/** Контракт и УНК: у заявки выбран контракт — их ставит сервер из карточки контракта. */
const CONTRACT_CODES = new Set(['03011', '03031'])

/** Замечание импорта (ключ broker.case.declaring.batch.*), как DocumentsNote. */
export interface AiDoc44Remark {
  key: 'doc44NoCode' | 'doc44VerifyCode' | 'doc44NoScan'
  params: Record<string, string>
}

export interface AiDoc44Options {
  /** Названия видов документов (классификатор 2009, код → наименование); нет кода — code_name из ответа. */
  docKindNames?: ReadonlyMap<string, string> | null
  /** У заявки выбран внешнеторговый контракт — 03011 и 03031 ставит сервер из карточки, из перечня не пишем. */
  hasCaseContract?: boolean
  /** ДТ выпущена или только для чтения — ничего не меняется. */
  readonly?: boolean
  /** Дата инвойса — запасная дата упаковочного «Б/Н», если инвойса с датой нет и в самом перечне. */
  invoiceDate?: string | null
  /**
   * Один документ, прочитанный двумя разборами по-разному: номер `from` у кода `code` (Zircon AI) — это строка с номером
   * `to` (её выбрал разбор шапки Excel). files — только для документов из этих файлов (пусто — для любых).
   */
  aliases?: readonly { code: string; from: string; to: string; files?: readonly string[] }[]
  /**
   * Дописывать номер в строку того же кода без номера (по умолчанию да). «Из документов» в ДТ с товарами — нет
   * (29.10.2026): пустая строка декларанта привязана к прежним товарам, документ этого разбора — новой строкой.
   */
  fillEmpty?: boolean
  /** Документ совпал со строкой existing (тот же код и номер — второй строки нет): её позиция. */
  onMatch?: (index: number) => void
}

export interface AiDoc44Result {
  /** Строки гр. 44: прежние (копии, у пустого номера может появиться номер и дата) и новые в конце. */
  rows: Import40Doc44ItemInput[]
  remarks: AiDoc44Remark[]
}

/** Номер для сравнения: без регистра, пробелов и знаков («№ UR-0910» = «ur0910»). */
export const docNoKey = (v: string | null | undefined): string => (v ?? '').toLocaleUpperCase('ru-RU').replace(/[^\p{L}\p{N}]/gu, '')

const NO_NUMBER_KEY = docNoKey(DOC_NO_NUMBER)
const isoDate = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
}
const trimmed = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t ? t : null
}
const codeOf = (r: Import40Doc44ItemInput) => (r.docTypeCode ?? '').trim()
/** Транспортные документы (020xx): один номер под разными кодами (CMR по документу, 02013 по виду транспорта) — один документ. */
const isTransport = (code: string) => code.startsWith('02')
const baseFile = (f: string) => f.split('#', 1)[0]

/**
 * Документы Zircon AI → строки гр. 44 поверх existing (чистая функция, existing не меняется):
 * 1. только forBox44 с кодом; кода нет — замечание «не определён код» (если такого номера в гр. 44 ещё нет); 09034 — нет;
 *    контракт и УНК при контракте заявки — нет (их ставит сервер);
 * 2. тот же код и номер уже есть — второй строки нет; строка того же кода без номера — дописываем номер и дату; прочие
 *    строки не меняются (то, что вписал декларант, не перетирается);
 * 3. упаковочный без своего номера (number_from_invoice) — «Б/Н», дата своя, иначе дата его инвойса;
 * 4. code_to_verify — «сверьте код», referenced_only — «скана нет» (поля примечания у строки гр. 44 нет — только замечание);
 * 5. новая строка — «для всех товаров», признак представления «0», как строки шапок документов (excelFallback.docLine).
 */
export function doc44FromAiDocuments(
  existing: readonly Import40Doc44ItemInput[],
  documents: readonly Import40ExtractionDocument[] | null | undefined,
  opts: AiDoc44Options = {},
): AiDoc44Result {
  const rows = existing.map((r) => ({ ...r }))
  const remarks: AiDoc44Remark[] = []
  if (opts.readonly || !documents?.length) return { rows, remarks }
  const remark = (r: AiDoc44Remark) => {
    if (!remarks.some((x) => x.key === r.key && JSON.stringify(x.params) === JSON.stringify(r.params))) remarks.push(r)
  }
  const flagsOf = (d: Import40ExtractionDocument) => d.flags ?? []
  const invoices = documents.filter((d) => d.kind === 'invoice' && !flagsOf(d).includes('referenced_only') && trimmed(d.number))

  for (const d of documents) {
    if (!d.forBox44) continue
    const flags = flagsOf(d)
    const code = trimmed(d.code)
    const name = trimmed(d.name) ?? trimmed(d.codeName) ?? code ?? ''
    let number = trimmed(d.number)
    if (!code) {
      // Ссылка на транспортный документ без вида и т. п.: тот же номер уже в гр. 44 (прежний путь по виду транспорта) — молча.
      if (number && rows.some((r) => docNoKey(r.docNumber) === docNoKey(number))) continue
      remark({ key: 'doc44NoCode', params: { name, file: d.sourceFiles?.[0] ?? '—' } })
      continue
    }
    if (SKIP_CODES.has(code)) continue
    if (opts.hasCaseContract && CONTRACT_CODES.has(code)) continue

    let date = isoDate(d.date)
    if (flags.includes('number_from_invoice')) {
      const own = invoices.find((i) => docNoKey(i.number) === docNoKey(number))
      date ??= isoDate(own?.date) ?? (invoices.length === 1 ? isoDate(invoices[0].date) : null) ?? isoDate(opts.invoiceDate)
      number = DOC_NO_NUMBER
    }
    const files = (d.sourceFiles ?? []).map(baseFile)
    const alias = opts.aliases?.find((a) => a.code === code && docNoKey(a.from) === docNoKey(number)
      && (!a.files?.length || a.files.some((f) => files.includes(baseFile(f)))))
    if (alias) number = alias.to
    const key = docNoKey(number)

    const sameDoc = (r: Import40Doc44ItemInput) => {
      if (!key || docNoKey(r.docNumber) !== key) return false
      if (codeOf(r) !== code && !(isTransport(code) && isTransport(codeOf(r)))) return false
      // «Б/Н» — не номер: два упаковочных без номера к разным инвойсам — разные строки (по дате)
      return key !== NO_NUMBER_KEY || !r.docDate || !date || r.docDate.slice(0, 10) === date
    }
    const hit = rows.findIndex(sameDoc)
    let inBox = hit >= 0
    if (inBox && hit < existing.length) opts.onMatch?.(hit)
    if (!inBox) {
      const empty = opts.fillEmpty === false ? undefined : rows.find((r) => codeOf(r) === code && !trimmed(r.docNumber))
      if (empty && number) {
        empty.docNumber = number
        empty.docDate ??= date
        inBox = true
      } else if (!number && rows.some((r) => codeOf(r) === code)) {
        // Номер не распознан, а строка этого вида уже есть — пустую вторую не добавляем.
        inBox = true
      }
    }
    if (!inBox) {
      rows.push({
        docTypeCode: code,
        docTypeName: opts.docKindNames?.get(code) ?? trimmed(d.codeName)?.toLocaleUpperCase('ru-RU') ?? null,
        docNumber: number, docDate: date, goodsItemIndex: null, appliesToAll: true, goodsItemIndexes: null,
        docStartDate: null, docValidityDate: null, issueCountryCode: null, presentKindCode: '0',
      })
    }
    if (d.codeToVerify || flags.includes('doc_code_to_verify')) remark({ key: 'doc44VerifyCode', params: { code, name } })
    if (flags.includes('referenced_only')) remark({ key: 'doc44NoScan', params: { name, number: number ?? '—' } })
  }
  return { rows, remarks }
}
