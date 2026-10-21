import apiClient from './client'

// Сверка документов поставки (17.10; по полям и по файлам — с 21.10, правка №13): по разбору пакета документов (Zircon AI)
// — что в каждом документе, что в ДТ и итог по полю; документы между собой и с заявкой. Сотрудникам.
export type DocumentCheckScope = 'documents' | 'case' | 'declaration'

export interface DocumentDiscrepancyValue {
  value: string | null
  /** document — source: документ по разбору; documents — итог по документам; case — заявка; declaration — source: номер ДТ. */
  sourceKind: 'document' | 'documents' | 'case' | 'declaration'
  source: string | null
}

export interface DocumentDiscrepancy {
  scope: DocumentCheckScope
  /** contract, invoice, invoiceDate, transport, transportDoc, tractor, trailer, sender, receiver, currency, incoterms,
   * origin, destination, quantity, packages, gross, net, value… */
  field: string
  /** Подпись сервера — запасная, если кода нет в переводах. */
  fieldLabel: string
  /** Строка товара (с 1), если расхождение по строке. */
  itemIndex: number | null
  itemDescription: string | null
  values: DocumentDiscrepancyValue[]
}

// ── Сверка по полям (правка №13, 21.10.2026) ──

/** Общий итог сверки. ok — только если совпало всё показанное; unrecognized — в документах не найдено ни одного
 * ключевого поля (номер инвойса или контракта, брутто, нетто, места, сумма); noDt — ДТ не выбрана. */
export type DocumentCheckVerdict = 'ok' | 'partial' | 'mismatch' | 'unrecognized' | 'noDt'

/** Итог строки: не найдено в документе / нет в ДТ — не совпадение, а «не сверено». */
export type DocumentCheckRowResult = 'match' | 'mismatch' | 'docsDiffer' | 'notInDocument' | 'notInDt' | 'checkName' | 'notCompared'

/** invoice | packing | invoicePacking | contract | transport | other; merged — слитые значения без файла (прежние сверки). */
export type DocumentCheckDocKind = 'invoice' | 'packing' | 'invoicePacking' | 'contract' | 'transport' | 'other' | 'merged'

export interface DocumentCheckDocValue {
  value: string | null
  /** Имя файла (у листа книги — «file.xlsx · Лист»); null — «Документы» (слитые значения). */
  fileName: string | null
  kind: DocumentCheckDocKind | string
  /** Итог этого файла, если сравнивали по файлам. */
  result?: DocumentCheckRowResult | null
}

export interface DocumentCheckRow {
  /** invoiceNumber, invoiceDate, packingNumber, packingDate, contractNumber, contractDate, gross, net, packages, quantity,
   * valueTotal, currency, sender, receiver, receiverBin, tractor, trailer, transportDoc. */
  field: string
  /** Подпись сервера — запасная. */
  fieldLabel: string
  box: string | null
  valueKind: 'text' | 'number' | 'date' | 'money'
  key: boolean
  result: DocumentCheckRowResult
  documents: DocumentCheckDocValue[]
  /** Числа — в инвариантной культуре («1198.5»), даты — ISO; списки — через «, ». */
  declarationValue: string | null
  /** dtPartial:k/n | sum42:v | notInGr44 | otherCurrency | mixedUnits | noDt | matchesFile:имя. */
  declarationNote: string | null
  /** docsSum:n. */
  documentsNote: string | null
  currency?: string | null
}

export interface DocumentCheckSource {
  fileName: string
  kind: DocumentCheckDocKind | string
  recognized: boolean
  /** scanNoOcr | noFields | noTable | legacyXls | unsupported | unreadable | browserOnly. */
  reason: string | null
  itemsCount: number
  sheet?: string | null
}

export interface DocumentCheck {
  id: string
  declarationId: string | null
  declarationNumber: string | null
  createdAtUtc: string
  sourceFileNames: string[]
  sourceDocumentTypes: string[]
  contractNumber: string | null
  invoiceNumber: string | null
  transportDocument: string | null
  transportPlates: string[]
  /** Прежний список (17.10) — новый фронт показывает rows. */
  discrepancies: DocumentDiscrepancy[]
  verdict?: DocumentCheckVerdict
  unrecognized?: boolean
  mismatchCount?: number
  notComparedCount?: number
  warningCount?: number
  rows?: DocumentCheckRow[]
  documents?: DocumentCheckSource[]
  /** Документы между собой: строки товаров и поля шапки вне таблицы. */
  itemConflicts?: DocumentDiscrepancy[]
  /** Документы и заявка (номера ТС). */
  caseDiscrepancies?: DocumentDiscrepancy[]
  declarationLabel?: string | null
  declarationSplit?: boolean
  declarationUpdatedAtUtc?: string | null
  comparedAtUtc?: string
  parsedAtUtc?: string | null
  legacy?: boolean
  canRecheck?: boolean
}

const base = (caseId: string) => `/import40/${encodeURIComponent(caseId)}/document-checks`

export const documentChecksApi = {
  // silent — блок необязателен: сбой — блок не показывается, без тоста.
  list: async (caseId: string): Promise<DocumentCheck[]> =>
    (await apiClient.get<DocumentCheck[]>(base(caseId), { silent: true })).data,
  link: async (caseId: string, checkId: string, declarationId: string | null): Promise<void> => {
    await apiClient.put(`${base(caseId)}/${encodeURIComponent(checkId)}/declaration`, { declarationId }, { silent: true })
  },
  /** «Сверить заново»: те же файлы — в распознавание, сравнение — с ДТ в её текущем виде. Ошибку показывает блок
   * (silent): 409 — файлы удалены (title Import40.DocumentCheckFilesMissing) / нечего отправить
   * (Import40.DocumentCheckNothingToParse), 502 — сервис распознавания недоступен. */
  recheck: async (caseId: string, checkId: string): Promise<DocumentCheck> =>
    (await apiClient.post<DocumentCheck>(`${base(caseId)}/${encodeURIComponent(checkId)}/recheck`, null, { silent: true })).data,
}
