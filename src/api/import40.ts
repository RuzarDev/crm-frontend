import apiClient from './client'
import type {
  Import40TransportMeans,
  Import40GoodsPayment,
  Import40FactPayment,
  Import40GoodsItemInput,
  Import40Doc44ItemInput,
  Import40DeclarationExpense,
  DeclarationReadiness,
} from '@/types/api'

export type Import40Action =
  | 'submit-for-processing'
  | 'border-passed'
  | 'submit-declaration'
  | 'release-declaration'
  | 'close-svh'
  | 'issue-invoice'
  | 'confirm-payment-and-complete'
  | 'return-to-client'
  | 'claim'
  | 'set-problem'
  | 'clear-problem'

// Статусы заявки (совпадают с Import40Status на бэке)
export const IMPORT40_STATUSES = [
  { id: 0, key: 'Draft', short: 'Новая', phase: 'Заявка' },
  { id: 1, key: 'AtBorder', short: 'На границе', phase: 'КПП' },
  { id: 2, key: 'Declaring', short: 'Декларирование', phase: 'Декларант' },
  { id: 3, key: 'Submitted', short: 'ДТ подана', phase: 'Декларант' },
  { id: 4, key: 'Released', short: 'ДТ выпущена', phase: 'Декларант' },
  { id: 5, key: 'SvhClosing', short: 'Закрытие СВХ', phase: 'КПП' },
  { id: 6, key: 'Invoiced', short: 'Счёт выставлен', phase: 'Финансы' },
  { id: 7, key: 'Paid', short: 'Оплата получена', phase: 'Финансы' },
  { id: 8, key: 'Done', short: 'Выполнено', phase: 'Архив' },
] as const

export interface Import40LogDto {
  id: string
  createdAtUtc: string
  text: string
  changedByBusinessRole: string
}

export interface Import40Party {
  name?: string | null
  countryCode?: string | null
  region?: string | null
  city?: string | null
  street?: string | null
}

export interface Import40GoodsItemDto {
  id: string
  sortOrder: number
  description?: string | null
  tnvedCode?: string | null
  tnvedDescription?: string | null
  countryOfOrigin?: string | null
  quantity?: number | null
  unit?: string | null
  unitCode?: string | null
  grossWeightKg?: number | null
  netWeightKg?: number | null
  packagesCount?: number | null
  quantityTypeCode?: string | null
  invoiceValue?: number | null
  currency?: string | null
  procedureCode?: string | null
  previousProcedureCode?: string | null
  goodsMoveFeatureCode?: string | null
  tradeMarkName?: string | null
  productMarkName?: string | null
  productModelName?: string | null
  productArticle?: string | null
  manufacturerName?: string | null
  packageAvailabilityCode?: string | null
  cargoPlacesQuantity?: number | null
  packageKindCode?: string | null
  packageQuantity?: number | null
  prefClearanceCode?: string | null
  prefDutyCode?: string | null
  prefExciseCode?: string | null
  prefVatCode?: string | null
  // Льготная ставка НДС товара (напр. 0.05 для медизделий) — см. одноимённое
  // поле в Import40GoodsItemInput (types/api.ts) для контекста Task 10.
  vatRatePreferential?: number | null
  customsValueKzt?: number | null
  statisticValueUsd?: number | null
  valuationMethodCode?: string | null
  quotaAmount?: number | null
  prohibitionCode?: string | null
  ipoCode?: string | null
  payments?: Import40GoodsPayment[]
  // Товар пришёл из КП без веса/количества (см. KpToDtMapper.MapGoods на бэке) —
  // сумма ТПиН требует проверки декларантом перед подачей.
  needsTpinRecalc?: boolean
  // Номер контейнера (гр.31.3) — Task 1 (бэк).
  containerNumber?: string | null
  // Временный ввоз: месяцев для расчёта 3%×мес (calculate-payments) — Task 1 (бэк).
  tempImportMonths?: number | null
  // Признак реестра запретов/ограничений (классификатор nis-registry) — Task 1 (бэк).
  nisRegistryFlag?: string | null
  // Сертификация / экспортный контроль — свободный текст — Task 1 (бэк).
  certificationNote?: string | null
}

export interface Import40Doc44ItemDto {
  id: string
  sortOrder: number
  docTypeCode?: string | null
  docTypeName?: string | null
  docNumber?: string | null
  docDate?: string | null
  goodsItemIndex?: number | null
  docStartDate?: string | null
  docValidityDate?: string | null
  issueCountryCode?: string | null
}

// Гр.40 "Предшествующий документ". Один тип на чтение/запись — сервер отдаёт
// id при чтении, но не требует его на upsert (см. Import40PrevDocItemDto /
// Import40PrevDocItemRequest в Import40Contracts.cs).
export interface Import40PrevDocItem {
  id?: string
  docTypeCode: string | null
  docNumber: string | null
  docDate: string | null
  goodsNumber: string | null
  goodsItemIndex: number | null
  sortOrder: number
}

export interface Import40DeclarationDto {
  id: string
  caseId: string
  declarationNumber: string
  corridor: string
  procedureCode: string
  sender?: Import40Party | null
  senderHouse?: string | null
  receiver?: Import40Party | null
  receiverHouse?: string | null
  receiverBin?: string | null
  receiverCategoryCode?: string | null
  receiverKatoCode?: string | null
  departureCountryCode?: string | null
  destinationCountryCode?: string | null
  incoterms?: string | null
  currency?: string | null
  totalInvoiceValue?: number | null
  exchangeRate?: number | null
  svhCost?: number | null
  releasedAtUtc?: string | null
  transactionNatureCode?: string | null
  transactionFeatureCode?: string | null
  tradeCountryCode?: string | null
  originCountryCode?: string | null
  incotermsPlace?: string | null
  consigneeEqualsDeclarant?: boolean | null
  financialSubjectEqualsDeclarant?: boolean | null
  goodsLocationCode?: string | null
  goodsLocationRegisterNumber?: string | null
  goodsLocationCountryCode?: string | null
  goodsLocationStation?: string | null
  goodsLocationAddress?: string | null
  borderCustomsOfficeCode?: string | null
  borderCustomsOfficeName?: string | null
  submissionCustomsOfficeCode?: string | null
  submissionDate?: string | null
  borderTransportModeCode?: string | null
  borderTransportNationality?: string | null
  borderTransportNumbers?: Import40TransportMeans[]
  arrivalTransportModeCode?: string | null
  arrivalTransportNationality?: string | null
  arrivalTransportNumbers?: Import40TransportMeans[]
  rateType?: string | null
  factPayments?: Import40FactPayment[]
  declarationTypeCode: string
  declarationFeatureCode: string | null
  sheetNumber: number | null
  totalSheets: number | null
  shippingSpecSheets: number | null
  referenceNumber: string | null
  financialSubjectName: string | null
  financialSubjectBin: string | null
  financialSubjectCountryCode: string | null
  financialSubjectRegion: string | null
  financialSubjectCity: string | null
  financialSubjectStreet: string | null
  financialSubjectHouse: string | null
  financialSubjectCategoryCode: string | null
  financialSubjectKatoCode: string | null
  declarantName: string | null
  declarantBin: string | null
  declarantCountryCode: string | null
  declarantRegion: string | null
  declarantCity: string | null
  declarantStreet: string | null
  declarantHouse: string | null
  declarantCategoryCode: string | null
  declarantKatoCode: string | null
  containerIndicator: boolean
  inlandTransportModeCode: string | null
  deferralDocType: string | null
  deferralNumber: string | null
  deferralDate: string | null
  deferralDueDate: string | null
  guaranteeInvalidFor: string | null
  signatoryFullName: string | null
  signatoryPosition: string | null
  signatoryDocument: string | null
  signatoryPhone: string | null
  signedDate: string | null
  totalGoodsCount: number
  totalPackagesCount: number
  totalCustomsValue: number
  goodsItems: Import40GoodsItemDto[]
  doc44Items: Import40Doc44ItemDto[]
  prevDocItems: Import40PrevDocItem[]
  expenses: Import40DeclarationExpense[]
}

// Товар ДТ на отправку = поля формы (Import40GoodsItemInput) без customsValue,
// вместо которого бэкенд ждёт invoiceValue (см. маппинг в Import40DtView.saveDt)
export type Import40GoodsUpsert = Omit<Import40GoodsItemInput, 'customsValue'> & {
  invoiceValue?: number | null
}

export interface Import40DeclarationUpsert {
  declarationNumber?: string | null
  corridor?: string | null
  procedureCode?: string | null
  sender?: Import40Party | null
  senderHouse?: string | null
  receiver?: Import40Party | null
  receiverHouse?: string | null
  receiverBin?: string | null
  receiverCategoryCode?: string | null
  receiverKatoCode?: string | null
  departureCountryCode?: string | null
  destinationCountryCode?: string | null
  incoterms?: string | null
  currency?: string | null
  totalInvoiceValue?: number | null
  exchangeRate?: number | null
  svhCost?: number | null
  transactionNatureCode?: string | null
  transactionFeatureCode?: string | null
  tradeCountryCode?: string | null
  originCountryCode?: string | null
  incotermsPlace?: string | null
  consigneeEqualsDeclarant?: boolean | null
  financialSubjectEqualsDeclarant?: boolean | null
  goodsLocationCode?: string | null
  goodsLocationRegisterNumber?: string | null
  goodsLocationCountryCode?: string | null
  goodsLocationStation?: string | null
  goodsLocationAddress?: string | null
  borderCustomsOfficeCode?: string | null
  borderCustomsOfficeName?: string | null
  submissionCustomsOfficeCode?: string | null
  submissionDate?: string | null
  borderTransportModeCode?: string | null
  borderTransportNationality?: string | null
  borderTransportNumbers?: Import40TransportMeans[]
  arrivalTransportModeCode?: string | null
  arrivalTransportNationality?: string | null
  arrivalTransportNumbers?: Import40TransportMeans[]
  rateType?: string | null
  factPayments?: Import40FactPayment[]
  // Nullable в контракте (Import40DeclarationUpsertRequest.DeclarationTypeCode),
  // в отличие от required-строки в Import40DeclarationDto — сервер сам подставит
  // дефолт, если не передано.
  declarationTypeCode?: string | null
  declarationFeatureCode?: string | null
  sheetNumber?: number | null
  totalSheets?: number | null
  shippingSpecSheets?: number | null
  referenceNumber?: string | null
  financialSubjectName?: string | null
  financialSubjectBin?: string | null
  financialSubjectCountryCode?: string | null
  financialSubjectRegion?: string | null
  financialSubjectCity?: string | null
  financialSubjectStreet?: string | null
  financialSubjectHouse?: string | null
  financialSubjectCategoryCode?: string | null
  financialSubjectKatoCode?: string | null
  declarantName?: string | null
  declarantBin?: string | null
  declarantCountryCode?: string | null
  declarantRegion?: string | null
  declarantCity?: string | null
  declarantStreet?: string | null
  declarantHouse?: string | null
  declarantCategoryCode?: string | null
  declarantKatoCode?: string | null
  // Как соседние consigneeEqualsDeclarant/financialSubjectEqualsDeclarant:
  // в C# non-nullable bool с дефолтом, но тип формы делаем optional-nullable
  // для единообразия остального интерфейса.
  containerIndicator?: boolean | null
  inlandTransportModeCode?: string | null
  deferralDocType?: string | null
  deferralNumber?: string | null
  deferralDate?: string | null
  deferralDueDate?: string | null
  guaranteeInvalidFor?: string | null
  signatoryFullName?: string | null
  signatoryPosition?: string | null
  signatoryDocument?: string | null
  signatoryPhone?: string | null
  signedDate?: string | null
  goodsItems?: Import40GoodsUpsert[]
  doc44Items?: Import40Doc44ItemInput[]
  prevDocItems?: Import40PrevDocItem[]
  expenses?: Import40DeclarationExpense[]
}

// Состояние редактора ДТ. Секционные компоненты Task 5-7 принимают именно
// его, чтобы не плодить девять разных inline-типов пропсов.
export type Import40DtFormState = Import40DeclarationUpsert & { id: string }

// Shape actually returned by POST .../declarations/extract-batch (server-side
// Import40Endpoints.ToUpsertPreview). Deliberately a separate type from
// Import40DeclarationUpsert: the backend's goods-item request contract uses
// `invoiceValue`, not the `customsValue` field the goods table UI edits — see
// applyExtractionPreview in Import40View.vue for the translation.
export interface Import40ExtractionPreviewGoodsItem {
  description?: string | null
  tnvedCode?: string | null
  countryOfOrigin?: string | null
  quantity?: number | null
  packagesCount?: number | null
  grossWeightKg?: number | null
  netWeightKg?: number | null
  invoiceValue?: number | null
  currency?: string | null
  tradeMarkName?: string | null
  productMarkName?: string | null
  manufacturerName?: string | null
}

export interface Import40ExtractionPreview {
  declarationNumber?: string | null
  corridor?: string | null
  procedureCode?: string | null
  sender?: Import40Party | null
  receiver?: Import40Party | null
  departureCountryCode?: string | null
  destinationCountryCode?: string | null
  incoterms?: string | null
  incotermsPlace?: string | null
  originCountryCode?: string | null
  currency?: string | null
  totalInvoiceValue?: number | null
  exchangeRate?: number | null
  borderTransportNumbers?: Import40TransportMeans[] | null
  arrivalTransportNumbers?: Import40TransportMeans[] | null
  goodsItems?: Import40ExtractionPreviewGoodsItem[] | null
}

// A declaration field where the uploaded documents disagreed (e.g. two files giving
// different receiver BINs) — server picked `value`, but `alternatives` weren't discarded.
export interface Import40ExtractionConflictAlternative {
  value?: string | null
  sourceDocument?: string | null
}

export interface Import40ExtractionConflict {
  field: string
  fieldLabel: string
  value?: string | null
  sourceDocument?: string | null
  alternatives: Import40ExtractionConflictAlternative[]
}

export interface Import40ExtractionResult {
  declaration: Import40ExtractionPreview
  warnings: string[]
  conflicts: Import40ExtractionConflict[]
}

export const IMPORT40_TRANSPORT_MODES: { value: number; label: string }[] = [
  { value: 0, label: 'ЖД' },
  { value: 1, label: 'Авто' },
  { value: 2, label: 'Авиа' },
  { value: 3, label: 'Море' },
]

export interface Import40ContainerDto {
  id: string
  containerNumber: string
  containerType: string
  notes: string
}

export interface Import40CaseDto {
  id: string
  createdAtUtc: string
  updatedAtUtc: string
  clientId: string
  clientName: string
  cargo: string
  post: string
  status: number
  isProblem: boolean
  problemNote: string
  returnReason: string
  assignedKppId: string | null
  assignedDeclarantId: string | null
  vehicleNumber: string
  driverName: string
  driverPhone: string
  powerOfAttorneyGenerated: boolean
  powerOfAttorneyReturned: boolean
  svhInvoiceNote: string
  svhClosed: boolean
  paymentConfirmed: boolean
  transportMode: number
  wagonNumber: string
  station: string
  trailerNumber: string
  flightNumber: string
  airWaybill: string
  vesselName: string
  billOfLading: string
  containers: Import40ContainerDto[]
  declarations: Import40DeclarationDto[]
  logs: Import40LogDto[]
}

export interface Import40ListResponse {
  items: Import40CaseDto[]
}

export type Import40FileSection =
  | 'documents'
  | 'power-of-attorney'
  | 'svh-invoice'
  | 'payment-check'
  | 'declaration-stamp'

export interface Import40FileDto {
  id: string
  section: Import40FileSection
  originalFileName: string
  contentType: string
  sizeBytes: number
  uploadedByBusinessRole: string
  createdAtUtc: string
}

export interface KedenReadinessDto {
  missing: string[]
  filled: number
  total: number
  // Полнота ДТ как бланка (46 граф) — отдельный счётчик от готовности к
  // выгрузке KEDEN-XML выше, см. DtBlankCompleteness.cs на сервере.
  blankFilled: number
  blankTotal: number
  blankEmptyGraphs: string[]
}

export interface Import40CreateRequest {
  clientId: string
  clientName: string
  cargo: string
  post: string
}

export interface Import40UpdateRequest {
  cargo?: string
  post?: string
  vehicleNumber?: string
  driverName?: string
  driverPhone?: string
  svhInvoiceNote?: string
  assignedKppId?: string | null
  assignedDeclarantId?: string | null
  transportMode?: number
  wagonNumber?: string
  station?: string
  trailerNumber?: string
  flightNumber?: string
  airWaybill?: string
  vesselName?: string
  billOfLading?: string
}

export interface Import40ContainerUpsertRequest {
  containerNumber: string
  containerType?: string
  notes?: string
}

export interface ImportQuotePayload {
  quoteId: string
  targetDeclarationId?: string | null
  force?: boolean
}

// POST /import40/calculate-customs-value (Spec 4a Task 2) — распределяет
// расходы (`expenses`) по товарам и возвращает таможенную стоимость (гр.45)
// для каждого. `index` в запросе/ответе — 0-based позиция товара в массиве
// goodsItems декларации (см. ApplyGoods на бэке: sortOrder присваивается по
// позиции в массиве при сохранении, без отдельного поля sortOrder в форме).
export interface Import40CvGoodsInput {
  index: number
  grossWeightKg?: number | null
  invoiceValue?: number | null
  currency?: string | null
}

export interface Import40CvExpenseInput {
  expenseTypeCode: string
  amount: number
  currencyCode: string
}

export interface Import40CalculateCustomsValueRequest {
  goods: Import40CvGoodsInput[]
  expenses: Import40CvExpenseInput[]
}

export interface Import40CvGoodsResult {
  index: number
  customsValueKzt: number
  distributedExpensesKzt: number
}

export interface Import40CalculateCustomsValueResult {
  goods: Import40CvGoodsResult[]
}

// Task 9 (бэк) / Task 10 (фронт): расчёт платежей гр.47 (по товару) и гр.B
// (итог по ДТ) — POST .../declarations/{id}/calculate-payments. Товары
// берутся сервером из уже СОХРАНЁННОЙ декларации (см. CalculatePayments в
// Import40Endpoints.cs), запрос без тела не нужен — поэтому вызывающая
// сторона обязана сперва saveDt(). Зеркалит C#-контракты 1:1
// (Import40Contracts.cs: PaymentRowDto/PaymentGoodsRowDto/CalculatePaymentsResponse) —
// camelCase JSON, имена полей совпадают с C# после сериализации.
export interface Import40PaymentRowDto {
  taxModeCode: string
  base?: number | null
  rate?: number | null
  amount: number
}

export interface Import40PaymentGoodsRowDto {
  index: number
  rows: Import40PaymentRowDto[]
  excisePossible: boolean
}

export interface Import40CalculatePaymentsResponse {
  goodsRows: Import40PaymentGoodsRowDto[]
  totalsByTaxMode: Record<string, number>
  grandTotalB: number
}

// Spec 4b Task 3: разделение ДТ на ЕТТ/ВТО. `vtoStatus` — длинная человекочитаемая
// подсказка с сервера (см. split-suggestion), не код — показываем как есть, с усечением/tooltip.
export interface Import40SplitSuggestionRow {
  sortOrder: number
  tnvedCode?: string | null
  vtoStatus?: string | null
  isVtoCandidate: boolean
}

export interface Import40SplitRequest {
  vtoGoodSortOrders: number[]
}

export interface Import40SplitResult {
  ettDeclarationId: string
  vtoDeclarationId: string
}

export const import40Api = {
  list: async (): Promise<Import40CaseDto[]> => {
    const response = await apiClient.get<Import40ListResponse>('/import40')
    return response.data.items
  },

  myTasks: async (): Promise<Import40CaseDto[]> => {
    const response = await apiClient.get<Import40ListResponse>('/import40/my-tasks')
    return response.data.items
  },

  get: async (id: string): Promise<Import40CaseDto> => {
    const response = await apiClient.get<Import40CaseDto>(`/import40/${encodeURIComponent(id)}`)
    return response.data
  },

  create: async (data: Import40CreateRequest): Promise<Import40CaseDto> => {
    const response = await apiClient.post<Import40CaseDto>('/import40', data)
    return response.data
  },

  update: async (id: string, data: Import40UpdateRequest): Promise<Import40CaseDto> => {
    const response = await apiClient.put<Import40CaseDto>(`/import40/${encodeURIComponent(id)}`, data)
    return response.data
  },

  action: async (id: string, action: Import40Action, value?: string): Promise<Import40CaseDto> => {
    const response = await apiClient.post<Import40CaseDto>(
      `/import40/${encodeURIComponent(id)}/actions/${action}`,
      { value: value ?? null },
    )
    return response.data
  },

  addContainer: async (
    id: string,
    data: Import40ContainerUpsertRequest,
  ): Promise<Import40CaseDto> => {
    const response = await apiClient.post<Import40CaseDto>(
      `/import40/${encodeURIComponent(id)}/containers`,
      data,
    )
    return response.data
  },

  updateContainer: async (
    id: string,
    containerId: string,
    data: Import40ContainerUpsertRequest,
  ): Promise<Import40CaseDto> => {
    const response = await apiClient.put<Import40CaseDto>(
      `/import40/${encodeURIComponent(id)}/containers/${encodeURIComponent(containerId)}`,
      data,
    )
    return response.data
  },

  deleteContainer: async (id: string, containerId: string): Promise<Import40CaseDto> => {
    const response = await apiClient.delete<Import40CaseDto>(
      `/import40/${encodeURIComponent(id)}/containers/${encodeURIComponent(containerId)}`,
    )
    return response.data
  },

  createDeclaration: async (
    caseId: string,
    data: Import40DeclarationUpsert,
  ): Promise<Import40DeclarationDto> => {
    const response = await apiClient.post<Import40DeclarationDto>(
      `/import40/${encodeURIComponent(caseId)}/declarations`,
      data,
    )
    return response.data
  },

  updateDeclaration: async (
    caseId: string,
    declarationId: string,
    data: Import40DeclarationUpsert,
  ): Promise<Import40DeclarationDto> => {
    const response = await apiClient.put<Import40DeclarationDto>(
      `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declarationId)}`,
      data,
    )
    return response.data
  },

  deleteDeclaration: async (caseId: string, declarationId: string): Promise<void> => {
    await apiClient.delete(
      `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declarationId)}`,
    )
  },

  importQuote: async (
    caseId: string,
    payload: ImportQuotePayload,
  ): Promise<{ declarationId: string; addedGoods: number }> => {
    const response = await apiClient.post<{ declarationId: string; addedGoods: number }>(
      `/import40/${encodeURIComponent(caseId)}/import-quote`,
      payload,
    )
    return response.data
  },

  // 200 → файл; 400 → { errors: string[] } с перечнем незаполненного
  downloadKedenXml: async (
    caseId: string,
    declarationId: string,
  ): Promise<{ blob: Blob; fileName: string } | { errors: string[] }> => {
    const res = await apiClient.get(`/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declarationId)}/keden-xml`, {
      responseType: 'blob',
      validateStatus: (s) => s === 200 || s === 400,
    })
    if (res.status === 400) {
      const text = await (res.data as Blob).text()
      const parsed = JSON.parse(text) as { errors: string[] }
      return { errors: parsed.errors ?? ['Не удалось сформировать XML'] }
    }
    const cd = String(res.headers['content-disposition'] ?? '')
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(cd)
    return { blob: res.data as Blob, fileName: m ? decodeURIComponent(m[1]) : 'declaration.xml' }
  },

  // Факсимиле бланка ДТ (печать) — работает на любой стадии, без проверки готовности.
  blankPdf: async (caseId: string, declarationId: string): Promise<{ blob: Blob; fileName: string }> => {
    const res = await apiClient.get(
      `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declarationId)}/blank-pdf`,
      { responseType: 'blob' },
    )
    const cd = String(res.headers['content-disposition'] ?? '')
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(cd)
    return { blob: res.data as Blob, fileName: m ? decodeURIComponent(m[1]) : 'declaration.pdf' }
  },

  kedenReadiness: async (caseId: string, declarationId: string): Promise<KedenReadinessDto> => {
    const { data } = await apiClient.get<KedenReadinessDto>(
      `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declarationId)}/keden-readiness`,
    )
    return data
  },

  // Готовность всех ДТ заявки к пакетной выгрузке KEDEN-XML (P6).
  kedenReadinessSummary: async (caseId: string): Promise<DeclarationReadiness[]> => {
    const { data } = await apiClient.get<DeclarationReadiness[]>(
      `/import40/${encodeURIComponent(caseId)}/keden-readiness-summary`,
    )
    return data
  },

  // Пакетная выгрузка всех готовых ДТ заявки одним ZIP. 200 → zip-blob;
  // 400 → { message } (нет ни одной готовой ДТ). Зеркалит downloadKedenXml выше.
  downloadKedenBatch: async (
    caseId: string,
  ): Promise<{ blob: Blob; fileName: string } | { error: string }> => {
    const res = await apiClient.get(
      `/import40/${encodeURIComponent(caseId)}/declarations/keden-xml-batch`,
      {
        responseType: 'blob',
        validateStatus: (s) => s === 200 || s === 400,
      },
    )
    if (res.status === 400) {
      const text = await (res.data as Blob).text()
      const parsed = JSON.parse(text) as { message?: string }
      return { error: parsed.message ?? 'Нет готовых ДТ для выгрузки' }
    }
    const cd = String(res.headers['content-disposition'] ?? '')
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(cd)
    return { blob: res.data as Blob, fileName: m ? decodeURIComponent(m[1]) : 'keden-batch.zip' }
  },

  // Batch-uploads a shipment's document package (invoice/packing-list Excel, CMR,
  // quarantine act, certs — Excel and/or PDF/scans). Aqniet merges what it can
  // extract into one record; the server maps it into an Import40ExtractionPreview,
  // plus any warnings/conflicts spotted between source documents (e.g. two files
  // giving different receiver BINs) — nothing is persisted until the broker
  // reviews/edits and calls createDeclaration explicitly.
  extractBatch: async (caseId: string, files: File[]): Promise<Import40ExtractionResult> => {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    const response = await apiClient.post<Import40ExtractionResult>(
      `/import40/${encodeURIComponent(caseId)}/declarations/extract-batch`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        // apiClient's default 30s timeout is fine for ordinary requests but too short
        // here: Aqniet runs OCR (PaddleOCR) over every scanned PDF in the batch, which
        // for a handful of files can genuinely take a couple of minutes, especially on
        // a cold model cache.
        timeout: 180000,
      },
    )
    return response.data
  },

  listClients: async (): Promise<{ id: string; username: string }[]> => {
    const response = await apiClient.get<{ id: string; username: string }[]>('/import40/clients')
    return response.data
  },

  listFiles: async (id: string): Promise<Import40FileDto[]> => {
    const response = await apiClient.get<Import40FileDto[]>(
      `/import40/${encodeURIComponent(id)}/files`,
    )
    return response.data
  },

  uploadFile: async (
    id: string,
    section: Import40FileSection,
    file: File,
  ): Promise<Import40FileDto> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient.post<Import40FileDto>(
      `/import40/${encodeURIComponent(id)}/files`,
      formData,
      {
        params: { section },
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    )
    return response.data
  },

  downloadFile: async (id: string, fileId: string): Promise<Blob> => {
    const response = await apiClient.get(
      `/import40/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}/download`,
      { responseType: 'blob' },
    )
    return response.data
  },

  deleteFile: async (id: string, fileId: string): Promise<void> => {
    await apiClient.delete(
      `/import40/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}`,
    )
  },

  calculateCustomsValue: async (
    payload: Import40CalculateCustomsValueRequest,
  ): Promise<Import40CalculateCustomsValueResult> => {
    const response = await apiClient.post<Import40CalculateCustomsValueResult>(
      '/import40/calculate-customs-value',
      payload,
    )
    return response.data
  },

  splitSuggestion: async (
    caseId: string,
    declarationId: string,
  ): Promise<Import40SplitSuggestionRow[]> => {
    const response = await apiClient.get<Import40SplitSuggestionRow[]>(
      `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declarationId)}/split-suggestion`,
    )
    return response.data
  },

  splitDeclaration: async (
    caseId: string,
    declarationId: string,
    data: Import40SplitRequest,
  ): Promise<Import40SplitResult> => {
    const response = await apiClient.post<Import40SplitResult>(
      `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declarationId)}/split`,
      data,
    )
    return response.data
  },

  // Task 10: расчёт платежей гр.47/гр.B. Никакого тела запроса — сервер сам
  // читает товары из сохранённой декларации (см. комментарий у
  // Import40CalculatePaymentsResponse выше). Вызывающая сторона должна
  // сохранить ДТ непосредственно перед вызовом.
  calculatePayments: async (
    caseId: string,
    declarationId: string,
  ): Promise<Import40CalculatePaymentsResponse> => {
    const response = await apiClient.post<Import40CalculatePaymentsResponse>(
      `/import40/${encodeURIComponent(caseId)}/declarations/${encodeURIComponent(declarationId)}/calculate-payments`,
    )
    return response.data
  },
}
