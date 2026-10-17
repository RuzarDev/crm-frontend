import apiClient from './client'

// Сверка документов поставки (17.10): по разбору пакета документов (Aqniet) — где документы разошлись между собой,
// с заявкой (транспорт) и с ДТ (контракт и инвойс в гр. 44, транспорт гр. 21, места, брутто, нетто). Сотрудникам.
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
  discrepancies: DocumentDiscrepancy[]
}

const base = (caseId: string) => `/import40/${encodeURIComponent(caseId)}/document-checks`

export const documentChecksApi = {
  // silent — блок необязателен: сбой — блок не показывается, без тоста.
  list: async (caseId: string): Promise<DocumentCheck[]> =>
    (await apiClient.get<DocumentCheck[]>(base(caseId), { silent: true })).data,
  link: async (caseId: string, checkId: string, declarationId: string | null): Promise<void> => {
    await apiClient.put(`${base(caseId)}/${encodeURIComponent(checkId)}/declaration`, { declarationId }, { silent: true })
  },
}
