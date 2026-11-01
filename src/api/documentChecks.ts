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
  /** Ключ отметки «Принять» (scope:поле:строка) и отпечаток значений — 01.11.2026. */
  markKey?: string
  fingerprint?: string
  /** Действующая отметка «Принять» (значения с тех пор не менялись). */
  mark?: DocumentCheckMark | null
}

/** Отметка сверки (01.11.2026): exclude — исключён из сверки, accept — «В ДТ верно», manual — «Проверил». */
export type DocumentCheckMarkKind = 'exclude' | 'accept' | 'manual'
export interface DocumentCheckMark {
  kind: DocumentCheckMarkKind
  byName: string
  atUtc: string
}

/** Раздел нового вида сверки: «Исправить в ДТ» / «Проверить вручную» / «Совпадает». */
export type DocumentCheckSection = 'fix' | 'manual' | 'match'

// ── Сверка по полям (правка №13, 21.10.2026) ──

/** Общий итог сверки. ok — только если совпало всё показанное; unrecognized — в документах не найдено ни одного
 * ключевого поля (номер инвойса или контракта, брутто, нетто, места, сумма); noDt — ДТ не выбрана. */
export type DocumentCheckVerdict = 'ok' | 'partial' | 'mismatch' | 'unrecognized' | 'noDt'

/** Итог строки: не найдено в документе / нет в ДТ — не совпадение, а «не сверено». */
export type DocumentCheckRowResult = 'match' | 'mismatch' | 'docsDiffer' | 'notInDocument' | 'notInDt' | 'checkName' | 'notCompared'

/** invoice | packing | invoicePacking | contract | transport | certificate (сертификат, разрешение — в номер и сумму
 * инвойса и итоги поставки не входит) | other; merged — слитые значения без файла (прежние сверки). */
export type DocumentCheckDocKind = 'invoice' | 'packing' | 'invoicePacking' | 'contract' | 'transport' | 'certificate' | 'other' | 'merged'

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
  /** docsSum:n | packingCitesInvoice (номер упаковочного листа из разбора — номер инвойса из гр. 44: не сверено). */
  documentsNote: string | null
  currency?: string | null
  // ── 01.11.2026 ──
  section?: DocumentCheckSection
  /** Ключ отметки (row:поле). */
  markKey?: string
  /** Отпечаток значений ДТ и документов: с другим отпечатком отметка не действует. */
  fingerprint?: string
  /** Действующая отметка: accept в «Исправить», manual в «Проверить вручную». */
  mark?: DocumentCheckMark | null
  /** «Поставить в ДТ»: однозначное значение документов; null — кнопки нет. */
  applyValue?: string | null
}

export interface DocumentCheckSource {
  fileName: string
  kind: DocumentCheckDocKind | string
  recognized: boolean
  /** scanNoOcr | noFields | noTable | legacyXls | unsupported | unreadable | browserOnly. */
  reason: string | null
  itemsCount: number
  sheet?: string | null
  // ── 01.11.2026 ──
  /** Ключ источника (sha256 файла и лист / страницы) — для «Исключить из сверки». */
  key?: string
  fileId?: string | null
  /** Имена повторов того же файла. */
  duplicateNames?: string[]
  /** Исключён из сверки — кто и когда. */
  excluded?: DocumentCheckMark | null
  /** Группа поставки: 0 — главная, 1… — похоже, другая поставка; null — ни в какой. */
  shipmentGroup?: number | null
  number?: string | null
  value?: number | null
  currency?: string | null
}

export interface DocumentCheckShipmentGroup {
  invoice: string
  value: number | null
  currency: string | null
  sourceKeys: string[]
  fileNames: string[]
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
  /** Части разделённой ДТ, которые есть: ETT, VTO (у одного товара — только VTO). */
  declarationSplitRoles?: string[]
  /** В заявке нет ни одной ДТ: verdict noDt — не «выберите ДТ», выбирать не из чего. */
  noDeclarationsInCase?: boolean
  declarationUpdatedAtUtc?: string | null
  comparedAtUtc?: string
  parsedAtUtc?: string | null
  legacy?: boolean
  canRecheck?: boolean
  /** Почему «Сверить заново» недоступна: файлов сверки в заявке нет / остались только .xls и неподдерживаемые. */
  recheckBlocked?: 'filesMissing' | 'nothingToParse' | null
  // ── Новый вид сверки (01.11.2026) ──
  fixCount?: number
  acceptedCount?: number
  manualCount?: number
  manualCheckedCount?: number
  matchCount?: number
  /** Документы, похоже, от разных поставок (неисключённые файлы). */
  shipment?: { main: DocumentCheckShipmentGroup; foreign: DocumentCheckShipmentGroup[] } | null
  /** Есть нерешённое «Исправить» или файл другой поставки. */
  unresolved?: boolean
  /** «Поставить в ДТ» доступно (право, ДТ не подана). */
  canApply?: boolean
  /** Какую ДТ открывать: у разделённой — первую часть. */
  openDeclarationId?: string | null
}

/** Код 409: значения изменились с тех пор, как их видели. */
export const DOC_CHECK_CHANGED = 'Import40.DocumentCheckChanged'

/** Таймаут «Сверить заново» — как у extract-batch (import40.ts). */
export const RECHECK_TIMEOUT_MS = 220000

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
   * (Import40.DocumentCheckNothingToParse), 502 — сервис распознавания недоступен. Таймаут — как у «Из документов»
   * (extract-batch): те же файлы, сканы и PDF разбираются до пары минут, 30 с по умолчанию обрывали разбор. */
  recheck: async (caseId: string, checkId: string): Promise<DocumentCheck> =>
    (await apiClient.post<DocumentCheck>(`${base(caseId)}/${encodeURIComponent(checkId)}/recheck`, null,
      { silent: true, timeout: RECHECK_TIMEOUT_MS })).data,
  /** Отметки (01.11.2026): exclude — key источника; accept / manual — markKey и отпечаток, который видел пользователь
   * (изменился — 409 Import40.DocumentCheckChanged). Ответ — сверка с отметками. Ошибку показывает блок (silent). */
  addMarks: async (caseId: string, checkId: string, kind: DocumentCheckMarkKind,
    items: { key: string; fingerprint?: string | null }[]): Promise<DocumentCheck> =>
    (await apiClient.post<DocumentCheck>(`${base(caseId)}/${encodeURIComponent(checkId)}/marks`, { kind, items }, { silent: true })).data,
  /** Снять отметку («Вернуть», отмена «В ДТ верно» / «Проверил»); без key — все отметки этого вида у ДТ. */
  removeMarks: async (caseId: string, checkId: string, kind: DocumentCheckMarkKind, key?: string): Promise<DocumentCheck> =>
    (await apiClient.delete<DocumentCheck>(`${base(caseId)}/${encodeURIComponent(checkId)}/marks`,
      { params: { kind, ...(key ? { key } : {}) }, silent: true })).data,
  /** «Поставить в ДТ»: 409 — значения изменились (Import40.DocumentCheckChanged) или ДТ изменена другим
   * (Import40.DeclarationChanged). */
  apply: async (caseId: string, checkId: string, field: string, fingerprint: string, expectedUpdatedAtUtc: string | null | undefined): Promise<DocumentCheck> =>
    (await apiClient.post<DocumentCheck>(`${base(caseId)}/${encodeURIComponent(checkId)}/apply`,
      { field, fingerprint, expectedUpdatedAtUtc: expectedUpdatedAtUtc ?? null }, { silent: true })).data,
}
